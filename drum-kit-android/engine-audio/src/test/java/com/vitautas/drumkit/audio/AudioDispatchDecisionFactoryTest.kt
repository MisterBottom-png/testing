package com.vitautas.drumkit.audio

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.SnareArticulation
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

class AudioDispatchDecisionFactoryTest {
    @Test
    fun resolvesSnareArticulationLayersBlendAndVelocitySource() {
        val decision = AudioDispatchDecisionFactory.create(
            strike(
                velocity = 0.55f,
                normalizedX = 0.5f,
                normalizedY = 0.5f,
                pressure = 0.7f,
            ),
        )

        assertEquals(SnareArticulation.CENTER, decision.articulation)
        assertEquals(2, decision.lowerVelocityLayer)
        assertEquals(3, decision.upperVelocityLayer)
        assertEquals(0.75f, decision.velocityLayerBlend ?: -1f, 0.0001f)
        assertEquals("pressure_plus_contact_size", decision.velocityEstimatorInputMode)
        assertEquals(-0.12f, decision.stereoPan, 0.0001f)
        assertNull(decision.lowerRoundRobinIndex)
        assertNull(decision.activeVoiceCount)
        assertFalse(decision.nativeSelectionTraceAvailable)
    }

    @Test
    fun sanitizesInvalidInputsAndLabelsLegacyFallback() {
        val decision = AudioDispatchDecisionFactory.create(
            strike(
                velocity = Float.NaN,
                normalizedX = Float.POSITIVE_INFINITY,
                normalizedY = Float.NEGATIVE_INFINITY,
                pressure = 0.5f,
            ),
        )

        assertEquals(0.8f, decision.sanitizedVelocity, 0.0001f)
        assertEquals(0.5f, decision.sanitizedNormalizedX, 0.0001f)
        assertEquals(0.5f, decision.sanitizedNormalizedY, 0.0001f)
        assertEquals("timestamp_fallback_plus_contact_size", decision.velocityEstimatorInputMode)
        assertEquals(4, decision.lowerVelocityLayer)
        assertEquals(5, decision.upperVelocityLayer)
    }

    @Test
    fun leavesSampleSelectionFieldsEmptyForSynthesizedInstruments() {
        val decision = AudioDispatchDecisionFactory.create(
            strike(instrument = InstrumentId.RIDE),
        )

        assertNull(decision.articulation)
        assertNull(decision.lowerVelocityLayer)
        assertNull(decision.upperVelocityLayer)
        assertNull(decision.velocityLayerBlend)
        assertEquals(0.52f, decision.stereoPan, 0.0001f)
    }

    private fun strike(
        instrument: InstrumentId = InstrumentId.SNARE,
        velocity: Float = 0.8f,
        normalizedX: Float = 0.5f,
        normalizedY: Float = 0.5f,
        pressure: Float = 0.7f,
    ): DrumStrike = DrumStrike(
        pointerId = 7,
        instrument = instrument,
        velocity = velocity,
        normalizedX = normalizedX,
        normalizedY = normalizedY,
        pressure = pressure,
        contactSize = 0.2f,
        eventTimeNanos = 12_000L,
    )
}
