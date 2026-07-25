package com.vitautas.drumkit

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.runtime.DisposableEffect
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
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val NativeOutcomePollIntervalMillis = 50L
private const val NativeOutcomeFinalPollIntervalMillis = 5L
private const val NativeOutcomeFinalPollLimit = 20

@Composable
internal fun DiagnosticDrumKitScreen(
    sessionController: DrumKitSessionController,
    audioAvailable: Boolean,
    onTouchObserverChanged: (DiagnosticTouchObserver?) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val recorder = remember { DiagnosticSessionBundleRecorder() }
    val dispatchTraceRecorder = remember { DiagnosticDispatchTraceRecorder() }
    var isRecording by remember { mutableStateOf(false) }
    var isExporting by remember { mutableStateOf(false) }
    var isChoosingSaveLocation by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var latestBundle by remember { mutableStateOf<File?>(null) }
    var pendingSaveBundle by remember { mutableStateOf<File?>(null) }
    var markerMenuExpanded by remember { mutableStateOf(false) }
    var masterVolume by remember { mutableFloatStateOf(0.76f) }
    var roomLevel by remember { mutableFloatStateOf(0.32f) }
    var status by remember { mutableStateOf("Diagnostic session idle") }
    val bottomInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal)

    val saveBundleLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/zip"),
    ) { destination ->
        isChoosingSaveLocation = false
        val source = pendingSaveBundle
        pendingSaveBundle = null
        if (destination == null) {
            status = source?.let { "Save cancelled · ${it.name}" } ?: "Save cancelled"
            return@rememberLauncherForActivityResult
        }
        if (source == null || !source.isFile) {
            status = "Save failed: diagnostic bundle unavailable"
            return@rememberLauncherForActivityResult
        }

        isSaving = true
        status = "Saving ${source.name}"
        scope.launch {
            runCatching {
                withContext(Dispatchers.IO) {
                    val output = checkNotNull(context.contentResolver.openOutputStream(destination)) {
                        "selected destination is unavailable"
                    }
                    DiagnosticBundleSaver.copyTo(source, output)
                }
            }.onSuccess { copiedBytes ->
                status = "Saved ${source.name} · $copiedBytes bytes"
            }.onFailure { failure ->
                status = "Save failed: ${failure.message ?: failure::class.java.simpleName}"
            }
            isSaving = false
        }
    }

    fun requestBundleSave(file: File) {
        if (!file.isFile) {
            status = "Save failed: diagnostic bundle unavailable"
            return
        }
        pendingSaveBundle = file
        isChoosingSaveLocation = true
        status = "Choose save location · ${file.name}"
        saveBundleLauncher.launch(file.name)
    }

    DisposableEffect(recorder, onTouchObserverChanged) {
        val observer: DiagnosticTouchObserver = { event, viewportWidth, viewportHeight ->
            recorder.recordTouchEvent(event, viewportWidth, viewportHeight)
        }
        onTouchObserverChanged(observer)
        onDispose { onTouchObserverChanged(null) }
    }

    LaunchedEffect(isRecording) {
        if (!isRecording) return@LaunchedEffect
        while (isRecording) {
            recorder.recordAudioDiagnostics(AudioEngine.diagnostics())
            repeat(10) {
                if (!isRecording) return@LaunchedEffect
                dispatchTraceRecorder.recordNativeOutcomes(
                    AudioEngine.drainDiagnosticDispatchOutcomes(),
                )
                delay(NativeOutcomePollIntervalMillis)
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        DrumKitScreen(
            onStrike = { strike ->
                if (isRecording) {
                    val dispatchDecision = AudioEngine.triggerWithDiagnostics(strike)
                    recorder.recordStrike(strike)
                    dispatchTraceRecorder.record(strike, dispatchDecision)
                } else {
                    AudioEngine.trigger(strike)
                }
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
                        status = "Finalising native trace"
                        scope.launch {
                            runCatching {
                                var attempts = 0
                                while (
                                    attempts < NativeOutcomeFinalPollLimit &&
                                    dispatchTraceRecorder.hasPendingNativeOutcomes()
                                ) {
                                    dispatchTraceRecorder.recordNativeOutcomes(
                                        AudioEngine.drainDiagnosticDispatchOutcomes(),
                                    )
                                    if (!dispatchTraceRecorder.hasPendingNativeOutcomes()) break
                                    attempts += 1
                                    delay(NativeOutcomeFinalPollIntervalMillis)
                                }
                                dispatchTraceRecorder.recordNativeOutcomes(
                                    AudioEngine.drainDiagnosticDispatchOutcomes(),
                                )
                                val dispatchTraceCapture = dispatchTraceRecorder.stop()
                                status = "Exporting diagnostic bundle"
                                withContext(Dispatchers.IO) {
                                    val result = recorder.export(capture, File(context.cacheDir, "diagnostics"))
                                    dispatchTraceRecorder.augmentBundle(
                                        bundle = result.file,
                                        sessionCapture = capture,
                                        traceCapture = dispatchTraceCapture,
                                    )
                                    result
                                }
                            }.onSuccess { result ->
                                latestBundle = result.file
                                requestBundleSave(result.file)
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
                        val staleOutcomes = AudioEngine.drainDiagnosticDispatchOutcomes()
                        val sessionId = recorder.start(metadata)
                        dispatchTraceRecorder.start(staleOutcomes.droppedOutcomeCount)
                        recorder.recordAudioDiagnostics(diagnostics)
                        isRecording = true
                        status = "Recording ${sessionId.take(8)}"
                    }
                },
                enabled = audioAvailable && !isExporting && !isSaving && !isChoosingSaveLocation,
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

            FilledTonalButton(
                onClick = { latestBundle?.let(::requestBundleSave) },
                enabled = latestBundle?.isFile == true &&
                    !isRecording &&
                    !isExporting &&
                    !isSaving &&
                    !isChoosingSaveLocation,
                modifier = Modifier.defaultMinSize(minHeight = 48.dp),
            ) {
                Text(if (isSaving) "SAVING" else "SAVE ZIP")
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
