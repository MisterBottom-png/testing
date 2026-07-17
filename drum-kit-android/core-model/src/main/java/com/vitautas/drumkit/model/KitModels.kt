package com.vitautas.drumkit.model

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

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

    fun contains(x: Float, y: Float, aspectRatio: Float): Boolean = contains(x, y)
}

data class RectangleHitRegion(
    val bounds: NormalizedRect,
) : HitRegion {
    override fun contains(x: Float, y: Float): Boolean = bounds.contains(x, y)
}

data class EllipseHitRegion(
    val bounds: NormalizedRect,
    val rotationDegrees: Float = 0f,
    val rotationCenter: NormalizedPoint = NormalizedPoint(bounds.centerX, bounds.centerY),
) : HitRegion {
    init {
        require(rotationDegrees.isFinite()) { "rotation must be finite" }
    }

    override fun contains(x: Float, y: Float): Boolean = contains(x, y, 1f)

    override fun contains(x: Float, y: Float, aspectRatio: Float): Boolean {
        require(aspectRatio.isFinite() && aspectRatio > 0f) { "aspect ratio must be positive and finite" }

        val scaledCenterX = rotationCenter.x * aspectRatio
        val deltaX = x * aspectRatio - scaledCenterX
        val deltaY = y - rotationCenter.y
        val radians = Math.toRadians(-rotationDegrees.toDouble())
        val cosine = cos(radians).toFloat()
        val sine = sin(radians).toFloat()
        val localX = deltaX * cosine - deltaY * sine + scaledCenterX
        val localY = deltaX * sine + deltaY * cosine + rotationCenter.y

        val radiusX = bounds.width * aspectRatio * 0.5f
        val radiusY = bounds.height * 0.5f
        val normalizedX = (localX - bounds.centerX * aspectRatio) / radiusX
        val normalizedY = (localY - bounds.centerY) / radiusY
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
    const val CONTROL_SAFE_AREA_BOTTOM = 0.12f

    val instruments: List<InstrumentDefinition> = listOf(
        instrument(
            id = InstrumentId.CRASH,
            drawBounds = cameraAlignedCymbalBounds(left = 0.05f, top = 0.10f, width = 0.25f),
            renderZIndex = 10,
            hitTestPriority = 50,
            rotationDegrees = -7f,
            labelPosition = NormalizedPoint(0.175f, 0.30f),
            rendererKey = InstrumentRendererKey.CYMBAL,
            pan = -0.55f,
        ),
        instrument(
            id = InstrumentId.RIDE,
            drawBounds = cameraAlignedCymbalBounds(left = 0.69f, top = 0.10f, width = 0.28f),
            renderZIndex = 10,
            hitTestPriority = 50,
            rotationDegrees = 6f,
            labelPosition = NormalizedPoint(0.83f, 0.32f),
            rendererKey = InstrumentRendererKey.CYMBAL,
            pan = 0.55f,
        ),
        instrument(
            id = InstrumentId.HI_HAT,
            drawBounds = cameraAlignedCymbalBounds(left = 0.05f, top = 0.36f, width = 0.20f),
            renderZIndex = 45,
            hitTestPriority = 60,
            rotationDegrees = -4f,
            labelPosition = NormalizedPoint(0.15f, 0.53f),
            rendererKey = InstrumentRendererKey.HI_HAT,
            pan = -0.65f,
        ),
        instrument(
            id = InstrumentId.TOM_HIGH,
            drawBounds = cameraAlignedDrumBounds(left = 0.33f, top = 0.22f, width = 0.17f),
            renderZIndex = 30,
            hitTestPriority = 80,
            rotationDegrees = -4f,
            labelPosition = NormalizedPoint(0.415f, 0.47f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = -0.22f,
        ),
        instrument(
            id = InstrumentId.TOM_MID,
            drawBounds = cameraAlignedDrumBounds(left = 0.51f, top = 0.21f, width = 0.19f),
            renderZIndex = 30,
            hitTestPriority = 80,
            rotationDegrees = 3f,
            labelPosition = NormalizedPoint(0.605f, 0.49f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = 0.14f,
        ),
        instrument(
            id = InstrumentId.KICK,
            drawBounds = NormalizedRect(0.34f, 0.42f, 0.68f, 0.94f),
            renderZIndex = 35,
            hitTestPriority = 70,
            rotationDegrees = 0f,
            labelPosition = NormalizedPoint(0.51f, 0.96f),
            rendererKey = InstrumentRendererKey.KICK,
            pan = 0f,
        ),
        instrument(
            id = InstrumentId.FLOOR_TOM,
            drawBounds = cameraAlignedDrumBounds(left = 0.70f, top = 0.48f, width = 0.24f),
            renderZIndex = 40,
            hitTestPriority = 90,
            rotationDegrees = 4f,
            labelPosition = NormalizedPoint(0.82f, 0.83f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = 0.46f,
        ),
        instrument(
            id = InstrumentId.SNARE,
            drawBounds = cameraAlignedDrumBounds(left = 0.18f, top = 0.50f, width = 0.27f),
            renderZIndex = 50,
            hitTestPriority = 100,
            rotationDegrees = -3f,
            labelPosition = NormalizedPoint(0.315f, 0.89f),
            rendererKey = InstrumentRendererKey.SNARE,
            pan = -0.18f,
        ),
    )

    val renderOrder: List<InstrumentDefinition> = instruments.sortedBy { it.layout.renderZIndex }

    val hitTestOrder: List<InstrumentDefinition> = instruments.sortedWith(
        compareByDescending<InstrumentDefinition> { it.layout.hitTestPriority }
            .thenByDescending { it.layout.renderZIndex },
    )

    fun hitTest(screenX: Float, screenY: Float, aspectRatio: Float = 1f): InstrumentDefinition? {
        for (definition in hitTestOrder) {
            if (definition.layout.hitRegion.contains(screenX, screenY, aspectRatio)) return definition
        }
        return null
    }

    fun matchingInstrumentCount(screenX: Float, screenY: Float, aspectRatio: Float = 1f): Int {
        var count = 0
        for (definition in instruments) {
            if (definition.layout.hitRegion.contains(screenX, screenY, aspectRatio)) count += 1
        }
        return count
    }

    private fun cameraAlignedDrumBounds(left: Float, top: Float, width: Float): NormalizedRect =
        NormalizedRect(
            left = left,
            top = top,
            right = left + width,
            bottom = top + StudioKitCamera.drumDrawBoundsHeight(width),
        )

    private fun cameraAlignedCymbalBounds(left: Float, top: Float, width: Float): NormalizedRect =
        NormalizedRect(
            left = left,
            top = top,
            right = left + width,
            bottom = top + StudioKitCamera.cymbalDrawBoundsHeight(width),
        )

    private fun playableHitRegion(
        drawBounds: NormalizedRect,
        rendererKey: InstrumentRendererKey,
        rotationDegrees: Float,
    ): HitRegion {
        val width = drawBounds.width
        val height = drawBounds.height
        val playableBounds = when (rendererKey) {
            InstrumentRendererKey.CYMBAL,
            InstrumentRendererKey.HI_HAT,
            -> NormalizedRect(
                left = drawBounds.left,
                top = drawBounds.top + height * 0.18f,
                right = drawBounds.right,
                bottom = drawBounds.bottom - height * 0.28f,
            )

            InstrumentRendererKey.DRUM,
            InstrumentRendererKey.SNARE,
            -> NormalizedRect(
                left = drawBounds.left,
                top = drawBounds.top,
                right = drawBounds.right,
                bottom = drawBounds.top + height * 0.42f,
            )

            InstrumentRendererKey.KICK -> NormalizedRect(
                left = drawBounds.left + width * 0.04f,
                top = drawBounds.top + height * 0.12f,
                right = drawBounds.right - width * 0.04f,
                bottom = drawBounds.bottom - height * 0.10f,
            )
        }
        return EllipseHitRegion(
            bounds = playableBounds,
            rotationDegrees = rotationDegrees,
            rotationCenter = NormalizedPoint(drawBounds.centerX, drawBounds.centerY),
        )
    }

    private fun instrument(
        id: InstrumentId,
        drawBounds: NormalizedRect,
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
            hitRegion = playableHitRegion(drawBounds, rendererKey, rotationDegrees),
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
