package com.vitautas.drumkit.input

import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import com.vitautas.drumkit.model.InstrumentArtworkMaterial
import com.vitautas.drumkit.model.InstrumentDefinition
import com.vitautas.drumkit.model.InstrumentRendererKey
import com.vitautas.drumkit.model.StudioKitArtworkProfiles
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.sin

internal class InstrumentArtworkCache(
    private val bodyLayer: CachedArtworkLayer?,
    private val playableLayer: CachedArtworkLayer,
) {
    fun drawBody(canvas: Canvas, paint: Paint) {
        bodyLayer?.draw(canvas, paint)
    }

    fun drawPlayable(canvas: Canvas, paint: Paint) {
        playableLayer.draw(canvas, paint)
    }

    fun release() {
        bodyLayer?.release()
        playableLayer.release()
    }
}

internal class LayeredInstrumentArtworkFactory(
    private val density: Float,
) {
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private val detailPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG)
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.DITHER_FLAG).apply {
        textAlign = Paint.Align.CENTER
        isFakeBoldText = true
    }
    private val scratchRect = RectF()

    fun create(
        definition: InstrumentDefinition,
        bodyRect: RectF,
        playableRect: RectF,
        backend: ArtworkCacheBackend,
    ): InstrumentArtworkCache {
        val profile = StudioKitArtworkProfiles.forRenderer(definition.layout.rendererKey)
        return when (definition.layout.rendererKey) {
            InstrumentRendererKey.DRUM,
            InstrumentRendererKey.SNARE,
            -> createDrumArtwork(definition.id.name, bodyRect, playableRect, profile.material, backend)

            InstrumentRendererKey.KICK -> createKickArtwork(definition.id.name, bodyRect, playableRect, backend)
            InstrumentRendererKey.CYMBAL -> createCymbalArtwork(definition.id.name, playableRect, hiHat = false, backend)
            InstrumentRendererKey.HI_HAT -> createCymbalArtwork(definition.id.name, playableRect, hiHat = true, backend)
        }
    }

    private fun createDrumArtwork(
        name: String,
        shellRect: RectF,
        headRect: RectF,
        material: InstrumentArtworkMaterial,
        backend: ArtworkCacheBackend,
    ): InstrumentArtworkCache = InstrumentArtworkCache(
        bodyLayer = createLayer(backend, "$name-body", shellRect, density * 5f) { canvas, localRect ->
            drawDrumBody(canvas, localRect, material)
        },
        playableLayer = createLayer(backend, "$name-playable", headRect, density * 5f) { canvas, localRect ->
            drawDrumHead(canvas, localRect, material == InstrumentArtworkMaterial.BRUSHED_STEEL)
        },
    )

    private fun createKickArtwork(
        name: String,
        shellRect: RectF,
        headRect: RectF,
        backend: ArtworkCacheBackend,
    ): InstrumentArtworkCache = InstrumentArtworkCache(
        bodyLayer = createLayer(backend, "$name-body", shellRect, density * 6f, ::drawKickBody),
        playableLayer = createLayer(backend, "$name-playable", headRect, density * 6f, ::drawKickHead),
    )

    private fun createCymbalArtwork(
        name: String,
        discRect: RectF,
        hiHat: Boolean,
        backend: ArtworkCacheBackend,
    ): InstrumentArtworkCache {
        val lowerDisc = if (hiHat) {
            val lowerRect = RectF(discRect)
            lowerRect.offset(0f, discRect.height() * 0.16f)
            createLayer(backend, "$name-lower", lowerRect, density * 5f) { canvas, localRect ->
                drawCymbalDisc(canvas, localRect, brightness = 0.72f, includeWasher = false)
            }
        } else {
            null
        }
        return InstrumentArtworkCache(
            bodyLayer = lowerDisc,
            playableLayer = createLayer(backend, "$name-playable", discRect, density * 5f) { canvas, localRect ->
                drawCymbalDisc(canvas, localRect, brightness = 1f, includeWasher = true)
            },
        )
    }

    private fun createLayer(
        backend: ArtworkCacheBackend,
        name: String,
        sourceRect: RectF,
        padding: Float,
        drawLayer: (Canvas, RectF) -> Unit,
    ): CachedArtworkLayer = CachedArtworkLayerFactory.create(
        backend = backend,
        name = name,
        sourceRect = sourceRect,
        padding = padding,
        drawLayer = drawLayer,
    )

    private fun drawDrumBody(
        canvas: Canvas,
        shell: RectF,
        material: InstrumentArtworkMaterial,
    ) {
        val shellColors = if (material == InstrumentArtworkMaterial.BRUSHED_STEEL) {
            intArrayOf(
                0xff15191e.toInt(),
                0xffeef1f3.toInt(),
                0xff747d85.toInt(),
                0xffd9dde0.toInt(),
                0xff30363c.toInt(),
            )
        } else {
            intArrayOf(
                0xff210407.toInt(),
                0xff741722.toInt(),
                0xffc65a5c.toInt(),
                0xff68131d.toInt(),
                0xff160307.toInt(),
            )
        }
        fillPaint.style = Paint.Style.FILL
        fillPaint.alpha = 255
        fillPaint.shader = LinearGradient(
            shell.left,
            shell.centerY(),
            shell.right,
            shell.centerY(),
            shellColors,
            floatArrayOf(0f, 0.18f, 0.38f, 0.68f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRoundRect(shell, shell.width() * 0.16f, shell.height() * 0.12f, fillPaint)

        fillPaint.shader = LinearGradient(
            shell.left,
            shell.top,
            shell.left,
            shell.bottom,
            intArrayOf(0x26ffffff, 0x00ffffff, 0x70000000),
            floatArrayOf(0f, 0.22f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRoundRect(shell, shell.width() * 0.16f, shell.height() * 0.12f, fillPaint)

        scratchRect.set(
            shell.left - shell.width() * 0.015f,
            shell.bottom - shell.height() * 0.17f,
            shell.right + shell.width() * 0.015f,
            shell.bottom + shell.height() * 0.03f,
        )
        fillPaint.shader = LinearGradient(
            scratchRect.left,
            scratchRect.top,
            scratchRect.left,
            scratchRect.bottom,
            intArrayOf(
                0x80ffffff.toInt(),
                0xff30363c.toInt(),
                0xffcbd0d4.toInt(),
                0xff191d21.toInt(),
                0x70ffffff,
            ),
            null,
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(scratchRect, fillPaint)

        fillPaint.shader = LinearGradient(
            shell.left,
            shell.centerY(),
            shell.right,
            shell.centerY(),
            intArrayOf(0xff252a2f.toInt(), 0xffe5e9ec.toInt(), 0xff79828a.toInt(), 0xff23282d.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
        val lugWidth = max(density * 3f, shell.width() * 0.055f)
        val lugTop = shell.top + shell.height() * 0.12f
        val lugBottom = shell.bottom - shell.height() * 0.12f
        val lugCenters = floatArrayOf(0.12f, 0.28f, 0.43f, 0.57f, 0.72f, 0.88f)
        for (fraction in lugCenters) {
            val centerX = shell.left + shell.width() * fraction
            scratchRect.set(centerX - lugWidth * 0.5f, lugTop, centerX + lugWidth * 0.5f, lugBottom)
            canvas.drawRoundRect(scratchRect, lugWidth * 0.45f, lugWidth * 0.45f, fillPaint)
        }

        detailPaint.style = Paint.Style.FILL
        detailPaint.shader = null
        detailPaint.color = 0x36ffffff
        detailPaint.alpha = 255
        scratchRect.set(
            shell.left + shell.width() * 0.22f,
            shell.top + shell.height() * 0.04f,
            shell.left + shell.width() * 0.29f,
            shell.bottom - shell.height() * 0.13f,
        )
        canvas.drawRoundRect(scratchRect, scratchRect.width() * 0.5f, scratchRect.width() * 0.5f, detailPaint)
        scratchRect.offset(shell.width() * 0.45f, 0f)
        detailPaint.color = 0x22ffffff
        canvas.drawRoundRect(scratchRect, scratchRect.width() * 0.5f, scratchRect.width() * 0.5f, detailPaint)

        strokePaint.shader = null
        strokePaint.color = 0x68ffffff
        strokePaint.alpha = 255
        strokePaint.strokeWidth = max(density, shell.width() * 0.006f)
        canvas.drawArc(shell, 202f, 76f, false, strokePaint)
        fillPaint.shader = null
    }

    private fun drawDrumHead(canvas: Canvas, head: RectF, snare: Boolean) {
        fillPaint.style = Paint.Style.FILL
        fillPaint.alpha = 255
        fillPaint.shader = RadialGradient(
            head.centerX() - head.width() * 0.13f,
            head.centerY() - head.height() * 0.24f,
            max(head.width(), head.height()) * 0.58f,
            if (snare) {
                intArrayOf(0xffffffff.toInt(), 0xffeeece7.toInt(), 0xffc8c6c0.toInt(), 0xff5b6064.toInt())
            } else {
                intArrayOf(0xfffffdf6.toInt(), 0xffe9e4d9.toInt(), 0xffbbb6aa.toInt(), 0xff55595d.toInt())
            },
            floatArrayOf(0f, 0.52f, 0.78f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(head, fillPaint)

        strokePaint.shader = LinearGradient(
            head.left,
            head.top,
            head.right,
            head.bottom,
            intArrayOf(0xfff4f6f7.toInt(), 0xff697178.toInt(), 0xffd8dde0.toInt(), 0xff20252a.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
        strokePaint.strokeWidth = max(density * 2.2f, head.width() * 0.035f)
        strokePaint.alpha = 255
        canvas.drawOval(head, strokePaint)

        scratchRect.set(head)
        scratchRect.inset(head.width() * 0.085f, head.height() * 0.085f)
        strokePaint.shader = null
        strokePaint.color = 0x38726d65
        strokePaint.strokeWidth = max(density * 0.7f, head.width() * 0.006f)
        canvas.drawOval(scratchRect, strokePaint)

        detailPaint.style = Paint.Style.FILL
        detailPaint.shader = RadialGradient(
            head.centerX(),
            head.centerY() + head.height() * 0.04f,
            head.width() * 0.24f,
            intArrayOf(0x2475685e, 0x0c75685e, 0x0075685e),
            null,
            Shader.TileMode.CLAMP,
        )
        detailPaint.alpha = 255
        scratchRect.set(
            head.centerX() - head.width() * 0.22f,
            head.centerY() - head.height() * 0.20f,
            head.centerX() + head.width() * 0.22f,
            head.centerY() + head.height() * 0.20f,
        )
        canvas.drawOval(scratchRect, detailPaint)

        strokePaint.shader = null
        strokePaint.color = 0x24ffffff
        strokePaint.strokeWidth = max(density * 0.8f, head.width() * 0.007f)
        canvas.drawArc(head, 205f, 72f, false, strokePaint)
        fillPaint.shader = null
        detailPaint.shader = null
    }

    private fun drawKickBody(canvas: Canvas, shell: RectF) {
        fillPaint.style = Paint.Style.FILL
        fillPaint.alpha = 255
        scratchRect.set(shell)
        scratchRect.offset(-shell.width() * 0.035f, shell.height() * 0.015f)
        fillPaint.shader = RadialGradient(
            scratchRect.centerX() - scratchRect.width() * 0.16f,
            scratchRect.centerY() - scratchRect.height() * 0.20f,
            max(scratchRect.width(), scratchRect.height()) * 0.62f,
            intArrayOf(0xff982d38.toInt(), 0xff4a0b14.toInt(), 0xff160306.toInt(), 0xff050607.toInt()),
            floatArrayOf(0f, 0.48f, 0.82f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(scratchRect, fillPaint)

        strokePaint.shader = LinearGradient(
            shell.left,
            shell.top,
            shell.right,
            shell.bottom,
            intArrayOf(0xff30363c.toInt(), 0xffeef1f3.toInt(), 0xff717b84.toInt(), 0xff171b20.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
        strokePaint.strokeWidth = max(density * 3f, shell.width() * 0.045f)
        canvas.drawOval(scratchRect, strokePaint)

        detailPaint.style = Paint.Style.FILL
        detailPaint.shader = LinearGradient(
            shell.left,
            shell.top,
            shell.right,
            shell.bottom,
            intArrayOf(0x18ffffff, 0x00ffffff, 0x60000000),
            null,
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(scratchRect, detailPaint)
        fillPaint.shader = null
        detailPaint.shader = null
    }

    private fun drawKickHead(canvas: Canvas, head: RectF) {
        fillPaint.style = Paint.Style.FILL
        fillPaint.alpha = 255
        fillPaint.shader = RadialGradient(
            head.centerX() - head.width() * 0.16f,
            head.centerY() - head.height() * 0.18f,
            max(head.width(), head.height()) * 0.58f,
            intArrayOf(0xff484e56.toInt(), 0xff171a1f.toInt(), 0xff08090c.toInt(), 0xff020304.toInt()),
            floatArrayOf(0f, 0.46f, 0.80f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(head, fillPaint)

        strokePaint.shader = LinearGradient(
            head.left,
            head.top,
            head.right,
            head.bottom,
            intArrayOf(0xfff0f2f3.toInt(), 0xff5e6871.toInt(), 0xffc8ced2.toInt(), 0xff171b20.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
        strokePaint.strokeWidth = max(density * 3f, head.width() * 0.045f)
        canvas.drawOval(head, strokePaint)

        val portRadius = head.width() * 0.085f
        val portX = head.left + head.width() * 0.67f
        val portY = head.top + head.height() * 0.64f
        fillPaint.shader = RadialGradient(
            portX - portRadius * 0.25f,
            portY - portRadius * 0.25f,
            portRadius,
            intArrayOf(0x30ffffff, 0xff050607.toInt(), 0xff20252a.toInt(), 0xff010203.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
        canvas.drawCircle(portX, portY, portRadius, fillPaint)

        textPaint.shader = null
        textPaint.color = 0x66ffffff
        textPaint.alpha = 255
        textPaint.textSize = max(density * 8f, head.width() * 0.052f)
        canvas.drawText("STUDIO", head.centerX(), head.top + head.height() * 0.30f, textPaint)

        scratchRect.set(
            head.centerX() - head.width() * 0.035f,
            head.top + head.height() * 0.07f,
            head.centerX() + head.width() * 0.035f,
            head.top + head.height() * 0.19f,
        )
        fillPaint.shader = LinearGradient(
            scratchRect.left,
            scratchRect.top,
            scratchRect.right,
            scratchRect.bottom,
            intArrayOf(0xfff1f3f4.toInt(), 0xff747e86.toInt(), 0xff20252a.toInt()),
            null,
            Shader.TileMode.CLAMP,
        )
        canvas.drawRoundRect(scratchRect, scratchRect.width() * 0.25f, scratchRect.width() * 0.25f, fillPaint)
        fillPaint.shader = null
    }

    private fun drawCymbalDisc(
        canvas: Canvas,
        disc: RectF,
        brightness: Float,
        includeWasher: Boolean,
    ) {
        fun scaleChannel(value: Int): Int = (value * brightness).toInt().coerceIn(0, 255)
        fun bronze(red: Int, green: Int, blue: Int): Int =
            0xff000000.toInt() or (scaleChannel(red) shl 16) or (scaleChannel(green) shl 8) or scaleChannel(blue)

        fillPaint.style = Paint.Style.FILL
        fillPaint.alpha = 255
        fillPaint.shader = RadialGradient(
            disc.centerX() - disc.width() * 0.16f,
            disc.centerY() - disc.height() * 0.24f,
            max(disc.width(), disc.height()) * 0.58f,
            intArrayOf(
                bronze(255, 232, 164),
                bronze(225, 177, 91),
                bronze(181, 118, 39),
                bronze(117, 72, 19),
                bronze(65, 39, 10),
            ),
            floatArrayOf(0f, 0.24f, 0.54f, 0.82f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(disc, fillPaint)

        strokePaint.shader = null
        strokePaint.color = bronze(79, 49, 13)
        strokePaint.alpha = 255
        strokePaint.strokeWidth = max(density, disc.width() * 0.009f)
        canvas.drawOval(disc, strokePaint)

        var ringIndex = 1
        while (ringIndex <= 6) {
            val insetX = disc.width() * ringIndex * 0.062f
            val insetY = disc.height() * ringIndex * 0.062f
            scratchRect.set(disc.left + insetX, disc.top + insetY, disc.right - insetX, disc.bottom - insetY)
            strokePaint.color = if (ringIndex % 2 == 0) 0x34fff0ba else 0x40734212
            strokePaint.strokeWidth = max(density * 0.55f, disc.width() * 0.0035f)
            canvas.drawOval(scratchRect, strokePaint)
            ringIndex += 1
        }

        detailPaint.style = Paint.Style.FILL
        detailPaint.shader = null
        detailPaint.color = 0x276b4517
        detailPaint.alpha = 255
        val hammerRadiusX = max(density * 1.2f, disc.width() * 0.012f)
        val hammerRadiusY = max(density * 0.7f, disc.height() * 0.045f)
        var mark = 0
        while (mark < 18) {
            val angle = (mark.toDouble() / 18.0) * PI * 2.0
            val radius = if (mark % 2 == 0) 0.31f else 0.39f
            val centerX = disc.centerX() + cos(angle).toFloat() * disc.width() * radius
            val centerY = disc.centerY() + sin(angle).toFloat() * disc.height() * radius
            scratchRect.set(
                centerX - hammerRadiusX,
                centerY - hammerRadiusY,
                centerX + hammerRadiusX,
                centerY + hammerRadiusY,
            )
            canvas.drawOval(scratchRect, detailPaint)
            mark += 1
        }

        scratchRect.set(
            disc.centerX() - disc.width() * 0.09f,
            disc.centerY() - disc.height() * 0.26f,
            disc.centerX() + disc.width() * 0.09f,
            disc.centerY() + disc.height() * 0.26f,
        )
        fillPaint.shader = RadialGradient(
            scratchRect.centerX() - scratchRect.width() * 0.18f,
            scratchRect.centerY() - scratchRect.height() * 0.20f,
            max(scratchRect.width(), scratchRect.height()) * 0.62f,
            intArrayOf(bronze(255, 242, 183), bronze(215, 157, 69), bronze(91, 55, 14)),
            null,
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(scratchRect, fillPaint)

        detailPaint.shader = RadialGradient(
            disc.left + disc.width() * 0.34f,
            disc.top + disc.height() * 0.22f,
            disc.width() * 0.18f,
            intArrayOf(0x80ffffff.toInt(), 0x18ffffff, 0x00ffffff),
            null,
            Shader.TileMode.CLAMP,
        )
        scratchRect.set(
            disc.left + disc.width() * 0.14f,
            disc.top + disc.height() * 0.04f,
            disc.left + disc.width() * 0.54f,
            disc.top + disc.height() * 0.44f,
        )
        canvas.drawOval(scratchRect, detailPaint)

        if (includeWasher) {
            fillPaint.shader = LinearGradient(
                disc.centerX(),
                disc.centerY() - disc.height() * 0.12f,
                disc.centerX(),
                disc.centerY() + disc.height() * 0.12f,
                intArrayOf(0xfff4f6f7.toInt(), 0xff929ba3.toInt(), 0xff272d33.toInt()),
                null,
                Shader.TileMode.CLAMP,
            )
            canvas.drawCircle(disc.centerX(), disc.centerY(), max(density * 2.6f, disc.width() * 0.026f), fillPaint)
            fillPaint.shader = null
            fillPaint.color = 0xff30363c.toInt()
            canvas.drawCircle(disc.centerX(), disc.centerY(), max(density * 1.1f, disc.width() * 0.010f), fillPaint)
        }
        fillPaint.shader = null
        detailPaint.shader = null
    }
}
