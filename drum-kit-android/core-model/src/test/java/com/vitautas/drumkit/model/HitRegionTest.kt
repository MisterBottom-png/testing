package com.vitautas.drumkit.model

import org.junit.Assert.assertFalse
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
}
