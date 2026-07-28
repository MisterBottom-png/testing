package com.vitautas.drumkit

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.security.MessageDigest
import java.util.zip.ZipFile
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DiagnosticPerformanceRecorderTest {
    @Test
    fun aggregatesFramesAndRecordsLifecycleViewportAndAnimationState() {
        var nowNanos = 1_000_000_000L
        val recorder = DiagnosticPerformanceRecorder(
            sampleCapacity = 32,
            sampleIntervalNanos = 50_000_000L,
            monotonicClockNanos = { nowNanos },
            javaHeapBytesProvider = { 12_000_000L },
            nativeHeapBytesProvider = { 7_000_000L },
        )
        recorder.start(
            metadata = metadata(refreshRateHz = 60f),
            viewportWidthPx = 1_920,
            viewportHeightPx = 1_080,
            density = 3f,
        )

        recorder.recordFrame(1_010_000_000L)
        recorder.recordStrike(kickStrike(eventTimeNanos = 1_015_000_000L))
        recorder.recordFrame(1_026_000_000L)
        recorder.recordFrame(1_060_000_000L)
        nowNanos = 1_070_000_000L
        recorder.recordLifecycle(DiagnosticLifecycleEvent.PAUSE)
        nowNanos = 1_080_000_000L
        recorder.recordViewport(widthPx = 1_080, heightPx = 1_920, density = 3f)
        nowNanos = 1_090_000_000L

        val capture = recorder.stop()

        assertEquals(2, capture.observedFrameCount)
        assertEquals(1, capture.observedLongFrameCount)
        assertEquals(1, capture.cacheRebuildCount)
        assertEquals(0, capture.droppedSampleCount)

        val frameWindow = capture.samples.single { it.eventType == "frame_window" }
        assertEquals(2, frameWindow.frameCount)
        assertEquals(1, frameWindow.longFrameCount)
        assertTrue(frameWindow.maximumFrameDurationNanos >= 34_000_000L)
        assertTrue(frameWindow.approximateFramesPerSecond > 0f)
        assertTrue(frameWindow.activeAnimationCount >= 1)
        assertTrue(frameWindow.invalidationReasons.contains("strike"))
        assertTrue(frameWindow.invalidationReasons.contains("animation"))
        assertEquals(12_000_000L, frameWindow.javaHeapBytes)
        assertEquals(7_000_000L, frameWindow.nativeHeapBytes)
        assertTrue(frameWindow.bitmapCacheBytes > 0L)

        val lifecycle = capture.samples.single { it.lifecycleEvent == "pause" }
        assertEquals("lifecycle", lifecycle.eventType)
        val viewport = capture.samples.single { it.eventType == "viewport_cache_rebuild" }
        assertEquals("portrait", viewport.orientation)
        assertEquals(1_080, viewport.viewportWidthPx)
        assertEquals(1_920, viewport.viewportHeightPx)
    }

    @Test
    fun exportsVersionedPerformanceCsvAndRecomputesChecksums() {
        var nowNanos = 2_000_000_000L
        val metadata = metadata()
        val sessionRecorder = DiagnosticSessionBundleRecorder(
            monotonicClockNanos = { nowNanos },
            wallClockMillis = { 1_700_000_000_000L },
            sessionIdFactory = { "performance-session" },
        )
        sessionRecorder.start(metadata)
        val sessionCapture = sessionRecorder.stop()
        val outputDirectory = Files.createTempDirectory("drum-performance-diagnostics").toFile()
        val result = sessionRecorder.export(sessionCapture, outputDirectory)

        val performanceRecorder = DiagnosticPerformanceRecorder(
            sampleIntervalNanos = 20_000_000L,
            monotonicClockNanos = { nowNanos },
            javaHeapBytesProvider = { 1_000L },
            nativeHeapBytesProvider = { 2_000L },
        )
        performanceRecorder.start(metadata, 1_920, 1_080, 3f)
        performanceRecorder.recordFrame(2_001_000_000L)
        performanceRecorder.recordFrame(2_018_000_000L)
        performanceRecorder.recordFrame(2_035_000_000L)
        nowNanos = 2_040_000_000L
        val performanceCapture = performanceRecorder.stop()
        performanceRecorder.augmentBundle(result.file, performanceCapture)

        ZipFile(result.file).use { zip ->
            val names = zip.entries().asSequence().map { it.name }.toSet()
            assertTrue("performance.csv" in names)
            val manifest = zip.readText("manifest.json")
            assertTrue(manifest.contains("\"performanceTrace\""))
            assertTrue(manifest.contains("\"performance.csv\""))
            assertTrue(manifest.contains("\"plannedFilesNotYetImplemented\": [\"generated-output.wav\"]"))
            assertTrue(manifest.contains("\"performanceSamples\": 0"))
            val csv = zip.readText("performance.csv")
            assertTrue(csv.startsWith("schema_version,event_type"))
            assertTrue(csv.contains("frame_window"))
            assertTrue(csv.lines().drop(1).filter { it.isNotBlank() }.all { it.startsWith("1,") })
            val summary = zip.readText("summary.txt")
            assertTrue(summary.contains("Performance samples:"))
            assertTrue(summary.contains("Observed UI frames:"))
            verifyChecksums(zip)
        }
    }

    @Test
    fun explicitlyReportsPerformanceSampleOverflow() {
        var nowNanos = 10L
        val recorder = DiagnosticPerformanceRecorder(
            sampleCapacity = 1,
            monotonicClockNanos = { nowNanos },
            javaHeapBytesProvider = { 0L },
            nativeHeapBytesProvider = { 0L },
        )
        recorder.start(metadata(), 1_920, 1_080, 3f)
        nowNanos = 20L
        recorder.recordLifecycle(DiagnosticLifecycleEvent.PAUSE)
        nowNanos = 30L

        val capture = recorder.stop()

        assertEquals(1, capture.samples.size)
        assertTrue(capture.droppedSampleCount >= 2)
    }

    @Test
    fun bitmapCacheEstimateIsPositiveAndScalesWithViewport() {
        val small = DiagnosticArtworkCacheEstimator.estimateBitmapBytes(
            viewportWidthPx = 1_280,
            viewportHeightPx = 720,
            density = 2f,
        )
        val large = DiagnosticArtworkCacheEstimator.estimateBitmapBytes(
            viewportWidthPx = 2_560,
            viewportHeightPx = 1_440,
            density = 2f,
        )

        assertTrue(small > 0L)
        assertTrue(large > small)
        assertEquals(
            0L,
            DiagnosticArtworkCacheEstimator.estimateBitmapBytes(0, 720, 2f),
        )
    }

    private fun metadata(refreshRateHz: Float = 120f): DiagnosticSessionMetadata = DiagnosticSessionMetadata(
        applicationVersion = "0.1.0",
        gitCommitSha = "abc123",
        buildType = "debug",
        deviceManufacturer = "Test",
        deviceModel = "Device",
        androidVersion = "16",
        screenWidthPx = 1_920,
        screenHeightPx = 1_080,
        densityDpi = 420,
        refreshRateHz = refreshRateHz,
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

    private fun kickStrike(eventTimeNanos: Long): DrumStrike = DrumStrike(
        pointerId = 1,
        instrument = InstrumentId.KICK,
        velocity = 0.8f,
        normalizedX = 0.5f,
        normalizedY = 0.58f,
        pressure = 0.7f,
        contactSize = 0.2f,
        eventTimeNanos = eventTimeNanos,
    )

    private fun ZipFile.readText(name: String): String = getInputStream(getEntry(name)).use { input ->
        input.readBytes().toString(StandardCharsets.UTF_8)
    }

    private fun verifyChecksums(zip: ZipFile) {
        val declared = zip.readText("checksums.sha256")
            .lineSequence()
            .filter { it.isNotBlank() }
            .associate { line ->
                val separator = line.indexOf("  ")
                line.substring(separator + 2) to line.substring(0, separator)
            }
        declared.forEach { (name, expected) ->
            val bytes = zip.getInputStream(zip.getEntry(name)).use { it.readBytes() }
            val actual = MessageDigest.getInstance("SHA-256")
                .digest(bytes)
                .joinToString("") { byte -> "%02x".format(byte) }
            assertEquals(name, expected, actual)
        }
        assertFalse("checksums.sha256" in declared)
    }
}
