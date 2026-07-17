package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HitRegionTest {
    private val landscapeAspectRatio = StudioKitCamera.REFERENCE_VIEWPORT_ASPECT_RATIO

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
    fun topControlSafeAreaDoesNotTriggerCymbals() {
        assertNull(
            StudioKitDefinition.hitTest(
                0.08f,
                StudioKitDefinition.CONTROL_SAFE_AREA_BOTTOM - 0.01f,
                landscapeAspectRatio,
            ),
        )
        assertNull(
            StudioKitDefinition.hitTest(
                0.88f,
                StudioKitDefinition.CONTROL_SAFE_AREA_BOTTOM - 0.01f,
                landscapeAspectRatio,
            ),
        )
    }

    @Test
    fun representativeRenderedHeadCentersResolveToExpectedInstruments() {
        val expectedHits = listOf(
            Triple(0.175f, 0.1815f, InstrumentId.CRASH),
            Triple(0.83f, 0.1912f, InstrumentId.RIDE),
            Triple(0.15f, 0.4252f, InstrumentId.HI_HAT),
            Triple(0.415f, 0.2699f, InstrumentId.TOM_HIGH),
            Triple(0.585f, 0.2657f, InstrumentId.TOM_MID),
            Triple(0.315f, 0.5792f, InstrumentId.SNARE),
            Triple(0.54f, 0.6852f, InstrumentId.KICK),
            Triple(0.82f, 0.5504f, InstrumentId.FLOOR_TOM),
        )

        for ((x, y, expected) in expectedHits) {
            assertEquals(expected, StudioKitDefinition.hitTest(x, y, landscapeAspectRatio)?.id)
        }
    }

    @Test
    fun rackTomsFlankKickAndPlayerSidePiecesRemainReachable() {
        val highTom = definition(InstrumentId.TOM_HIGH).layout.drawBounds
        val midTom = definition(InstrumentId.TOM_MID).layout.drawBounds
        val kick = definition(InstrumentId.KICK).layout.drawBounds
        val snare = definition(InstrumentId.SNARE).layout.drawBounds
        val hiHat = definition(InstrumentId.HI_HAT).layout.drawBounds
        val floorTom = definition(InstrumentId.FLOOR_TOM).layout.drawBounds

        assertTrue(highTom.centerX < kick.centerX)
        assertTrue(midTom.centerX > kick.centerX)
        assertEquals(kick.centerX - highTom.centerX, midTom.centerX - kick.centerX, 0.001f)
        assertTrue(snare.centerY > highTom.centerY)
        assertTrue(hiHat.centerX < snare.centerX)
        assertTrue(floorTom.centerX > kick.centerX)
        assertTrue(floorTom.width > highTom.width)
        assertTrue(floorTom.width > midTom.width)
    }

    @Test
    fun snareUsesEntireRenderedHeadInsteadOfDetachedInset() {
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(0.195f, 0.579f, landscapeAspectRatio)?.id)
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(0.435f, 0.579f, landscapeAspectRatio)?.id)
        assertNull(StudioKitDefinition.hitTest(0.315f, 0.69f, landscapeAspectRatio))
    }

    @Test
    fun snareWinsIntentionalKickOverlap() {
        val x = 0.42f
        val y = 0.57f

        assertEquals(2, StudioKitDefinition.matchingInstrumentCount(x, y, landscapeAspectRatio))
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(x, y, landscapeAspectRatio)?.id)
    }

    private fun definition(id: InstrumentId): InstrumentDefinition =
        StudioKitDefinition.instruments.first { it.id == id }
}
