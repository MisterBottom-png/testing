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
            Triple(0.605f, 0.2657f, InstrumentId.TOM_MID),
            Triple(0.315f, 0.5792f, InstrumentId.SNARE),
            Triple(0.51f, 0.6852f, InstrumentId.KICK),
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
    fun renderDepthMatchesElevatedDrummerView() {
        val renderOrder = StudioKitDefinition.renderOrder.map { it.id }

        assertTrue(renderOrder.indexOf(InstrumentId.CRASH) < renderOrder.indexOf(InstrumentId.KICK))
        assertTrue(renderOrder.indexOf(InstrumentId.RIDE) < renderOrder.indexOf(InstrumentId.KICK))
        assertTrue(renderOrder.indexOf(InstrumentId.KICK) < renderOrder.indexOf(InstrumentId.TOM_HIGH))
        assertTrue(renderOrder.indexOf(InstrumentId.KICK) < renderOrder.indexOf(InstrumentId.TOM_MID))
        assertTrue(renderOrder.indexOf(InstrumentId.TOM_HIGH) < renderOrder.indexOf(InstrumentId.SNARE))
        assertTrue(renderOrder.indexOf(InstrumentId.TOM_MID) < renderOrder.indexOf(InstrumentId.SNARE))
        assertTrue(renderOrder.indexOf(InstrumentId.KICK) < renderOrder.indexOf(InstrumentId.FLOOR_TOM))
        assertTrue(renderOrder.indexOf(InstrumentId.KICK) < renderOrder.indexOf(InstrumentId.SNARE))
    }

    @Test
    fun floorSupportedHardwareUsesOneSharedPlane() {
        val floorSupported = listOf(
            InstrumentId.CRASH,
            InstrumentId.RIDE,
            InstrumentId.HI_HAT,
            InstrumentId.KICK,
            InstrumentId.FLOOR_TOM,
            InstrumentId.SNARE,
        )

        for (instrument in floorSupported) {
            assertEquals(
                StudioKitCamera.FLOOR_PLANE_Y,
                definition(instrument).layout.supportFloorY ?: Float.NaN,
                0.00001f,
            )
        }
        assertNull(definition(InstrumentId.TOM_HIGH).layout.supportFloorY)
        assertNull(definition(InstrumentId.TOM_MID).layout.supportFloorY)
        assertTrue(StudioKitCamera.FLOOR_PLANE_Y > StudioKitCamera.HORIZON_Y)
        assertEquals(
            definition(InstrumentId.KICK).layout.drawBounds.bottom,
            StudioKitCamera.FLOOR_PLANE_Y,
            0.00001f,
        )
    }

    @Test
    fun visualSurfaceBoundsAndHitRegionsAreIndependent() {
        for (definition in StudioKitDefinition.instruments) {
            val surface = definition.layout.playableSurfaceBounds
            val hit = StudioKitGeometry.playableBounds(definition.layout, landscapeAspectRatio)

            assertTrue(hit.left > surface.left)
            assertTrue(hit.top > surface.top)
            assertTrue(hit.right < surface.right)
            assertTrue(hit.bottom < surface.bottom)
        }
    }

    @Test
    fun tunedStudioKitHitRegionsDoNotOverlapAtReferenceViewport() {
        for (yIndex in 0..140) {
            val y = yIndex / 140f
            for (xIndex in 0..280) {
                val x = xIndex / 280f
                assertTrue(
                    "overlapping targets at ($x, $y)",
                    StudioKitDefinition.matchingInstrumentCount(x, y, landscapeAspectRatio) <= 1,
                )
            }
        }
    }

    @Test
    fun formerKickSnareOverlapResolvesToOneVisibleTarget() {
        val snareX = 0.42f
        val snareY = 0.57f

        assertEquals(1, StudioKitDefinition.matchingInstrumentCount(snareX, snareY, landscapeAspectRatio))
        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(snareX, snareY, landscapeAspectRatio)?.id)
        assertEquals(InstrumentId.KICK, StudioKitDefinition.hitTest(0.51f, 0.685f, landscapeAspectRatio)?.id)
    }

    private fun definition(id: InstrumentId): InstrumentDefinition =
        StudioKitDefinition.instruments.first { it.id == id }
}
