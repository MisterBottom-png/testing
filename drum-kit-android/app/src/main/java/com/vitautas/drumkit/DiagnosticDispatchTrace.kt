package com.vitautas.drumkit

import com.vitautas.drumkit.audio.AudioDispatchDecision
import com.vitautas.drumkit.audio.NativeDispatchOutcome
import com.vitautas.drumkit.audio.NativeDispatchOutcomeBatch
import com.vitautas.drumkit.audio.NativeQueueState
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

private const val DiagnosticDispatchSchemaVersion = 2
private const val DefaultDispatchDecisionCapacity = 16_384
private const val DefaultNativeOutcomeCapacity = 16_384

private data class DispatchStrikeKey(
    val eventTimeNanos: Long,
    val pointerId: Int,
)

private data class NativeTraceStats(
    val matchedOutcomeCount: Int,
    val unmatchedEnqueuedDecisionCount: Int,
    val unmatchedOutcomeCount: Int,
)

internal data class RecordedDiagnosticDispatchDecision(
    val offsetNanos: Long,
    val eventTimeNanos: Long,
    val pointerId: Int,
    val decision: AudioDispatchDecision,
)

internal data class DiagnosticDispatchTraceCapture(
    val decisions: List<RecordedDiagnosticDispatchDecision>,
    val nativeOutcomes: List<NativeDispatchOutcome>,
    val droppedDecisionCount: Int,
    val droppedNativeOutcomeCount: Int,
    val droppedNativeOutcomeRecordCount: Int,
)

/**
 * Bounded request-side and callback-outcome trace for Step 1.2.
 *
 * Request decisions are recorded only after JNI returns. Native callback
 * outcomes arrive through a fixed-capacity native ring that Kotlin drains
 * outside the real-time callback.
 */
