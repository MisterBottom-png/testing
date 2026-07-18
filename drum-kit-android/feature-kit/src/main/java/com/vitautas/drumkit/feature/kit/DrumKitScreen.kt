package com.vitautas.drumkit.feature.kit

import android.graphics.Paint as AndroidPaint
import android.graphics.Typeface
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.widthIn
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import com.vitautas.drumkit.input.DrumSurfaceView
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.CircleHitRegion
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.EllipseHitRegion
import com.vitautas.drumkit.model.HitRegion
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.InstrumentLayout
import com.vitautas.drumkit.model.PolygonHitRegion
import com.vitautas.drumkit.model.RectangleHitRegion
import com.vitautas.drumkit.model.StudioKitDefinition
import com.vitautas.drumkit.model.StudioKitGeometry
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

@Composable
fun DrumKitScreen(
    onStrike: (DrumStrike) -> Unit,
    onMasterVolumeChanged: (Float) -> Unit,
    onRoomMixChanged: (Float) -> Unit,
    diagnosticsProvider: () -> AudioDiagnostics,
    sessionController: DrumKitSessionController,
    modifier: Modifier = Modifier,
    audioAvailable: Boolean = true,
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
    var showHitRegions by remember { mutableStateOf(false) }
    var lastDebugStrike by remember { mutableStateOf<DrumStrike?>(null) }
    val recorder = remember { PerformanceRecorder() }
    val topSafeInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)
    val bottomSafeInsets = WindowInsets.safeDrawing.only(WindowInsetsSides.Bottom + WindowInsetsSides.Horizontal)
    val strikeDispatcher = remember(onStrike, recorder, showHitRegions) {
        { strike: DrumStrike ->
            onStrike(strike)
            recorder.record(strike)
            if (showHitRegions) lastDebugStrike = strike
        }
    }
    val stopRecordingHandler: () -> Unit = remember(recorder) {
        {
            recorder.stopIfRecording()?.let { take ->
                lastTake = take
                isRecording = false
            }
        }
    }

    DisposableEffect(sessionController, stopRecordingHandler) {
        sessionController.bindStopRecordingHandler(stopRecordingHandler)
        onDispose {
            sessionController.unbindStopRecordingHandler(stopRecordingHandler)
        }
    }

    LaunchedEffect(audioAvailable, stopRecordingHandler) {
        if (!audioAvailable) stopRecordingHandler()
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
                    this.onStrike = strikeDispatcher
                    hapticsEnabled = haptics
                }
            },
            update = { surface ->
                surface.onStrike = strikeDispatcher
                surface.hapticsEnabled = haptics
            },
            onReset = null,
            onRelease = { surface -> surface.releaseResources() },
            modifier = Modifier.fillMaxSize(),
        )

        if (showDiagnostics && showHitRegions) {
            HitRegionOverlay(lastStrike = lastDebugStrike)
        }

        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .windowInsetsPadding(topSafeInsets)
                .padding(start = 8.dp, top = 6.dp),
        ) {
            FilledTonalButton(
                onClick = { kitSelectorExpanded = true },
                modifier = Modifier.defaultMinSize(minWidth = 72.dp, minHeight = 48.dp),
            ) {
                Text("KIT")
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
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .windowInsetsPadding(topSafeInsets)
                .padding(end = 8.dp, top = 6.dp),
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
                enabled = audioAvailable,
                colors = ButtonDefaults.filledTonalButtonColors(
                    containerColor = if (isRecording) Color(0xffa93232) else Color(0xff292d32),
                    contentColor = Color(0xfff7f4ee),
                ),
                modifier = Modifier.defaultMinSize(minWidth = 56.dp, minHeight = 48.dp),
            ) {
                Text(if (isRecording) "STOP" else "REC")
            }
            FilledTonalButton(
                onClick = { settingsExpanded = !settingsExpanded },
                modifier = Modifier.defaultMinSize(minWidth = 56.dp, minHeight = 48.dp),
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
                    .windowInsetsPadding(topSafeInsets)
                    .padding(end = 8.dp, top = 64.dp)
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
                    if (showDiagnostics) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .defaultMinSize(minHeight = 48.dp),
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Hit map")
                                Text(
                                    "Playable regions and last selected target",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = Color(0xffaab2bf),
                                )
                            }
                            Switch(
                                checked = showHitRegions,
                                onCheckedChange = {
                                    showHitRegions = it
                                    if (!it) lastDebugStrike = null
                                },
                            )
                        }
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

        if (!audioAvailable) {
            Text(
                text = "Audio unavailable · retrying",
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xffffa08d),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .windowInsetsPadding(bottomSafeInsets)
                    .background(Color(0xcc000000), MaterialTheme.shapes.small)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            )
        } else if (showDiagnostics) {
            Text(
                text = diagnostics.toDisplayText(),
                style = MaterialTheme.typography.labelSmall,
                color = Color(0xffaab2bf),
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .windowInsetsPadding(bottomSafeInsets)
                    .background(Color(0x99000000), MaterialTheme.shapes.small)
                    .padding(horizontal = 10.dp, vertical = 5.dp),
            )
        }
    }
}

