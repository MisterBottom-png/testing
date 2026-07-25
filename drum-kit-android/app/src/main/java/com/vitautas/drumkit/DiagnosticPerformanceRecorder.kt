package com.vitautas.drumkit

import android.os.Debug
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import java.io.File
import java.nio.charset.StandardCharsets
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.security.MessageDigest
import java.util.Locale
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream

private const val DiagnosticPerformanceSchemaVersion = 1
private const val DefaultPerformanceSampleCapacity = 4_096
private const val DefaultPerformanceSampleIntervalNanos = 500_000_000L
private const val NanosPerSecond = 1_000_000_000L
private const val LongFrameMultiplier = 1.5
private const val BytesPerMiB = 1_048_576.0

internal enum class DiagnosticLifecycleEvent(val wireName: String) {
    START("start"),
    RESUME("resume"),
    PAUSE("pause"),
    STOP("stop"),
    RESTART("restart"),
    DESTROY("destroy"),
}

internal typealias DiagnosticLifecycleObserver = (DiagnosticLifecycleEvent) -> Unit

private enum class DiagnosticInvalidationReason(
    val bit: Int,
    val wireName: String,
) {
    STRIKE(1 shl 0, "strike"),
    ANIMATION(1 shl 1, "animation"),
    VIEWPORT(1 shl 2, "viewport"),
    CACHE_REBUILD(1 shl 3, "cache_rebuild"),
    LIFECYCLE(1 shl 4, "lifecycle"),
    DIAGNOSTIC_POLL(1 shl 5, "diagnostic_poll"),
    CONTROL(1 shl 6, "control"),
}

internal data class RecordedDiagnosticPerformanceSample(
    val offsetNanos: Long,
    val eventType: String,
    val windowDurationNanos: Long,
    val frameCount: Int,
    val averageFrameDurationNanos: Long,
    val maximumFrameDurationNanos: Long,
    val longFrameThresholdNanos: Long,
    val longFrameCount: Int,
    val approximateFramesPerSecond: Float,
    val activeAnimationCount: Int,
    val invalidationReasons: String,
    val cacheRebuildCount: Int,
    val artworkCacheBackend: String,
    val bitmapCacheBytes: Long,
    val javaHeapBytes: Long,
    val nativeHeapBytes: Long,
    val viewportWidthPx: Int,
    val viewportHeightPx: Int,
    val orientation: String,
    val lifecycleEvent: String?,
)

internal data class DiagnosticPerformanceCapture(
    val samples: List<RecordedDiagnosticPerformanceSample>,
    val droppedSampleCount: Int,
    val observedFrameCount: Int,
    val observedLongFrameCount: Int,
    val cacheRebuildCount: Int,
)

