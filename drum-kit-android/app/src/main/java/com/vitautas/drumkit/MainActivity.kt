package com.vitautas.drumkit

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.vitautas.drumkit.audio.AudioEngine
import com.vitautas.drumkit.feature.kit.DrumKitScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        hideSystemBars()

        setContent {
            NativeDrumKitTheme {
                DrumKitScreen(
                    onStrike = AudioEngine::trigger,
                    onMasterVolumeChanged = AudioEngine::setMasterVolume,
                    onRoomMixChanged = AudioEngine::setRoomMix,
                    diagnosticsProvider = AudioEngine::diagnostics,
                )
            }
        }
    }

    override fun onStart() {
        super.onStart()
        AudioEngine.start(this)
    }

    override fun onStop() {
        AudioEngine.stop()
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
            primary = Color(0xffffb44a),
            background = Color(0xff05070a),
            surface = Color(0xff0d1016),
            onBackground = Color(0xfff3f5f8),
            onSurface = Color(0xfff3f5f8),
        ),
        content = content,
    )
}
