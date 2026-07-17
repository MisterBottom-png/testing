package com.vitautas.drumkit.feature.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.weight
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
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
import kotlin.math.roundToInt

@Composable
fun DrumKitScreen(
    onStrike: (DrumStrike) -> Unit,
    onMasterVolumeChanged: (Float) -> Unit,
    onRoomMixChanged: (Float) -> Unit,
    diagnosticsProvider: () -> AudioDiagnostics,
    modifier: Modifier = Modifier,
    showDiagnostics: Boolean = false,
) {
    var volume by remember { mutableFloatStateOf(0.76f) }
    var room by remember { mutableFloatStateOf(0.32f) }
    var haptics by remember { mutableStateOf(true) }
    var settingsExpanded by remember { mutableStateOf(false) }
    var kitSelectorExpanded by remember { mutableStateOf(false) }
    var diagnostics by remember { mutableStateOf(AudioDiagnostics()) }
    var isRecording by remember { mutableStateOf(false) }
    var lastTake by remember { mutableStateOf<RecordedPerformance?>(null) }
    val recorder = remember { PerformanceRecorder() }
    val strikeDispatcher = remember(onStrike, recorder) {
        { strike: DrumStrike ->
            onStrike(strike)
            recorder.record(strike)
        }
    }

    LaunchedEffect(showDiagnostics, diagnosticsProvider) {
        if (!showDiagnostics) return@LaunchedEffect
        while (true) {
            diagnostics = diagnosticsProvider()
            delay(500)
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xff08090b)),
    ) {
        AndroidView(
            factory = { context ->
                DrumSurfaceView(context).apply {
                    onStrike = strikeDispatcher
                    hapticsEnabled = haptics
                }
            },
            update = { surface ->
                surface.onStrike = strikeDispatcher
                surface.hapticsEnabled = haptics
            },
            modifier = Modifier.fillMaxSize(),
        )

        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(start = 12.dp, top = 10.dp),
        ) {
            FilledTonalButton(
                onClick = { kitSelectorExpanded = true },
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text("STUDIO KIT")
            }
            DropdownMenu(
                expanded = kitSelectorExpanded,
                onDismissRequest = { kitSelectorExpanded = false },
            ) {
                DropdownMenuItem(
                    text = { Text("Studio Kit") },
                    onClick = { kitSelectorExpanded = false },
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(end = 12.dp, top = 10.dp),
        ) {
            FilledTonalButton(
                onClick = {
                    if (isRecording) {
                        lastTake = recorder.stop()
                        isRecording = false
                    } else {
                        recorder.start()
                        isRecording = true
                    }
                },
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = if (isRecording) Color(0xffa93232) else Color(0xff292d32),
                    contentColor = Color(0xfff7f4ee),
                ),
                modifier = Modifier.defaultMinSize(minWidth = 64.dp, minHeight = 48.dp),
            ) {
                Text(if (isRecording) "STOP" else "REC")
            }
            FilledTonalButton(
                onClick = { settingsExpanded = !settingsExpanded },
                modifier = Modifier.defaultMinSize(minWidth = 64.dp, minHeight = 48.dp),
            ) {
                Text(if (settingsExpanded) "CLOSE" else "MIX")
            }
        }

        if (settingsExpanded) {
            Surface(
                color = Color(0xee111318),
                contentColor = Color(0xfff3f5f8),
                shape = MaterialTheme.shapes.large,
                tonalElevation = 8.dp,
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(end = 12.dp, top = 70.dp)
                    .widthIn(min = 270.dp, max = 330.dp),
            ) {
                Column(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(16.dp),
                ) {
                    Text("Mixer", style = MaterialTheme.typography.titleMedium)
                    CompactSlider(
                        label = "Volume",
                        value = volume,
                        onValueChange = {
                            volume = it
                            onMasterVolumeChanged(it)
                        },
                    )
                    CompactSlider(
                        label = "Room",
                        value = room,
                        onValueChange = {
                            room = it
                            onRoomMixChanged(it)
                        },
                    )
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .defaultMinSize(minHeight = 48.dp),
                    ) {
                        Text("Haptics", modifier = Modifier.weight(1f))
                        Switch(
                            checked = haptics,
                            onCheckedChange = { haptics = it },
                        )
                    }
                    Surface(
                        color = Color(0xff1a1d22),
                        shape = MaterialTheme.shapes.medium,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                        ) {
                            Text("Performance capture", style = MaterialTheme.typography.labelLarge)
                            Text(
                                text = recordingStatus(isRecording, lastTake),
                                style = MaterialTheme.typography.labelSmall,
                                color = if (isRecording) Color(0xffffa08d) else Color(0xffaab2bf),
                            )
                        }
                    }
                }
            }
        }

        if (showDiagnostics) {
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
}

@Composable
private fun CompactSlider(
    label: String,
    value: Float,
    onValueChange: (Float) -> Unit,
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(2.dp),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(label, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
            Text(
                "${(value * 100f).roundToInt()}%",
                style = MaterialTheme.typography.labelMedium,
                color = Color(0xffaab2bf),
            )
        }
        Slider(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

private fun recordingStatus(
    isRecording: Boolean,
    lastTake: RecordedPerformance?,
): String = when {
    isRecording -> "Capturing strike timing and expression"
    lastTake == null -> "No take captured"
    lastTake.truncated -> "${lastTake.strikes.size} hits · buffer limit reached"
    else -> {
        val seconds = lastTake.durationMillis / 1_000f
        "${lastTake.strikes.size} hits · ${"%.1f".format(seconds)} s"
    }
}

private fun AudioDiagnostics.toDisplayText(): String = when {
    !running -> "Audio stopped"
    else -> "$sampleRate Hz · $framesPerBurst frames/burst · $underruns underruns"
}
