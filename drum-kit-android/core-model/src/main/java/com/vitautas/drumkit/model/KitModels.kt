package com.vitautas.drumkit.model

import kotlin.math.abs

private const val MinimumPolygonPoints = 3
private const val GeometryEpsilon = 0.000001f

enum class InstrumentId(val nativeCode: Int, val label: String) {
    KICK(0, "Kick"),
    SNARE(1, "Snare"),
    TOM_HIGH(2, "High Tom"),
    TOM_MID(3, "Mid Tom"),
    FLOOR_TOM(4, "Floor Tom"),
    HI_HAT(5, "Hi-Hat"),
    CRASH(6, "Crash"),
    RIDE(7, "Ride"),
}

enum class InstrumentRendererKey {
    DRUM,
    SNARE,
    KICK,
    CYMBAL,
    HI_HAT,
}

data class NormalizedPoint(
    val x: Float,
    val y: Float,
) {
    init {
        require(x in 0f..1f) { "x must be normalized" }
        require(y in 0f..1f) { "y must be normalized" }
    }
}

data class NormalizedRect(
    val left: Float,
    val top: Float,
    val right: Float,
    val bottom: Float,
) {
    init {
        require(left in 0f..1f && right in 0f..1f) { "horizontal bounds must be normalized" }
        require(top in 0f..1f && bottom in 0f..1f) { "vertical bounds must be normalized" }
        require(left < right && top < bottom) { "bounds must have positive size" }
    }

    val width: Float
        get() = right - left

    val height: Float
        get() = bottom - top

    val centerX: Float
        get() = (left + right) * 0.5f

    val centerY: Float
        get() = (top + bottom) * 0.5f

    fun contains(x: Float, y: Float): Boolean = x in left..right && y in top..bottom
}

sealed interface HitRegion {
    fun contains(x: Float, y: Float): Boolean
}

data class RectangleHitRegion(
    val bounds: NormalizedRect,
) : HitRegion {
    override fun contains(x: Float, y: Float): Boolean = bounds.contains(x, y)
}

data class EllipseHitRegion(
    val bounds: NormalizedRect,
) : HitRegion {
    override fun contains(x: Float, y: Float): Boolean {
        val radiusX = bounds.width * 0.5f
        val radiusY = bounds.height * 0.5f
        val normalizedX = (x - bounds.centerX) / radiusX
        val normalizedY = (y - bounds.centerY) / radiusY
        return normalizedX * normalizedX + normalizedY * normalizedY <= 1f
    }
}

data class CircleHitRegion(
    val center: NormalizedPoint,
    val radius: Float,
) : HitRegion {
    init {
        require(radius > 0f && radius <= 1f) { "radius must be within the normalized coordinate space" }
    }

    override fun contains(x: Float, y: Float): Boolean {
        val dx = x - center.x
        val dy = y - center.y
        return dx * dx + dy * dy <= radius * radius
    }
}

data class PolygonHitRegion(
    val points: List<NormalizedPoint>,
) : HitRegion {
    init {
        require(points.size >= MinimumPolygonPoints) { "polygon requires at least three points" }
    }

    override fun contains(x: Float, y: Float): Boolean {
        var inside = false
        var previousIndex = points.lastIndex

        for (currentIndex in points.indices) {
            val current = points[currentIndex]
            val previous = points[previousIndex]
            if (pointOnSegment(x, y, previous, current)) return true

            val crossesScanline = (current.y > y) != (previous.y > y)
            if (crossesScanline) {
                val intersectionX = (previous.x - current.x) * (y - current.y) /
                    (previous.y - current.y) + current.x
                if (x < intersectionX) inside = !inside
            }
            previousIndex = currentIndex
        }
        return inside
    }

    private fun pointOnSegment(
        x: Float,
        y: Float,
        start: NormalizedPoint,
        end: NormalizedPoint,
    ): Boolean {
        val cross = (x - start.x) * (end.y - start.y) - (y - start.y) * (end.x - start.x)
        if (abs(cross) > GeometryEpsilon) return false

        val dot = (x - start.x) * (end.x - start.x) + (y - start.y) * (end.y - start.y)
        if (dot < 0f) return false

        val squaredLength = (end.x - start.x) * (end.x - start.x) +
            (end.y - start.y) * (end.y - start.y)
        return dot <= squaredLength
    }
}

data class InstrumentLayout(
    val instrumentId: InstrumentId,
    val drawBounds: NormalizedRect,
    val hitRegion: HitRegion,
    val renderZIndex: Int,
    val hitTestPriority: Int,
    val rotationDegrees: Float,
    val labelPosition: NormalizedPoint,
    val rendererKey: InstrumentRendererKey,
) {
    init {
        require(rotationDegrees.isFinite()) { "rotation must be finite" }
    }
}

data class InstrumentDefinition(
    val layout: InstrumentLayout,
    val pan: Float,
) {
    val id: InstrumentId
        get() = layout.instrumentId

    init {
        require(pan in -1f..1f) { "pan must be within the stereo field" }
    }
}

