package com.vitautas.drumkit

import com.vitautas.drumkit.audio.AudioDispatchDecisionFactory
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.zip.ZipFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticDispatchTraceRecorderTest {
    @Test
    fun enrichesStrikeLogAndRecomputesBundleChecksums() {
        var nanos = 1_000L
        val sessionRecorder = DiagnosticSessionBundleRecorder(
            monotonicClockNanos = { nanos },
            wallClockMillis = { 1_700_000_000_000L },
            sessionIdFactory = { "dispatch-session" },
        )
        val traceRecorder = DiagnosticDispatchTraceRecorder(
            monotonicClockNanos = { nanos },
        )
        val strike = strike()

        sessionRecorder.start(metadata())
        traceRecorder.start()
        nanos += 100L
        sessionRecorder.recordStrike(strike)
        traceRecorder.record(strike, AudioDispatchDecisionFactory.create(strike))
        nanos += 100L
        val sessionCapture = sessionRecorder.stop()
        val traceCapture = traceRecorder.stop()
        val outputDirectory = Files.createTempDirectory("drum-dispatch-diagnostics").toFile()
        val result = sessionRecorder.export(sessionCapture, outputDirectory)
        traceRecorder.augmentBundle(result.file, sessionCapture, traceCapture)

        ZipFile(result.file).use { zip ->
            val strikes = zip.readText("strikes.jsonl")
            assertTrue(strikes.contains("\"velocityEstimatorInputMode\":\"pressure_plus_contact_size\""))
            assertTrue(strikes.contains("\"selectedArticulation\":\"center\""))
            assertTrue(strikes.contains("\"lowerVelocityLayer\":2"))
            assertTrue(strikes.contains("\"upperVelocityLayer\":3"))
            assertTrue(strikes.contains("\"velocityLayerBlend\":0.75"))
            assertTrue(strikes.contains("\"nativeQueueState\":\"native_trigger_invoked_unobserved\""))
            assertTrue(strikes.contains("\"lowerRoundRobinIndex\":null"))
            assertTrue(strikes.contains("\"nativeSelectionTraceAvailable\":false"))

            val manifest = zip.readText("manifest.json")
            assertTrue(manifest.contains("step_1_2_dispatch_request_trace_partial"))
            assertTrue(manifest.contains("\"requestSideDecisions\": 1"))
            assertTrue(manifest.contains("\"nativeSelectionTraceAvailable\": false"))

            val checksums = zip.readText("checksums.sha256")
            assertTrue(checksums.contains("manifest.json"))
            assertTrue(checksums.contains("strikes.jsonl"))
        }
    }

    @Test
    fun reportsDroppedDispatchDecisions() {
        var nanos = 0L
        val traceRecorder = DiagnosticDispatchTraceRecorder(
            decisionCapacity = 1,
            monotonicClockNanos = { ++nanos },
        )
        val first = strike(pointerId = 1)
        val second = strike(pointerId = 2, eventTimeNanos = 13_000L)

        traceRecorder.start()
        traceRecorder.record(first, AudioDispatchDecisionFactory.create(first))
        traceRecorder.record(second, AudioDispatchDecisionFactory.create(second))
        val capture = traceRecorder.stop()

        assertEquals(1, capture.decisions.size)
        assertEquals(1, capture.droppedDecisionCount)
    }

    private fun metadata(): DiagnosticSessionMetadata = DiagnosticSessionMetadata(
        applicationVersion = "0.1.0",
        gitCommitSha = "abc123",
        buildType = "debug",
        deviceManufacturer = "Test",
        deviceModel = "Device",
        androidVersion = "16",
        screenWidthPx = 1920,
        screenHeightPx = 1080,
        densityDpi = 420,
        refreshRateHz = 120f,
        orientation = "landscape",
        audioOutputRoute = "speaker",
        audioSampleRate = 48_000,
        framesPerBurst = 96,
        oboeSharingMode = "exclusive",
        audioPerformanceMode = "low_latency",
        masterVolume = 0.76f,
        roomLevel = 0.32f,
        hapticsEnabled = true,
        selectedDrumKit = "Studio Kit",
        rendererBackend = "BITMAP",
        availableMemoryBytes = 1_000_000L,
        sessionMode = "free_play",
    )

    private fun strike(
        pointerId: Int = 1,
        eventTimeNanos: Long = 12_000L,
    ): DrumStrike = DrumStrike(
        pointerId = pointerId,
        instrument = InstrumentId.SNARE,
        velocity = 0.55f,
        normalizedX = 0.5f,
        normalizedY = 0.5f,
        pressure = 0.7f,
        contactSize = 0.2f,
        eventTimeNanos = eventTimeNanos,
    )

    private fun ZipFile.readText(name: String): String = getInputStream(getEntry(name)).use { input ->
        input.readBytes().toString(StandardCharsets.UTF_8)
    }
}
