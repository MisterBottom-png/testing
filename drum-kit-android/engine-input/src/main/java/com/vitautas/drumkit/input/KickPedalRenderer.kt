package com.vitautas.drumkit.input

import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import com.vitautas.drumkit.model.KickPedalDefinition

internal class KickPedalRenderer(
    private val density: Float,
) {
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0x66000000
        style = Paint.Style.FILL
    }
    private val basePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff34383d.toInt()
        style = Paint.Style.FILL
    }
    private val metalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffc2c8ce.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = density * 2.2f
    }
    private val darkMetalPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff666d74.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = density * 1.5f
    }
    private val footboardPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff6f757b.toInt()
        style = Paint.Style.FILL
    }
    private val footboardEdgePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffd2d6da.toInt()
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeWidth = density * 1.4f
    }
    private val treadPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff25282c.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeWidth = density * 1.2f
    }
    private val chainPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffd7dbde.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeWidth = density * 1.25f
    }
    private val springPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffaeb5bb.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        strokeWidth = density * 1.15f
    }
    private val rubberPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff24272a.toInt()
        style = Paint.Style.FILL
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffe7eaec.toInt()
        textAlign = Paint.Align.CENTER
        textSize = density * 8.5f
        isFakeBoldText = true
        letterSpacing = 0.12f
    }
    private val impactFlashPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffffa13a.toInt()
        style = Paint.Style.STROKE
        strokeWidth = density * 2.4f
    }

    private val shadowRect = RectF()
    private val baseRect = RectF()
    private val heelRect = RectF()
    private val axleRect = RectF()
    private val camRect = RectF()
    private val beaterHeadRect = RectF()
    private val impactFlashRect = RectF()
    private val footboardPath = Path()
    private val springPath = Path()

    private var viewWidth = 0f
    private var viewHeight = 0f

    fun configure(width: Float, height: Float) {
        viewWidth = width.coerceAtLeast(0f)
        viewHeight = height.coerceAtLeast(0f)
        if (viewWidth <= 0f || viewHeight <= 0f) return

        shadowRect.set(x(0.405f), y(0.947f), x(0.615f), y(0.995f))
        baseRect.set(x(0.425f), y(0.944f), x(0.595f), y(0.989f))
        heelRect.set(x(0.447f), y(0.942f), x(0.573f), y(0.986f))
        val axleX = x(KickPedalDefinition.axle.x)
        val axleY = y(KickPedalDefinition.axle.y)
        axleRect.set(
            axleX - viewHeight * 0.011f,
            axleY - viewHeight * 0.011f,
            axleX + viewHeight * 0.011f,
            axleY + viewHeight * 0.011f,
        )
        camRect.set(
            axleX - viewHeight * 0.020f,
            axleY - viewHeight * 0.020f,
            axleX + viewHeight * 0.020f,
            axleY + viewHeight * 0.020f,
        )
        footboardPaint.shader = LinearGradient(
            x(0.455f),
            y(0.78f),
            x(0.565f),
            y(0.975f),
            intArrayOf(0xffb6bcc1.toInt(), 0xff666c72.toInt(), 0xff34383d.toInt()),
            floatArrayOf(0f, 0.58f, 1f),
            Shader.TileMode.CLAMP,
        )
        impactFlashPaint.shader = RadialGradient(
            x(KickPedalDefinition.beaterImpactHead.x),
            y(KickPedalDefinition.beaterImpactHead.y),
            viewHeight * 0.05f,
            intArrayOf(0xffffd29a.toInt(), 0xffff8a28.toInt(), 0x00ff8a28),
            floatArrayOf(0f, 0.45f, 1f),
            Shader.TileMode.CLAMP,
        )
    }

    fun draw(
        canvas: Canvas,
        animation: KickPedalAnimationState,
        nowNanos: Long,
    ): Boolean {
        if (viewWidth <= 0f || viewHeight <= 0f) return false
        val animationActive = animation.update(nowNanos)
        val depression = animation.currentFootboardDepression
        val beaterTravel = animation.currentBeaterTravel

        canvas.drawOval(shadowRect, shadowPaint)
        canvas.drawRoundRect(baseRect, density * 5f, density * 5f, basePaint)
        canvas.drawRoundRect(heelRect, density * 4f, density * 4f, rubberPaint)

        val axleX = x(KickPedalDefinition.axle.x)
        val axleY = y(KickPedalDefinition.axle.y)
        val leftPostX = x(0.468f)
        val rightPostX = x(0.552f)
        val postBottomY = y(0.905f)
        val postTopY = y(0.775f)
        canvas.drawLine(leftPostX, postBottomY, leftPostX, postTopY, metalPaint)
        canvas.drawLine(rightPostX, postBottomY, rightPostX, postTopY, metalPaint)
        canvas.drawLine(leftPostX, postTopY, rightPostX, postTopY, metalPaint)
        canvas.drawLine(leftPostX, axleY, rightPostX, axleY, darkMetalPaint)
        canvas.drawOval(camRect, basePaint)
        canvas.drawOval(camRect, metalPaint)
        canvas.drawOval(axleRect, rubberPaint)

        val heelLeftX = x(0.458f)
        val heelRightX = x(0.562f)
        val heelY = y(0.966f)
        val toeLeftX = x(0.476f)
        val toeRightX = x(0.544f)
        val toeY = y(0.802f + depression * 0.064f)
        footboardPath.reset()
        footboardPath.moveTo(heelLeftX, heelY)
        footboardPath.lineTo(toeLeftX, toeY)
        footboardPath.lineTo(toeRightX, toeY)
        footboardPath.lineTo(heelRightX, heelY)
        footboardPath.close()
        canvas.drawPath(footboardPath, footboardPaint)
        canvas.drawPath(footboardPath, footboardEdgePaint)

        for (index in 1..6) {
            val amount = index / 7f
            val leftX = lerp(toeLeftX, heelLeftX, amount)
            val rightX = lerp(toeRightX, heelRightX, amount)
            val treadY = lerp(toeY, heelY, amount)
            canvas.drawLine(leftX + density * 2f, treadY, rightX - density * 2f, treadY, treadPaint)
        }

        val toeCenterX = (toeLeftX + toeRightX) * 0.5f
        canvas.drawLine(toeCenterX, toeY, axleX, axleY + viewHeight * 0.016f, chainPaint)
        for (index in 1..5) {
            val amount = index / 6f
            canvas.drawCircle(
                lerp(toeCenterX, axleX, amount),
                lerp(toeY, axleY + viewHeight * 0.016f, amount),
                density * 0.9f,
                chainPaint,
            )
        }

        drawSpring(canvas, depression)

        val beaterHeadX = lerp(
            x(KickPedalDefinition.beaterRestHead.x),
            x(KickPedalDefinition.beaterImpactHead.x),
            beaterTravel,
        )
        val beaterHeadY = lerp(
            y(KickPedalDefinition.beaterRestHead.y),
            y(KickPedalDefinition.beaterImpactHead.y),
            beaterTravel,
        )
        canvas.drawLine(axleX, axleY, beaterHeadX, beaterHeadY, metalPaint)
        val headRadiusX = viewHeight * 0.014f
        val headRadiusY = viewHeight * 0.022f
        beaterHeadRect.set(
            beaterHeadX - headRadiusX,
            beaterHeadY - headRadiusY,
            beaterHeadX + headRadiusX,
            beaterHeadY + headRadiusY,
        )
        canvas.drawOval(beaterHeadRect, rubberPaint)
        canvas.drawOval(beaterHeadRect, darkMetalPaint)

        val boardLabelY = lerp(toeY, heelY, 0.58f)
        labelPaint.alpha = (175f + depression * 80f).toInt().coerceIn(0, 255)
        canvas.drawText("KICK", x(KickPedalDefinition.labelPosition.x), boardLabelY, labelPaint)

        if (animation.currentImpactFlash > 0f) {
            val flashRadius = viewHeight * (0.025f + animation.currentImpactFlash * 0.018f)
            impactFlashRect.set(
                x(KickPedalDefinition.beaterImpactHead.x) - flashRadius,
                y(KickPedalDefinition.beaterImpactHead.y) - flashRadius,
                x(KickPedalDefinition.beaterImpactHead.x) + flashRadius,
                y(KickPedalDefinition.beaterImpactHead.y) + flashRadius,
            )
            impactFlashPaint.alpha = (animation.currentImpactFlash * 220f).toInt().coerceIn(0, 220)
            canvas.drawOval(impactFlashRect, impactFlashPaint)
        }

        return animationActive
    }

    private fun drawSpring(canvas: Canvas, depression: Float) {
        val springX = x(0.568f)
        val topY = y(0.802f)
        val bottomY = y(0.900f - depression * 0.018f)
        val turns = 8
        springPath.reset()
        springPath.moveTo(springX, topY)
        for (index in 1 until turns) {
            val amount = index / turns.toFloat()
            val offset = if (index % 2 == 0) -density * 2.4f else density * 2.4f
            springPath.lineTo(springX + offset, lerp(topY, bottomY, amount))
        }
        springPath.lineTo(springX, bottomY)
        canvas.drawPath(springPath, springPaint)
        canvas.drawLine(springX, bottomY, rightPostAnchorX(), y(0.912f), darkMetalPaint)
    }

    private fun rightPostAnchorX(): Float = x(0.552f)

    private fun x(normalized: Float): Float = normalized * viewWidth

    private fun y(normalized: Float): Float = normalized * viewHeight

    private fun lerp(start: Float, end: Float, amount: Float): Float = start + (end - start) * amount
}
