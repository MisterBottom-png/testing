package com.vitautas.drumkit

import com.vitautas.drumkit.model.InstrumentRendererKey
import com.vitautas.drumkit.model.NormalizedRect
import com.vitautas.drumkit.model.StudioKitDefinition
import kotlin.math.ceil
import kotlin.math.floor

private const val Argb8888BytesPerPixel = 4L

/**
 * Estimates the allocation footprint of the renderer's ARGB_8888 bitmap layers.
 *
 * The calculation mirrors the unrotated cache rectangles and padding used by
 * DrumSurfaceView and CachedArtworkLayerFactory. It deliberately reports an
 * estimate rather than pretending row alignment and platform bookkeeping are
 * identical on every Android build.
 */
internal object DiagnosticArtworkCacheEstimator {
    fun estimateBitmapBytes(
        viewportWidthPx: Int,
        viewportHeightPx: Int,
        density: Float,
    ): Long {
        if (viewportWidthPx <= 0 || viewportHeightPx <= 0) return 0L
        val safeDensity = density.takeIf { it.isFinite() && it > 0f } ?: return 0L
        val width = viewportWidthPx.toFloat()
        val height = viewportHeightPx.toFloat()
        var totalBytes = 0L

        StudioKitDefinition.instruments.forEach { definition ->
            val draw = definition.layout.drawBounds.toPixels(width, height)
            val playable = definition.layout.playableSurfaceBounds.toPixels(width, height)
            when (definition.layout.rendererKey) {
                InstrumentRendererKey.CYMBAL -> {
                    totalBytes += layerBytes(playable, safeDensity * 5f)
                }

                InstrumentRendererKey.HI_HAT -> {
                    totalBytes += layerBytes(playable, safeDensity * 5f)
                    totalBytes += layerBytes(playable, safeDensity * 5f)
                }

                InstrumentRendererKey.DRUM,
                InstrumentRendererKey.SNARE,
                -> {
                    val body = PixelRect(
                        left = draw.left + draw.width * 0.10f,
                        top = draw.top + draw.height * 0.23f,
                        right = draw.right - draw.width * 0.10f,
                        bottom = draw.bottom - draw.height * 0.10f,
                    )
                    totalBytes += layerBytes(body, safeDensity * 5f)
                    totalBytes += layerBytes(playable, safeDensity * 5f)
                }

                InstrumentRendererKey.KICK -> {
                    val body = PixelRect(
                        left = draw.left,
                        top = draw.top + draw.height * 0.06f,
                        right = draw.right,
                        bottom = draw.bottom - draw.height * 0.04f,
                    )
                    totalBytes += layerBytes(body, safeDensity * 6f)
                    totalBytes += layerBytes(playable, safeDensity * 6f)
                }
            }
        }
        return totalBytes.coerceAtLeast(0L)
    }

    private fun NormalizedRect.toPixels(widthPx: Float, heightPx: Float): PixelRect = PixelRect(
        left = left * widthPx,
        top = top * heightPx,
        right = right * widthPx,
        bottom = bottom * heightPx,
    )

    private fun layerBytes(rect: PixelRect, padding: Float): Long {
        val width = (ceil(rect.right + padding) - floor(rect.left - padding))
            .toLong()
            .coerceAtLeast(1L)
        val height = (ceil(rect.bottom + padding) - floor(rect.top - padding))
            .toLong()
            .coerceAtLeast(1L)
        return width * height * Argb8888BytesPerPixel
    }

    private data class PixelRect(
        val left: Float,
        val top: Float,
        val right: Float,
        val bottom: Float,
    ) {
        val width: Float
            get() = right - left

        val height: Float
            get() = bottom - top
    }
}
