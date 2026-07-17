package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class InstrumentGeometryTest {
    private val landscapeAspectRatio = StudioKitCamera.REFERENCE_VIEWPORT_ASPECT_RATIO

    @Test
    fun playableCentersRoundTripThroughRenderedRotation() {
        for (definition in StudioKitDefinition.instruments) {
            val screenPoint = StudioKitGeometry.screenPoint(
                layout = definition.layout,
                normalizedX = 0.5f,
                normalizedY = 0.5f,
                aspectRatio = landscapeAspectRatio,
            )
            val hit = StudioKitGeometry.hitTest(
                screenX = screenPoint.x,
                screenY = screenPoint.y,
                aspectRatio = landscapeAspectRatio,
            )

            assertEquals(definition.id, hit?.definition?.id)
            assertEquals(0.5f, hit?.normalizedX ?: Float.NaN, 0.00001f)
            assertEquals(0.5f, hit?.normalizedY ?: Float.NaN, 0.00001f)
        }
    }

    @Test
    fun rotatedRidePointRoundTripsToPlayableCoordinates() {
        val ride = definition(InstrumentId.RIDE)
        val expectedX = 0.78f
        val expectedY = 0.36f
        val screenPoint = StudioKitGeometry.screenPoint(
            layout = ride.layout,
            normalizedX = expectedX,
            normalizedY = expectedY,
            aspectRatio = landscapeAspectRatio,
        )
        val hit = StudioKitGeometry.hitTest(
            screenX = screenPoint.x,
            screenY = screenPoint.y,
            aspectRatio = landscapeAspectRatio,
        )

        assertEquals(InstrumentId.RIDE, hit?.definition?.id)
        assertEquals(expectedX, hit?.normalizedX ?: Float.NaN, 0.00001f)
        assertEquals(expectedY, hit?.normalizedY ?: Float.NaN, 0.00001f)
    }

    @Test
    fun rotatedTransparentCornerIsNotPlayable() {
        val crash = definition(InstrumentId.CRASH)
        val corner = StudioKitGeometry.screenPoint(
            layout = crash.layout,
            normalizedX = 0.99f,
            normalizedY = 0.99f,
            aspectRatio = landscapeAspectRatio,
        )

        assertFalse(
            StudioKitGeometry.contains(
                layout = crash.layout,
                screenX = corner.x,
                screenY = corner.y,
                aspectRatio = landscapeAspectRatio,
            ),
        )
    }

    @Test
    fun circleRadiusStaysCircularInPhysicalLandscapeSpace() {
        val layout = InstrumentLayout(
            instrumentId = InstrumentId.KICK,
            drawBounds = NormalizedRect(0.3f, 0.3f, 0.7f, 0.7f),
            hitRegion = CircleHitRegion(NormalizedPoint(0.5f, 0.5f), 0.1f),
            renderZIndex = 0,
            hitTestPriority = 0,
            rotationDegrees = 0f,
            labelPosition = NormalizedPoint(0.5f, 0.8f),
            rendererKey = InstrumentRendererKey.KICK,
        )

        assertTrue(
            StudioKitGeometry.contains(
                layout = layout,
                screenX = 0.5f + 0.09f / landscapeAspectRatio,
                screenY = 0.5f,
                aspectRatio = landscapeAspectRatio,
            ),
        )
        assertFalse(
            StudioKitGeometry.contains(
                layout = layout,
                screenX = 0.59f,
                screenY = 0.5f,
                aspectRatio = landscapeAspectRatio,
            ),
        )
    }

    @Test
    fun snareVisualCenterIsAcousticCenter() {
        val snare = definition(InstrumentId.SNARE)
        val screenPoint = StudioKitGeometry.screenPoint(
            layout = snare.layout,
            normalizedX = 0.5f,
            normalizedY = 0.5f,
            aspectRatio = landscapeAspectRatio,
        )
        val hit = StudioKitGeometry.hitTest(screenPoint.x, screenPoint.y, landscapeAspectRatio)

        assertEquals(InstrumentId.SNARE, hit?.definition?.id)
        assertEquals(0.5f, hit?.normalizedX ?: Float.NaN, 0.00001f)
        assertEquals(0.5f, hit?.normalizedY ?: Float.NaN, 0.00001f)
    }

    private fun definition(id: InstrumentId): InstrumentDefinition =
        StudioKitDefinition.instruments.first { it.id == id }
}
