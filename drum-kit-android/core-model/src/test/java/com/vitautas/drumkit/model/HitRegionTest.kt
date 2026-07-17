package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HitRegionTest {
    @Test
    fun ellipseRejectsTransparentCorners() {
        val region = EllipseHitRegion(NormalizedRect(0.2f, 0.2f, 0.8f, 0.6f))

        assertTrue(region.contains(0.5f, 0.4f))
        assertFalse(region.contains(0.21f, 0.21f))
    }

    @Test
    fun circleUsesIndependentCenterAndRadius() {
        val region = CircleHitRegion(NormalizedPoint(0.5f, 0.5f), 0.2f)

        assertTrue(region.contains(0.6f, 0.5f))
        assertFalse(region.contains(0.8f, 0.5f))
    }

    @Test
    fun polygonIncludesInteriorAndBoundary() {
        val region = PolygonHitRegion(
            listOf(
                NormalizedPoint(0.2f, 0.2f),
                NormalizedPoint(0.8f, 0.2f),
                NormalizedPoint(0.5f, 0.8f),
            ),
        )

        assertTrue(region.contains(0.5f, 0.4f))
        assertTrue(region.contains(0.5f, 0.8f))
        assertFalse(region.contains(0.1f, 0.7f))
    }

    @Test
    fun hitPriorityIsIndependentFromRenderOrder() {
        val highTomRenderIndex = StudioKitDefinition.renderOrder.indexOfFirst { it.id == InstrumentId.TOM_HIGH }
        val hiHatRenderIndex = StudioKitDefinition.renderOrder.indexOfFirst { it.id == InstrumentId.HI_HAT }
        val highTomHitIndex = StudioKitDefinition.hitTestOrder.indexOfFirst { it.id == InstrumentId.TOM_HIGH }
        val hiHatHitIndex = StudioKitDefinition.hitTestOrder.indexOfFirst { it.id == InstrumentId.HI_HAT }

        assertTrue(highTomRenderIndex < hiHatRenderIndex)
        assertTrue(highTomHitIndex < hiHatHitIndex)
        assertTrue(
            StudioKitDefinition.instruments.first { it.id == InstrumentId.HI_HAT }.layout.renderZIndex >
                StudioKitDefinition.instruments.first { it.id == InstrumentId.TOM_HIGH }.layout.renderZIndex,
        )
        assertTrue(
            StudioKitDefinition.instruments.first { it.id == InstrumentId.HI_HAT }.layout.hitTestPriority <
                StudioKitDefinition.instruments.first { it.id == InstrumentId.TOM_HIGH }.layout.hitTestPriority,
        )
    }

    @Test
    fun topControlStripDoesNotTriggerCymbals() {
        assertNull(StudioKitDefinition.hitTest(0.08f, 0.08f))
        assertNull(StudioKitDefinition.hitTest(0.88f, 0.08f))
    }

    @Test
    fun representativeHeadCentersResolveToExpectedInstruments() {
        val expectedHits = listOf(
            Triple(0.165f, 0.215f, InstrumentId.CRASH),
            Triple(0.835f, 0.215f, InstrumentId.RIDE),
            Triple(0.135f, 0.43f, InstrumentId.HI_HAT),
            Triple(0.375f, 0.255f, InstrumentId.TOM_HIGH),
            Triple(0.60f, 0.245f, InstrumentId.TOM_MID),
            Triple(0.33f, 0.55f, InstrumentId.SNARE),
            Triple(0.545f, 0.68f, InstrumentId.KICK),
            Triple(0.835f, 0.545f, InstrumentId.FLOOR_TOM),
        )

        for ((x, y, expected) in expectedHits) {
            assertEquals(expected, StudioKitDefinition.hitTest(x, y)?.id)
        }
    }

    @Test
    fun snareWinsIntentionalKickOverlap() {
        val x = 0.447f
        val y = 0.575f

        assertEquals(2, StudioKitDefinition.matchingInstrumentCount(x, y))
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(x, y)?.id)
    }
}
