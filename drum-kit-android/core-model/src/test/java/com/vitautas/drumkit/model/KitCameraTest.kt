package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class KitCameraTest {
    @Test
    fun cameraDefinesFixedElevatedDrummerView() {
        assertEquals(24f, StudioKitCamera.ELEVATION_DEGREES, 0f)
        assertEquals(0.68f, StudioKitCamera.HORIZON_Y, 0f)
        assertEquals(1536f / 707f, StudioKitCamera.REFERENCE_VIEWPORT_ASPECT_RATIO, 0f)
        assertTrue(StudioKitCamera.ELEVATION_DEGREES in 0f..90f)
        assertTrue(StudioKitCamera.HORIZON_Y in 0f..1f)
    }

    @Test
    fun projectedSurfaceHeightsPreserveSharedCompressionRatios() {
        val normalizedWidth = 0.24f
        val projectedMajorAxis = normalizedWidth * StudioKitCamera.REFERENCE_VIEWPORT_ASPECT_RATIO
        val drumHeight = StudioKitCamera.projectedDrumHeadHeight(normalizedWidth)
        val cymbalHeight = StudioKitCamera.projectedCymbalHeight(normalizedWidth)

        assertEquals(
            StudioKitCamera.DRUM_HEAD_ELLIPSE_COMPRESSION,
            drumHeight / projectedMajorAxis,
            0.000001f,
        )
        assertEquals(
            StudioKitCamera.CYMBAL_ELLIPSE_COMPRESSION,
            cymbalHeight / projectedMajorAxis,
            0.000001f,
        )
        assertTrue(cymbalHeight < drumHeight)
    }

    @Test(expected = IllegalArgumentException::class)
    fun projectedSurfaceHeightRejectsOutOfRangeWidth() {
        StudioKitCamera.projectedDrumHeadHeight(1.01f)
    }
}