internal class DiagnosticPerformanceRecorder(
    sampleCapacity: Int = DefaultPerformanceSampleCapacity,
    private val sampleIntervalNanos: Long = DefaultPerformanceSampleIntervalNanos,
    private val monotonicClockNanos: () -> Long = System::nanoTime,
    private val javaHeapBytesProvider: () -> Long = {
        val runtime = Runtime.getRuntime()
        runtime.totalMemory() - runtime.freeMemory()
    },
    private val nativeHeapBytesProvider: () -> Long = Debug::getNativeHeapAllocatedSize,
) {
    private val validatedCapacity = sampleCapacity.positive("sampleCapacity")
    private val samples = ArrayList<RecordedDiagnosticPerformanceSample>(
        validatedCapacity.coerceAtMost(256),
    )
    private val animationEndNanos = LongArray(InstrumentId.entries.size)

    private var recording = false
    private var startedAtNanos = 0L
    private var previousFrameNanos = 0L
    private var frameWindowStartedAtNanos = 0L
    private var frameCount = 0
    private var frameDurationSumNanos = 0L
    private var maximumFrameDurationNanos = 0L
    private var windowLongFrameCount = 0
    private var totalObservedFrameCount = 0
    private var totalObservedLongFrameCount = 0
    private var droppedSampleCount = 0
    private var pendingInvalidationMask = 0
    private var longFrameThresholdNanos = 25_000_000L
    private var cacheRebuildCount = 0
    private var artworkCacheBackend = "unknown"
    private var bitmapCacheBytes = 0L
    private var viewportWidthPx = 0
    private var viewportHeightPx = 0
    private var density = 1f

    val isRecording: Boolean
        get() = recording

    init {
        require(sampleIntervalNanos > 0L) { "sampleIntervalNanos must be positive" }
    }

    fun start(
        metadata: DiagnosticSessionMetadata,
        viewportWidthPx: Int,
        viewportHeightPx: Int,
        density: Float,
    ) {
        check(!recording) { "diagnostic performance recording already active" }
        samples.clear()
        animationEndNanos.fill(0L)
        frameCount = 0
        frameDurationSumNanos = 0L
        maximumFrameDurationNanos = 0L
        windowLongFrameCount = 0
        totalObservedFrameCount = 0
        totalObservedLongFrameCount = 0
        droppedSampleCount = 0
        pendingInvalidationMask = 0
        cacheRebuildCount = 0
        previousFrameNanos = 0L
        frameWindowStartedAtNanos = 0L
        startedAtNanos = monotonicClockNanos()
        artworkCacheBackend = metadata.rendererBackend.trim().ifEmpty { "unknown" }
        val safeRefreshRate = metadata.refreshRateHz
            .takeIf { it.isFinite() && it >= 1f }
            ?: 60f
        longFrameThresholdNanos = (
            NanosPerSecond.toDouble() / safeRefreshRate.toDouble() * LongFrameMultiplier
        ).toLong().coerceAtLeast(1L)
        this.density = density.finiteOr(1f).coerceAtLeast(0.1f)
        this.viewportWidthPx = viewportWidthPx.coerceAtLeast(0)
        this.viewportHeightPx = viewportHeightPx.coerceAtLeast(0)
        bitmapCacheBytes = cacheEstimate(
            widthPx = this.viewportWidthPx,
            heightPx = this.viewportHeightPx,
            density = this.density,
        )
        recording = true
        appendSample(
            timestampNanos = startedAtNanos,
            eventType = "session_start",
            windowDurationNanos = 0L,
            frameCount = 0,
            averageFrameDurationNanos = 0L,
            maximumFrameDurationNanos = 0L,
            longFrameCount = 0,
            approximateFramesPerSecond = 0f,
            activeAnimationCount = 0,
            invalidationMask = 0,
            lifecycleEvent = "resumed",
        )
    }

    fun recordFrame(frameTimeNanos: Long) {
        if (!recording || frameTimeNanos <= 0L) return
        if (frameWindowStartedAtNanos == 0L) {
            frameWindowStartedAtNanos = frameTimeNanos
            previousFrameNanos = frameTimeNanos
            return
        }

        val frameDurationNanos = (frameTimeNanos - previousFrameNanos).coerceAtLeast(0L)
        previousFrameNanos = frameTimeNanos
        if (frameDurationNanos > 0L) {
            frameCount += 1
            totalObservedFrameCount += 1
            frameDurationSumNanos += frameDurationNanos
            maximumFrameDurationNanos = maxOf(maximumFrameDurationNanos, frameDurationNanos)
            if (frameDurationNanos > longFrameThresholdNanos) {
                windowLongFrameCount += 1
                totalObservedLongFrameCount += 1
            }
        }

        val activeAnimationCount = activeAnimationCount(frameTimeNanos)
        if (activeAnimationCount > 0) {
            pendingInvalidationMask = pendingInvalidationMask or DiagnosticInvalidationReason.ANIMATION.bit
        }

        if (frameTimeNanos - frameWindowStartedAtNanos >= sampleIntervalNanos) {
            flushFrameWindow(frameTimeNanos, activeAnimationCount)
        }
    }

    fun recordStrike(strike: DrumStrike) {
        if (!recording) return
        val timestampNanos = strike.eventTimeNanos
            .takeIf { it > 0L }
            ?: monotonicClockNanos()
        val durationNanos = animationDurationNanos(strike.instrument)
        animationEndNanos[strike.instrument.ordinal] = maxOf(
            animationEndNanos[strike.instrument.ordinal],
            timestampNanos + durationNanos,
        )
        pendingInvalidationMask = pendingInvalidationMask or DiagnosticInvalidationReason.STRIKE.bit
    }

    fun recordViewport(widthPx: Int, heightPx: Int, density: Float) {
        if (!recording || widthPx <= 0 || heightPx <= 0) return
        val safeDensity = density.finiteOr(this.density).coerceAtLeast(0.1f)
        if (
            widthPx == viewportWidthPx &&
            heightPx == viewportHeightPx &&
            safeDensity == this.density
        ) {
            return
        }

        viewportWidthPx = widthPx
        viewportHeightPx = heightPx
        this.density = safeDensity
        bitmapCacheBytes = cacheEstimate(widthPx, heightPx, safeDensity)
        cacheRebuildCount += 1
        pendingInvalidationMask = pendingInvalidationMask or
            DiagnosticInvalidationReason.VIEWPORT.bit or
            DiagnosticInvalidationReason.CACHE_REBUILD.bit
        val nowNanos = monotonicClockNanos()
        appendSample(
            timestampNanos = nowNanos,
            eventType = "viewport_cache_rebuild",
            windowDurationNanos = 0L,
            frameCount = 0,
            averageFrameDurationNanos = 0L,
            maximumFrameDurationNanos = 0L,
            longFrameCount = 0,
            approximateFramesPerSecond = 0f,
            activeAnimationCount = activeAnimationCount(nowNanos),
            invalidationMask = pendingInvalidationMask,
            lifecycleEvent = null,
        )
        pendingInvalidationMask = 0
    }

    fun recordLifecycle(event: DiagnosticLifecycleEvent) {
        if (!recording) return
        pendingInvalidationMask = pendingInvalidationMask or DiagnosticInvalidationReason.LIFECYCLE.bit
        val nowNanos = monotonicClockNanos()
        appendSample(
            timestampNanos = nowNanos,
            eventType = "lifecycle",
            windowDurationNanos = 0L,
            frameCount = 0,
            averageFrameDurationNanos = 0L,
            maximumFrameDurationNanos = 0L,
            longFrameCount = 0,
            approximateFramesPerSecond = 0f,
            activeAnimationCount = activeAnimationCount(nowNanos),
            invalidationMask = pendingInvalidationMask,
            lifecycleEvent = event.wireName,
        )
        pendingInvalidationMask = 0
    }

    fun recordDiagnosticPoll() {
        if (!recording) return
        pendingInvalidationMask = pendingInvalidationMask or DiagnosticInvalidationReason.DIAGNOSTIC_POLL.bit
    }

    fun recordControlInvalidation() {
        if (!recording) return
        pendingInvalidationMask = pendingInvalidationMask or DiagnosticInvalidationReason.CONTROL.bit
    }

    fun cancel() {
        recording = false
        samples.clear()
        animationEndNanos.fill(0L)
        resetFrameWindow()
        droppedSampleCount = 0
        totalObservedFrameCount = 0
        totalObservedLongFrameCount = 0
        pendingInvalidationMask = 0
        cacheRebuildCount = 0
    }

    fun stop(): DiagnosticPerformanceCapture {
        check(recording) { "diagnostic performance recording is not active" }
        val nowNanos = monotonicClockNanos()
        if (frameCount > 0) {
            flushFrameWindow(nowNanos, activeAnimationCount(nowNanos))
        }
        appendSample(
            timestampNanos = nowNanos,
            eventType = "session_stop",
            windowDurationNanos = 0L,
            frameCount = 0,
            averageFrameDurationNanos = 0L,
            maximumFrameDurationNanos = 0L,
            longFrameCount = 0,
            approximateFramesPerSecond = 0f,
            activeAnimationCount = activeAnimationCount(nowNanos),
            invalidationMask = pendingInvalidationMask,
            lifecycleEvent = null,
        )
        val capture = DiagnosticPerformanceCapture(
            samples = samples.toList(),
            droppedSampleCount = droppedSampleCount,
            observedFrameCount = totalObservedFrameCount,
            observedLongFrameCount = totalObservedLongFrameCount,
            cacheRebuildCount = cacheRebuildCount,
        )
        recording = false
        samples.clear()
        animationEndNanos.fill(0L)
        resetFrameWindow()
        pendingInvalidationMask = 0
        return capture
    }

    fun augmentBundle(bundle: File, capture: DiagnosticPerformanceCapture) {
        val retained = linkedMapOf<String, ByteArray>()
        ZipFile(bundle).use { zip ->
            val iterator = zip.entries()
            while (iterator.hasMoreElements()) {
                val entry = iterator.nextElement()
                if (entry.name !in setOf("manifest.json", "performance.csv", "summary.txt", "checksums.sha256")) {
                    retained[entry.name] = zip.getInputStream(entry).use { it.readBytes() }
                }
            }
            val manifest = zip.readUtf8("manifest.json")
                .replace(
                    "\"bundleState\": \"step_1_2_native_dispatch_trace_partial\"",
                    "\"bundleState\": \"step_1_2_performance_trace_partial\"",
                )
                .replace(
                    "\"bundleState\": \"step_1_2_partial\"",
                    "\"bundleState\": \"step_1_2_performance_trace_partial\"",
                )
                .replace(
                    "\"audio-diagnostics.csv\", \"markers.json\"",
                    "\"audio-diagnostics.csv\", \"performance.csv\", \"markers.json\"",
                )
                .replace(
                    "\"plannedFilesNotYetImplemented\": [\"performance.csv\", \"generated-output.wav\"]",
                    "\"plannedFilesNotYetImplemented\": [\"generated-output.wav\"]",
                )
                .replaceFirst(
                    "  \"droppedData\": {",
                    buildString {
                        append("  \"performanceTrace\": {\n")
                        append("    \"schemaVersion\": ").append(DiagnosticPerformanceSchemaVersion).append(",\n")
                        append("    \"samples\": ").append(capture.samples.size).append(",\n")
                        append("    \"observedFrames\": ").append(capture.observedFrameCount).append(",\n")
                        append("    \"longFrames\": ").append(capture.observedLongFrameCount).append(",\n")
                        append("    \"cacheRebuilds\": ").append(capture.cacheRebuildCount).append(",\n")
                        append("    \"droppedSamples\": ").append(capture.droppedSampleCount).append('\n')
                        append("  },\n")
                        append("  \"droppedData\": {")
                    },
                )
                .replaceFirst(
                    "  \"droppedData\": {\n",
                    "  \"droppedData\": {\n    \"performanceSamples\": ${capture.droppedSampleCount},\n",
                )
            retained["manifest.json"] = manifest.utf8()
            retained["summary.txt"] = (
                zip.readUtf8("summary.txt")
                    .replace(
                        "Rendering telemetry and generated-output WAV capture are not yet implemented.",
                        "Generated-output WAV capture is not yet implemented.",
                    ) +
                    performanceSummary(capture)
                ).utf8()
        }

        val entries = linkedMapOf<String, ByteArray>()
        entries["manifest.json"] = checkNotNull(retained.remove("manifest.json"))
        retained["session.json"]?.let { entries["session.json"] = it }
        retained["touch-events.jsonl"]?.let { entries["touch-events.jsonl"] = it }
        retained["strikes.jsonl"]?.let { entries["strikes.jsonl"] = it }
        retained["audio-diagnostics.csv"]?.let { entries["audio-diagnostics.csv"] = it }
        entries["performance.csv"] = performanceCsv(capture).utf8()
        retained["markers.json"]?.let { entries["markers.json"] = it }
        retained["summary.txt"]?.let { entries["summary.txt"] = it }
        retained.forEach { (name, bytes) ->
            if (name !in entries) entries[name] = bytes
        }
        entries["checksums.sha256"] = buildString {
            entries.forEach { (name, bytes) ->
                append(sha256(bytes)).append("  ").append(name).append('\n')
            }
        }.utf8()

        val temporary = File(bundle.parentFile, ".${bundle.name}.performance.tmp")
        if (temporary.exists()) temporary.delete()
        try {
            temporary.outputStream().buffered().use { output ->
                ZipOutputStream(output).use { zip ->
                    entries.forEach { (name, bytes) ->
                        zip.putNextEntry(ZipEntry(name))
                        zip.write(bytes)
                        zip.closeEntry()
                    }
                }
            }
            replacePerformanceBundle(temporary, bundle)
        } catch (failure: Throwable) {
            temporary.delete()
            throw failure
        }
    }

    private fun flushFrameWindow(timestampNanos: Long, activeAnimationCount: Int) {
        if (frameCount <= 0) {
            frameWindowStartedAtNanos = timestampNanos
            previousFrameNanos = timestampNanos
            return
        }
        val windowDurationNanos = (timestampNanos - frameWindowStartedAtNanos).coerceAtLeast(1L)
        val averageFrameDurationNanos = frameDurationSumNanos / frameCount
        val approximateFramesPerSecond = (
            frameCount.toDouble() * NanosPerSecond.toDouble() / windowDurationNanos.toDouble()
        ).toFloat()
        appendSample(
            timestampNanos = timestampNanos,
            eventType = "frame_window",
            windowDurationNanos = windowDurationNanos,
            frameCount = frameCount,
            averageFrameDurationNanos = averageFrameDurationNanos,
            maximumFrameDurationNanos = maximumFrameDurationNanos,
            longFrameCount = windowLongFrameCount,
            approximateFramesPerSecond = approximateFramesPerSecond,
            activeAnimationCount = activeAnimationCount,
            invalidationMask = pendingInvalidationMask,
            lifecycleEvent = null,
        )
        resetFrameWindow()
        frameWindowStartedAtNanos = timestampNanos
        previousFrameNanos = timestampNanos
        pendingInvalidationMask = 0
    }

    private fun appendSample(
        timestampNanos: Long,
        eventType: String,
        windowDurationNanos: Long,
        frameCount: Int,
        averageFrameDurationNanos: Long,
        maximumFrameDurationNanos: Long,
        longFrameCount: Int,
        approximateFramesPerSecond: Float,
        activeAnimationCount: Int,
        invalidationMask: Int,
        lifecycleEvent: String?,
    ) {
        if (samples.size >= validatedCapacity) {
            droppedSampleCount += 1
            return
        }
        samples += RecordedDiagnosticPerformanceSample(
            offsetNanos = (timestampNanos - startedAtNanos).coerceAtLeast(0L),
            eventType = eventType,
            windowDurationNanos = windowDurationNanos.coerceAtLeast(0L),
            frameCount = frameCount.coerceAtLeast(0),
            averageFrameDurationNanos = averageFrameDurationNanos.coerceAtLeast(0L),
            maximumFrameDurationNanos = maximumFrameDurationNanos.coerceAtLeast(0L),
            longFrameThresholdNanos = longFrameThresholdNanos,
            longFrameCount = longFrameCount.coerceAtLeast(0),
            approximateFramesPerSecond = approximateFramesPerSecond.finiteOr(0f).coerceAtLeast(0f),
            activeAnimationCount = activeAnimationCount.coerceAtLeast(0),
            invalidationReasons = invalidationReasons(invalidationMask),
            cacheRebuildCount = cacheRebuildCount,
            artworkCacheBackend = artworkCacheBackend,
            bitmapCacheBytes = bitmapCacheBytes.coerceAtLeast(0L),
            javaHeapBytes = javaHeapBytesProvider().coerceAtLeast(0L),
            nativeHeapBytes = nativeHeapBytesProvider().coerceAtLeast(0L),
            viewportWidthPx = viewportWidthPx.coerceAtLeast(0),
            viewportHeightPx = viewportHeightPx.coerceAtLeast(0),
            orientation = orientation(viewportWidthPx, viewportHeightPx),
            lifecycleEvent = lifecycleEvent,
        )
    }

    private fun resetFrameWindow() {
        frameCount = 0
        frameDurationSumNanos = 0L
        maximumFrameDurationNanos = 0L
        windowLongFrameCount = 0
        frameWindowStartedAtNanos = 0L
        previousFrameNanos = 0L
    }

    private fun activeAnimationCount(timestampNanos: Long): Int =
        animationEndNanos.count { it > timestampNanos }

    private fun cacheEstimate(widthPx: Int, heightPx: Int, density: Float): Long =
        if (artworkCacheBackend.equals("bitmap", ignoreCase = true)) {
            DiagnosticArtworkCacheEstimator.estimateBitmapBytes(widthPx, heightPx, density)
        } else {
            0L
        }

    private fun invalidationReasons(mask: Int): String {
        if (mask == 0) return "idle_or_unknown"
        return DiagnosticInvalidationReason.entries
            .asSequence()
            .filter { reason -> mask and reason.bit != 0 }
            .joinToString("|") { reason -> reason.wireName }
    }
}

