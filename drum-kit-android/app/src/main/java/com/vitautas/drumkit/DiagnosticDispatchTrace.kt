package com.vitautas.drumkit

import com.vitautas.drumkit.audio.AudioDispatchDecision
import com.vitautas.drumkit.model.DrumStrike
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.ArrayDeque
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

private const val DiagnosticDispatchSchemaVersion = 1
private const val DefaultDispatchDecisionCapacity = 16_384

private data class DispatchStrikeKey(
    val eventTimeNanos: Long,
    val pointerId: Int,
)

internal data class RecordedDiagnosticDispatchDecision(
    val offsetNanos: Long,
    val eventTimeNanos: Long,
    val pointerId: Int,
    val decision: AudioDispatchDecision,
)

internal data class DiagnosticDispatchTraceCapture(
    val decisions: List<RecordedDiagnosticDispatchDecision>,
    val droppedDecisionCount: Int,
)

/**
 * Bounded request-side dispatch trace for Step 1.2.
 *
 * This recorder runs after AudioEngine has invoked JNI. It records only values
 * that are known on the Kotlin side and leaves native callback outcomes null.
 */
internal class DiagnosticDispatchTraceRecorder(
    decisionCapacity: Int = DefaultDispatchDecisionCapacity,
    private val monotonicClockNanos: () -> Long = System::nanoTime,
) {
    private val capacity = decisionCapacity.positive("decisionCapacity")
    private val decisions = ArrayList<RecordedDiagnosticDispatchDecision>(capacity.coerceAtMost(1_024))
    private var sessionStartNanos = 0L
    private var recording = false
    private var droppedDecisionCount = 0

    fun start() {
        check(!recording) { "diagnostic dispatch trace already active" }
        decisions.clear()
        droppedDecisionCount = 0
        sessionStartNanos = monotonicClockNanos()
        recording = true
    }

    fun record(strike: DrumStrike, decision: AudioDispatchDecision) {
        if (!recording) return
        if (decisions.size >= capacity) {
            droppedDecisionCount += 1
            return
        }
        decisions += RecordedDiagnosticDispatchDecision(
            offsetNanos = (monotonicClockNanos() - sessionStartNanos).coerceAtLeast(0L),
            eventTimeNanos = strike.eventTimeNanos.coerceAtLeast(0L),
            pointerId = strike.pointerId,
            decision = decision,
        )
    }

    fun cancel() {
        recording = false
        decisions.clear()
        droppedDecisionCount = 0
    }

    fun stop(): DiagnosticDispatchTraceCapture {
        check(recording) { "diagnostic dispatch trace is not active" }
        val capture = DiagnosticDispatchTraceCapture(
            decisions = decisions.toList(),
            droppedDecisionCount = droppedDecisionCount,
        )
        recording = false
        decisions.clear()
        droppedDecisionCount = 0
        return capture
    }

    fun augmentBundle(
        bundle: File,
        sessionCapture: DiagnosticSessionBundleCapture,
        traceCapture: DiagnosticDispatchTraceCapture,
    ) {
        val retained = linkedMapOf<String, ByteArray>()
        ZipFile(bundle).use { zip ->
            val iterator = zip.entries()
            while (iterator.hasMoreElements()) {
                val entry = iterator.nextElement()
                if (entry.name !in setOf("manifest.json", "strikes.jsonl", "summary.txt", "checksums.sha256")) {
                    retained[entry.name] = zip.getInputStream(entry).use { it.readBytes() }
                }
            }
            val manifest = zip.readUtf8("manifest.json")
                .replace(
                    "\"bundleState\": \"step_1_2_partial\"",
                    "\"bundleState\": \"step_1_2_dispatch_request_trace_partial\"",
                )
                .replace(
                    "  \"droppedData\": {",
                    buildString {
                        append("  \"dispatchTrace\": {\n")
                        append("    \"requestSideDecisions\": ").append(traceCapture.decisions.size).append(",\n")
                        append("    \"droppedRequestSideDecisions\": ").append(traceCapture.droppedDecisionCount).append(",\n")
                        append("    \"nativeSelectionTraceAvailable\": false,\n")
                        append("    \"unobservedNativeFields\": [\"queueAcceptance\", \"roundRobinIndices\", \"pitchVariation\", \"gainVariation\", \"filterVariation\", \"activeVoiceCount\", \"voiceSteal\"]\n")
                        append("  },\n")
                        append("  \"droppedData\": {")
                    },
                )
            retained["manifest.json"] = manifest.utf8()
            retained["summary.txt"] = (zip.readUtf8("summary.txt") + buildString {
                append("\nRequest-side dispatch decisions: ").append(traceCapture.decisions.size).append('\n')
                append("Dropped request-side dispatch decisions: ").append(traceCapture.droppedDecisionCount).append('\n')
                append("Native queue, round-robin, variation, and voice-allocation outcomes are not yet traced.\n")
            }).utf8()
        }

        val entries = linkedMapOf<String, ByteArray>()
        entries["manifest.json"] = checkNotNull(retained.remove("manifest.json"))
        retained["session.json"]?.let { entries["session.json"] = it }
        retained["touch-events.jsonl"]?.let { entries["touch-events.jsonl"] = it }
        entries["strikes.jsonl"] = enrichedStrikesJsonLines(sessionCapture, traceCapture).utf8()
        retained.forEach { (name, bytes) ->
            if (name != "session.json" && name != "touch-events.jsonl") entries[name] = bytes
        }
        entries["checksums.sha256"] = buildString {
            entries.forEach { (name, bytes) ->
                append(sha256(bytes)).append("  ").append(name).append('\n')
            }
        }.utf8()

        val temporary = File(bundle.parentFile, ".${bundle.name}.dispatch.tmp")
        if (temporary.exists()) temporary.delete()
        try {
            temporary.outputStream().buffered().use { output ->
                ZipOutputStream(output).use { zip ->
                    entries.forEach { (name, bytes) ->
                        zip.putNextEntry(ZipEntry(name).apply {
                            time = sessionCapture.baseCapture.endedAtEpochMillis
                        })
                        zip.write(bytes)
                        zip.closeEntry()
                    }
                }
            }
            replaceDiagnosticBundle(temporary, bundle)
        } catch (failure: Throwable) {
            temporary.delete()
            throw failure
        }
    }
}

