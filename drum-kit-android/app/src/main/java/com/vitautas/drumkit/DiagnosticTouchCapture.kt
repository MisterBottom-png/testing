package com.vitautas.drumkit

import android.os.Build
import android.view.MotionEvent
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.StrikeInputTarget
import com.vitautas.drumkit.model.StudioKitInputGeometry
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

private const val DiagnosticTouchSchemaVersion = 2
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
    val candidateTargets: List<StrikeInputTarget> = emptyList(),
    val selectedTarget: StrikeInputTarget? = null,
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
                val rawX = event.rawXFor(pointerIndex)
                val rawY = event.rawYFor(pointerIndex)
                val normalizedX = localX / viewportWidth.toFloat()
                val normalizedY = localY / viewportHeight.toFloat()
                val inputCandidates = StudioKitInputGeometry.candidates(
                    screenX = normalizedX,
                    screenY = normalizedY,
                    aspectRatio = aspectRatio,
                )
                val selectedCandidate = inputCandidates.firstOrNull()
                val candidateInstruments = inputCandidates.map { it.instrument }.distinct()
                val isActionPointer = pointerIndex == event.actionIndex
                add(
                    DiagnosticTouchSample(
                        eventTimeNanos = event.eventTime * NanosPerMillisecond,
                        action = action,
                        actionMasked = event.actionMasked,
                        actionIndex = event.actionIndex,
                        pointerId = event.getPointerId(pointerIndex),
                        pointerIndex = pointerIndex,
                        isActionPointer = isActionPointer,
                        acceptedStrike = isActionPointer && action.isDownAction() && selectedCandidate != null,
                        rawX = rawX,
                        rawY = rawY,
                        normalizedX = normalizedX,
                        normalizedY = normalizedY,
                        pressure = event.getPressure(pointerIndex).finiteOrZero().coerceAtLeast(0f),
                        contactSize = event.getSize(pointerIndex).finiteOrZero().coerceAtLeast(0f),
                        toolType = event.getToolType(pointerIndex).toolTypeName(),
                        orientationRadians = event.getOrientation(pointerIndex).finiteOrZero(),
                        hitRegionCount = inputCandidates.size,
                        candidateInstruments = candidateInstruments,
                        selectedInstrument = selectedCandidate?.instrument,
                        rejectionReason = if (selectedCandidate == null) "outside_hit_regions" else null,
                        historicalSamples = event.historyFor(
                            pointerIndex,
                            viewportWidth,
                            viewportHeight,
                            rawX - localX,
                            rawY - localY,
                        ),
                        candidateTargets = inputCandidates.map { it.inputTarget },
                        selectedTarget = selectedCandidate?.inputTarget,
                    ),
                )
            }
        }
    }

    private fun DiagnosticTouchAction.isDownAction(): Boolean =
        this == DiagnosticTouchAction.DOWN || this == DiagnosticTouchAction.POINTER_DOWN

    private fun MotionEvent.historyFor(
        pointerIndex: Int,
        viewportWidth: Int,
        viewportHeight: Int,
        rawOffsetX: Float,
        rawOffsetY: Float,
    ): List<DiagnosticHistoricalTouchSample> = buildList(historySize) {
        for (historyIndex in 0 until historySize) {
            val localX = getHistoricalX(pointerIndex, historyIndex)
            val localY = getHistoricalY(pointerIndex, historyIndex)
            add(
                DiagnosticHistoricalTouchSample(
                    eventTimeNanos = getHistoricalEventTime(historyIndex) * NanosPerMillisecond,
                    rawX = localX + rawOffsetX,
                    rawY = localY + rawOffsetY,
                    normalizedX = localX / viewportWidth.toFloat(),
                    normalizedY = localY / viewportHeight.toFloat(),
                    pressure = getHistoricalPressure(pointerIndex, historyIndex).finiteOrZero().coerceAtLeast(0f),
                    contactSize = getHistoricalSize(pointerIndex, historyIndex).finiteOrZero().coerceAtLeast(0f),
                    orientationRadians = getHistoricalAxisValue(
                        MotionEvent.AXIS_ORIENTATION,
                        pointerIndex,
                        historyIndex,
                    ).finiteOrZero(),
                ),
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun MotionEvent.rawXFor(pointerIndex: Int): Float =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) getRawX(pointerIndex) else rawX + getX(pointerIndex) - x

    @Suppress("DEPRECATION")
    private fun MotionEvent.rawYFor(pointerIndex: Int): Float =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) getRawY(pointerIndex) else rawY + getY(pointerIndex) - y

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
}

