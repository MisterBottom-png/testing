package com.vitautas.drumkit

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.vitautas.drumkit.audio.AudioEngine
import com.vitautas.drumkit.feature.kit.DrumKitScreen
import com.vitautas.drumkit.feature.kit.DrumKitSessionController
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

@Composable
internal fun DiagnosticDrumKitScreen(
    sessionController: DrumKitSessionController,
    audioAvailable: Boolean,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { DiagnosticSessionRecorder() }
    var isRecording by remember { mutableStateOf(false) }
    var isExporting by remember { mutableStateOf(false) }
    var markerMenuExpanded by remember { mutableStateOf(false) }
    var masterVolume by remember { mutableFloatStateOf(0.76f) }
    var roomLevel by remember { mutableFloatStateOf(0.32f) }
    var status by remember { mutableStateOf("Diagnostic session idle") }
    val bottomInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal)

    LaunchedEffect(isRecording) {
        while (isRecording) {
            recorder.recordAudioDiagnostics(AudioEngine.diagnostics())
            delay(500)
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        DrumKitScreen(
            onStrike = { strike ->
                AudioEngine.trigger(strike)
                recorder.recordStrike(strike)
            },
            onMasterVolumeChanged = { value ->
                masterVolume = value
                AudioEngine.setMasterVolume(value)
            },
            onRoomMixChanged = { value ->
                roomLevel = value
                AudioEngine.setRoomMix(value)
            },
            diagnosticsProvider = AudioEngine::diagnostics,
            sessionController = sessionController,
            audioAvailable = audioAvailable,
            showDiagnostics = true,
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .windowInsetsPadding(bottomInsets)
                .padding(start = 8.dp, bottom = 8.dp)
                .background(Color(0xcc08090b), MaterialTheme.shapes.medium)
                .padding(6.dp),
        ) {
            FilledTonalButton(
                onClick = {
                    if (isRecording) {
                        val capture = recorder.stop()
                        isRecording = false
                        isExporting = true
                        status = "Exporting diagnostic bundle"
                        scope.launch {
                            runCatching {
                                withContext(Dispatchers.IO) {
                                    recorder.export(capture, File(context.cacheDir, "diagnostics"))
                                }
                            }.onSuccess { result ->
                                status = "${result.strikeCount} strikes · ${result.file.name}"
                            }.onFailure { failure ->
                                status = "Export failed: ${failure.message ?: failure::class.java.simpleName}"
                            }
                            isExporting = false
                        }
                    } else {
                        val diagnostics = AudioEngine.diagnostics()
                        val metadata = DiagnosticMetadataFactory.create(
                            context = context,
                            diagnostics = diagnostics,
                            masterVolume = masterVolume,
                            roomLevel = roomLevel,
                        )
                        val sessionId = recorder.start(metadata)
                        recorder.recordAudioDiagnostics(diagnostics)
                        isRecording = true
                        status = "Recording ${sessionId.take(8)}"
                    }
                },
                enabled = audioAvailable && !isExporting,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = if (isRecording) Color(0xffa93232) else Color(0xff292d32),
                    contentColor = Color(0xfff7f4ee),
                ),
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(if (isRecording) "STOP & EXPORT" else "START DIAG")
            }

            Box {
                FilledTonalButton(
                    onClick = { markerMenuExpanded = true },
                    enabled = isRecording,
                    modifier = Modifier.defaultMinSize(minHeight = 48.dp),
                ) {
                    Text("MARK")
                }
                DropdownMenu(
                    expanded = markerMenuExpanded,
                    onDismissRequest = { markerMenuExpanded = false },
                ) {
                    DiagnosticMarkerType.entries.forEach { markerType ->
                        DropdownMenuItem(
                            text = { Text(markerType.displayLabel()) },
                            onClick = {
                                recorder.recordMarker(markerType)
                                status = "Marker: ${markerType.displayLabel()}"
                                markerMenuExpanded = false
                            },
                        )
                    }
                }
            }

            Text(
                text = status,
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xffaab2bf),
                modifier = Modifier.padding(horizontal = 4.dp),
            )
        }
    }
}

private fun DiagnosticMarkerType.displayLabel(): String = when (this) {
    DiagnosticMarkerType.SOUNDS_WRONG -> "Sounds wrong"
    DiagnosticMarkerType.WRONG_INSTRUMENT -> "Wrong instrument"
    DiagnosticMarkerType.WRONG_ARTICULATION -> "Wrong articulation"
    DiagnosticMarkerType.TOO_LOUD -> "Too loud"
    DiagnosticMarkerType.TOO_QUIET -> "Too quiet"
    DiagnosticMarkerType.DELAYED -> "Delayed"
    DiagnosticMarkerType.VISUAL_PROBLEM -> "Visual problem"
    DiagnosticMarkerType.MISSED_HIT -> "Missed hit"
    DiagnosticMarkerType.OTHER -> "Other"
}