object StudioKitDefinition {
    val instruments: List<InstrumentDefinition> = listOf(
        instrument(
            id = InstrumentId.CRASH,
            drawBounds = NormalizedRect(0.03f, 0.03f, 0.30f, 0.30f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.055f, 0.085f, 0.275f, 0.235f)),
            renderZIndex = 10,
            hitTestPriority = 50,
            rotationDegrees = -7f,
            labelPosition = NormalizedPoint(0.165f, 0.31f),
            rendererKey = InstrumentRendererKey.CYMBAL,
            pan = -0.55f,
        ),
        instrument(
            id = InstrumentId.RIDE,
            drawBounds = NormalizedRect(0.70f, 0.04f, 0.97f, 0.31f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.725f, 0.095f, 0.945f, 0.245f)),
            renderZIndex = 10,
            hitTestPriority = 50,
            rotationDegrees = 6f,
            labelPosition = NormalizedPoint(0.835f, 0.32f),
            rendererKey = InstrumentRendererKey.CYMBAL,
            pan = 0.55f,
        ),
        instrument(
            id = InstrumentId.HI_HAT,
            drawBounds = NormalizedRect(0.02f, 0.31f, 0.25f, 0.58f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.04f, 0.36f, 0.23f, 0.50f)),
            renderZIndex = 45,
            hitTestPriority = 60,
            rotationDegrees = -4f,
            labelPosition = NormalizedPoint(0.135f, 0.60f),
            rendererKey = InstrumentRendererKey.HI_HAT,
            pan = -0.65f,
        ),
        instrument(
            id = InstrumentId.TOM_HIGH,
            drawBounds = NormalizedRect(0.26f, 0.18f, 0.49f, 0.49f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.275f, 0.18f, 0.475f, 0.34f)),
            renderZIndex = 30,
            hitTestPriority = 80,
            rotationDegrees = -4f,
            labelPosition = NormalizedPoint(0.375f, 0.50f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = -0.22f,
        ),
        instrument(
            id = InstrumentId.TOM_MID,
            drawBounds = NormalizedRect(0.48f, 0.17f, 0.72f, 0.49f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.495f, 0.17f, 0.705f, 0.305f)),
            renderZIndex = 30,
            hitTestPriority = 80,
            rotationDegrees = 3f,
            labelPosition = NormalizedPoint(0.60f, 0.50f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = 0.14f,
        ),
        instrument(
            id = InstrumentId.KICK,
            drawBounds = NormalizedRect(0.37f, 0.43f, 0.72f, 0.94f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.405f, 0.50f, 0.685f, 0.86f)),
            renderZIndex = 35,
            hitTestPriority = 70,
            rotationDegrees = 0f,
            labelPosition = NormalizedPoint(0.545f, 0.96f),
            rendererKey = InstrumentRendererKey.KICK,
            pan = 0f,
        ),
        instrument(
            id = InstrumentId.FLOOR_TOM,
            drawBounds = NormalizedRect(0.70f, 0.46f, 0.97f, 0.84f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.72f, 0.46f, 0.95f, 0.63f)),
            renderZIndex = 40,
            hitTestPriority = 90,
            rotationDegrees = 4f,
            labelPosition = NormalizedPoint(0.835f, 0.86f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = 0.46f,
        ),
        instrument(
            id = InstrumentId.SNARE,
            drawBounds = NormalizedRect(0.18f, 0.47f, 0.48f, 0.82f),
            hitRegion = EllipseHitRegion(NormalizedRect(0.20f, 0.47f, 0.46f, 0.63f)),
            renderZIndex = 50,
            hitTestPriority = 100,
            rotationDegrees = -3f,
            labelPosition = NormalizedPoint(0.33f, 0.84f),
            rendererKey = InstrumentRendererKey.SNARE,
            pan = -0.18f,
        ),
    )

    val renderOrder: List<InstrumentDefinition> = instruments.sortedBy { it.layout.renderZIndex }

    val hitTestOrder: List<InstrumentDefinition> = instruments.sortedWith(
        compareByDescending<InstrumentDefinition> { it.layout.hitTestPriority }
            .thenByDescending { it.layout.renderZIndex },
    )

    private fun instrument(
        id: InstrumentId,
        drawBounds: NormalizedRect,
        hitRegion: HitRegion,
        renderZIndex: Int,
        hitTestPriority: Int,
        rotationDegrees: Float,
        labelPosition: NormalizedPoint,
        rendererKey: InstrumentRendererKey,
        pan: Float,
    ): InstrumentDefinition = InstrumentDefinition(
        layout = InstrumentLayout(
            instrumentId = id,
            drawBounds = drawBounds,
            hitRegion = hitRegion,
            renderZIndex = renderZIndex,
            hitTestPriority = hitTestPriority,
            rotationDegrees = rotationDegrees,
            labelPosition = labelPosition,
            rendererKey = rendererKey,
        ),
        pan = pan,
    )
}

data class DrumStrike(
    val pointerId: Int,
    val instrument: InstrumentId,
    val velocity: Float,
    val normalizedX: Float,
    val normalizedY: Float,
    val pressure: Float,
    val contactSize: Float,
    val eventTimeNanos: Long,
)

data class AudioDiagnostics(
    val running: Boolean = false,
    val sampleRate: Int = 0,
    val framesPerBurst: Int = 0,
    val underruns: Int = 0,
)