private fun enrichedStrikesJsonLines(
    sessionCapture: DiagnosticSessionBundleCapture,
    traceCapture: DiagnosticDispatchTraceCapture,
): String {
    val tracesByStrike = HashMap<DispatchStrikeKey, ArrayDeque<RecordedDiagnosticDispatchDecision>>()
    traceCapture.decisions.forEach { recorded ->
        tracesByStrike.getOrPut(DispatchStrikeKey(recorded.eventTimeNanos, recorded.pointerId), ::ArrayDeque)
            .addLast(recorded)
    }
    return buildString {
        sessionCapture.baseCapture.strikes.forEach { recordedStrike ->
            val strike = recordedStrike.strike
            val trace = tracesByStrike[DispatchStrikeKey(strike.eventTimeNanos, strike.pointerId)]?.pollFirst()
            val decision = trace?.decision
            append('{')
            append("\"schemaVersion\":$DiagnosticDispatchSchemaVersion,")
            append("\"offsetNanos\":${recordedStrike.offsetNanos},")
            append("\"eventTimeNanos\":${strike.eventTimeNanos},")
            append("\"pointerId\":${strike.pointerId},")
            append("\"instrument\":").appendJson(strike.instrument.name.lowercase()).append(',')
            append("\"velocity\":${strike.velocity},")
            append("\"normalizedX\":${strike.normalizedX},\"normalizedY\":${strike.normalizedY},")
            append("\"pressure\":${strike.pressure},\"contactSize\":${strike.contactSize},")
            append("\"dispatchDecisionOffsetNanos\":").appendNullable(trace?.offsetNanos).append(',')
            append("\"velocityEstimatorInputMode\":").appendNullableJson(decision?.velocityEstimatorInputMode).append(',')
            append("\"sanitizedVelocity\":").appendNullable(decision?.sanitizedVelocity).append(',')
            append("\"sanitizedNormalizedX\":").appendNullable(decision?.sanitizedNormalizedX).append(',')
            append("\"sanitizedNormalizedY\":").appendNullable(decision?.sanitizedNormalizedY).append(',')
            append("\"selectedArticulation\":").appendNullableJson(decision?.articulation?.name?.lowercase()).append(',')
            append("\"articulationResolverInputs\":")
            if (decision?.articulation == null) {
                append("null,")
            } else {
                append("{\"normalizedX\":${decision.sanitizedNormalizedX},\"normalizedY\":${decision.sanitizedNormalizedY},\"velocity\":${decision.sanitizedVelocity}},")
            }
            append("\"lowerVelocityLayer\":").appendNullable(decision?.lowerVelocityLayer).append(',')
            append("\"upperVelocityLayer\":").appendNullable(decision?.upperVelocityLayer).append(',')
            append("\"velocityLayerBlend\":").appendNullable(decision?.velocityLayerBlend).append(',')
            append("\"lowerRoundRobinIndex\":").appendNullable(decision?.lowerRoundRobinIndex).append(',')
            append("\"upperRoundRobinIndex\":").appendNullable(decision?.upperRoundRobinIndex).append(',')
            append("\"pitchVariation\":").appendNullable(decision?.pitchVariation).append(',')
            append("\"gainVariation\":").appendNullable(decision?.gainVariation).append(',')
            append("\"filterVariation\":").appendNullable(decision?.filterVariation).append(',')
            append("\"stereoPan\":").appendNullable(decision?.stereoPan).append(',')
            append("\"nativeQueueState\":").appendNullableJson(decision?.nativeQueueState).append(',')
            append("\"activeVoiceCount\":").appendNullable(decision?.activeVoiceCount).append(',')
            append("\"voiceStealOccurred\":").appendNullable(decision?.voiceStealOccurred).append(',')
            append("\"nativeSelectionTraceAvailable\":${decision?.nativeSelectionTraceAvailable ?: false},")
            append("\"dispatchDecisionMissing\":${decision == null}")
            append("}\n")
        }
    }
}

private fun ZipFile.readUtf8(name: String): String = getInputStream(getEntry(name)).use { input ->
    input.readBytes().toString(StandardCharsets.UTF_8)
}

private fun replaceDiagnosticBundle(source: File, destination: File) {
    runCatching {
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
    }.getOrElse {
        Files.move(source.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
    }
}

private fun StringBuilder.appendJson(value: String): StringBuilder = append('"').append(
    value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t"),
).append('"')

private fun StringBuilder.appendNullableJson(value: String?): StringBuilder =
    if (value == null) append("null") else appendJson(value)

private fun StringBuilder.appendNullable(value: Any?): StringBuilder =
    if (value == null) append("null") else append(value)

private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { byte -> "%02x".format(byte) }

private fun String.utf8(): ByteArray = toByteArray(StandardCharsets.UTF_8)

private fun Int.positive(name: String): Int {
    require(this > 0) { "$name must be positive" }
    return this
}
