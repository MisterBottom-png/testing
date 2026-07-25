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

object StudioKitDepth {
    const val BACK_CYMBAL = 10
    const val RACK_TOM_MOUNT = 15
    const val KICK = 20
    const val RACK_TOM = 30
    const val FLOOR_TOM = 40
    const val HI_HAT = 45
    const val SNARE = 50
}

enum class InstrumentRenderLayerKind {
    SUPPORT,
    SURFACE,
}

data class InstrumentRenderLayer(
    val instrumentId: InstrumentId,
    val kind: InstrumentRenderLayerKind,
    val zIndex: Int,
)

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

    override fun contains(x: Float, y: Float): Boolean = contains(x, y, 1f)

    override fun contains(x: Float, y: Float, aspectRatio: Float): Boolean {
        require(aspectRatio.isFinite() && aspectRatio > 0f) {
            "aspect ratio must be positive and finite"
        }
        val dx = (x - center.x) * aspectRatio
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
    val playableSurfaceBounds: NormalizedRect = drawBounds,
    val supportRenderZIndex: Int? = null,
    val supportFloorY: Float? = null,
) {
    init {
        require(rotationDegrees.isFinite()) { "rotation must be finite" }
        require(
            playableSurfaceBounds.left >= drawBounds.left &&
                playableSurfaceBounds.top >= drawBounds.top &&
                playableSurfaceBounds.right <= drawBounds.right &&
                playableSurfaceBounds.bottom <= drawBounds.bottom,
        ) { "playable surface bounds must stay inside draw bounds" }
        require(supportRenderZIndex == null || supportRenderZIndex < renderZIndex) {
            "support hardware must render behind its instrument surface"
        }
        require(supportFloorY == null || supportFloorY.isFinite() && supportFloorY in 0f..1f) {
            "support floor must be normalized and finite"
        }
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
            renderZIndex = StudioKitDepth.BACK_CYMBAL,
            hitTestPriority = 50,
            rotationDegrees = -7f,
            labelPosition = NormalizedPoint(0.175f, 0.30f),
            rendererKey = InstrumentRendererKey.CYMBAL,
            pan = -0.55f,
        ),
        instrument(
            id = InstrumentId.RIDE,
            drawBounds = cameraAlignedCymbalBounds(left = 0.69f, top = 0.10f, width = 0.28f),
            renderZIndex = StudioKitDepth.BACK_CYMBAL,
            hitTestPriority = 50,
            rotationDegrees = 6f,
            labelPosition = NormalizedPoint(0.83f, 0.32f),
            rendererKey = InstrumentRendererKey.CYMBAL,
            pan = 0.55f,
        ),
        instrument(
            id = InstrumentId.HI_HAT,
            drawBounds = cameraAlignedCymbalBounds(left = 0.05f, top = 0.36f, width = 0.20f),
            renderZIndex = StudioKitDepth.HI_HAT,
            hitTestPriority = 60,
            rotationDegrees = -4f,
            labelPosition = NormalizedPoint(0.15f, 0.53f),
            rendererKey = InstrumentRendererKey.HI_HAT,
            pan = -0.65f,
        ),
        instrument(
            id = InstrumentId.TOM_HIGH,
            drawBounds = cameraAlignedDrumBounds(left = 0.33f, top = 0.22f, width = 0.17f),
            renderZIndex = StudioKitDepth.RACK_TOM,
            hitTestPriority = 80,
            rotationDegrees = -4f,
            labelPosition = NormalizedPoint(0.415f, 0.47f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = -0.22f,
        ),
        instrument(
            id = InstrumentId.TOM_MID,
            drawBounds = cameraAlignedDrumBounds(left = 0.51f, top = 0.21f, width = 0.19f),
            renderZIndex = StudioKitDepth.RACK_TOM,
            hitTestPriority = 80,
            rotationDegrees = 3f,
            labelPosition = NormalizedPoint(0.605f, 0.49f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = 0.14f,
        ),
        instrument(
            id = InstrumentId.KICK,
            drawBounds = NormalizedRect(0.34f, 0.42f, 0.68f, 0.94f),
            renderZIndex = StudioKitDepth.KICK,
            hitTestPriority = 70,
            rotationDegrees = 0f,
            labelPosition = NormalizedPoint(0.51f, 0.96f),
            rendererKey = InstrumentRendererKey.KICK,
            pan = 0f,
        ),
        instrument(
            id = InstrumentId.FLOOR_TOM,
            drawBounds = cameraAlignedDrumBounds(left = 0.70f, top = 0.48f, width = 0.24f),
            renderZIndex = StudioKitDepth.FLOOR_TOM,
            hitTestPriority = 90,
            rotationDegrees = 4f,
            labelPosition = NormalizedPoint(0.82f, 0.83f),
            rendererKey = InstrumentRendererKey.DRUM,
            pan = 0.46f,
        ),
        instrument(
            id = InstrumentId.SNARE,
            drawBounds = cameraAlignedDrumBounds(left = 0.18f, top = 0.50f, width = 0.27f),
            renderZIndex = StudioKitDepth.SNARE,
            hitTestPriority = 100,
            rotationDegrees = -3f,
            labelPosition = NormalizedPoint(0.315f, 0.89f),
            rendererKey = InstrumentRendererKey.SNARE,
            pan = -0.18f,
        ),
    )

    val renderOrder: List<InstrumentDefinition> = instruments.sortedBy { it.layout.renderZIndex }

    val renderLayers: List<InstrumentRenderLayer> = buildList(instruments.size * 2) {
        for (definition in instruments) {
            definition.layout.supportRenderZIndex?.let { supportZIndex ->
                add(InstrumentRenderLayer(definition.id, InstrumentRenderLayerKind.SUPPORT, supportZIndex))
            }
            add(InstrumentRenderLayer(definition.id, InstrumentRenderLayerKind.SURFACE, definition.layout.renderZIndex))
        }
    }.sortedWith(
        compareBy<InstrumentRenderLayer> { it.zIndex }
            .thenBy { it.kind.ordinal }
            .thenBy { it.instrumentId.ordinal },
    )

    val hitTestOrder: List<InstrumentDefinition> = instruments.sortedWith(
        compareByDescending<InstrumentDefinition> { it.layout.hitTestPriority }
            .thenByDescending { it.layout.renderZIndex },
    )

    fun hitTest(screenX: Float, screenY: Float, aspectRatio: Float = 1f): InstrumentDefinition? =
        StudioKitGeometry.hitTest(screenX, screenY, aspectRatio)?.definition

    fun matchingInstrumentCount(screenX: Float, screenY: Float, aspectRatio: Float = 1f): Int =
        StudioKitGeometry.matchingInstrumentCount(screenX, screenY, aspectRatio)

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

    private data class HitRegionInsets(
        val left: Float,
        val top: Float,
        val right: Float,
        val bottom: Float,
    ) {
        init {
            require(left >= 0f && top >= 0f && right >= 0f && bottom >= 0f) {
                "hit-region insets must be non-negative"
            }
            require(left + right < 1f && top + bottom < 1f) {
                "hit-region insets must preserve positive size"
            }
        }
    }

    private fun visualSurfaceBounds(
        drawBounds: NormalizedRect,
        rendererKey: InstrumentRendererKey,
    ): NormalizedRect {
        val width = drawBounds.width
        val height = drawBounds.height
        return when (rendererKey) {
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
                bottom = drawBounds.top + height * StudioKitCamera.DRUM_HEAD_HEIGHT_FRACTION_OF_DRAW_BOUNDS,
            )

            InstrumentRendererKey.KICK -> NormalizedRect(
                left = drawBounds.left + width * 0.04f,
                top = drawBounds.top + height * 0.12f,
                right = drawBounds.right - width * 0.04f,
                bottom = drawBounds.bottom - height * 0.10f,
            )
        }
    }

    private fun playableHitRegion(
        instrumentId: InstrumentId,
        surfaceBounds: NormalizedRect,
    ): HitRegion {
        val insets = when (instrumentId) {
            InstrumentId.CRASH,
            InstrumentId.RIDE,
            -> HitRegionInsets(left = 0.04f, top = 0.10f, right = 0.04f, bottom = 0.10f)

            InstrumentId.HI_HAT ->
                HitRegionInsets(left = 0.05f, top = 0.12f, right = 0.05f, bottom = 0.12f)

            InstrumentId.TOM_HIGH,
            InstrumentId.TOM_MID,
            InstrumentId.FLOOR_TOM,
            -> HitRegionInsets(left = 0.05f, top = 0.08f, right = 0.05f, bottom = 0.08f)

            InstrumentId.SNARE ->
                HitRegionInsets(left = 0.06f, top = 0.08f, right = 0.06f, bottom = 0.08f)

            InstrumentId.KICK ->
                HitRegionInsets(left = 0.18f, top = 0.18f, right = 0.08f, bottom = 0.10f)
        }
        val hitBounds = inset(surfaceBounds, insets)
        return EllipseHitRegion(bounds = hitBounds)
    }

    private fun inset(bounds: NormalizedRect, insets: HitRegionInsets): NormalizedRect =
        NormalizedRect(
            left = bounds.left + bounds.width * insets.left,
            top = bounds.top + bounds.height * insets.top,
            right = bounds.right - bounds.width * insets.right,
            bottom = bounds.bottom - bounds.height * insets.bottom,
        )

    private fun instrument(
        id: InstrumentId,
        drawBounds: NormalizedRect,
        renderZIndex: Int,
        hitTestPriority: Int,
        rotationDegrees: Float,
        labelPosition: NormalizedPoint,
        rendererKey: InstrumentRendererKey,
        pan: Float,
    ): InstrumentDefinition {
        val playableSurfaceBounds = visualSurfaceBounds(drawBounds, rendererKey)
        return InstrumentDefinition(
            layout = InstrumentLayout(
                instrumentId = id,
                drawBounds = drawBounds,
                hitRegion = playableHitRegion(id, playableSurfaceBounds),
                renderZIndex = renderZIndex,
                hitTestPriority = hitTestPriority,
                rotationDegrees = rotationDegrees,
                labelPosition = labelPosition,
                rendererKey = rendererKey,
                playableSurfaceBounds = playableSurfaceBounds,
                supportRenderZIndex = when (id) {
                    InstrumentId.TOM_HIGH,
                    InstrumentId.TOM_MID,
                    -> StudioKitDepth.RACK_TOM_MOUNT

                    else -> renderZIndex - 1
                },
                supportFloorY = when (id) {
                    InstrumentId.TOM_HIGH,
                    InstrumentId.TOM_MID,
                    -> null

                    else -> StudioKitCamera.FLOOR_PLANE_Y
                },
            ),
            pan = pan,
        )
    }

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
