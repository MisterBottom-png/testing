package com.vitautas.drumkit.feature.kit

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId

private const val DefaultRecordingCapacity = 8_192

internal data class RecordedStrike(
    val offsetNanos: Long,
    val pointerId: Int,
    val instrument: InstrumentId,
    val velocity: Float,
    val normalizedX: Float,
    val normalizedY: Float,
    val pressure: Float,
    val contactSize: Float,
)

internal data class RecordedPerformance(
    val durationNanos: Long,
    val strikes: List<RecordedStrike>,
    val truncated: Boolean,
) {
    val durationMillis: Long
        get() = durationNanos / 1_000_000L
}

internal class PerformanceRecorder(
    capacity: Int = DefaultRecordingCapacity,
    private val clockNanos: () -> Long = System::nanoTime,
) {
    private val validatedCapacity = capacity.also {
        require(it > 0) { "capacity must be positive" }
    }
    private val offsetsNanos = LongArray(validatedCapacity)
    private val pointerIds = IntArray(validatedCapacity)
    private val instrumentOrdinals = IntArray(validatedCapacity)
    private val velocities = FloatArray(validatedCapacity)
    private val normalizedXs = FloatArray(validatedCapacity)
    private val normalizedYs = FloatArray(validatedCapacity)
    private val pressures = FloatArray(validatedCapacity)
    private val contactSizes = FloatArray(validatedCapacity)

    var isRecording: Boolean = false
        private set

    private var startedAtNanos: Long = 0L
    private var strikeCount: Int = 0
    private var truncated: Boolean = false

    fun start() {
        strikeCount = 0
        truncated = false
        startedAtNanos = clockNanos()
        isRecording = true
    }

    fun record(strike: DrumStrike) {
        if (!isRecording) return
        if (strikeCount >= offsetsNanos.size) {
            truncated = true
            return
        }

        val index = strikeCount
        offsetsNanos[index] = (clockNanos() - startedAtNanos).coerceAtLeast(0L)
        pointerIds[index] = strike.pointerId
        instrumentOrdinals[index] = strike.instrument.ordinal
        velocities[index] = strike.velocity.finiteOr(0.8f).coerceIn(0.05f, 1f)
        normalizedXs[index] = strike.normalizedX.finiteOr(0.5f).coerceIn(0f, 1f)
        normalizedYs[index] = strike.normalizedY.finiteOr(0.5f).coerceIn(0f, 1f)
        pressures[index] = strike.pressure.finiteOr(0f).coerceAtLeast(0f)
        contactSizes[index] = strike.contactSize.finiteOr(0f).coerceAtLeast(0f)
        strikeCount += 1
    }

    fun stopIfRecording(): RecordedPerformance? = if (isRecording) stop() else null

    fun stop(): RecordedPerformance {
        if (!isRecording) {
            return RecordedPerformance(
                durationNanos = 0L,
                strikes = emptyList(),
                truncated = false,
            )
        }

        val durationNanos = (clockNanos() - startedAtNanos).coerceAtLeast(0L)
        isRecording = false
        val strikes = ArrayList<RecordedStrike>(strikeCount)
        for (index in 0 until strikeCount) {
            strikes += RecordedStrike(
                offsetNanos = offsetsNanos[index],
                pointerId = pointerIds[index],
                instrument = InstrumentId.entries[instrumentOrdinals[index]],
                velocity = velocities[index],
                normalizedX = normalizedXs[index],
                normalizedY = normalizedYs[index],
                pressure = pressures[index],
                contactSize = contactSizes[index],
            )
        }
        return RecordedPerformance(
            durationNanos = durationNanos,
            strikes = strikes,
            truncated = truncated,
        )
    }

    private fun Float.finiteOr(defaultValue: Float): Float = if (isFinite()) this else defaultValue
}
