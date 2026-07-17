package com.vitautas.drumkit.feature.kit

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

    private fun strike(
        instrument: InstrumentId,
        velocity: Float,
    ): DrumStrike = DrumStrike(
        pointerId = 7,
        instrument = instrument,
        velocity = velocity,
        normalizedX = 0.35f,
        normalizedY = 0.64f,
        pressure = 0.73f,
        contactSize = 0.18f,
        eventTimeNanos = 123L,
    )
}
