package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Test

class SnareArticulationResolverTest {
    @Test
    fun centerOfHeadSelectsCenter() {
        assertEquals(
            SnareArticulation.CENTER,
            SnareArticulationResolver.resolve(0.5f, 0.21f, 0.7f),
        )
    }

    @Test
    fun middleRadiusSelectsOffCenter() {
        assertEquals(
            SnareArticulation.OFF_CENTER,
            SnareArticulationResolver.resolve(0.70f, 0.21f, 0.7f),
        )
    }

    @Test
    fun outerHeadSelectsEdge() {
        assertEquals(
            SnareArticulation.EDGE,
            SnareArticulationResolver.resolve(0.85f, 0.21f, 0.7f),
        )
    }

    @Test
    fun hardHoopStrikeSelectsRimshot() {
        assertEquals(
            SnareArticulation.RIMSHOT,
            SnareArticulationResolver.resolve(0.96f, 0.21f, 0.8f),
        )
    }

    @Test
    fun lowerStickBandSelectsCrossStick() {
        assertEquals(
            SnareArticulation.CROSS_STICK,
            SnareArticulationResolver.resolve(0.5f, 0.55f, 0.7f),
        )
    }

    @Test
    fun softHoopStrikeSelectsCrossStick() {
        assertEquals(
            SnareArticulation.CROSS_STICK,
            SnareArticulationResolver.resolve(0.96f, 0.21f, 0.3f),
        )
    }

    @Test
    fun deviceCoordinatesAreClampedBeforeSelection() {
        assertEquals(
            SnareArticulation.RIMSHOT,
            SnareArticulationResolver.resolve(2.0f, 0.21f, 4.0f),
        )
    }
}