private data class TouchStrikeKey(val eventTimeNanos: Long, val pointerId: Int)

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
    private val touchCapacity = touchEventCapacity.positive("touchEventCapacity")
    private val touchEvents = ArrayList<RecordedDiagnosticTouchEvent>(touchCapacity.coerceAtMost(1_024))
    private var touchSessionStartNanos = 0L
    private var nextMotionEventSequence = 0L
    private var droppedTouchEventCount = 0
    private val acceptedStrikeInstruments = HashMap<TouchStrikeKey, InstrumentId>()

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

    fun recordStrike(strike: DrumStrike) {
        delegate.recordStrike(strike)
        acceptedStrikeInstruments[TouchStrikeKey(strike.eventTimeNanos, strike.pointerId)] = strike.instrument
    }

    fun recordAudioDiagnostics(value: AudioDiagnostics) = delegate.recordAudioDiagnostics(value)

    fun recordMarker(type: DiagnosticMarkerType, note: String? = null) = delegate.recordMarker(type, note)

    fun recordTouchEvent(event: MotionEvent, viewportWidth: Int, viewportHeight: Int) {
        if (!isRecording) return
        val sequence = nextMotionEventSequence++
        DiagnosticTouchEventFactory.capture(event, viewportWidth, viewportHeight).forEach { sample ->
            val downActionPointer = sample.isActionPointer &&
                (sample.action == DiagnosticTouchAction.DOWN || sample.action == DiagnosticTouchAction.POINTER_DOWN)
            val acceptedInstrument = if (downActionPointer) {
                acceptedStrikeInstruments.remove(TouchStrikeKey(sample.eventTimeNanos, sample.pointerId))
            } else {
                null
            }
            val resolvedSample = sample.copy(
                acceptedStrike = acceptedInstrument != null,
                selectedInstrument = if (downActionPointer) acceptedInstrument else sample.selectedInstrument,
                rejectionReason = when {
                    acceptedInstrument != null -> null
                    downActionPointer && sample.candidateTargets.isNotEmpty() -> "consumed_before_playable_surface"
                    sample.selectedInstrument == null -> "outside_hit_regions"
                    else -> sample.rejectionReason
                },
            )
            recordTouchSample(resolvedSample, sequence)
        }
    }

    internal fun recordTouchSample(sample: DiagnosticTouchSample, motionEventSequence: Long = nextMotionEventSequence++) {
        if (!isRecording) return
        if (touchEvents.size >= touchCapacity) {
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
        resetTouchState()
    }

    fun stop(): DiagnosticSessionBundleCapture {
        val capture = DiagnosticSessionBundleCapture(
            baseCapture = delegate.stop(),
            touchEvents = touchEvents.toList(),
            droppedTouchEventCount = droppedTouchEventCount,
        )
        resetTouchState()
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

    private fun resetTouchState() {
        touchEvents.clear()
        droppedTouchEventCount = 0
        nextMotionEventSequence = 0L
        acceptedStrikeInstruments.clear()
    }

    private fun augmentBundle(bundle: File, capture: DiagnosticSessionBundleCapture) {
        val retained = linkedMapOf<String, ByteArray>()
        ZipFile(bundle).use { zip ->
            val iterator = zip.entries()
            while (iterator.hasMoreElements()) {
                val entry = iterator.nextElement()
                if (entry.name != "manifest.json" && entry.name != "checksums.sha256") {
                    retained[entry.name] = zip.getInputStream(entry).use { it.readBytes() }
                }
            }
        }
        val summary = retained["summary.txt"]?.toString(StandardCharsets.UTF_8).orEmpty() +
            "\nTouch events: ${capture.touchEvents.size}\nDropped touch events: ${capture.droppedTouchEventCount}\n"
        retained["summary.txt"] = summary.toByteArray(StandardCharsets.UTF_8)

        val entries = linkedMapOf<String, ByteArray>()
        entries["manifest.json"] = manifestJson(capture).utf8()
        retained["session.json"]?.let { entries["session.json"] = it }
        entries["touch-events.jsonl"] = touchEventsJsonLines(capture).utf8()
        retained.forEach { (name, bytes) -> if (name != "session.json") entries[name] = bytes }
        entries["checksums.sha256"] = buildString {
            entries.forEach { (name, bytes) -> append(sha256(bytes)).append("  ").append(name).append('\n') }
        }.utf8()

        val temporary = File(bundle.parentFile, ".${bundle.name}.touch.tmp")
        if (temporary.exists()) temporary.delete()
        try {
            temporary.outputStream().buffered().use { output ->
                ZipOutputStream(output).use { zip ->
                    entries.forEach { (name, bytes) ->
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
}

private fun manifestJson(capture: DiagnosticSessionBundleCapture): String = buildString {
    val base = capture.baseCapture
    append("{\n")
    append("  \"schemaVersion\": $DiagnosticTouchSchemaVersion,\n")
    append("  \"sessionId\": ").appendJson(base.sessionId).append(",\n")
    append("  \"bundleState\": \"step_1_2_partial\",\n")
    append("  \"includedFiles\": [\"session.json\", \"touch-events.jsonl\", \"strikes.jsonl\", \"audio-diagnostics.csv\", \"markers.json\", \"summary.txt\", \"checksums.sha256\"],\n")
    append("  \"plannedFilesNotYetImplemented\": [\"performance.csv\", \"generated-output.wav\"],\n")
    append("  \"droppedData\": {\n")
    append("    \"touchEvents\": ${capture.droppedTouchEventCount},\n")
    append("    \"strikes\": ${base.droppedStrikeCount},\n")
    append("    \"audioDiagnostics\": ${base.droppedDiagnosticsCount},\n")
    append("    \"markers\": ${base.droppedMarkerCount}\n")
    append("  }\n}\n")
}

private fun touchEventsJsonLines(capture: DiagnosticSessionBundleCapture): String = buildString {
    capture.touchEvents.forEach { recorded ->
        val sample = recorded.sample
        append('{')
        append("\"schemaVersion\":$DiagnosticTouchSchemaVersion,")
        append("\"offsetNanos\":${recorded.offsetNanos},")
        append("\"motionEventSequence\":${recorded.motionEventSequence},")
        append("\"eventTimeNanos\":${sample.eventTimeNanos},")
        append("\"action\":").appendJson(sample.action.wireName).append(',')
        append("\"actionMasked\":${sample.actionMasked},")
        append("\"actionIndex\":${sample.actionIndex},")
        append("\"pointerId\":${sample.pointerId},")
        append("\"pointerIndex\":${sample.pointerIndex},")
        append("\"isActionPointer\":${sample.isActionPointer},")
        append("\"acceptedStrike\":${sample.acceptedStrike},")
        append("\"rawX\":${sample.rawX},\"rawY\":${sample.rawY},")
        append("\"normalizedX\":${sample.normalizedX},\"normalizedY\":${sample.normalizedY},")
        append("\"pressure\":${sample.pressure},\"contactSize\":${sample.contactSize},")
        append("\"toolType\":").appendJson(sample.toolType).append(',')
        append("\"orientationRadians\":${sample.orientationRadians},")
        append("\"hitRegionCount\":${sample.hitRegionCount},")
        append("\"candidateInstruments\":[")
        sample.candidateInstruments.forEachIndexed { index, instrument ->
            if (index > 0) append(',')
            appendJson(instrument.name.lowercase())
        }
        append("],\"candidateTargets\":[")
        sample.candidateTargets.forEachIndexed { index, target ->
            if (index > 0) append(',')
            appendJson(target.wireName)
        }
        append("],\"selectedInstrument\":")
        if (sample.selectedInstrument == null) append("null") else appendJson(sample.selectedInstrument.name.lowercase())
        append(",\"selectedTarget\":")
        if (sample.selectedTarget == null) append("null") else appendJson(sample.selectedTarget.wireName)
        append(",\"rejectionReason\":")
        if (sample.rejectionReason == null) append("null") else appendJson(sample.rejectionReason)
        append(",\"historicalSamples\":[")
        sample.historicalSamples.forEachIndexed { index, historical ->
            if (index > 0) append(',')
            append('{')
            append("\"eventTimeNanos\":${historical.eventTimeNanos},")
            append("\"rawX\":${historical.rawX},\"rawY\":${historical.rawY},")
            append("\"normalizedX\":${historical.normalizedX},\"normalizedY\":${historical.normalizedY},")
            append("\"pressure\":${historical.pressure},\"contactSize\":${historical.contactSize},")
            append("\"orientationRadians\":${historical.orientationRadians}")
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
    historicalSamples = historicalSamples.map { sample ->
        sample.copy(
            rawX = sample.rawX.finiteOrZero(),
            rawY = sample.rawY.finiteOrZero(),
            normalizedX = sample.normalizedX.finiteOrZero(),
            normalizedY = sample.normalizedY.finiteOrZero(),
            pressure = sample.pressure.finiteOrZero().coerceAtLeast(0f),
            contactSize = sample.contactSize.finiteOrZero().coerceAtLeast(0f),
            orientationRadians = sample.orientationRadians.finiteOrZero(),
        )
    },
)

private fun replaceFile(source: File, destination: File) {
    runCatching {
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    }.getOrElse {
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }
}

private fun StringBuilder.appendJson(value: String): StringBuilder = append('"').append(
    value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t"),
).append('"')

private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { byte -> "%02x".format(byte) }

private fun String.utf8(): ByteArray = toByteArray(StandardCharsets.UTF_8)
private fun Float.finiteOrZero(): Float = if (isFinite()) this else 0f
private fun Int.positive(name: String): Int {
    require(this > 0) { "$name must be positive" }
    return this
}
