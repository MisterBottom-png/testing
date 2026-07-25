package com.vitautas.drumkit

import android.os.Build
import android.view.MotionEvent
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.StudioKitDefinition
import com.vitautas.drumkit.model.StudioKitGeometry
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

private const val DiagnosticTouchSchemaVersion = 1
private const val DefaultTouchEventCapacity = 32_768
private const val NanosPerMillisecond = 1_000_000L

internal typealias DiagnosticTouchObserver = (MotionEvent, Int, Int) -> Unit

internal enum class DiagnosticTouchAction(val wireName: String) {
    DOWN("down"),
    POINTER_DOWN("pointer_down"),
    MOVE("move"),
    POINTER_UP("pointer_up"),
    UP("up"),
    CANCEL("cancel"),
    OTHER("other"),
}

internal data class DiagnosticHistoricalTouchSample(
    val eventTimeNanos: Long,
    val rawX: Float,
    val rawY: Float,
    val normalizedX: Float,
    val normalizedY: Float,
    val pressure: Float,
    val contactSize: Float,
    val orientationRadians: Float,
)

internal data class DiagnosticTouchSample(
    val eventTimeNanos: Long,
    val action: DiagnosticTouchAction,
    val actionMasked: Int,
    val actionIndex: Int,
    val pointerId: Int,
    val pointerIndex: Int,
    val isActionPointer: Boolean,
    val acceptedStrike: Boolean,
    val rawX: Float,
    val rawY: Float,
    val normalizedX: Float,
    val normalizedY: Float,
    val pressure: Float,
    val contactSize: Float,
    val toolType: String,
    val orientationRadians: Float,
    val hitRegionCount: Int,
    val candidateInstruments: List<InstrumentId>,
    val selectedInstrument: InstrumentId?,
    val rejectionReason: String?,
    val historicalSamples: List<DiagnosticHistoricalTouchSample>,
)

internal data class RecordedDiagnosticTouchEvent(
    val offsetNanos: Long,
    val motionEventSequence: Long,
    val sample: DiagnosticTouchSample,
)

internal data class DiagnosticSessionBundleCapture(
    val baseCapture: DiagnosticSessionCapture,
    val touchEvents: List<RecordedDiagnosticTouchEvent>,
    val droppedTouchEventCount: Int,
)

internal data class DiagnosticSessionBundleExportResult(
    val file: File,
    val strikeCount: Int,
    val diagnosticsCount: Int,
    val markerCount: Int,
    val touchEventCount: Int,
    val droppedStrikeCount: Int,
    val droppedDiagnosticsCount: Int,
    val droppedMarkerCount: Int,
    val droppedTouchEventCount: Int,
)

internal object DiagnosticTouchEventFactory {
    fun capture(event: MotionEvent, viewportWidth: Int, viewportHeight: Int): List<DiagnosticTouchSample> {
        if (viewportWidth <= 0 || viewportHeight <= 0 || event.pointerCount <= 0) return emptyList()
        val aspectRatio = viewportWidth.toFloat() / viewportHeight.toFloat()
        val action = event.actionMasked.toDiagnosticTouchAction()
        return buildList(event.pointerCount) {
            for (pointerIndex in 0 until event.pointerCount) {
                val localX = event.getX(pointerIndex)
                val localY = event.getY(pointerIndex)
                val rawX = event.rawX(pointerIndex)
                val rawY = event.rawY(pointerIndex)
                val normalizedX = localX / viewportWidth.toFloat()
                val normalizedY = localY / viewportHeight.toFloat()
                val candidates = StudioKitDefinition.hitTestOrder
                    .asSequence()
                    .filter { definition ->
                        StudioKitGeometry.contains(
                            layout = definition.layout,
                            screenX = normalizedX,
                            screenY = normalizedY,
                            aspectRatio = aspectRatio,
                        )
                    }
                    .map { it.id }
                    .toList()
                val selectedInstrument = candidates.firstOrNull()
                val isActionPointer = pointerIndex == event.actionIndex
                val acceptedStrike = isActionPointer &&
                    (action == DiagnosticTouchAction.DOWN || action == DiagnosticTouchAction.POINTER_DOWN) &&
                    selectedInstrument != null
                add(
                    DiagnosticTouchSample(
                        eventTimeNanos = event.eventTime * NanosPerMillisecond,
                        action = action,
                        actionMasked = event.actionMasked,
                        actionIndex = event.actionIndex,
                        pointerId = event.getPointerId(pointerIndex),
                        pointerIndex = pointerIndex,
                        isActionPointer = isActionPointer,
                        acceptedStrike = acceptedStrike,
                        rawX = rawX,
                        rawY = rawY,
                        normalizedX = normalizedX,
                        normalizedY = normalizedY,
                        pressure = event.getPressure(pointerIndex).finiteOrZero().coerceAtLeast(0f),
                        contactSize = event.getSize(pointerIndex).finiteOrZero().coerceAtLeast(0f),
                        toolType = event.getToolType(pointerIndex).toolTypeName(),
                        orientationRadians = event.getOrientation(pointerIndex).finiteOrZero(),
                        hitRegionCount = candidates.size,
                        candidateInstruments = candidates,
                        selectedInstrument = selectedInstrument,
                        rejectionReason = when {
                            selectedInstrument != null -> null
                            !normalizedX.isFinite() || !normalizedY.isFinite() -> "non_finite_coordinate"
                            else -> "outside_hit_regions"
                        },
                        historicalSamples = historicalSamples(
                            event = event,
                            pointerIndex = pointerIndex,
                            viewportWidth = viewportWidth,
                            viewportHeight = viewportHeight,
                            rawOffsetX = rawX - localX,
                            rawOffsetY = rawY - localY,
                        ),
                    ),
                )
            }
        }
    }

