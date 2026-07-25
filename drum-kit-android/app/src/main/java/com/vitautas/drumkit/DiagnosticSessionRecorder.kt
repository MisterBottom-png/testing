package com.vitautas.drumkit

import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import java.io.File
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

private const val DiagnosticSchemaVersion = 1
private const val DefaultStrikeCapacity = 16_384
private const val DefaultDiagnosticsCapacity = 7_200
private const val DefaultMarkerCapacity = 256

internal data class DiagnosticSessionMetadata(
    val applicationVersion: String,
    val gitCommitSha: String,
    val buildType: String,
    val deviceManufacturer: String,
    val deviceModel: String,
    val androidVersion: String,
    val screenWidthPx: Int,
    val screenHeightPx: Int,
    val densityDpi: Int,
    val refreshRateHz: Float,
    val orientation: String,
    val audioOutputRoute: String,
    val audioSampleRate: Int,
    val framesPerBurst: Int,
    val oboeSharingMode: String,
    val audioPerformanceMode: String,
    val masterVolume: Float,
    val roomLevel: Float,
    val hapticsEnabled: Boolean?,
    val selectedDrumKit: String,
    val rendererBackend: String,
    val availableMemoryBytes: Long,
    val sessionMode: String,
)

internal enum class DiagnosticMarkerType(val wireName: String) {
    SOUNDS_WRONG("sounds_wrong"),
    WRONG_INSTRUMENT("wrong_instrument"),
    WRONG_ARTICULATION("wrong_articulation"),
    TOO_LOUD("too_loud"),
    TOO_QUIET("too_quiet"),
    DELAYED("delayed"),
    VISUAL_PROBLEM("visual_problem"),
    MISSED_HIT("missed_hit"),
    OTHER("other"),
}

internal data class DiagnosticExportResult(
    val file: File,
    val strikeCount: Int,
    val diagnosticsCount: Int,
    val markerCount: Int,
    val droppedStrikeCount: Int,
    val droppedDiagnosticsCount: Int,
    val droppedMarkerCount: Int,
)

internal data class RecordedDiagnosticStrike(
    val offsetNanos: Long,
    val strike: DrumStrike,
)

internal data class RecordedAudioDiagnostics(
    val offsetNanos: Long,
    val diagnostics: AudioDiagnostics,
)

internal data class RecordedDiagnosticMarker(
    val offsetNanos: Long,
    val type: DiagnosticMarkerType,
    val note: String?,
)

internal data class DiagnosticSessionCapture(
    val sessionId: String,
    val startedAtEpochMillis: Long,
    val endedAtEpochMillis: Long,
    val durationNanos: Long,
    val metadata: DiagnosticSessionMetadata,
    val strikes: List<RecordedDiagnosticStrike>,
    val diagnostics: List<RecordedAudioDiagnostics>,
    val markers: List<RecordedDiagnosticMarker>,
    val droppedStrikeCount: Int,
    val droppedDiagnosticsCount: Int,
    val droppedMarkerCount: Int,
)

