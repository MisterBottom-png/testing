package com.vitautas.drumkit

import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.util.zip.ZipFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticSessionBundleRecorderTest {
    @Test
    fun exportsRawTouchEventsAndRecomputedChecksums() {
        var nanos = 1_000L
        var millis = 1_700_000_000_000L
        val recorder = DiagnosticSessionBundleRecorder(
            monotonicClockNanos = { nanos },
            wallClockMillis = { millis },
            sessionIdFactory = { "touch-session" },
        )
        recorder.start(metadata())
        nanos += 100L
        recorder.recordTouchSample(touchSample())
        nanos += 100L
        recorder.recordStrike(strike())
        nanos += 100L
        recorder.recordAudioDiagnostics(AudioDiagnostics(true, 48_000, 96, 0))
        millis += 20L

        val outputDirectory = Files.createTempDirectory("drum-touch-diagnostics").toFile()
        val result = recorder.stopAndExport(outputDirectory)

        assertFalse(recorder.isRecording)
        assertEquals(1, result.touchEventCount)
        assertEquals(1, result.strikeCount)
        assertEquals(0, result.droppedTouchEventCount)

        ZipFile(result.file).use { zip ->
            val names = zip.entries().asSequence().map { it.name }.toSet()
            assertTrue("touch-events.jsonl" in names)
            assertTrue("checksums.sha256" in names)
            val manifest = zip.readText("manifest.json")
            assertTrue(manifest.contains("step_1_2_partial"))
            assertTrue(manifest.contains("touch-events.jsonl"))
            assertFalse(manifest.contains("\"plannedFilesNotYetImplemented\": [\"touch-events.jsonl\""))
            val touches = zip.readText("touch-events.jsonl")
            assertTrue(touches.contains("\"action\":\"down\""))
            assertTrue(touches.contains("\"acceptedStrike\":true"))
            assertTrue(touches.contains("\"candidateInstruments\":[\"snare\",\"kick\"]"))
            assertTrue(touches.contains("\"historicalSamples\":[{"))
            val summary = zip.readText("summary.txt")
            assertTrue(summary.contains("Touch events: 1"))
            assertTrue(summary.contains("Rendering telemetry and generated-output WAV capture are not yet implemented."))
            assertFalse(summary.contains("does not yet contain raw rejected touches"))
            val checksums = zip.readText("checksums.sha256")
            assertTrue(checksums.contains("touch-events.jsonl"))
            assertTrue(checksums.contains("manifest.json"))
        }
    }

    @Test
    fun reportsTouchCapacityOverflow() {
        var nanos = 0L
        val recorder = DiagnosticSessionBundleRecorder(
            touchEventCapacity = 1,
            monotonicClockNanos = { ++nanos },
            wallClockMillis = { 100L },
            sessionIdFactory = { "touch-overflow" },
        )
        recorder.start(metadata())
        recorder.recordTouchSample(touchSample())
        recorder.recordTouchSample(touchSample(pointerId = 2))

        val outputDirectory = Files.createTempDirectory("drum-touch-overflow").toFile()
        val result = recorder.stopAndExport(outputDirectory)

        assertEquals(1, result.touchEventCount)
        assertEquals(1, result.droppedTouchEventCount)
        ZipFile(result.file).use { zip ->
            val manifest = zip.readText("manifest.json")
            assertTrue(manifest.contains("\"touchEvents\": 1"))
        }
    }

    private fun touchSample(pointerId: Int = 1): DiagnosticTouchSample = DiagnosticTouchSample(
        eventTimeNanos = 2_000L,
        action = DiagnosticTouchAction.DOWN,
        actionMasked = 0,
        actionIndex = 0,
        pointerId = pointerId,
        pointerIndex = 0,
        isActionPointer = true,
        acceptedStrike = true,
        rawX = 960f,
        rawY = 540f,
        normalizedX = 0.5f,
        normalizedY = 0.5f,
        pressure = 0.7f,
        contactSize = 0.2f,
        toolType = "finger",
        orientationRadians = 0f,
        hitRegionCount = 2,
        candidateInstruments = listOf(InstrumentId.SNARE, InstrumentId.KICK),
        selectedInstrument = InstrumentId.SNARE,
        rejectionReason = null,
        historicalSamples = listOf(
            DiagnosticHistoricalTouchSample(
                eventTimeNanos = 1_900L,
                rawX = 950f,
                rawY = 530f,
                normalizedX = 0.49f,
                normalizedY = 0.49f,
                pressure = 0.6f,
                contactSize = 0.18f,
                orientationRadians = 0f,
            ),
        ),
    )

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

    private fun strike(): DrumStrike = DrumStrike(
        pointerId = 1,
        instrument = InstrumentId.SNARE,
        velocity = 0.8f,
        normalizedX = 0.5f,
        normalizedY = 0.5f,
        pressure = 0.7f,
        contactSize = 0.2f,
        eventTimeNanos = 2_000L,
    )

    private fun ZipFile.readText(name: String): String = getInputStream(getEntry(name)).use { input ->
        input.readBytes().toString(StandardCharsets.UTF_8)
    }
}
