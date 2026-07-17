package com.vitautas.drumkit

import android.content.pm.ApplicationInfo
import android.os.Bundle
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

class MainActivity : ComponentActivity() {
    private val audioAvailableState = mutableStateOf(true)
    private lateinit var audioSessionController: AudioSessionController

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        hideSystemBars()

        audioSessionController = AudioSessionController(this) { available ->
            audioAvailableState.value = available
        }
        val showDiagnostics = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0
        setContent {
            NativeDrumKitTheme {
                DrumKitScreen(
                    onStrike = AudioEngine::trigger,
                    onMasterVolumeChanged = AudioEngine::setMasterVolume,
                    onRoomMixChanged = AudioEngine::setRoomMix,
                    diagnosticsProvider = AudioEngine::diagnostics,
                    audioAvailable = audioAvailableState.value,
                    showDiagnostics = showDiagnostics,
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        audioSessionController.start()
    }

    override fun onStop() {
        audioSessionController.stop()
        super.onStop()
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
