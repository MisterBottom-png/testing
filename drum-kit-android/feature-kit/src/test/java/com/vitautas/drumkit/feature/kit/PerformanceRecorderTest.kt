package com.vitautas.drumkit.feature.kit

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PerformanceRecorderTest {
    @Test
    fun recordsExpressiveStrikeDataWithRelativeTiming() {
        var nowNanos = 1_000L
        val recorder = PerformanceRecorder(capacity = 4, clockNanos = { nowNanos })

        recorder.start()
        nowNanos = 1_250L
        recorder.record(strike(instrument = InstrumentId.SNARE, velocity = 0.82f))
        nowNanos = 2_000L
        val take = recorder.stop()

        assertFalse(recorder.isRecording)
        assertEquals(1_000L, take.durationNanos)
        assertEquals(1, take.strikes.size)
        assertEquals(250L, take.strikes.single().offsetNanos)
        assertEquals(InstrumentId.SNARE, take.strikes.single().instrument)
        assertEquals(0.82f, take.strikes.single().velocity)
        assertFalse(take.truncated)
    }

    @Test
    fun marksTakeTruncatedWithoutGrowingTheBuffer() {
        var nowNanos = 0L
        val recorder = PerformanceRecorder(capacity = 1, clockNanos = { nowNanos })

        recorder.start()
        recorder.record(strike(instrument = InstrumentId.KICK, velocity = 0.9f))
        nowNanos = 10L
        recorder.record(strike(instrument = InstrumentId.CRASH, velocity = 0.7f))
        val take = recorder.stop()

        assertEquals(1, take.strikes.size)
        assertEquals(InstrumentId.KICK, take.strikes.single().instrument)
        assertTrue(take.truncated)
    }

    @Test
    fun stopIfRecordingFinalizesOnlyAnActiveTake() {
        var nowNanos = 100L
        val recorder = PerformanceRecorder(capacity = 2, clockNanos = { nowNanos })

        assertNull(recorder.stopIfRecording())
        recorder.start()
        nowNanos = 350L
        val take = recorder.stopIfRecording()

        assertEquals(250L, take?.durationNanos)
        assertFalse(recorder.isRecording)
        assertNull(recorder.stopIfRecording())
    }

    @Test
    fun capturedValuesAreFiniteAndClamped() {
        val recorder = PerformanceRecorder(capacity = 1, clockNanos = { 0L })
        recorder.start()
        recorder.record(
            strike(
                instrument = InstrumentId.RIDE,
                velocity = Float.NaN,
                normalizedX = Float.POSITIVE_INFINITY,
                normalizedY = -3f,
                pressure = Float.NaN,
                contactSize = Float.NEGATIVE_INFINITY,
            ),
        )

        val recorded = recorder.stop().strikes.single()
        assertEquals(0.8f, recorded.velocity, 0f)
        assertEquals(0.5f, recorded.normalizedX, 0f)
        assertEquals(0f, recorded.normalizedY, 0f)
        assertEquals(0f, recorded.pressure, 0f)
        assertEquals(0f, recorded.contactSize, 0f)
    }

    private fun strike(
        instrument: InstrumentId,
        velocity: Float,
        normalizedX: Float = 0.35f,
        normalizedY: Float = 0.64f,
        pressure: Float = 0.73f,
        contactSize: Float = 0.18f,
    ): DrumStrike = DrumStrike(
        pointerId = 7,
        instrument = instrument,
        velocity = velocity,
        normalizedX = normalizedX,
        normalizedY = normalizedY,
        pressure = pressure,
        contactSize = contactSize,
        eventTimeNanos = 123L,
    )
}
