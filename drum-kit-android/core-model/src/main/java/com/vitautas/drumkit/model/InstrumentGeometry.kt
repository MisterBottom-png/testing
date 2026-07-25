package com.vitautas.drumkit.model

import kotlin.math.cos
import kotlin.math.sin

/**
 * Viewport-aware geometry shared by touch handling, diagnostics, and rendering.
 *
 * Instrument rotation is applied in physical screen space around the draw-bounds
 * center. Strike coordinates are normalized within the playable region rather
 * than the larger artwork bounds.
 */
data class InstrumentHit(
    val definition: InstrumentDefinition,
    val normalizedX: Float,
    val normalizedY: Float,
)

data class GeometryPoint(
    val x: Float,
    val y: Float,
) {
    init {
        require(x.isFinite() && y.isFinite()) { "geometry point must be finite" }
    }
}

data class GeometryBounds(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    init {
        require(left.isFinite() && top.isFinite() && right.isFinite() && bottom.isFinite()) {
            "geometry bounds must be finite"
        }
        require(left < right && top < bottom) { "geometry bounds must have positive size" }
    }

    val width: Float
        get() = right - left

    val height: Float
        get() = bottom - top

    val centerX: Float
        get() = (left + right) * 0.5f

    val centerY: Float
        get() = (top + bottom) * 0.5f
}

object StudioKitGeometry {
    fun hitTest(
        screenX: Float,
        screenY: Float,
        aspectRatio: Float,
    ): InstrumentHit? {
        validateInput(screenX, screenY, aspectRatio)
        for (definition in StudioKitDefinition.hitTestOrder) {
            val hit = hitTest(definition, screenX, screenY, aspectRatio)
            if (hit != null) return hit
        }
        return null
    }

    fun matchingInstrumentCount(
        screenX: Float,
        screenY: Float,
        aspectRatio: Float,
    ): Int {
        validateInput(screenX, screenY, aspectRatio)
        var count = 0
        for (definition in StudioKitDefinition.instruments) {
            if (contains(definition.layout, screenX, screenY, aspectRatio)) count += 1
        }
        return count
    }

    fun contains(
        layout: InstrumentLayout,
        screenX: Float,
        screenY: Float,
        aspectRatio: Float,
    ): Boolean {
        validateInput(screenX, screenY, aspectRatio)
        val unrotated = rotateScreenPoint(
            x = screenX,
            y = screenY,
            centerX = layout.drawBounds.centerX,
            centerY = layout.drawBounds.centerY,
            degrees = -layout.rotationDegrees,
            aspectRatio = aspectRatio,
        )
        return containsUnrotated(layout.hitRegion, unrotated.x, unrotated.y, aspectRatio)
    }