internal class DiagnosticDispatchTraceRecorder(
    decisionCapacity: Int = DefaultDispatchDecisionCapacity,
    nativeOutcomeCapacity: Int = DefaultNativeOutcomeCapacity,
    private val monotonicClockNanos: () -> Long = System::nanoTime,
) {
    private val validatedDecisionCapacity = decisionCapacity.positive("decisionCapacity")
    private val validatedNativeOutcomeCapacity = nativeOutcomeCapacity.positive("nativeOutcomeCapacity")
    private val decisions = ArrayList<RecordedDiagnosticDispatchDecision>(
        validatedDecisionCapacity.coerceAtMost(1_024),
    )
    private val nativeOutcomes = ArrayList<NativeDispatchOutcome>(
        validatedNativeOutcomeCapacity.coerceAtMost(1_024),
    )
    private val nativeOutcomeTokens = HashSet<Long>()
    private var sessionStartNanos = 0L
    private var recording = false
    private var droppedDecisionCount = 0
    private var droppedNativeOutcomeBaseline = 0
    private var latestDroppedNativeOutcomeCount = 0
    private var droppedNativeOutcomeRecordCount = 0

    fun start(droppedNativeOutcomeBaseline: Int = 0) {
        check(!recording) { "diagnostic dispatch trace already active" }
        decisions.clear()
        nativeOutcomes.clear()
        nativeOutcomeTokens.clear()
        droppedDecisionCount = 0
        this.droppedNativeOutcomeBaseline = droppedNativeOutcomeBaseline.coerceAtLeast(0)
        latestDroppedNativeOutcomeCount = this.droppedNativeOutcomeBaseline
        droppedNativeOutcomeRecordCount = 0
        sessionStartNanos = monotonicClockNanos()
        recording = true
    }

    fun record(strike: DrumStrike, decision: AudioDispatchDecision) {
        if (!recording) return
        if (decisions.size >= validatedDecisionCapacity) {
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

    fun recordNativeOutcomes(batch: NativeDispatchOutcomeBatch) {
        if (!recording) return
        latestDroppedNativeOutcomeCount = maxOf(
            latestDroppedNativeOutcomeCount,
            batch.droppedOutcomeCount.coerceAtLeast(0),
        )
        batch.outcomes.forEach { outcome ->
            if (outcome.diagnosticToken <= 0L || !nativeOutcomeTokens.add(outcome.diagnosticToken)) {
                return@forEach
            }
            if (nativeOutcomes.size >= validatedNativeOutcomeCapacity) {
                droppedNativeOutcomeRecordCount += 1
                return@forEach
            }
            nativeOutcomes += outcome
        }
    }

    fun hasPendingNativeOutcomes(): Boolean {
        if (!recording) return false
        return decisions.any { recorded ->
            recorded.decision.nativeQueueState == NativeQueueState.ENQUEUED.wireName &&
                recorded.decision.diagnosticToken > 0L &&
                recorded.decision.diagnosticToken !in nativeOutcomeTokens
        }
    }

    fun cancel() {
        recording = false
        decisions.clear()
        nativeOutcomes.clear()
        nativeOutcomeTokens.clear()
        droppedDecisionCount = 0
        droppedNativeOutcomeBaseline = 0
        latestDroppedNativeOutcomeCount = 0
        droppedNativeOutcomeRecordCount = 0
    }

    fun stop(): DiagnosticDispatchTraceCapture {
        check(recording) { "diagnostic dispatch trace is not active" }
        val capture = DiagnosticDispatchTraceCapture(
            decisions = decisions.toList(),
            nativeOutcomes = nativeOutcomes.toList(),
            droppedDecisionCount = droppedDecisionCount,
            droppedNativeOutcomeCount = (
                latestDroppedNativeOutcomeCount - droppedNativeOutcomeBaseline
            ).coerceAtLeast(0),
            droppedNativeOutcomeRecordCount = droppedNativeOutcomeRecordCount,
        )
        cancel()
        return capture
    }

    fun augmentBundle(
        bundle: File,
        sessionCapture: DiagnosticSessionBundleCapture,
        traceCapture: DiagnosticDispatchTraceCapture,
    ) {
        val stats = nativeTraceStats(traceCapture)
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
                    "\"bundleState\": \"step_1_2_native_dispatch_trace_partial\"",
                )
                .replace(
                    "  \"droppedData\": {",
                    buildString {
                        append("  \"dispatchTrace\": {\n")
                        append("    \"schemaVersion\": ").append(DiagnosticDispatchSchemaVersion).append(",\n")
                        append("    \"requestSideDecisions\": ").append(traceCapture.decisions.size).append(",\n")
                        append("    \"nativeSelectionOutcomes\": ").append(traceCapture.nativeOutcomes.size).append(",\n")
                        append("    \"matchedNativeSelectionOutcomes\": ").append(stats.matchedOutcomeCount).append(",\n")
                        append("    \"unmatchedEnqueuedDecisions\": ").append(stats.unmatchedEnqueuedDecisionCount).append(",\n")
                        append("    \"unmatchedNativeSelectionOutcomes\": ").append(stats.unmatchedOutcomeCount).append(",\n")
                        append("    \"droppedRequestSideDecisions\": ").append(traceCapture.droppedDecisionCount).append(",\n")
                        append("    \"droppedNativeOutcomeRingEntries\": ").append(traceCapture.droppedNativeOutcomeCount).append(",\n")
                        append("    \"droppedNativeOutcomeRecords\": ").append(traceCapture.droppedNativeOutcomeRecordCount).append(",\n")
                        append("    \"nativeQueueAcceptanceAvailable\": true,\n")
                        append("    \"nativeSelectionTraceAvailable\": true,\n")
                        append("    \"unobservedNativeFields\": []\n")
                        append("  },\n")
                        append("  \"droppedData\": {")
                    },
                )
            retained["manifest.json"] = manifest.utf8()
            retained["summary.txt"] = (zip.readUtf8("summary.txt") + buildString {
                append("\nRequest-side dispatch decisions: ").append(traceCapture.decisions.size).append('\n')
                append("Native callback outcomes: ").append(traceCapture.nativeOutcomes.size).append('\n')
                append("Matched native outcomes: ").append(stats.matchedOutcomeCount).append('\n')
                append("Unmatched enqueued decisions: ").append(stats.unmatchedEnqueuedDecisionCount).append('\n')
                append("Unmatched native outcomes: ").append(stats.unmatchedOutcomeCount).append('\n')
                append("Dropped request-side dispatch decisions: ").append(traceCapture.droppedDecisionCount).append('\n')
                append("Dropped native outcome ring entries: ").append(traceCapture.droppedNativeOutcomeCount).append('\n')
                append("Dropped native outcome records: ").append(traceCapture.droppedNativeOutcomeRecordCount).append('\n')
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

private fun nativeTraceStats(traceCapture: DiagnosticDispatchTraceCapture): NativeTraceStats {
    val enqueuedTokens = traceCapture.decisions.asSequence()
        .map { it.decision }
        .filter { it.nativeQueueState == NativeQueueState.ENQUEUED.wireName }
        .map { it.diagnosticToken }
        .filter { it > 0L }
        .toSet()
    val outcomeTokens = traceCapture.nativeOutcomes.asSequence()
        .map { it.diagnosticToken }
        .filter { it > 0L }
        .toSet()
    return NativeTraceStats(
        matchedOutcomeCount = enqueuedTokens.intersect(outcomeTokens).size,
        unmatchedEnqueuedDecisionCount = (enqueuedTokens - outcomeTokens).size,
        unmatchedOutcomeCount = (outcomeTokens - enqueuedTokens).size,
    )
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
    val outcomesByToken = traceCapture.nativeOutcomes.associateBy { it.diagnosticToken }
    return buildString {
        sessionCapture.baseCapture.strikes.forEach { recordedStrike ->
            val strike = recordedStrike.strike
            val trace = tracesByStrike[DispatchStrikeKey(strike.eventTimeNanos, strike.pointerId)]?.pollFirst()
            val decision = trace?.decision
            val outcome = decision?.diagnosticToken?.let(outcomesByToken::get)
            val expectedNativeOutcome = decision?.nativeQueueState == NativeQueueState.ENQUEUED.wireName
            append('{')
            append("\"schemaVersion\":$DiagnosticDispatchSchemaVersion,")
            append("\"offsetNanos\":${recordedStrike.offsetNanos},")
            append("\"eventTimeNanos\":${strike.eventTimeNanos},")
            append("\"pointerId\":${strike.pointerId},")
            append("\"instrument\":").appendJson(strike.instrument.name.lowercase()).append(',')
            append("\"velocity\":${strike.velocity},")
            append("\"velocitySource\":").appendJson(strike.velocitySource.wireName).append(',')
            append("\"normalizedX\":${strike.normalizedX},\"normalizedY\":${strike.normalizedY},")
            append("\"pressure\":${strike.pressure},\"contactSize\":${strike.contactSize},")
            append("\"dispatchDecisionOffsetNanos\":").appendNullable(trace?.offsetNanos).append(',')
            append("\"diagnosticToken\":").appendNullable(decision?.diagnosticToken).append(',')
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
            append("\"lowerRoundRobinIndex\":").appendNullable(outcome?.lowerRoundRobinIndex).append(',')
            append("\"upperRoundRobinIndex\":").appendNullable(outcome?.upperRoundRobinIndex).append(',')
            append("\"pitchVariation\":").appendNullable(outcome?.pitchVariation).append(',')
            append("\"gainVariation\":").appendNullable(outcome?.gainVariation).append(',')
            append("\"filterVariation\":").appendNullable(outcome?.filterVariation).append(',')
            append("\"stereoPan\":").appendNullable(decision?.stereoPan).append(',')
            append("\"nativeQueueState\":").appendNullableJson(decision?.nativeQueueState).append(',')
            append("\"activeVoiceCount\":").appendNullable(outcome?.activeVoiceCount).append(',')
            append("\"voiceStealOccurred\":").appendNullable(outcome?.voiceStealOccurred).append(',')
            append("\"sampledVoice\":").appendNullable(outcome?.sampledVoice).append(',')
            append("\"nativeSelectionTraceAvailable\":${outcome != null},")
            append("\"nativeOutcomeMissing\":${expectedNativeOutcome && outcome == null},")
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
