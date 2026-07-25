package com.vitautas.drumkit

import android.os.Bundle
import android.view.MotionEvent
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.graphics.Color
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.vitautas.drumkit.audio.AudioEngine
import com.vitautas.drumkit.feature.kit.DrumKitScreen
import com.vitautas.drumkit.feature.kit.DrumKitSessionController

class MainActivity : ComponentActivity() {
    private val audioAvailableState = mutableStateOf(true)
    private val kitSessionController = DrumKitSessionController()
    private lateinit var audioSessionController: AudioSessionController
    private var diagnosticTouchObserver: DiagnosticTouchObserver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        hideSystemBars()

        audioSessionController = AudioSessionController(this) { available ->
            audioAvailableState.value = available
        }
        setContent {
            NativeDrumKitTheme {
                if (BuildConfig.DEBUG) {
                    DiagnosticDrumKitScreen(
                        sessionController = kitSessionController,
                        audioAvailable = audioAvailableState.value,
                        onTouchObserverChanged = { observer -> diagnosticTouchObserver = observer },
                    )
                } else {
                    DrumKitScreen(
                        onStrike = AudioEngine::trigger,
                        onMasterVolumeChanged = AudioEngine::setMasterVolume,
                        onRoomMixChanged = AudioEngine::setRoomMix,
                        diagnosticsProvider = AudioEngine::diagnostics,
                        sessionController = kitSessionController,
                        audioAvailable = audioAvailableState.value,
                        showDiagnostics = false,
                    )
                }
            }
        }
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        val handled = super.dispatchTouchEvent(event)
        if (BuildConfig.DEBUG) {
            diagnosticTouchObserver?.invoke(event, window.decorView.width, window.decorView.height)
        }
        return handled
    }

    override fun onStart() {
        super.onStart()
        audioSessionController.start()
    }

    override fun onStop() {
        kitSessionController.onAppStopping()
        audioSessionController.stop()
        super.onStop()
    }

    override fun onDestroy() {
        diagnosticTouchObserver = null
        super.onDestroy()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
    }

    private fun hideSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }
}

@Composable
private fun NativeDrumKitTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Color(0xffffa13a),
            background = Color(0xff08090b),
            surface = Color(0xff111318),
            onBackground = Color(0xfff2f0eb),
            onSurface = Color(0xfff2f0eb),
        ),
        content = content,
    )
}
