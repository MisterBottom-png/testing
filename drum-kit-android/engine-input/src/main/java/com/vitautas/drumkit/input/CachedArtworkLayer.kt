package com.vitautas.drumkit.input

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.RenderNode
import android.os.Build
import kotlin.math.ceil
import kotlin.math.floor

internal interface CachedArtworkLayer {
    val backend: ArtworkCacheBackend

    fun prepare()

    fun draw(canvas: Canvas, paint: Paint)

    fun release()
}

internal object CachedArtworkLayerFactory {
    fun create(
        backend: ArtworkCacheBackend,
        name: String,
        sourceRect: RectF,
        padding: Float,
        drawLayer: (Canvas, RectF) -> Unit,
    ): CachedArtworkLayer {
        val left = floor(sourceRect.left - padding)
        val top = floor(sourceRect.top - padding)
        val right = ceil(sourceRect.right + padding)
        val bottom = ceil(sourceRect.bottom + padding)
        val width = (right - left).toInt().coerceAtLeast(1)
        val height = (bottom - top).toInt().coerceAtLeast(1)
        val localRect = RectF(
            sourceRect.left - left,
            sourceRect.top - top,
            sourceRect.right - left,
            sourceRect.bottom - top,
        )

        return when (backend) {
            ArtworkCacheBackend.BITMAP -> BitmapArtworkLayer(
                width = width,
                height = height,
                left = left,
                top = top,
                localRect = localRect,
                drawLayer = drawLayer,
            )

            ArtworkCacheBackend.RENDER_NODE -> {
                check(Build.VERSION.SDK_INT >= ArtworkCacheBackendPolicy.RENDER_NODE_MIN_SDK) {
                    "RenderNode artwork requires API ${ArtworkCacheBackendPolicy.RENDER_NODE_MIN_SDK}+"
                }
                Api29RenderNodeArtworkLayer(
                    name = name,
                    width = width,
                    height = height,
                    left = left,
                    top = top,
                    localRect = localRect,
                    drawLayer = drawLayer,
                )
            }
        }
    }
}

private class BitmapArtworkLayer(
    width: Int,
    height: Int,
    private val left: Float,
    private val top: Float,
    localRect: RectF,
    drawLayer: (Canvas, RectF) -> Unit,
) : CachedArtworkLayer {
    override val backend: ArtworkCacheBackend = ArtworkCacheBackend.BITMAP
    private val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also { bitmap ->
        drawLayer(Canvas(bitmap), localRect)
    }

    override fun prepare() = Unit

    override fun draw(canvas: Canvas, paint: Paint) {
        canvas.drawBitmap(bitmap, left, top, paint)
    }

    override fun release() {
        if (!bitmap.isRecycled) bitmap.recycle()
    }
}

@SuppressLint("NewApi")
private class Api29RenderNodeArtworkLayer(
    name: String,
    private val width: Int,
    private val height: Int,
    private val left: Float,
    private val top: Float,
    private val localRect: RectF,
    private val drawLayer: (Canvas, RectF) -> Unit,
) : CachedArtworkLayer {
    override val backend: ArtworkCacheBackend = ArtworkCacheBackend.RENDER_NODE
    private val renderNode = RenderNode(name).apply {
        setPosition(0, 0, width, height)
        setClipToBounds(true)
    }

    init {
        prepare()
    }

    override fun prepare() {
        if (renderNode.hasDisplayList()) return

        val recordingCanvas = renderNode.beginRecording(width, height)
        try {
            drawLayer(recordingCanvas, localRect)
        } finally {
            renderNode.endRecording()
        }
    }

    override fun draw(canvas: Canvas, paint: Paint) {
        val saveCount = canvas.save()
        canvas.translate(left, top)
        if (canvas.isHardwareAccelerated) {
            prepare()
            canvas.drawRenderNode(renderNode)
        } else {
            drawLayer(canvas, localRect)
        }
        canvas.restoreToCount(saveCount)
    }

    override fun release() {
        renderNode.discardDisplayList()
    }
}
