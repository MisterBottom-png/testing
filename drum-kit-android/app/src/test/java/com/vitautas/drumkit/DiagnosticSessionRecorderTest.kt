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

class DiagnosticSessionRecorderTest {
    @Test
    fun exportsStructuredBundleWithChecksums() {
        var nanos = 1_000L
        var millis = 1_700_000_000_000L
        val recorder = DiagnosticSessionRecorder(
            monotonicClockNanos = { nanos },
            wallClockMillis = { millis },
            sessionIdFactory = { "session-test" },
        )
        recorder.start(metadata())
        nanos += 100L
        recorder.recordStrike(strike())
        nanos += 100L
        recorder.recordAudioDiagnostics(AudioDiagnostics(true, 48_000, 96, 0))
        nanos += 100L
        recorder.recordMarker(DiagnosticMarkerType.SOUNDS_WRONG, "metallic ring")
        nanos += 100L
        millis += 25L

        val outputDirectory = Files.createTempDirectory("drum-diagnostics").toFile()
        val result = recorder.stopAndExport(outputDirectory)

        assertFalse(recorder.isRecording)
        assertEquals(1, result.strikeCount)
        assertEquals(1, result.diagnosticsCount)
        assertEquals(1, result.markerCount)
        assertTrue(result.file.isFile)

        ZipFile(result.file).use { zip ->
            val names = zip.entries().asSequence().map { it.name }.toSet()
            assertTrue("manifest.json" in names)
            assertTrue("session.json" in names)
            assertTrue("strikes.jsonl" in names)
            assertTrue("audio-diagnostics.csv" in names)
            assertTrue("markers.json" in names)
            assertTrue("summary.txt" in names)
            assertTrue("checksums.sha256" in names)
            val manifest = zip.readText("manifest.json")
            assertTrue(manifest.contains("foundation_partial"))
            assertTrue(manifest.contains("touch-events.jsonl"))
            val strikes = zip.readText("strikes.jsonl")
            assertTrue(strikes.contains("\"instrument\":\"snare\""))
            assertTrue(strikes.contains("\"velocitySource\":\"deterministic_fallback\""))
            val markers = zip.readText("markers.json")
            assertTrue(markers.contains("metallic ring"))
        }
    }

    @Test
    fun reportsCapacityOverflow() {
        var nanos = 0L
        val recorder = DiagnosticSessionRecorder(
            strikeCapacity = 1,
            diagnosticsCapacity = 1,
            markerCapacity = 1,
            monotonicClockNanos = { ++nanos },
            wallClockMillis = { 100L },
            sessionIdFactory = { "overflow" },
        )
        recorder.start(metadata())
        recorder.recordStrike(strike())
        recorder.recordStrike(strike())
        recorder.recordAudioDiagnostics(AudioDiagnostics())
        recorder.recordAudioDiagnostics(AudioDiagnostics())
        recorder.recordMarker(DiagnosticMarkerType.OTHER)
        recorder.recordMarker(DiagnosticMarkerType.OTHER)

        val outputDirectory = Files.createTempDirectory("drum-diagnostics-overflow").toFile()
        val result = recorder.stopAndExport(outputDirectory)

        assertEquals(1, result.droppedStrikeCount)
        assertEquals(1, result.droppedDiagnosticsCount)
        assertEquals(1, result.droppedMarkerCount)
        ZipFile(result.file).use { zip ->
            val manifest = zip.readText("manifest.json")
            assertTrue(manifest.contains("\"strikes\": 1"))
            assertTrue(manifest.contains("\"audioDiagnostics\": 1"))
            assertTrue(manifest.contains("\"markers\": 1"))
        }
    }

    @Test(expected = IllegalStateException::class)
    fun cannotStartSecondSessionWhileActive() {
        val recorder = DiagnosticSessionRecorder(sessionIdFactory = { "duplicate" })
        recorder.start(metadata())
        recorder.start(metadata())
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

    private fun strike(): DrumStrike = DrumStrike(
        pointerId = 1,
        instrument = InstrumentId.SNARE,
        velocity = 0.8f,
        normalizedX = 0.5f,
        normalizedY = 0.5f,
        pressure = 0.6f,
        contactSize = 0.2f,
        eventTimeNanos = 1_234L,
    )

    private fun ZipFile.readText(name: String): String = getInputStream(getEntry(name)).use { input ->
        input.readBytes().toString(StandardCharsets.UTF_8)
    }
}