@Composable
private fun HitRegionOverlay(lastStrike: DrumStrike?) {
    val density = LocalDensity.current
    val strokeWidth = with(density) { 1.5.dp.toPx() }
    val selectedStrokeWidth = with(density) { 3.dp.toPx() }
    val markerRadius = with(density) { 9.dp.toPx() }
    val definitions = remember { StudioKitDefinition.hitTestOrder.asReversed() }
    val textPaint = remember(density) {
        AndroidPaint(AndroidPaint.ANTI_ALIAS_FLAG).apply {
            color = android.graphics.Color.WHITE
            textAlign = AndroidPaint.Align.CENTER
            textSize = with(density) { 10.sp.toPx() }
            typeface = Typeface.DEFAULT_BOLD
            setShadowLayer(with(density) { 2.dp.toPx() }, 0f, with(density) { 1.dp.toPx() }, android.graphics.Color.BLACK)
        }
    }

    Canvas(modifier = Modifier.fillMaxSize()) {
        val aspectRatio = size.width / size.height
        for (definition in definitions) {
            val selected = definition.id == lastStrike?.instrument
            val color = debugColor(definition.id)
            drawDebugHitRegion(
                layout = definition.layout,
                color = color,
                strokeWidth = if (selected) selectedStrokeWidth else strokeWidth,
                selected = selected,
            )
            val center = StudioKitGeometry.screenPoint(
                layout = definition.layout,
                normalizedX = 0.5f,
                normalizedY = 0.5f,
                aspectRatio = aspectRatio,
            )
            textPaint.color = color.toArgb()
            drawContext.canvas.nativeCanvas.drawText(
                "${definition.id.label.uppercase()} P${definition.layout.hitTestPriority}",
                center.x * size.width,
                center.y * size.height,
                textPaint,
            )
        }

        val strike = lastStrike ?: return@Canvas
        val definition = StudioKitDefinition.instruments.firstOrNull { it.id == strike.instrument } ?: return@Canvas
        val screenPoint = StudioKitGeometry.screenPoint(
            layout = definition.layout,
            normalizedX = strike.normalizedX,
            normalizedY = strike.normalizedY,
            aspectRatio = aspectRatio,
        )
        val marker = Offset(screenPoint.x * size.width, screenPoint.y * size.height)
        val color = debugColor(strike.instrument)
        val overlapCount = StudioKitGeometry.matchingInstrumentCount(
            screenX = screenPoint.x,
            screenY = screenPoint.y,
            aspectRatio = aspectRatio,
        )

        drawCircle(Color.Black.copy(alpha = 0.55f), markerRadius * 1.45f, marker)
        drawCircle(color, markerRadius, marker, style = Stroke(width = selectedStrokeWidth))
        drawLine(
            color = color,
            start = Offset(marker.x - markerRadius, marker.y),
            end = Offset(marker.x + markerRadius, marker.y),
            strokeWidth = strokeWidth,
        )
        drawLine(
            color = color,
            start = Offset(marker.x, marker.y - markerRadius),
            end = Offset(marker.x, marker.y + markerRadius),
            strokeWidth = strokeWidth,
        )
        textPaint.color = color.toArgb()
        drawContext.canvas.nativeCanvas.drawText(
            "${strike.instrument.label.uppercase()} · $overlapCount TARGET${if (overlapCount == 1) "" else "S"}",
            marker.x,
            marker.y - markerRadius * 1.7f,
            textPaint,
        )
    }
}

