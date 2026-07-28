package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class KickPedalTest {
    private val landscapeAspectRatio = StudioKitCamera.REFERENCE_VIEWPORT_ASPECT_RATIO

    @Test
    fun pedalCenterResolvesToFixedKickImpact() {
        val hit = StudioKitInputGeometry.hitTest(0.51f, 0.88f, landscapeAspectRatio)

        assertEquals(InstrumentId.KICK, hit?.definition?.id)
        assertEquals(StrikeInputTarget.KICK_PEDAL, hit?.inputTarget)
        assertEquals(KickPedalDefinition.kickImpact.x, hit?.normalizedX ?: Float.NaN, 0.00001f)
        assertEquals(KickPedalDefinition.kickImpact.y, hit?.normalizedY ?: Float.NaN, 0.00001f)
    }

    @Test
    fun pedalHasPriorityOverUnderlyingKickSurface() {
        val x = 0.51f
        val y = 0.80f
        val candidates = StudioKitInputGeometry.candidates(x, y, landscapeAspectRatio)

        assertTrue(KickPedalDefinition.contains(x, y))
        assertEquals(StrikeInputTarget.KICK_PEDAL, candidates.first().inputTarget)
        assertEquals(InstrumentId.KICK, candidates.first().instrument)
        assertEquals(StrikeInputTarget.KICK_PEDAL, StudioKitInputGeometry.hitTest(x, y, landscapeAspectRatio)?.inputTarget)
    }

    @Test
    fun pedalTargetDoesNotConsumeSnareOrEmptyFloor() {
        val snareHit = StudioKitInputGeometry.hitTest(0.315f, 0.5792f, landscapeAspectRatio)

        assertEquals(InstrumentId.SNARE, snareHit?.definition?.id)
        assertEquals(StrikeInputTarget.INSTRUMENT_SURFACE, snareHit?.inputTarget)
        assertFalse(KickPedalDefinition.contains(0.315f, 0.5792f))
        assertNull(StudioKitInputGeometry.hitTest(0.72f, 0.97f, landscapeAspectRatio))
    }

    @Test
    fun visibleSnareRimResolvesToDedicatedRimTarget() {
        val snare = StudioKitDefinition.instruments.first { it.id == InstrumentId.SNARE }
        val point = StudioKitGeometry.screenPoint(
            layout = snare.layout,
            normalizedX = 0.96f,
            normalizedY = 0.5f,
            aspectRatio = landscapeAspectRatio,
        )

        val hit = StudioKitInputGeometry.hitTest(point.x, point.y, landscapeAspectRatio)

        assertEquals(InstrumentId.SNARE, hit?.definition?.id)
        assertEquals(StrikeInputTarget.SNARE_RIM, hit?.inputTarget)
    }

    @Test
    fun pedalTouchAreaExtendsBeyondRenderedFootboard() {
        val accessiblePointX = 0.41f
        val accessiblePointY = 0.90f

        assertTrue(KickPedalDefinition.contains(accessiblePointX, accessiblePointY))
        assertFalse(KickPedalDefinition.footboardBounds.contains(accessiblePointX, accessiblePointY))
    }
}
