package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HitRegionTest {
    private val landscapeAspectRatio = 1536f / 707f

    @Test
    fun ellipseRejectsTransparentCorners() {
        val region = EllipseHitRegion(NormalizedRect(0.2f, 0.2f, 0.8f, 0.6f))

        assertTrue(region.contains(0.5f, 0.4f))
        assertFalse(region.contains(0.21f, 0.21f))
    }

    @Test
    fun rotatedEllipseUsesViewportAspectRatio() {
        val region = EllipseHitRegion(
            bounds = NormalizedRect(0.2f, 0.3f, 0.8f, 0.5f),
            rotationDegrees = 20f,
            rotationCenter = NormalizedPoint(0.5f, 0.4f),
        )

        assertTrue(region.contains(0.5f, 0.4f, landscapeAspectRatio))
        assertTrue(region.contains(0.60f, 0.44f, landscapeAspectRatio))
        assertFalse(region.contains(0.78f, 0.30f, landscapeAspectRatio))
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
        assertNull(StudioKitDefinition.hitTest(0.08f, 0.08f, landscapeAspectRatio))
        assertNull(StudioKitDefinition.hitTest(0.88f, 0.08f, landscapeAspectRatio))
    }

    @Test
    fun representativeRenderedHeadCentersResolveToExpectedInstruments() {
        val expectedHits = listOf(
            Triple(0.165f, 0.2215f, InstrumentId.CRASH),
            Triple(0.835f, 0.2215f, InstrumentId.RIDE),
            Triple(0.135f, 0.4315f, InstrumentId.HI_HAT),
            Triple(0.375f, 0.2451f, InstrumentId.TOM_HIGH),
            Triple(0.60f, 0.2372f, InstrumentId.TOM_MID),
            Triple(0.33f, 0.5435f, InstrumentId.SNARE),
            Triple(0.545f, 0.6901f, InstrumentId.KICK),
            Triple(0.835f, 0.5398f, InstrumentId.FLOOR_TOM),
        )

        for ((x, y, expected) in expectedHits) {
            assertEquals(expected, StudioKitDefinition.hitTest(x, y, landscapeAspectRatio)?.id)
        }
    }

    @Test
    fun snareUsesEntireRenderedHeadInsteadOfDetachedInset() {
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(0.205f, 0.545f, landscapeAspectRatio)?.id)
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(0.455f, 0.545f, landscapeAspectRatio)?.id)
        assertNull(StudioKitDefinition.hitTest(0.33f, 0.65f, landscapeAspectRatio))
    }

    @Test
    fun snareWinsIntentionalKickOverlap() {
        val x = 0.44f
        val y = 0.56f

        assertEquals(2, StudioKitDefinition.matchingInstrumentCount(x, y, landscapeAspectRatio))
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(x, y, landscapeAspectRatio)?.id)
    }
}
