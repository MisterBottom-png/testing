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
    private val offsetsNanos = LongArray(capacity)
    private val pointerIds = IntArray(capacity)
    private val instrumentOrdinals = IntArray(capacity)
    private val velocities = FloatArray(capacity)
    private val normalizedXs = FloatArray(capacity)
    private val normalizedYs = FloatArray(capacity)
    private val pressures = FloatArray(capacity)
    private val contactSizes = FloatArray(capacity)

    var isRecording: Boolean = false
        private set

    private var startedAtNanos: Long = 0L
    private var strikeCount: Int = 0
    private var truncated: Boolean = false

    init {
        require(capacity > 0) { "capacity must be positive" }
    }

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
        velocities[index] = strike.velocity
        normalizedXs[index] = strike.normalizedX
        normalizedYs[index] = strike.normalizedY
        pressures[index] = strike.pressure
        contactSizes[index] = strike.contactSize
        strikeCount += 1
    }

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
}