private fun DrawScope.drawDebugHitRegion(
    layout: InstrumentLayout,
    color: Color,
    strokeWidth: Float,
    selected: Boolean,
) {
    val fillColor = color.copy(alpha = if (selected) 0.30f else 0.12f)
    val strokeColor = color.copy(alpha = if (selected) 1f else 0.78f)
    val pivot = Offset(
        layout.drawBounds.centerX * size.width,
        layout.drawBounds.centerY * size.height,
    )

    withTransform({
        rotate(degrees = layout.rotationDegrees, pivot = pivot)
    }) {
        drawUnrotatedHitRegion(
            region = layout.hitRegion,
            fillColor = fillColor,
            strokeColor = strokeColor,
            strokeWidth = strokeWidth,
        )
    }
}

private fun DrawScope.drawUnrotatedHitRegion(
    region: HitRegion,
    fillColor: Color,
    strokeColor: Color,
    strokeWidth: Float,
) {
    when (region) {
        is RectangleHitRegion -> {
            val bounds = region.bounds
            val topLeft = Offset(bounds.left * size.width, bounds.top * size.height)
            val regionSize = Size(bounds.width * size.width, bounds.height * size.height)
            drawRect(fillColor, topLeft, regionSize)
            drawRect(strokeColor, topLeft, regionSize, style = Stroke(width = strokeWidth))
        }

        is EllipseHitRegion -> {
            val bounds = region.bounds
            val topLeft = Offset(bounds.left * size.width, bounds.top * size.height)
            val regionSize = Size(bounds.width * size.width, bounds.height * size.height)
            drawOval(fillColor, topLeft, regionSize)
            drawOval(strokeColor, topLeft, regionSize, style = Stroke(width = strokeWidth))
        }

        is CircleHitRegion -> {
            val center = Offset(region.center.x * size.width, region.center.y * size.height)
            val radius = region.radius * size.height
            drawCircle(fillColor, radius, center)
            drawCircle(strokeColor, radius, center, style = Stroke(width = strokeWidth))
        }

        is PolygonHitRegion -> {
            val path = Path()
            val first = region.points.first()
            path.moveTo(first.x * size.width, first.y * size.height)
            for (index in 1 until region.points.size) {
                val point = region.points[index]
                path.lineTo(point.x * size.width, point.y * size.height)
            }
            path.close()
            drawPath(path, fillColor)
            drawPath(path, strokeColor, style = Stroke(width = strokeWidth))
        }
    }
}

private fun debugColor(instrument: InstrumentId): Color = when (instrument) {
    InstrumentId.KICK -> Color(0xffff6b6b)
    InstrumentId.SNARE -> Color(0xfff8f9fa)
    InstrumentId.TOM_HIGH -> Color(0xffffd166)
    InstrumentId.TOM_MID -> Color(0xfff8961e)
    InstrumentId.FLOOR_TOM -> Color(0xffef476f)
    InstrumentId.HI_HAT -> Color(0xff06d6a0)
    InstrumentId.CRASH -> Color(0xff4cc9f0)
    InstrumentId.RIDE -> Color(0xffb388ff)
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