internal class DiagnosticSessionRecorder(
    strikeCapacity: Int = DefaultStrikeCapacity,
    diagnosticsCapacity: Int = DefaultDiagnosticsCapacity,
    markerCapacity: Int = DefaultMarkerCapacity,
    private val monotonicClockNanos: () -> Long = System::nanoTime,
    private val wallClockMillis: () -> Long = System::currentTimeMillis,
    private val sessionIdFactory: () -> String = { UUID.randomUUID().toString() },
) {
    private val validatedStrikeCapacity = strikeCapacity.requirePositive("strikeCapacity")
    private val validatedDiagnosticsCapacity = diagnosticsCapacity.requirePositive("diagnosticsCapacity")
    private val validatedMarkerCapacity = markerCapacity.requirePositive("markerCapacity")

    private var activeSessionId: String? = null
    private var startedAtNanos: Long = 0L
    private var startedAtEpochMillis: Long = 0L
    private var metadata: DiagnosticSessionMetadata? = null
    private val strikes = ArrayList<RecordedDiagnosticStrike>(validatedStrikeCapacity.coerceAtMost(1_024))
    private val diagnostics = ArrayList<RecordedAudioDiagnostics>(validatedDiagnosticsCapacity.coerceAtMost(256))
    private val markers = ArrayList<RecordedDiagnosticMarker>(validatedMarkerCapacity.coerceAtMost(64))
    private var droppedStrikeCount = 0
    private var droppedDiagnosticsCount = 0
    private var droppedMarkerCount = 0

    val isRecording: Boolean
        get() = activeSessionId != null

    fun start(metadata: DiagnosticSessionMetadata): String {
        check(!isRecording) { "diagnostic session already active" }
        strikes.clear()
        diagnostics.clear()
        markers.clear()
        droppedStrikeCount = 0
        droppedDiagnosticsCount = 0
        droppedMarkerCount = 0
        startedAtNanos = monotonicClockNanos()
        startedAtEpochMillis = wallClockMillis()
        this.metadata = metadata.sanitized()
        return sessionIdFactory().also { activeSessionId = it }
    }

    fun recordStrike(strike: DrumStrike) {
        if (!isRecording) return
        if (strikes.size >= validatedStrikeCapacity) {
            droppedStrikeCount += 1
            return
        }
        strikes += RecordedDiagnosticStrike(
            offsetNanos = elapsedNanos(),
            strike = strike.sanitized(),
        )
    }

    fun recordAudioDiagnostics(value: AudioDiagnostics) {
        if (!isRecording) return
        if (diagnostics.size >= validatedDiagnosticsCapacity) {
            droppedDiagnosticsCount += 1
            return
        }
        diagnostics += RecordedAudioDiagnostics(
            offsetNanos = elapsedNanos(),
            diagnostics = value.sanitized(),
        )
    }

    fun recordMarker(type: DiagnosticMarkerType, note: String? = null) {
        if (!isRecording) return
        if (markers.size >= validatedMarkerCapacity) {
            droppedMarkerCount += 1
            return
        }
        markers += RecordedDiagnosticMarker(
            offsetNanos = elapsedNanos(),
            type = type,
            note = note?.trim()?.take(160)?.ifEmpty { null },
        )
    }

    fun cancel() {
        activeSessionId = null
        metadata = null
        strikes.clear()
        diagnostics.clear()
        markers.clear()
        droppedStrikeCount = 0
        droppedDiagnosticsCount = 0
        droppedMarkerCount = 0
    }

    fun stop(): DiagnosticSessionCapture = stopSnapshot()

    fun export(capture: DiagnosticSessionCapture, outputDirectory: File): DiagnosticExportResult {
        val snapshot = capture
        outputDirectory.mkdirs()
        require(outputDirectory.isDirectory) { "diagnostic output directory is unavailable" }
        val destination = File(outputDirectory, "drum-diagnostic-${snapshot.sessionId}.zip")
        val temporary = File(outputDirectory, ".${destination.name}.tmp")
        if (temporary.exists()) temporary.delete()
        try {
            writeBundle(snapshot, temporary)
            if (destination.exists()) destination.delete()
            check(temporary.renameTo(destination)) { "unable to finalize diagnostic bundle" }
        } catch (failure: Throwable) {
            temporary.delete()
            throw failure
        }
        return DiagnosticExportResult(
            file = destination,
            strikeCount = snapshot.strikes.size,
            diagnosticsCount = snapshot.diagnostics.size,
            markerCount = snapshot.markers.size,
            droppedStrikeCount = snapshot.droppedStrikeCount,
            droppedDiagnosticsCount = snapshot.droppedDiagnosticsCount,
            droppedMarkerCount = snapshot.droppedMarkerCount,
        )
    }

    fun stopAndExport(outputDirectory: File): DiagnosticExportResult = export(stop(), outputDirectory)

    private fun stopSnapshot(): DiagnosticSessionCapture {
        val sessionId = checkNotNull(activeSessionId) { "no diagnostic session is active" }
        val sessionMetadata = checkNotNull(metadata) { "diagnostic metadata is unavailable" }
        val endedAtNanos = monotonicClockNanos()
        val endedAtEpochMillis = wallClockMillis()
        val snapshot = DiagnosticSessionCapture(
            sessionId = sessionId,
            startedAtEpochMillis = startedAtEpochMillis,
            endedAtEpochMillis = endedAtEpochMillis,
            durationNanos = (endedAtNanos - startedAtNanos).coerceAtLeast(0L),
            metadata = sessionMetadata,
            strikes = strikes.toList(),
            diagnostics = diagnostics.toList(),
            markers = markers.toList(),
            droppedStrikeCount = droppedStrikeCount,
            droppedDiagnosticsCount = droppedDiagnosticsCount,
            droppedMarkerCount = droppedMarkerCount,
        )
        activeSessionId = null
        metadata = null
        strikes.clear()
        diagnostics.clear()
        markers.clear()
        return snapshot
    }

    private fun elapsedNanos(): Long = (monotonicClockNanos() - startedAtNanos).coerceAtLeast(0L)

    private fun writeBundle(snapshot: DiagnosticSessionCapture, destination: File) {
        val entries = linkedMapOf(
            "manifest.json" to manifestJson(snapshot).utf8(),
            "session.json" to sessionJson(snapshot).utf8(),
            "strikes.jsonl" to strikesJsonLines(snapshot).utf8(),
            "audio-diagnostics.csv" to diagnosticsCsv(snapshot).utf8(),
            "markers.json" to markersJson(snapshot).utf8(),
            "summary.txt" to summaryText(snapshot).utf8(),
        )
        val checksumText = buildString {
            for ((name, bytes) in entries) {
                append(sha256(bytes)).append("  ").append(name).append('\n')
            }
        }
        entries["checksums.sha256"] = checksumText.utf8()

        destination.outputStream().buffered().use { output ->
            ZipOutputStream(output).use { zip ->
                for ((name, bytes) in entries) {
                    zip.putNextEntry(ZipEntry(name).apply { time = snapshot.endedAtEpochMillis })
                    zip.write(bytes)
                    zip.closeEntry()
                }
            }
        }
    }

    private fun manifestJson(snapshot: DiagnosticSessionCapture): String = buildString {
        append("{\n")
        append("  \"schemaVersion\": ").append(DiagnosticSchemaVersion).append(",\n")
        append("  \"sessionId\": ").appendJson(snapshot.sessionId).append(",\n")
        append("  \"bundleState\": \"foundation_partial\",\n")
        append("  \"includedFiles\": [\"session.json\", \"strikes.jsonl\", \"audio-diagnostics.csv\", \"markers.json\", \"summary.txt\", \"checksums.sha256\"],\n")
        append("  \"plannedFilesNotYetImplemented\": [\"touch-events.jsonl\", \"performance.csv\", \"generated-output.wav\"],\n")
        append("  \"droppedData\": {\n")
        append("    \"strikes\": ").append(snapshot.droppedStrikeCount).append(",\n")
        append("    \"audioDiagnostics\": ").append(snapshot.droppedDiagnosticsCount).append(",\n")
        append("    \"markers\": ").append(snapshot.droppedMarkerCount).append("\n")
        append("  }\n")
        append("}\n")
    }

    private fun sessionJson(snapshot: DiagnosticSessionCapture): String = buildString {
        val metadata = snapshot.metadata
        append("{\n")
        append("  \"schemaVersion\": ").append(DiagnosticSchemaVersion).append(",\n")
        append("  \"sessionId\": ").appendJson(snapshot.sessionId).append(",\n")
        append("  \"startedAtUtc\": ").appendJson(Instant.ofEpochMilli(snapshot.startedAtEpochMillis).toString()).append(",\n")
        append("  \"endedAtUtc\": ").appendJson(Instant.ofEpochMilli(snapshot.endedAtEpochMillis).toString()).append(",\n")
        append("  \"durationNanos\": ").append(snapshot.durationNanos).append(",\n")
        append("  \"applicationVersion\": ").appendJson(metadata.applicationVersion).append(",\n")
        append("  \"gitCommitSha\": ").appendJson(metadata.gitCommitSha).append(",\n")
        append("  \"buildType\": ").appendJson(metadata.buildType).append(",\n")
        append("  \"deviceManufacturer\": ").appendJson(metadata.deviceManufacturer).append(",\n")
        append("  \"deviceModel\": ").appendJson(metadata.deviceModel).append(",\n")
        append("  \"androidVersion\": ").appendJson(metadata.androidVersion).append(",\n")
        append("  \"screenWidthPx\": ").append(metadata.screenWidthPx).append(",\n")
        append("  \"screenHeightPx\": ").append(metadata.screenHeightPx).append(",\n")
        append("  \"densityDpi\": ").append(metadata.densityDpi).append(",\n")
        append("  \"refreshRateHz\": ").append(metadata.refreshRateHz).append(",\n")
        append("  \"orientation\": ").appendJson(metadata.orientation).append(",\n")
        append("  \"audioOutputRoute\": ").appendJson(metadata.audioOutputRoute).append(",\n")
        append("  \"audioSampleRate\": ").append(metadata.audioSampleRate).append(",\n")
        append("  \"framesPerBurst\": ").append(metadata.framesPerBurst).append(",\n")
        append("  \"oboeSharingMode\": ").appendJson(metadata.oboeSharingMode).append(",\n")
        append("  \"audioPerformanceMode\": ").appendJson(metadata.audioPerformanceMode).append(",\n")
        append("  \"masterVolume\": ").append(metadata.masterVolume).append(",\n")
        append("  \"roomLevel\": ").append(metadata.roomLevel).append(",\n")
        append("  \"hapticsEnabled\": ")
        metadata.hapticsEnabled?.let { append(it) } ?: append("null")
        append(",\n")
        append("  \"selectedDrumKit\": ").appendJson(metadata.selectedDrumKit).append(",\n")
        append("  \"rendererBackend\": ").appendJson(metadata.rendererBackend).append(",\n")
        append("  \"availableMemoryBytes\": ").append(metadata.availableMemoryBytes).append(",\n")
        append("  \"sessionMode\": ").appendJson(metadata.sessionMode).append("\n")
        append("}\n")
    }

    private fun strikesJsonLines(snapshot: DiagnosticSessionCapture): String = buildString {
        for (entry in snapshot.strikes) {
            val strike = entry.strike
            append('{')
            append("\"schemaVersion\":").append(DiagnosticSchemaVersion).append(',')
            append("\"offsetNanos\":").append(entry.offsetNanos).append(',')
            append("\"eventTimeNanos\":").append(strike.eventTimeNanos).append(',')
            append("\"pointerId\":").append(strike.pointerId).append(',')
            append("\"instrument\":").appendJson(strike.instrument.name.lowercase()).append(',')
            append("\"velocity\":").append(strike.velocity).append(',')
            append("\"normalizedX\":").append(strike.normalizedX).append(',')
            append("\"normalizedY\":").append(strike.normalizedY).append(',')
            append("\"pressure\":").append(strike.pressure).append(',')
            append("\"contactSize\":").append(strike.contactSize)
            append("}\n")
        }
    }

    private fun diagnosticsCsv(snapshot: DiagnosticSessionCapture): String = buildString {
        append("schema_version,offset_nanos,running,sample_rate,frames_per_burst,underruns\n")
        for (entry in snapshot.diagnostics) {
            val value = entry.diagnostics
            append(DiagnosticSchemaVersion).append(',')
            append(entry.offsetNanos).append(',')
            append(value.running).append(',')
            append(value.sampleRate).append(',')
            append(value.framesPerBurst).append(',')
            append(value.underruns).append('\n')
        }
    }

    private fun markersJson(snapshot: DiagnosticSessionCapture): String = buildString {
        append("{\n  \"schemaVersion\": ").append(DiagnosticSchemaVersion).append(",\n  \"markers\": [")
        snapshot.markers.forEachIndexed { index, marker ->
            if (index > 0) append(',')
            append("\n    {\"offsetNanos\":").append(marker.offsetNanos)
            append(",\"type\":").appendJson(marker.type.wireName)
            append(",\"note\":")
            marker.note?.let { appendJson(it) } ?: append("null")
            append('}')
        }
        if (snapshot.markers.isNotEmpty()) append('\n')
        append("  ]\n}\n")
    }

    private fun summaryText(snapshot: DiagnosticSessionCapture): String = buildString {
        append("Drum diagnostic session ").append(snapshot.sessionId).append('\n')
        append("Duration: ").append(snapshot.durationNanos / 1_000_000L).append(" ms\n")
        append("Accepted strikes: ").append(snapshot.strikes.size).append('\n')
        append("Audio diagnostic samples: ").append(snapshot.diagnostics.size).append('\n')
        append("User markers: ").append(snapshot.markers.size).append('\n')
        append("Dropped strikes: ").append(snapshot.droppedStrikeCount).append('\n')
        append("Dropped audio diagnostic samples: ").append(snapshot.droppedDiagnosticsCount).append('\n')
        append("Dropped markers: ").append(snapshot.droppedMarkerCount).append('\n')
        append("\nRendering telemetry and generated-output WAV capture are not yet implemented.\n")
    }

    private fun DiagnosticSessionMetadata.sanitized(): DiagnosticSessionMetadata = copy(
        applicationVersion = applicationVersion.cleanText(),
        gitCommitSha = gitCommitSha.cleanText(),
        buildType = buildType.cleanText(),
        deviceManufacturer = deviceManufacturer.cleanText(),
        deviceModel = deviceModel.cleanText(),
        androidVersion = androidVersion.cleanText(),
        screenWidthPx = screenWidthPx.coerceAtLeast(0),
        screenHeightPx = screenHeightPx.coerceAtLeast(0),
        densityDpi = densityDpi.coerceAtLeast(0),
        refreshRateHz = refreshRateHz.finiteOr(0f).coerceAtLeast(0f),
        orientation = orientation.cleanText(),
        audioOutputRoute = audioOutputRoute.cleanText(),
        audioSampleRate = audioSampleRate.coerceAtLeast(0),
        framesPerBurst = framesPerBurst.coerceAtLeast(0),
        oboeSharingMode = oboeSharingMode.cleanText(),
        audioPerformanceMode = audioPerformanceMode.cleanText(),
        masterVolume = masterVolume.finiteOr(0f).coerceIn(0f, 1f),
        roomLevel = roomLevel.finiteOr(0f).coerceIn(0f, 1f),
        selectedDrumKit = selectedDrumKit.cleanText(),
        rendererBackend = rendererBackend.cleanText(),
        availableMemoryBytes = availableMemoryBytes.coerceAtLeast(0L),
        sessionMode = sessionMode.cleanText(),
    )

    private fun DrumStrike.sanitized(): DrumStrike = copy(
        velocity = velocity.finiteOr(0.8f).coerceIn(0.05f, 1f),
        normalizedX = normalizedX.finiteOr(0.5f).coerceIn(0f, 1f),
        normalizedY = normalizedY.finiteOr(0.5f).coerceIn(0f, 1f),
        pressure = pressure.finiteOr(0f).coerceAtLeast(0f),
        contactSize = contactSize.finiteOr(0f).coerceAtLeast(0f),
        eventTimeNanos = eventTimeNanos.coerceAtLeast(0L),
    )

    private fun AudioDiagnostics.sanitized(): AudioDiagnostics = copy(
        sampleRate = sampleRate.coerceAtLeast(0),
        framesPerBurst = framesPerBurst.coerceAtLeast(0),
        underruns = underruns.coerceAtLeast(0),
    )

    private fun String.cleanText(): String = trim().take(256)

    private fun Float.finiteOr(defaultValue: Float): Float = if (isFinite()) this else defaultValue

    private fun Int.requirePositive(name: String): Int = also { require(it > 0) { "$name must be positive" } }

    private fun String.utf8(): ByteArray = toByteArray(StandardCharsets.UTF_8)

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes)
        .joinToString("") { byte -> "%02x".format(byte) }

    private fun StringBuilder.appendJson(value: String): StringBuilder {
        append('"')
        for (character in value) {
            when (character) {
                '"' -> append("\\\"")
                '\\' -> append("\\\\")
                '\b' -> append("\\b")
                '\u000c' -> append("\\f")
                '\n' -> append("\\n")
                '\r' -> append("\\r")
                '\t' -> append("\\t")
                else -> if (character.code < 0x20) {
                    append("\\u").append(character.code.toString(16).padStart(4, '0'))
                } else {
                    append(character)
                }
            }
        }
        return append('"')
    }
}
