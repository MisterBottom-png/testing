#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/app/src/main/assets/native"
cat > "$ROOT/app/src/main/assets/native/native-host.css" <<'__AD_FILE_2_0__'
html.android-native-host,
html.android-native-host body {
  background: transparent !important;
}
html.android-native-host #ui,
html.android-native-host #background-animations,
html.android-native-host .videocontainer,
html.android-native-host #loading,
html.android-native-host #browser-warning {
  visibility: hidden !important;
  pointer-events: none !important;
  opacity: 0 !important;
}

__AD_FILE_2_0__

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/GameViewModel.kt" <<'__AD_FILE_2_1__'
package com.vitautas.antimatter.nativegame

import android.app.Application
import android.webkit.WebView
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.vitautas.antimatter.core.model.EngineEvent
import com.vitautas.antimatter.core.model.GameSettings
import com.vitautas.antimatter.nativegame.data.GameSettingsRepository
import com.vitautas.antimatter.engine.web.WebGameEngine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class GameViewModel(application: Application) : AndroidViewModel(application) {
    val engine = WebGameEngine(application.applicationContext)
    private val settingsRepository = GameSettingsRepository(application.applicationContext)

    val settings: StateFlow<GameSettings> = settingsRepository.settings.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = GameSettings(),
    )

    val snapshot = engine.snapshot
    val status = engine.status
    val events = engine.events

    fun createEngineView(context: android.content.Context): WebView = engine.createView(context.applicationContext)

    fun updateSettings(transform: (GameSettings) -> GameSettings) {
        viewModelScope.launch { settingsRepository.update(transform) }
    }

    fun buyDimension(tier: Int, max: Boolean = false) {
        viewModelScope.launch { engine.buyDimension(tier, max) }
    }

    fun buyTickspeed(max: Boolean = false) {
        viewModelScope.launch { engine.buyTickspeed(max) }
    }

    fun reset(id: String) {
        viewModelScope.launch { engine.performReset(id) }
    }

    fun purchaseUpgrade(id: String) {
        viewModelScope.launch { engine.purchaseUpgrade(id) }
    }

    fun save() {
        viewModelScope.launch { engine.save() }
    }

    fun restoreRecoverySave() {
        viewModelScope.launch { engine.restoreRecoverySave() }
    }

    fun importSave(text: String, onResult: (Boolean) -> Unit) {
        viewModelScope.launch { onResult(engine.importSave(text)) }
    }

    fun exportSave(onResult: (String?) -> Unit) {
        viewModelScope.launch { onResult(engine.exportSave()) }
    }

    fun setLegacyVisible(visible: Boolean) {
        viewModelScope.launch { engine.setLegacyVisible(visible) }
    }

    fun emitNavigationEvent() {
        // UI-only feedback remains outside the simulation bridge.
        viewModelScope.launch {
            // Deliberately no state mutation. Consumers may play local navigation feedback.
        }
    }

    override fun onCleared() {
        engine.close()
        super.onCleared()
    }
}

__AD_FILE_2_1__

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/MainActivity.kt" <<'__AD_FILE_2_2__'
package com.vitautas.antimatter.nativegame

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vitautas.antimatter.nativegame.audio.GameAudioController
import com.vitautas.antimatter.nativegame.feedback.HapticController
import com.vitautas.antimatter.nativegame.ui.AntimatterGameApp

class MainActivity : ComponentActivity() {
    private val viewModel: GameViewModel by viewModels()
    private lateinit var audio: GameAudioController
    private lateinit var haptics: HapticController

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        audio = GameAudioController(applicationContext)
        haptics = HapticController(applicationContext)

        setContent {
            val snapshot by viewModel.snapshot.collectAsStateWithLifecycle()
            val status by viewModel.status.collectAsStateWithLifecycle()
            val settings by viewModel.settings.collectAsStateWithLifecycle()
            val engineView = remember { viewModel.createEngineView(this@MainActivity) }
            var pendingExport by remember { mutableStateOf<String?>(null) }
            var uiMessage by remember { mutableStateOf<String?>(null) }

            val createDocument = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.CreateDocument("text/plain"),
            ) { uri ->
                val text = pendingExport
                pendingExport = null
                if (uri != null && text != null) {
                    val result = runCatching {
                        contentResolver.openOutputStream(uri)?.bufferedWriter()?.use { it.write(text) }
                            ?: error("Unable to open destination")
                    }
                    uiMessage = if (result.isSuccess) "Save exported" else "Export failed: ${result.exceptionOrNull()?.message}"
                }
            }

            val openDocument = rememberLauncherForActivityResult(
                contract = ActivityResultContracts.OpenDocument(),
            ) { uri ->
                if (uri != null) {
                    val text = runCatching {
                        contentResolver.openInputStream(uri)?.bufferedReader()?.use { it.readText() }
                            ?: error("Unable to open save file")
                    }
                    text.onSuccess { save ->
                        viewModel.importSave(save) { success ->
                            uiMessage = if (success) "Save imported successfully" else "The save was rejected by the original serializer"
                        }
                    }.onFailure { error -> uiMessage = "Import failed: ${error.message}" }
                }
            }

            LaunchedEffect(settings, snapshot.layer) { audio.apply(settings, snapshot.layer) }

            AntimatterGameApp(
                snapshot = snapshot,
                status = status,
                settings = settings,
                events = viewModel.events,
                engineView = engineView,
                externalMessage = uiMessage,
                onExternalMessageConsumed = { uiMessage = null },
                onEngineEvent = { event, view ->
                    audio.play(event)
                    haptics.perform(view, event, settings.hapticsEnabled)
                },
                onSettingsChange = viewModel::updateSettings,
                onBuyDimension = viewModel::buyDimension,
                onBuyTickspeed = viewModel::buyTickspeed,
                onReset = viewModel::reset,
                onPurchaseUpgrade = viewModel::purchaseUpgrade,
                onSave = viewModel::save,
                onRestoreRecovery = viewModel::restoreRecoverySave,
                onImport = { openDocument.launch(arrayOf("text/plain", "application/octet-stream", "*/*")) },
                onExport = {
                    viewModel.exportSave { save ->
                        if (save == null) {
                            uiMessage = "The game engine could not export the current save"
                        } else {
                            pendingExport = save
                            createDocument.launch("antimatter-dimensions-save.txt")
                        }
                    }
                },
                onLegacyVisibilityChanged = viewModel::setLegacyVisible,
            )
        }
    }

    override fun onStart() {
        super.onStart()
        viewModel.engine.onForeground()
        if (::audio.isInitialized) audio.onForeground()
    }

    override fun onStop() {
        if (::audio.isInitialized) audio.onBackground()
        viewModel.engine.onBackground()
        super.onStop()
    }

    override fun onDestroy() {
        if (::audio.isInitialized) audio.close()
        super.onDestroy()
    }
}

__AD_FILE_2_2__
