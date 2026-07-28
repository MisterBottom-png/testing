package com.vitautas.drumkit.audio

import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.SnareArticulation
import com.vitautas.drumkit.model.SnareArticulationResolver

internal object StrikeArticulationSelector {
    fun resolve(
        strike: DrumStrike,
        velocity: Float,
        normalizedX: Float,
        normalizedY: Float,
    ): SnareArticulation = if (strike.instrument == InstrumentId.SNARE) {
        strike.requestedArticulation ?: SnareArticulationResolver.resolve(
            normalizedX = normalizedX,
            normalizedY = normalizedY,
            velocity = velocity,
        )
    } else {
        SnareArticulation.CENTER
    }
}