    private fun historicalSamples(
        event: MotionEvent,
        pointerIndex: Int,
        viewportWidth: Int,
        viewportHeight: Int,
        rawOffsetX: Float,
        rawOffsetY: Float,
    ): List<DiagnosticHistoricalTouchSample> = buildList(event.historySize) {
        for (historyIndex in 0 until event.historySize) {
            val localX = event.getHistoricalX(pointerIndex, historyIndex)
            val localY = event.getHistoricalY(pointerIndex, historyIndex)
            add(
                DiagnosticHistoricalTouchSample(
                    eventTimeNanos = event.getHistoricalEventTime(historyIndex) * NanosPerMillisecond,
                    rawX = localX + rawOffsetX,
                    rawY = localY + rawOffsetY,
                    normalizedX = localX / viewportWidth.toFloat(),
                    normalizedY = localY / viewportHeight.toFloat(),
                    pressure = event.getHistoricalPressure(pointerIndex, historyIndex).finiteOrZero().coerceAtLeast(0f),
                    contactSize = event.getHistoricalSize(pointerIndex, historyIndex).finiteOrZero().coerceAtLeast(0f),
                    orientationRadians = event.getHistoricalAxisValue(
                        MotionEvent.AXIS_ORIENTATION,
                        pointerIndex,
                        historyIndex,
                    ).finiteOrZero(),
                ),
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun MotionEvent.rawX(pointerIndex: Int): Float =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getRawX(pointerIndex)
        } else {
            rawX + getX(pointerIndex) - x
        }

    @Suppress("DEPRECATION")
    private fun MotionEvent.rawY(pointerIndex: Int): Float =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getRawY(pointerIndex)
        } else {
            rawY + getY(pointerIndex) - y
        }

    private fun Int.toolTypeName(): String = when (this) {
        MotionEvent.TOOL_TYPE_FINGER -> "finger"
        MotionEvent.TOOL_TYPE_STYLUS -> "stylus"
        MotionEvent.TOOL_TYPE_MOUSE -> "mouse"
        MotionEvent.TOOL_TYPE_ERASER -> "eraser"
        MotionEvent.TOOL_TYPE_UNKNOWN -> "unknown"
        else -> "tool_$this"
    }

    private fun Int.toDiagnosticTouchAction(): DiagnosticTouchAction = when (this) {
        MotionEvent.ACTION_DOWN -> DiagnosticTouchAction.DOWN
        MotionEvent.ACTION_POINTER_DOWN -> DiagnosticTouchAction.POINTER_DOWN
        MotionEvent.ACTION_MOVE -> DiagnosticTouchAction.MOVE
        MotionEvent.ACTION_POINTER_UP -> DiagnosticTouchAction.POINTER_UP
        MotionEvent.ACTION_UP -> DiagnosticTouchAction.UP
        MotionEvent.ACTION_CANCEL -> DiagnosticTouchAction.CANCEL
        else -> DiagnosticTouchAction.OTHER
    }

    private fun Float.finiteOrZero(): Float = if (isFinite()) this else 0f
}

internal class DiagnosticSessionBundleRecorder(
    strikeCapacity: Int = 16_384,
    diagnosticsCapacity: Int = 7_200,
    markerCapacity: Int = 256,
    touchEventCapacity: Int = DefaultTouchEventCapacity,
    private val monotonicClockNanos: () -> Long = System::nanoTime,
    wallClockMillis: () -> Long = System::currentTimeMillis,
    sessionIdFactory: () -> String = { UUID.randomUUID().toString() },
) {
    private val delegate = DiagnosticSessionRecorder(
        strikeCapacity = strikeCapacity,
        diagnosticsCapacity = diagnosticsCapacity,
        markerCapacity = markerCapacity,
        monotonicClockNanos = monotonicClockNanos,
        wallClockMillis = wallClockMillis,
        sessionIdFactory = sessionIdFactory,
    )
    private val validatedTouchEventCapacity = touchEventCapacity.requirePositive("touchEventCapacity")
    private val touchEvents = ArrayList<RecordedDiagnosticTouchEvent>(validatedTouchEventCapacity.coerceAtMost(1_024))
    private var touchSessionStartNanos = 0L
    private var nextMotionEventSequence = 0L
    private var droppedTouchEventCount = 0

    val isRecording: Boolean
        get() = delegate.isRecording

    fun start(metadata: DiagnosticSessionMetadata): String {
        val sessionId = delegate.start(metadata)
        touchEvents.clear()
        droppedTouchEventCount = 0
        nextMotionEventSequence = 0L
        touchSessionStartNanos = monotonicClockNanos()
        return sessionId
    }

    fun recordStrike(strike: DrumStrike) = delegate.recordStrike(strike)

    fun recordAudioDiagnostics(value: AudioDiagnostics) = delegate.recordAudioDiagnostics(value)

    fun recordMarker(type: DiagnosticMarkerType, note: String? = null) = delegate.recordMarker(type, note)

    fun recordTouchEvent(event: MotionEvent, viewportWidth: Int, viewportHeight: Int) {
        if (!isRecording) return
        val sequence = nextMotionEventSequence++
        for (sample in DiagnosticTouchEventFactory.capture(event, viewportWidth, viewportHeight)) {
            recordTouchSample(sample, sequence)
        }
    }

    internal fun recordTouchSample(sample: DiagnosticTouchSample, motionEventSequence: Long = nextMotionEventSequence++) {
        if (!isRecording) return
        if (touchEvents.size >= validatedTouchEventCapacity) {
            droppedTouchEventCount += 1
            return
        }
        touchEvents += RecordedDiagnosticTouchEvent(
            offsetNanos = (monotonicClockNanos() - touchSessionStartNanos).coerceAtLeast(0L),
            motionEventSequence = motionEventSequence,
            sample = sample.sanitized(),
        )
    }

    fun cancel() {
        delegate.cancel()
        touchEvents.clear()
        droppedTouchEventCount = 0
        nextMotionEventSequence = 0L
    }

    fun stop(): DiagnosticSessionBundleCapture {
        val baseCapture = delegate.stop()
        val capture = DiagnosticSessionBundleCapture(
            baseCapture = baseCapture,
            touchEvents = touchEvents.toList(),
            droppedTouchEventCount = droppedTouchEventCount,
        )
        touchEvents.clear()
        droppedTouchEventCount = 0
        nextMotionEventSequence = 0L
        return capture
    }

    fun export(capture: DiagnosticSessionBundleCapture, outputDirectory: File): DiagnosticSessionBundleExportResult {
        val baseResult = delegate.export(capture.baseCapture, outputDirectory)
        augmentBundle(baseResult.file, capture)
        return DiagnosticSessionBundleExportResult(
            file = baseResult.file,
            strikeCount = baseResult.strikeCount,
            diagnosticsCount = baseResult.diagnosticsCount,
            markerCount = baseResult.markerCount,
            touchEventCount = capture.touchEvents.size,
            droppedStrikeCount = baseResult.droppedStrikeCount,
            droppedDiagnosticsCount = baseResult.droppedDiagnosticsCount,
            droppedMarkerCount = baseResult.droppedMarkerCount,
            droppedTouchEventCount = capture.droppedTouchEventCount,
        )
    }

    fun stopAndExport(outputDirectory: File): DiagnosticSessionBundleExportResult = export(stop(), outputDirectory)

    private fun augmentBundle(bundle: File, capture: DiagnosticSessionBundleCapture) {
        val originalEntries = linkedMapOf<String, ByteArray>()
        ZipFile(bundle).use { zip ->
            val entries = zip.entries()
            while (entries.hasMoreElements()) {
                val entry = entries.nextElement()
                if (entry.name != "manifest.json" && entry.name != "checksums.sha256") {
                    originalEntries[entry.name] = zip.getInputStream(entry).use { it.readBytes() }
                }
            }
        }

        val summary = originalEntries["summary.txt"]?.toString(StandardCharsets.UTF_8).orEmpty() + buildString {
            append("\nTouch events: ").append(capture.touchEvents.size).append('\n')
            append("Dropped touch events: ").append(capture.droppedTouchEventCount).append('\n')
        }
        originalEntries["summary.txt"] = summary.toByteArray(StandardCharsets.UTF_8)

        val entries = linkedMapOf<String, ByteArray>()
        entries["manifest.json"] = manifestJson(capture).toByteArray(StandardCharsets.UTF_8)
        originalEntries["session.json"]?.let { entries["session.json"] = it }
        entries["touch-events.jsonl"] = touchEventsJsonLines(capture).toByteArray(StandardCharsets.UTF_8)
        for ((name, bytes) in originalEntries) {
            if (name != "session.json") entries[name] = bytes
        }
        entries["checksums.sha256"] = buildString {
            for ((name, bytes) in entries) {
                append(sha256(bytes)).append("  ").append(name).append('\n')
            }
        }.toByteArray(StandardCharsets.UTF_8)

        val temporary = File(bundle.parentFile, ".${bundle.name}.touch.tmp")
        if (temporary.exists()) temporary.delete()
        try {
            temporary.outputStream().buffered().use { output ->
                ZipOutputStream(output).use { zip ->
                    for ((name, bytes) in entries) {
                        zip.putNextEntry(ZipEntry(name).apply { time = capture.baseCapture.endedAtEpochMillis })
                        zip.write(bytes)
                        zip.closeEntry()
                    }
                }
            }
            replaceFile(temporary, bundle)
        } catch (failure: Throwable) {
            temporary.delete()
            throw failure
        }
    }

    private fun manifestJson(capture: DiagnosticSessionBundleCapture): String = buildString {
        val base = capture.baseCapture
        append("{\n")
        append("  \"schemaVersion\": ").append(DiagnosticTouchSchemaVersion).append(",\n")
        append("  \"sessionId\": ").appendJson(base.sessionId).append(",\n")
        append("  \"bundleState\": \"step_1_2_partial\",\n")
        append("  \"includedFiles\": [\"session.json\", \"touch-events.jsonl\", \"strikes.jsonl\", \"audio-diagnostics.csv\", \"markers.json\", \"summary.txt\", \"checksums.sha256\"],\n")
        append("  \"plannedFilesNotYetImplemented\": [\"performance.csv\", \"generated-output.wav\"],\n")
        append("  \"droppedData\": {\n")
        append("    \"touchEvents\": ").append(capture.droppedTouchEventCount).append(",\n")
        append("    \"strikes\": ").append(base.droppedStrikeCount).append(",\n")
        append("    \"audioDiagnostics\": ").append(base.droppedDiagnosticsCount).append(",\n")
        append("    \"markers\": ").append(base.droppedMarkerCount).append("\n")
        append("  }\n")
        append("}\n")
    }

    private fun touchEventsJsonLines(capture: DiagnosticSessionBundleCapture): String = buildString {
        for (recorded in capture.touchEvents) {
            val sample = recorded.sample
            append('{')
            append("\"schemaVersion\":").append(DiagnosticTouchSchemaVersion).append(',')
            append("\"offsetNanos\":").append(recorded.offsetNanos).append(',')
            append("\"motionEventSequence\":").append(recorded.motionEventSequence).append(',')
            append("\"eventTimeNanos\":").append(sample.eventTimeNanos).append(',')
            append("\"action\":").appendJson(sample.action.wireName).append(',')
            append("\"actionMasked\":").append(sample.actionMasked).append(',')
            append("\"actionIndex\":").append(sample.actionIndex).append(',')
            append("\"pointerId\":").append(sample.pointerId).append(',')
            append("\"pointerIndex\":").append(sample.pointerIndex).append(',')
            append("\"isActionPointer\":").append(sample.isActionPointer).append(',')
            append("\"acceptedStrike\":").append(sample.acceptedStrike).append(',')
            append("\"rawX\":").append(sample.rawX).append(',')
            append("\"rawY\":").append(sample.rawY).append(',')
            append("\"normalizedX\":").append(sample.normalizedX).append(',')
            append("\"normalizedY\":").append(sample.normalizedY).append(',')
            append("\"pressure\":").append(sample.pressure).append(',')
            append("\"contactSize\":").append(sample.contactSize).append(',')
            append("\"toolType\":").appendJson(sample.toolType).append(',')
            append("\"orientationRadians\":").append(sample.orientationRadians).append(',')
            append("\"hitRegionCount\":").append(sample.hitRegionCount).append(',')
            append("\"candidateInstruments\":[")
            sample.candidateInstruments.forEachIndexed { index, instrument ->
                if (index > 0) append(',')
                appendJson(instrument.name.lowercase())
            }
            append("],")
            append("\"selectedInstrument\":")
            sample.selectedInstrument?.let { appendJson(it.name.lowercase()) } ?: append("null")
            append(',')
            append("\"rejectionReason\":")
            sample.rejectionReason?.let(::appendJson) ?: append("null")
            append(',')
            append("\"historicalSamples\":[")
            sample.historicalSamples.forEachIndexed { index, historical ->
                if (index > 0) append(',')
                append('{')
                append("\"eventTimeNanos\":").append(historical.eventTimeNanos).append(',')
                append("\"rawX\":").append(historical.rawX).append(',')
                append("\"rawY\":").append(historical.rawY).append(',')
                append("\"normalizedX\":").append(historical.normalizedX).append(',')
                append("\"normalizedY\":").append(historical.normalizedY).append(',')
                append("\"pressure\":").append(historical.pressure).append(',')
                append("\"contactSize\":").append(historical.contactSize).append(',')
                append("\"orientationRadians\":").append(historical.orientationRadians)
                append('}')
            }
            append("]}\n")
        }
    }

    private fun DiagnosticTouchSample.sanitized(): DiagnosticTouchSample = copy(
        rawX = rawX.finiteOrZero(),
        rawY = rawY.finiteOrZero(),
        normalizedX = normalizedX.finiteOrZero(),
        normalizedY = normalizedY.finiteOrZero(),
        pressure = pressure.finiteOrZero().coerceAtLeast(0f),
        contactSize = contactSize.finiteOrZero().coerceAtLeast(0f),
        orientationRadians = orientationRadians.finiteOrZero(),
        rejectionReason = rejectionReason?.take(80),
        historicalSamples = historicalSamples.map { historical ->
            historical.copy(
                rawX = historical.rawX.finiteOrZero(),
                rawY = historical.rawY.finiteOrZero(),
                normalizedX = historical.normalizedX.finiteOrZero(),
                normalizedY = historical.normalizedY.finiteOrZero(),
                pressure = historical.pressure.finiteOrZero().coerceAtLeast(0f),
                contactSize = historical.contactSize.finiteOrZero().coerceAtLeast(0f),
                orientationRadians = historical.orientationRadians.finiteOrZero(),
            )
        },
    )

    private fun replaceFile(source: File, destination: File) {
        runCatching {
            Files.move(
                source.toPath(),
                destination.toPath(),
                StandardCopyOption.ATOMIC_MOVE,
                StandardCopyOption.REPLACE_EXISTING,
            )
        }.getOrElse {
            Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
        }
    }

    private fun StringBuilder.appendJson(value: String): StringBuilder = append('"').append(
        value
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t"),
    ).append('"')

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }

    private fun Float.finiteOrZero(): Float = if (isFinite()) this else 0f

    private fun Int.requirePositive(name: String): Int {
        require(this > 0) { "$name must be positive" }
        return this
    }
}
