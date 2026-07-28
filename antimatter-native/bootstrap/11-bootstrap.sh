#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/engine/web/src/main/java/com/vitautas/antimatter/engine/web"
cat > "$ROOT/engine/web/src/main/java/com/vitautas/antimatter/engine/web/WebGameEngine.kt" <<'__AD_FILE_11_0__'
package com.vitautas.antimatter.engine.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.MainThread
import androidx.webkit.WebViewAssetLoader
import com.vitautas.antimatter.core.model.EngineEvent
import com.vitautas.antimatter.core.model.EngineStatus
import com.vitautas.antimatter.core.model.GameEventDetector
import com.vitautas.antimatter.core.model.GameSnapshot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import org.json.JSONObject
import kotlin.coroutines.resume

class WebGameEngine(
    private val applicationContext: Context,
) : AutoCloseable {
    companion object {
        private const val AssetHost = "appassets.androidplatform.net"
        private const val GameUrl = "https://$AssetHost/assets/game/index.html"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _snapshot = MutableStateFlow(GameSnapshot.Loading)
    private val _status = MutableStateFlow(EngineStatus())
    private val _events = MutableSharedFlow<EngineEvent>(extraBufferCapacity = 32)

    val snapshot: StateFlow<GameSnapshot> = _snapshot.asStateFlow()
    val status: StateFlow<EngineStatus> = _status.asStateFlow()
    val events: SharedFlow<EngineEvent> = _events.asSharedFlow()

    private var webView: WebView? = null
    private var pollingJob: Job? = null
    private var isForeground = true
    private var legacyVisible = false
    private var bridgeInjected = false
    private var lastSnapshot = GameSnapshot.Loading

    @SuppressLint("SetJavaScriptEnabled")
    @MainThread
    fun createView(context: Context): WebView {
        webView?.let { existing ->
            (existing.parent as? ViewGroup)?.removeView(existing)
            return existing
        }

        _status.value = EngineStatus(EngineStatus.State.LOADING, "Loading preserved game engine")
        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
            .build()

        return WebView(context).also { view ->
            webView = view
            view.setBackgroundColor(Color.TRANSPARENT)
            view.isFocusable = true
            view.isFocusableInTouchMode = true
            view.settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                textZoom = 100
                allowFileAccess = false
                allowContentAccess = true
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                userAgentString = "$userAgentString AntimatterNative/0.3.0"
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                view.importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
            }
            WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
            view.webViewClient = object : WebViewClient() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.host?.equals(AssetHost, ignoreCase = true) == true) return false
                    if (uri.scheme in setOf("about", "data", "blob")) return false
                    runCatching {
                        applicationContext.startActivity(
                            Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                        )
                    }
                    return true
                }

                override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
                    bridgeInjected = false
                    _status.value = EngineStatus(EngineStatus.State.LOADING, "Loading preserved game engine")
                    super.onPageStarted(view, url, favicon)
                }

                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    injectNativePresentationBridge()
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: android.webkit.WebResourceError,
                ) {
                    if (request.isForMainFrame) {
                        _status.value = EngineStatus(EngineStatus.State.ERROR, error.description.toString())
                    }
                }
            }
            view.loadUrl(GameUrl)
        }
    }

    @MainThread
    fun onForeground() {
        isForeground = true
        webView?.onResume()
        webView?.resumeTimers()
        ensurePolling()
    }

    @MainThread
    fun onBackground() {
        isForeground = false
        scope.launch {
            command("save", emitEvent = false)
            webView?.onPause()
            webView?.pauseTimers()
        }
    }

    suspend fun buyDimension(tier: Int, max: Boolean = false): Boolean =
        command(if (max) "buyMaxDimension" else "buyDimension", JSONObject().put("tier", tier))

    suspend fun buyTickspeed(max: Boolean = false): Boolean =
        command("buyTickspeed", JSONObject().put("max", max))

    suspend fun performReset(id: String, bulk: Boolean = true): Boolean = when (id) {
        "dimension_boost" -> command("dimensionBoost", JSONObject().put("bulk", bulk))
        "galaxy" -> command("galaxy", JSONObject().put("bulk", bulk))
        "infinity", "eternity" -> command(id)
        else -> false
    }

    suspend fun purchaseUpgrade(id: String): Boolean =
        command("purchaseUpgrade", JSONObject().put("id", id))

    suspend fun save(): Boolean = command("save")

    suspend fun restoreRecoverySave(): Boolean = command("restoreRecovery")

    suspend fun exportSave(): String? {
        val result = evaluate("window.ADMobileNative && window.ADMobileNative.exportSave()")
        return decodeJavaScriptString(result)?.takeIf { it.isNotBlank() }
    }

    suspend fun importSave(saveText: String): Boolean {
        val quoted = JSONObject.quote(saveText)
        val result = evaluate("window.ADMobileNative && window.ADMobileNative.importSave($quoted)")
        return handleCommandResult(decodeJavaScriptString(result))
    }

    suspend fun setLegacyVisible(visible: Boolean): Boolean {
        legacyVisible = visible
        return command("setLegacyMode", JSONObject().put("visible", visible))
    }

    private fun injectNativePresentationBridge() {
        if (bridgeInjected) return
        val view = webView ?: return
        val css = readAsset("native/native-host.css")
        val bridge = readAsset("native/native-bridge.js")
        if (bridge.isBlank()) {
            _status.value = EngineStatus(EngineStatus.State.ERROR, "Native bridge asset is missing")
            return
        }
        val cssScript = """
            (() => {
              const style = document.createElement('style');
              style.id = 'android-native-host-style';
              style.textContent = ${JSONObject.quote(css)};
              document.head.appendChild(style);
            })();
        """.trimIndent()
        view.evaluateJavascript(cssScript, null)
        view.evaluateJavascript(bridge) {
            bridgeInjected = true
            ensurePolling()
        }
    }

    private fun readAsset(path: String): String = runCatching {
        applicationContext.assets.open(path).bufferedReader().use { it.readText() }
    }.getOrDefault("")

    private fun ensurePolling() {
        if (pollingJob?.isActive == true || !bridgeInjected) return
        pollingJob = scope.launch {
            while (isActive) {
                if (isForeground) pollSnapshot()
                delay(if (legacyVisible) 750L else 250L)
            }
        }
    }

    private suspend fun pollSnapshot() {
        val raw = evaluate("window.ADMobileNative && window.ADMobileNative.snapshot()") ?: return
        val json = decodeJavaScriptString(raw) ?: return
        val parsed = runCatching { GameSnapshotJsonParser.parse(json) }
            .getOrElse { error ->
                _status.value = EngineStatus(EngineStatus.State.ERROR, "State bridge error: ${error.message}")
                return
            }

        if (parsed.ready) {
            emitStateTransitionEvents(lastSnapshot, parsed)
            lastSnapshot = parsed
            _snapshot.value = parsed
            _status.value = EngineStatus(EngineStatus.State.READY)
        }
    }

    private fun emitStateTransitionEvents(previous: GameSnapshot, current: GameSnapshot) {
        GameEventDetector.between(previous, current).forEach(_events::tryEmit)
    }

    private suspend fun command(
        name: String,
        payload: JSONObject = JSONObject(),
        emitEvent: Boolean = true,
    ): Boolean {
        val script = "window.ADMobileNative && window.ADMobileNative.command(${JSONObject.quote(name)}, ${JSONObject.quote(payload.toString())})"
        val result = evaluate(script)
        val success = handleCommandResult(decodeJavaScriptString(result), emitEvent)
        if (success) pollSnapshot()
        return success
    }

    private fun handleCommandResult(json: String?, emitEvent: Boolean = true): Boolean {
        if (json.isNullOrBlank()) return false
        return runCatching {
            val result = JSONObject(json)
            val success = result.optBoolean("ok", false)
            val type = runCatching { EngineEvent.Type.valueOf(result.optString("event", "ERROR")) }
                .getOrDefault(EngineEvent.Type.ERROR)
            val significance = runCatching {
                EngineEvent.Significance.valueOf(result.optString("significance", "LIGHT"))
            }.getOrDefault(EngineEvent.Significance.LIGHT)
            if (emitEvent) {
                _events.tryEmit(
                    EngineEvent(
                        type = type,
                        significance = significance,
                        message = result.optString("message").takeIf { it.isNotBlank() && it != "null" },
                    )
                )
            }
            success
        }.getOrElse {
            _events.tryEmit(EngineEvent(EngineEvent.Type.ERROR, message = it.message))
            false
        }
    }

    private suspend fun evaluate(script: String): String? = suspendCancellableCoroutine { continuation ->
        val view = webView
        if (view == null) {
            continuation.resume(null)
            return@suspendCancellableCoroutine
        }
        view.post {
            if (!continuation.isActive) return@post
            view.evaluateJavascript(script) { value ->
                if (continuation.isActive) continuation.resume(value)
            }
        }
    }

    override fun close() {
        pollingJob?.cancel()
        scope.coroutineContext[Job]?.cancel()
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            clearHistory()
            removeAllViews()
            destroy()
        }
        webView = null
        _status.value = EngineStatus(EngineStatus.State.DESTROYED)
    }
}

__AD_FILE_11_0__
