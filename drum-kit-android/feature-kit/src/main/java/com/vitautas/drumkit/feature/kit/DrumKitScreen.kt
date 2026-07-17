package com.vitautas.drumkit.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.vitautas.drumkit.input.DrumSurfaceView
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import kotlinx.coroutines.delay

@Composable
fun DrumKitScreen(
    onStrike: (DrumStrike) -> Unit,
    onMasterVolumeChanged: (Float) -> Unit,
    onRoomMixChanged: (Float) -> Unit,
    diagnosticsProvider: () -> AudioDiagnostics,
    modifier: Modifier = Modifier,
) {
    var volume by remember { mutableFloatStateOf(0.76f) }
    var room by remember { mutableFloatStateOf(0.32f) }
    var haptics by remember { mutableStateOf(true) }
    var diagnostics by remember { mutableStateOf(AudioDiagnostics()) }

    LaunchedEffect(diagnosticsProvider) {
        while (true) {
            diagnostics = diagnosticsProvider()
            delay(500)
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xff05070a)),
    ) {
        AndroidView(
            factory = { context ->
                DrumSurfaceView(context).apply {
                    this.onStrike = onStrike
                    hapticsEnabled = haptics
                }
            },
            update = { surface ->
                surface.onStrike = onStrike
                surface.hapticsEnabled = haptics
            },
            modifier = Modifier.fillMaxSize(),
        )

        Surface(
            color = Color(0xcc0d1016),
            contentColor = Color(0xfff3f5f8),
            shape = MaterialTheme.shapes.medium,
            tonalElevation = 6.dp,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 10.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
            ) {
                Column {
                    Text("STUDIO KIT", style = MaterialTheme.typography.titleSmall)
                    Text(
                        "native low-latency foundation",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color(0xffaab2bf),
                    )
                }

                Spacer(Modifier.weight(1f))

                ControlSlider(
                    label = "Room",
                    value = room,
                    onValueChange = {
                        room = it
                        onRoomMixChanged(it)
                    },
                )

                ControlSlider(
                    label = "Volume",
                    value = volume,
                    onValueChange = {
                        volume = it
                        onMasterVolumeChanged(it)
                    },
                )

                Text("Haptic", style = MaterialTheme.typography.labelSmall)
                Switch(checked = haptics, onCheckedChange = { haptics = it })
            }
        }

        Text(
            text = diagnostics.toDisplayText(),
            style = MaterialTheme.typography.labelSmall,
            color = Color(0xffaab2bf),
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .background(Color(0x99000000), MaterialTheme.shapes.small)
                .padding(horizontal = 10.dp, vertical = 5.dp),
        )
    }
}

@Composable
private fun ControlSlider(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = Color(0xffaab2bf))
        Slider(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.width(110.dp),
        )
    }
}

private fun AudioDiagnostics.toDisplayText(): String = when {
    !running -> "Audio stopped"
    else -> "$sampleRate Hz · $framesPerBurst frames/burst · $underruns underruns"
}