private fun animationDurationNanos(instrument: InstrumentId): Long = when (instrument) {
    InstrumentId.SNARE -> 110_000_000L
    InstrumentId.TOM_HIGH -> 160_000_000L
    InstrumentId.TOM_MID -> 195_000_000L
    InstrumentId.FLOOR_TOM -> 245_000_000L
    InstrumentId.KICK -> 230_000_000L
    InstrumentId.HI_HAT -> 280_000_000L
    InstrumentId.CRASH -> 620_000_000L
    InstrumentId.RIDE -> 720_000_000L
}

private fun orientation(widthPx: Int, heightPx: Int): String = when {
    widthPx <= 0 || heightPx <= 0 -> "unknown"
    widthPx >= heightPx -> "landscape"
    else -> "portrait"
}

private fun performanceCsv(capture: DiagnosticPerformanceCapture): String = buildString {
    append(
        "schema_version,event_type,offset_nanos,window_duration_nanos,frame_count," +
            "average_frame_duration_nanos,maximum_frame_duration_nanos,long_frame_threshold_nanos," +
            "long_frame_count,approximate_fps,active_animation_count,invalidation_reasons," +
            "cache_rebuild_count,artwork_cache_backend,bitmap_cache_bytes,java_heap_bytes," +
            "native_heap_bytes,viewport_width_px,viewport_height_px,orientation,lifecycle_event\n",
    )
    capture.samples.forEach { sample ->
        append(DiagnosticPerformanceSchemaVersion).append(',')
        appendCsv(sample.eventType).append(',')
        append(sample.offsetNanos).append(',')
        append(sample.windowDurationNanos).append(',')
        append(sample.frameCount).append(',')
        append(sample.averageFrameDurationNanos).append(',')
        append(sample.maximumFrameDurationNanos).append(',')
        append(sample.longFrameThresholdNanos).append(',')
        append(sample.longFrameCount).append(',')
        append(String.format(Locale.US, "%.3f", sample.approximateFramesPerSecond)).append(',')
        append(sample.activeAnimationCount).append(',')
        appendCsv(sample.invalidationReasons).append(',')
        append(sample.cacheRebuildCount).append(',')
        appendCsv(sample.artworkCacheBackend).append(',')
        append(sample.bitmapCacheBytes).append(',')
        append(sample.javaHeapBytes).append(',')
        append(sample.nativeHeapBytes).append(',')
        append(sample.viewportWidthPx).append(',')
        append(sample.viewportHeightPx).append(',')
        appendCsv(sample.orientation).append(',')
        appendCsv(sample.lifecycleEvent.orEmpty()).append('\n')
    }
}