    fun playableBounds(layout: InstrumentLayout, aspectRatio: Float): GeometryBounds {
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }
        return layout.playableSurfaceBounds.toGeometryBounds()
    }

    fun hitBounds(layout: InstrumentLayout, aspectRatio: Float): GeometryBounds {
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }
        return boundsFor(layout.hitRegion, aspectRatio)
    }

    fun screenPoint(
        layout: InstrumentLayout,
        normalizedX: Float,
        normalizedY: Float,
        aspectRatio: Float,
    ): GeometryPoint {
        require(normalizedX.isFinite() && normalizedX in 0f..1f) { "normalized x must be within 0..1" }
        require(normalizedY.isFinite() && normalizedY in 0f..1f) { "normalized y must be within 0..1" }
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }

        val bounds = layout.playableSurfaceBounds.toGeometryBounds()
        val unrotatedX = bounds.left + normalizedX * bounds.width
        val unrotatedY = bounds.top + normalizedY * bounds.height
        return rotateScreenPoint(
            x = unrotatedX,
            y = unrotatedY,
            centerX = layout.drawBounds.centerX,
            centerY = layout.drawBounds.centerY,
            degrees = layout.rotationDegrees,
            aspectRatio = aspectRatio,
        )
    }

    private fun hitTest(
        definition: InstrumentDefinition,
        screenX: Float,
        screenY: Float,
        aspectRatio: Float,
    ): InstrumentHit? {
        val layout = definition.layout
        val unrotated = rotateScreenPoint(
            x = screenX,
            y = screenY,
            centerX = layout.drawBounds.centerX,
            centerY = layout.drawBounds.centerY,
            degrees = -layout.rotationDegrees,
            aspectRatio = aspectRatio,
        )
        if (!containsUnrotated(layout.hitRegion, unrotated.x, unrotated.y, aspectRatio)) return null

        val bounds = layout.playableSurfaceBounds.toGeometryBounds()
        return InstrumentHit(
            definition = definition,
            normalizedX = ((unrotated.x - bounds.left) / bounds.width).coerceIn(0f, 1f),
            normalizedY = ((unrotated.y - bounds.top) / bounds.height).coerceIn(0f, 1f),
        )
    }

    private fun containsUnrotated(
        region: HitRegion,
        x: Float,
        y: Float,
        aspectRatio: Float,
    ): Boolean = when (region) {
        is RectangleHitRegion -> region.bounds.contains(x, y)
        is EllipseHitRegion -> {
            val radiusX = region.bounds.width * 0.5f
            val radiusY = region.bounds.height * 0.5f
            val localX = (x - region.bounds.centerX) / radiusX
            val localY = (y - region.bounds.centerY) / radiusY
            localX * localX + localY * localY <= 1f
        }
        is CircleHitRegion -> {
            val dx = (x - region.center.x) * aspectRatio
            val dy = y - region.center.y
            dx * dx + dy * dy <= region.radius * region.radius
        }
        is PolygonHitRegion -> region.contains(x, y)
    }

    private fun boundsFor(region: HitRegion, aspectRatio: Float): GeometryBounds = when (region) {
        is RectangleHitRegion -> region.bounds.toGeometryBounds()
        is EllipseHitRegion -> region.bounds.toGeometryBounds()
        is CircleHitRegion -> {
            val radiusX = region.radius / aspectRatio
            GeometryBounds(
                left = region.center.x - radiusX,
                top = region.center.y - region.radius,
                right = region.center.x + radiusX,
                bottom = region.center.y + region.radius,
            )
        }
        is PolygonHitRegion -> {
            var left = Float.POSITIVE_INFINITY
            var top = Float.POSITIVE_INFINITY
            var right = Float.NEGATIVE_INFINITY
            var bottom = Float.NEGATIVE_INFINITY
            for (point in region.points) {
                left = minOf(left, point.x)
                top = minOf(top, point.y)
                right = maxOf(right, point.x)
                bottom = maxOf(bottom, point.y)
            }
            GeometryBounds(left, top, right, bottom)
        }
    }

    private fun rotateScreenPoint(
        x: Float,
        y: Float,
        centerX: Float,
        centerY: Float,
        degrees: Float,
        aspectRatio: Float,
    ): GeometryPoint {
        if (degrees == 0f) return GeometryPoint(x, y)

        val scaledCenterX = centerX * aspectRatio
        val deltaX = x * aspectRatio - scaledCenterX
        val deltaY = y - centerY
        val radians = Math.toRadians(degrees.toDouble())
        val cosine = cos(radians).toFloat()
        val sine = sin(radians).toFloat()
        val rotatedX = deltaX * cosine - deltaY * sine + scaledCenterX
        val rotatedY = deltaX * sine + deltaY * cosine + centerY
        return GeometryPoint(rotatedX / aspectRatio, rotatedY)
    }

    private fun validateInput(screenX: Float, screenY: Float, aspectRatio: Float) {
        require(screenX.isFinite() && screenY.isFinite()) { "screen point must be finite" }
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }
    }

    private fun NormalizedRect.toGeometryBounds(): GeometryBounds = GeometryBounds(left, top, right, bottom)
}
