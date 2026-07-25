package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Test

class SnareArticulationResolverTest {
    @Test
    fun centerOfPlayableHeadSelectsCenter() {
        assertEquals(
            SnareArticulation.CENTER,
            SnareArticulationResolver.resolve(0.5f, 0.5f, 0.7f),
        )
    }

    @Test
    fun middleRadiusSelectsOffCenter() {
        assertEquals(
            SnareArticulation.OFF_CENTER,
            SnareArticulationResolver.resolve(0.70f, 0.5f, 0.7f),
        )
    }

    @Test
    fun outerHeadSelectsEdge() {
        assertEquals(
            SnareArticulation.EDGE,
            SnareArticulationResolver.resolve(0.86f, 0.5f, 0.7f),
        )
    }

    @Test
    fun hardHoopStrikeSelectsRimshot() {
        assertEquals(
            SnareArticulation.RIMSHOT,
            SnareArticulationResolver.resolve(0.96f, 0.5f, 0.8f),
        )
    }

    @Test
    fun lowerHeadStrikeDoesNotAccidentallySelectCrossStick() {
        assertEquals(
            SnareArticulation.OFF_CENTER,
            SnareArticulationResolver.resolve(0.5f, 0.82f, 0.7f),
        )
    }

    @Test
    fun softHoopStrikeSelectsEdgeRatherThanCrossStick() {
        assertEquals(
            SnareArticulation.EDGE,
            SnareArticulationResolver.resolve(0.96f, 0.5f, 0.3f),
        )
    }

    @Test
    fun deviceCoordinatesAreClampedBeforeSelection() {
        assertEquals(
            SnareArticulation.RIMSHOT,
            SnareArticulationResolver.resolve(2.0f, 0.5f, 4.0f),
        )
    }

    @Test
    fun nonFiniteInputFallsBackToCenterSafely() {
        assertEquals(
            SnareArticulation.CENTER,
            SnareArticulationResolver.resolve(Float.NaN, Float.POSITIVE_INFINITY, Float.NaN),
        )
    }
}
