package com.vitautas.drumkit.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeDispatchOutcomeDecoderTest {
    @Test
    fun decodesSampleSelectionAndVoiceOutcome() {
        val destination = mutableListOf<NativeDispatchOutcome>()

        NativeDispatchOutcomeDecoder.appendDecoded(
            tokens = longArrayOf(91L),
            integers = intArrayOf(2, 3, 17, 1, 1),
            floats = floatArrayOf(1.003f, 0.98f, -0.007f),
            count = 1,
            destination = destination,
        )

        val outcome = destination.single()
        assertEquals(91L, outcome.diagnosticToken)
        assertEquals(2, outcome.lowerRoundRobinIndex)
        assertEquals(3, outcome.upperRoundRobinIndex)
        assertEquals(1.003f, outcome.pitchVariation ?: 0f, 0.0001f)
        assertEquals(0.98f, outcome.gainVariation ?: 0f, 0.0001f)
        assertEquals(-0.007f, outcome.filterVariation ?: 0f, 0.0001f)
        assertEquals(17, outcome.activeVoiceCount)
        assertTrue(outcome.voiceStealOccurred)
        assertTrue(outcome.sampledVoice)
    }

    @Test
    fun keepsSampleFieldsNullForSynthesizedVoice() {
        val destination = mutableListOf<NativeDispatchOutcome>()

        NativeDispatchOutcomeDecoder.appendDecoded(
            tokens = longArrayOf(12L),
            integers = intArrayOf(-1, -1, 4, 0, 0),
            floats = floatArrayOf(0f, 0f, 0f),
            count = 1,
            destination = destination,
        )

        val outcome = destination.single()
        assertNull(outcome.lowerRoundRobinIndex)
        assertNull(outcome.upperRoundRobinIndex)
        assertNull(outcome.pitchVariation)
        assertNull(outcome.gainVariation)
        assertNull(outcome.filterVariation)
        assertEquals(4, outcome.activeVoiceCount)
        assertFalse(outcome.voiceStealOccurred)
        assertFalse(outcome.sampledVoice)
    }
}
