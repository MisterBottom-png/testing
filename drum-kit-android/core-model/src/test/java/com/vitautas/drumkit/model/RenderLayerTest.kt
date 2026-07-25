package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RenderLayerTest {
    @Test
    fun everyInstrumentHasOneSupportAndOneSurfaceLayer() {
        assertEquals(StudioKitDefinition.instruments.size * 2, StudioKitDefinition.renderLayers.size)
        for (instrument in InstrumentId.entries) {
            assertEquals(1, count(instrument, InstrumentRenderLayerKind.SUPPORT))
            assertEquals(1, count(instrument, InstrumentRenderLayerKind.SURFACE))
        }
    }

    @Test
    fun supportHardwareRendersBehindItsOwnSurface() {
        for (instrument in InstrumentId.entries) {
            assertTrue(index(instrument, InstrumentRenderLayerKind.SUPPORT) < index(instrument, InstrumentRenderLayerKind.SURFACE))
        }
    }

    @Test
    fun rackTomMountsStayBehindKickWhileRackTomSurfacesStayInFront() {
        val kick = index(InstrumentId.KICK, InstrumentRenderLayerKind.SURFACE)
        assertTrue(index(InstrumentId.TOM_HIGH, InstrumentRenderLayerKind.SUPPORT) < kick)
        assertTrue(index(InstrumentId.TOM_MID, InstrumentRenderLayerKind.SUPPORT) < kick)
        assertTrue(kick < index(InstrumentId.TOM_HIGH, InstrumentRenderLayerKind.SURFACE))
        assertTrue(kick < index(InstrumentId.TOM_MID, InstrumentRenderLayerKind.SURFACE))
    }

    @Test
    fun foregroundSupportsAreNotFlattenedBehindBackgroundDrums() {
        val kick = index(InstrumentId.KICK, InstrumentRenderLayerKind.SURFACE)
        val rackTom = index(InstrumentId.TOM_MID, InstrumentRenderLayerKind.SURFACE)
        assertTrue(kick < index(InstrumentId.FLOOR_TOM, InstrumentRenderLayerKind.SUPPORT))
        assertTrue(kick < index(InstrumentId.HI_HAT, InstrumentRenderLayerKind.SUPPORT))
        assertTrue(kick < index(InstrumentId.SNARE, InstrumentRenderLayerKind.SUPPORT))
        assertTrue(rackTom < index(InstrumentId.SNARE, InstrumentRenderLayerKind.SUPPORT))
    }

    private fun count(id: InstrumentId, kind: InstrumentRenderLayerKind): Int =
        StudioKitDefinition.renderLayers.count { it.instrumentId == id && it.kind == kind }

    private fun index(id: InstrumentId, kind: InstrumentRenderLayerKind): Int =
        StudioKitDefinition.renderLayers.indexOfFirst { it.instrumentId == id && it.kind == kind }
}
