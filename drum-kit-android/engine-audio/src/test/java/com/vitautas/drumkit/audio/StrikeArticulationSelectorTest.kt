package com.vitautas.drumkit.audio

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.SnareArticulation
import org.junit.Assert.assertEquals
import org.junit.Test

class StrikeArticulationSelectorTest {
    @Test
    fun honorsDeliberateCrossStickFromInput() {
        assertEquals(
            SnareArticulation.CROSS_STICK,
            StrikeArticulationSelector.resolve(
                strike = strike(requestedArticulation = SnareArticulation.CROSS_STICK),
                velocity = 0.5f,
                normalizedX = 0.96f,
                normalizedY = 0.5f,
            ),
        )
    }

    @Test
    fun fallsBackToCoordinateBasedSnareResolution() {
        assertEquals(
            SnareArticulation.OFF_CENTER,
            StrikeArticulationSelector.resolve(
                strike = strike(),
                velocity = 0.7f,
                normalizedX = 0.5f,
                normalizedY = 0.82f,
            ),
        )
    }

    @Test
    fun nonSnareInstrumentAlwaysUsesCenterArticulationCode() {
        assertEquals(
            SnareArticulation.CENTER,
            StrikeArticulationSelector.resolve(
                strike = strike(
                    instrument = InstrumentId.KICK,
                    requestedArticulation = SnareArticulation.CROSS_STICK,
                ),
                velocity = 0.8f,
                normalizedX = 0.5f,
                normalizedY = 0.5f,
            ),
        )
    }

    private fun strike(
        instrument: InstrumentId = InstrumentId.SNARE,
        requestedArticulation: SnareArticulation? = null,
    ) = DrumStrike(
        pointerId = 1,
        instrument = instrument,
        velocity = 0.7f,
        normalizedX = 0.5f,
        normalizedY = 0.5f,
        pressure = 0.5f,
        contactSize = 0f,
        eventTimeNanos = 1L,
        requestedArticulation = requestedArticulation,
    )
}