private fun performanceSummary(capture: DiagnosticPerformanceCapture): String {
    val frameWindows = capture.samples.filter { it.eventType == "frame_window" }
    val maximumFrameDurationNanos = frameWindows.maxOfOrNull { it.maximumFrameDurationNanos } ?: 0L
    val maximumActiveAnimations = capture.samples.maxOfOrNull { it.activeAnimationCount } ?: 0
    val latestCacheBytes = capture.samples.lastOrNull()?.bitmapCacheBytes ?: 0L
    val latestJavaHeapBytes = capture.samples.lastOrNull()?.javaHeapBytes ?: 0L
    val latestNativeHeapBytes = capture.samples.lastOrNull()?.nativeHeapBytes ?: 0L
    return buildString {
        append("\nPerformance samples: ").append(capture.samples.size).append('\n')
        append("Observed UI frames: ").append(capture.observedFrameCount).append('\n')
        append("Long UI frames: ").append(capture.observedLongFrameCount).append('\n')
        append("Maximum frame duration: ").append(maximumFrameDurationNanos).append(" ns\n")
        append("Maximum active animations: ").append(maximumActiveAnimations).append('\n')
        append("Artwork cache rebuilds: ").append(capture.cacheRebuildCount).append('\n')
        append("Latest bitmap cache estimate: ")
            .append(String.format(Locale.US, "%.2f", latestCacheBytes / BytesPerMiB))
            .append(" MiB\n")
        append("Latest Java heap: ")
            .append(String.format(Locale.US, "%.2f", latestJavaHeapBytes / BytesPerMiB))
            .append(" MiB\n")
        append("Latest native heap: ")
            .append(String.format(Locale.US, "%.2f", latestNativeHeapBytes / BytesPerMiB))
            .append(" MiB\n")
        append("Dropped performance samples: ").append(capture.droppedSampleCount).append('\n')
    }
}

private fun StringBuilder.appendCsv(value: String): StringBuilder {
    append('"')
    value.forEach { character ->
        if (character == '"') append("\"\"") else append(character)
    }
    return append('"')
}

private fun ZipFile.readUtf8(name: String): String {
    val entry = checkNotNull(getEntry(name)) { "missing ZIP entry: $name" }
    return getInputStream(entry).use { input ->
        input.readBytes().toString(StandardCharsets.UTF_8)
    }
}

private fun replacePerformanceBundle(source: File, destination: File) {
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

private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
    .digest(bytes)
    .joinToString("") { byte -> "%02x".format(byte) }

private fun String.utf8(): ByteArray = toByteArray(StandardCharsets.UTF_8)

private fun Int.positive(name: String): Int {
    require(this > 0) { "$name must be positive" }
    return this
}

private fun Float.finiteOr(defaultValue: Float): Float = if (isFinite()) this else defaultValue
