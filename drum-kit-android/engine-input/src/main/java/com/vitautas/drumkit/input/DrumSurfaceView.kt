package com.vitautas.drumkit.input

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.util.AttributeSet
import android.util.SparseArray
import android.util.TypedValue
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentDefinition
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.InstrumentRendererKey
import com.vitautas.drumkit.model.StudioKitDefinition
import kotlin.math.PI
import kotlin.math.sin

private const val LabelHoldMillis = 2_000L
private const val LabelFadeMillis = 900L
private const val NanosPerMillisecond = 1_000_000L

class DrumSurfaceView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    var onStrike: ((DrumStrike) -> Unit)? = null
    var hapticsEnabled: Boolean = true

    private val density = resources.displayMetrics.density
    private val activePointers = SparseArray<InstrumentId>()
    private val renderStates = ArrayList<InstrumentRenderState>(StudioKitDefinition.instruments.size)
    private val animationStates = Array(InstrumentId.entries.size) { InstrumentAnimationState() }

    private val stagePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val spotlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x70000000 }
    private val shellPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val headPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val cymbalPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val standPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff858b91.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeWidth = density * 2.2f
    }
    private val hardwarePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffc4c9cd.toInt()
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeWidth = density * 1.5f
    }
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffd3d6d8.toInt()
        style = Paint.Style.STROKE
        strokeWidth = density * 3f
    }
    private val impactPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xff17191c.toInt()
        style = Paint.Style.FILL
    }
    private val flashPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = 0xffffa13a.toInt()
        style = Paint.Style.STROKE
        strokeWidth = density * 4f
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = TypedValue.applyDimension(
    TypedValue.COMPLEX_UNIT_SP,
    11f,
    resources.displayMetrics,
)
        isFakeBoldText = true
        setShadowLayer(density * 3f, 0f, density, Color.BLACK)
    }

    private val spotlightRect = RectF()
    private val scratchRect = RectF()
    private var labelsVisibleSinceNanos = System.nanoTime()
    private val labelFadeRunnable = Runnable { postInvalidateOnAnimation() }

    init {
        isFocusable = true
        isClickable = true
        contentDescription = "Playable acoustic drum kit"
    }

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (width <= 0 || height <= 0) return

        stagePaint.shader = LinearGradient(
            0f,
            0f,
            0f,
            height.toFloat(),
            intArrayOf(0xff232326.toInt(), 0xff111216.toInt(), 0xff07080a.toInt()),
            floatArrayOf(0f, 0.55f, 1f),
            Shader.TileMode.CLAMP,
        )
        spotlightPaint.shader = RadialGradient(
            width * 0.5f,
            height * 0.15f,
            width * 0.62f,
            intArrayOf(0x2effd29a, 0x0affb464, 0x00000000),
            floatArrayOf(0f, 0.48f, 1f),
            Shader.TileMode.CLAMP,
        )
        spotlightRect.set(-width * 0.10f, -height * 0.25f, width * 1.10f, height * 0.95f)

        renderStates.clear()
        for (definition in StudioKitDefinition.renderOrder) {
            val state = InstrumentRenderState(definition)
            configureRenderState(state, width.toFloat(), height.toFloat())
            renderStates += state
        }

        labelsVisibleSinceNanos = System.nanoTime()
        removeCallbacks(labelFadeRunnable)
        postDelayed(labelFadeRunnable, LabelHoldMillis + 16L)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), stagePaint)
        canvas.drawOval(spotlightRect, spotlightPaint)

        val nowNanos = System.nanoTime()
        var animationActive = false
        for (renderState in renderStates) {
            val animationState = animationStates[renderState.definition.id.ordinal]
            if (updateAnimation(renderState.definition, animationState, nowNanos)) {
                animationActive = true
            }
            drawInstrument(canvas, renderState, animationState)
        }

        val labelAlpha = labelAlpha(nowNanos)
        if (labelAlpha > 0) {
            labelPaint.alpha = labelAlpha
            for (renderState in renderStates) {
                canvas.drawText(
                    renderState.label,
                    renderState.labelX,
                    renderState.labelY,
                    labelPaint,
                )
            }
        }

        if (animationActive || labelAlpha in 1..254) {
            postInvalidateOnAnimation()
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN,
            MotionEvent.ACTION_POINTER_DOWN,
            -> handlePointerDown(event, event.actionIndex)

            MotionEvent.ACTION_UP -> {
                handlePointerUp(event.getPointerId(event.actionIndex))
                performClick()
            }

            MotionEvent.ACTION_POINTER_UP -> handlePointerUp(event.getPointerId(event.actionIndex))

            MotionEvent.ACTION_CANCEL -> clearActivePointers()
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(labelFadeRunnable)
        clearActivePointers()
        super.onDetachedFromWindow()
    }

    private fun handlePointerDown(event: MotionEvent, pointerIndex: Int) {
        if (width <= 0 || height <= 0) return

        val x = event.getX(pointerIndex)
        val y = event.getY(pointerIndex)
        val screenX = x / width.toFloat()
        val screenY = y / height.toFloat()
        val definition = hitTest(screenX, screenY) ?: return
        val pointerId = event.getPointerId(pointerIndex)
        val drawBounds = definition.layout.drawBounds
        val normalizedX = ((screenX - drawBounds.left) / drawBounds.width).coerceIn(0f, 1f)
        val normalizedY = ((screenY - drawBounds.top) / drawBounds.height).coerceIn(0f, 1f)
        val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)
        val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)
        val velocity = estimateVelocity(pressure, contactSize, event.eventTime)
        val eventTimeNanos = event.eventTime * NanosPerMillisecond

        onStrike?.invoke(
            DrumStrike(
                pointerId = pointerId,
                instrument = definition.id,
                velocity = velocity,
                normalizedX = normalizedX,
                normalizedY = normalizedY,
                pressure = pressure,
                contactSize = contactSize,
                eventTimeNanos = eventTimeNanos,
            ),
        )

        activePointers.put(pointerId, definition.id)
        animationStates[definition.id.ordinal].apply {
            strikeX = normalizedX
            strikeY = normalizedY
            this.velocity = velocity
            startTimeNanos = System.nanoTime()
            activePointerCount += 1
        }
        performInstrumentHaptic(definition.id, velocity)
        postInvalidateOnAnimation()
    }

    private fun handlePointerUp(pointerId: Int) {
        val instrument = activePointers.get(pointerId)
        if (instrument != null) {
            val state = animationStates[instrument.ordinal]
            state.activePointerCount = (state.activePointerCount - 1).coerceAtLeast(0)
        }
        activePointers.remove(pointerId)
        postInvalidateOnAnimation()
    }

    private fun clearActivePointers() {
        activePointers.clear()
        for (state in animationStates) {
            state.activePointerCount = 0
        }
        postInvalidateOnAnimation()
    }

    private fun estimateVelocity(pressure: Float, contactSize: Float, eventTime: Long): Float {
        val pressureVelocity = if (pressure > 0.02f && pressure != 0.5f) {
            0.24f + pressure.coerceIn(0f, 1.2f) * 0.72f
        } else {
            0.58f + ((eventTime % 23L).toFloat() / 100f)
        }
        return (pressureVelocity + contactSize.coerceIn(0f, 1f) * 0.12f).coerceIn(0.22f, 1f)
    }

    private fun hitTest(screenX: Float, screenY: Float): InstrumentDefinition? {
        for (definition in StudioKitDefinition.hitTestOrder) {
            if (definition.layout.hitRegion.contains(screenX, screenY)) return definition
        }
        return null
    }

    private fun configureRenderState(state: InstrumentRenderState, viewWidth: Float, viewHeight: Float) {
        val normalized = state.definition.layout.drawBounds
        val bounds = state.drawBounds
        bounds.set(
            normalized.left * viewWidth,
            normalized.top * viewHeight,
            normalized.right * viewWidth,
            normalized.bottom * viewHeight,
        )
        state.labelX = state.definition.layout.labelPosition.x * viewWidth
        state.labelY = state.definition.layout.labelPosition.y * viewHeight

        when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL,
            InstrumentRendererKey.HI_HAT,
            -> {
                state.primaryRect.set(
                    bounds.left,
                    bounds.top + bounds.height() * 0.18f,
                    bounds.right,
                    bounds.bottom - bounds.height() * 0.28f,
                )
                state.shadowRect.set(
                    state.primaryRect.left + state.primaryRect.width() * 0.10f,
                    state.primaryRect.bottom - bounds.height() * 0.02f,
                    state.primaryRect.right - state.primaryRect.width() * 0.10f,
                    state.primaryRect.bottom + bounds.height() * 0.10f,
                )
                state.primaryShader = RadialGradient(
                    state.primaryRect.centerX() - state.primaryRect.width() * 0.16f,
                    state.primaryRect.centerY() - state.primaryRect.height() * 0.28f,
                    state.primaryRect.width() * 0.62f,
                    intArrayOf(0xffffe3a0.toInt(), 0xffc58a35.toInt(), 0xff704213.toInt()),
                    floatArrayOf(0f, 0.56f, 1f),
                    Shader.TileMode.CLAMP,
                )
            }

            InstrumentRendererKey.DRUM,
            InstrumentRendererKey.SNARE,
            -> {
                state.primaryRect.set(
                    bounds.left + bounds.width() * 0.10f,
                    bounds.top + bounds.height() * 0.23f,
                    bounds.right - bounds.width() * 0.10f,
                    bounds.bottom - bounds.height() * 0.10f,
                )
                state.secondaryRect.set(
                    bounds.left,
                    bounds.top,
                    bounds.right,
                    bounds.top + bounds.height() * 0.42f,
                )
                state.shadowRect.set(
                    state.primaryRect.left + state.primaryRect.width() * 0.05f,
                    state.primaryRect.bottom - bounds.height() * 0.02f,
                    state.primaryRect.right - state.primaryRect.width() * 0.05f,
                    state.primaryRect.bottom + bounds.height() * 0.10f,
                )
                state.primaryShader = LinearGradient(
                    state.primaryRect.left,
                    state.primaryRect.top,
                    state.primaryRect.right,
                    state.primaryRect.bottom,
                    if (state.definition.layout.rendererKey == InstrumentRendererKey.SNARE) {
                        intArrayOf(0xff292d31.toInt(), 0xffe1e4e6.toInt(), 0xff555b60.toInt())
                    } else {
                        intArrayOf(0xff26070b.toInt(), 0xff7d202c.toInt(), 0xff170408.toInt())
                    },
                    null,
                    Shader.TileMode.CLAMP,
                )
                state.secondaryShader = RadialGradient(
                    state.secondaryRect.centerX() - state.secondaryRect.width() * 0.12f,
                    state.secondaryRect.centerY() - state.secondaryRect.height() * 0.25f,
                    state.secondaryRect.width() * 0.58f,
                    intArrayOf(0xfffaf7ef.toInt(), 0xffd5d0c5.toInt(), 0xff6a6a67.toInt()),
                    floatArrayOf(0f, 0.68f, 1f),
                    Shader.TileMode.CLAMP,
                )
            }

            InstrumentRendererKey.KICK -> {
                state.primaryRect.set(
                    bounds.left + bounds.width() * 0.04f,
                    bounds.top + bounds.height() * 0.12f,
                    bounds.right - bounds.width() * 0.04f,
                    bounds.bottom - bounds.height() * 0.10f,
                )
                state.secondaryRect.set(state.primaryRect)
                state.secondaryRect.inset(state.primaryRect.width() * 0.10f, state.primaryRect.height() * 0.10f)
                state.shadowRect.set(
                    state.primaryRect.left + state.primaryRect.width() * 0.04f,
                    state.primaryRect.bottom - bounds.height() * 0.03f,
                    state.primaryRect.right - state.primaryRect.width() * 0.04f,
                    state.primaryRect.bottom + bounds.height() * 0.08f,
                )
                state.primaryShader = RadialGradient(
                    state.primaryRect.centerX() - state.primaryRect.width() * 0.18f,
                    state.primaryRect.centerY() - state.primaryRect.height() * 0.22f,
                    state.primaryRect.width() * 0.62f,
                    intArrayOf(0xff8c2731.toInt(), 0xff35070d.toInt(), 0xff090a0c.toInt()),
                    floatArrayOf(0f, 0.58f, 1f),
                    Shader.TileMode.CLAMP,
                )
                state.secondaryShader = RadialGradient(
                    state.secondaryRect.centerX() - state.secondaryRect.width() * 0.18f,
                    state.secondaryRect.centerY() - state.secondaryRect.height() * 0.18f,
                    state.secondaryRect.width() * 0.58f,
                    intArrayOf(0xff373b40.toInt(), 0xff14171b.toInt(), 0xff050607.toInt()),
                    floatArrayOf(0f, 0.62f, 1f),
                    Shader.TileMode.CLAMP,
                )
            }
        }
    }

    private fun drawInstrument(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
    ) {
        val saveCount = canvas.save()
        val bounds = state.drawBounds
        canvas.rotate(
            state.definition.layout.rotationDegrees,
            bounds.centerX(),
            bounds.centerY(),
        )

        canvas.drawOval(state.shadowRect, shadowPaint)
        when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL -> drawCymbal(canvas, state, animation, hiHat = false)
            InstrumentRendererKey.HI_HAT -> drawCymbal(canvas, state, animation, hiHat = true)
            InstrumentRendererKey.DRUM -> drawDrum(canvas, state, animation, snare = false)
            InstrumentRendererKey.SNARE -> drawDrum(canvas, state, animation, snare = true)
            InstrumentRendererKey.KICK -> drawKick(canvas, state, animation)
        }
        canvas.restoreToCount(saveCount)
    }

    private fun drawDrum(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
        snare: Boolean,
    ) {
        val shell = state.primaryRect
        val head = state.secondaryRect
        val bounds = state.drawBounds

        canvas.drawLine(shell.left + shell.width() * 0.18f, shell.bottom, bounds.left + bounds.width() * 0.08f, bounds.bottom, standPaint)
        canvas.drawLine(shell.right - shell.width() * 0.18f, shell.bottom, bounds.right - bounds.width() * 0.08f, bounds.bottom, standPaint)

        shellPaint.shader = state.primaryShader
        canvas.drawRoundRect(shell, shell.width() * 0.16f, shell.height() * 0.12f, shellPaint)
        canvas.drawLine(shell.left, shell.bottom - density * 2f, shell.right, shell.bottom - density * 2f, hardwarePaint)

        val lugTop = shell.top + shell.height() * 0.10f
        val lugBottom = shell.bottom - shell.height() * 0.10f
        canvas.drawLine(shell.left + shell.width() * 0.15f, lugTop, shell.left + shell.width() * 0.15f, lugBottom, hardwarePaint)
        canvas.drawLine(shell.left + shell.width() * 0.38f, lugTop, shell.left + shell.width() * 0.38f, lugBottom, hardwarePaint)
        canvas.drawLine(shell.right - shell.width() * 0.38f, lugTop, shell.right - shell.width() * 0.38f, lugBottom, hardwarePaint)
        canvas.drawLine(shell.right - shell.width() * 0.15f, lugTop, shell.right - shell.width() * 0.15f, lugBottom, hardwarePaint)

        val impactX = bounds.left + animation.strikeX * bounds.width()
        val impactY = bounds.top + animation.strikeY * bounds.height()
        val headSaveCount = canvas.save()
        if (animation.currentDeformation > 0f) {
            canvas.scale(
                1f + animation.currentDeformation * 0.012f,
                1f - animation.currentDeformation * if (snare) 0.035f else 0.055f,
                impactX,
                impactY,
            )
        }
        headPaint.shader = state.secondaryShader
        canvas.drawOval(head, headPaint)
        rimPaint.color = 0xffd4d7d9.toInt()
        rimPaint.alpha = 255
        canvas.drawOval(head, rimPaint)
        canvas.restoreToCount(headSaveCount)

        if (animation.currentDeformation > 0f) {
            val radiusX = head.width() * (0.10f + animation.velocity * 0.08f)
            val radiusY = head.height() * (0.08f + animation.velocity * 0.06f)
            scratchRect.set(impactX - radiusX, impactY - radiusY, impactX + radiusX, impactY + radiusY)
            impactPaint.alpha = (animation.currentDeformation * 90f).toInt().coerceIn(0, 90)
            canvas.drawOval(scratchRect, impactPaint)
        }
        drawFlash(canvas, head, animation)
    }

    private fun drawKick(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
    ) {
        val shell = state.primaryRect
        val head = state.secondaryRect
        val bounds = state.drawBounds

        canvas.drawLine(shell.left + shell.width() * 0.18f, shell.bottom, bounds.left, bounds.bottom, standPaint)
        canvas.drawLine(shell.right - shell.width() * 0.18f, shell.bottom, bounds.right, bounds.bottom, standPaint)

        shellPaint.shader = state.primaryShader
        canvas.drawOval(shell, shellPaint)
        rimPaint.color = 0xffc7ccd0.toInt()
        rimPaint.alpha = 255
        canvas.drawOval(shell, rimPaint)

        val headSaveCount = canvas.save()
        if (animation.currentDeformation > 0f) {
            val scale = 1f - animation.currentDeformation * 0.045f
            canvas.scale(scale, scale, head.centerX(), head.centerY())
        }
        headPaint.shader = state.secondaryShader
        canvas.drawOval(head, headPaint)
        canvas.restoreToCount(headSaveCount)
        drawFlash(canvas, head, animation)
    }

    private fun drawCymbal(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
        hiHat: Boolean,
    ) {
        val disc = state.primaryRect
        val bounds = state.drawBounds
        val centerX = disc.centerX()
        val centerY = disc.centerY()

        canvas.drawLine(centerX, centerY, centerX, bounds.bottom, standPaint)
        canvas.drawLine(centerX, bounds.bottom - bounds.height() * 0.05f, bounds.left + bounds.width() * 0.28f, bounds.bottom, standPaint)
        canvas.drawLine(centerX, bounds.bottom - bounds.height() * 0.05f, bounds.right - bounds.width() * 0.28f, bounds.bottom, standPaint)

        cymbalPaint.shader = state.primaryShader
        if (hiHat) {
            cymbalPaint.alpha = 150
            canvas.drawOval(disc, cymbalPaint)
        }

        val discSaveCount = canvas.save()
        canvas.rotate(animation.currentRotation, centerX, centerY)
        if (hiHat) {
            canvas.translate(0f, -animation.currentDeformation * bounds.height() * 0.07f)
        }
        cymbalPaint.alpha = 255
        canvas.drawOval(disc, cymbalPaint)
        rimPaint.color = 0xffe1b563.toInt()
        rimPaint.alpha = 255
        canvas.drawOval(disc, rimPaint)

        hardwarePaint.color = 0x66f8d58f
        hardwarePaint.alpha = 115
        var ringIndex = 1
        while (ringIndex <= 3) {
            val insetX = disc.width() * ringIndex * 0.09f
            val insetY = disc.height() * ringIndex * 0.09f
            scratchRect.set(disc.left + insetX, disc.top + insetY, disc.right - insetX, disc.bottom - insetY)
            canvas.drawOval(scratchRect, hardwarePaint)
            ringIndex += 1
        }
        hardwarePaint.color = 0xffc4c9cd.toInt()
        hardwarePaint.alpha = 255

        canvas.drawCircle(centerX, centerY, disc.width() * 0.07f, rimPaint)
        canvas.drawCircle(centerX, centerY, density * 3.2f, hardwarePaint)
        drawFlash(canvas, disc, animation)
        canvas.restoreToCount(discSaveCount)
    }

    private fun drawFlash(canvas: Canvas, bounds: RectF, animation: InstrumentAnimationState) {
        if (animation.currentFlash <= 0f) return
        flashPaint.alpha = (animation.currentFlash * 190f).toInt().coerceIn(0, 190)
        canvas.drawOval(bounds, flashPaint)
    }

    private fun updateAnimation(
        definition: InstrumentDefinition,
        state: InstrumentAnimationState,
        nowNanos: Long,
    ): Boolean {
        if (state.startTimeNanos == 0L) return false

        val durationMillis = when (definition.id) {
            InstrumentId.SNARE -> 110L
            InstrumentId.TOM_HIGH -> 160L
            InstrumentId.TOM_MID -> 195L
            InstrumentId.FLOOR_TOM -> 245L
            InstrumentId.KICK -> 230L
            InstrumentId.HI_HAT -> 280L
            InstrumentId.CRASH -> 620L
            InstrumentId.RIDE -> 720L
        }
        val elapsedNanos = nowNanos - state.startTimeNanos
        val durationNanos = durationMillis * NanosPerMillisecond
        if (elapsedNanos >= durationNanos) {
            state.startTimeNanos = 0L
            state.currentDeformation = 0f
            state.currentRotation = 0f
            state.currentFlash = 0f
            return false
        }

        val progress = elapsedNanos.toFloat() / durationNanos.toFloat()
        val decay = 1f - progress
        state.currentFlash = state.velocity * (1f - (progress / 0.22f).coerceIn(0f, 1f))

        when (definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL -> {
                state.currentDeformation = state.velocity * decay
                state.currentRotation = sin(progress * PI * 5.0).toFloat() * state.velocity * 7f * decay
            }

            InstrumentRendererKey.HI_HAT -> {
                state.currentDeformation = state.velocity * decay * decay
                state.currentRotation = sin(progress * PI * 4.0).toFloat() * state.velocity * 2.5f * decay
            }

            InstrumentRendererKey.SNARE -> {
                state.currentDeformation = state.velocity * decay * decay
                state.currentRotation = 0f
            }

            InstrumentRendererKey.DRUM -> {
                state.currentDeformation = state.velocity * decay * decay
                state.currentRotation = 0f
            }

            InstrumentRendererKey.KICK -> {
                state.currentDeformation = state.velocity * decay * decay
                state.currentRotation = 0f
            }
        }
        return true
    }

    private fun labelAlpha(nowNanos: Long): Int {
        val elapsedMillis = (nowNanos - labelsVisibleSinceNanos) / NanosPerMillisecond
        if (elapsedMillis <= LabelHoldMillis) return 255
        if (elapsedMillis >= LabelHoldMillis + LabelFadeMillis) return 0

        val fadeProgress = (elapsedMillis - LabelHoldMillis).toFloat() / LabelFadeMillis.toFloat()
        return ((1f - fadeProgress) * 255f).toInt().coerceIn(0, 255)
    }

    private fun performInstrumentHaptic(instrument: InstrumentId, velocity: Float) {
        if (!hapticsEnabled) return

        val feedbackConstant = when (instrument) {
            InstrumentId.KICK -> {
                if (velocity >= 0.68f) HapticFeedbackConstants.CONTEXT_CLICK else HapticFeedbackConstants.KEYBOARD_TAP
            }

            InstrumentId.SNARE,
            InstrumentId.TOM_HIGH,
            InstrumentId.TOM_MID,
            InstrumentId.FLOOR_TOM,
            -> {
                if (velocity >= 0.86f) HapticFeedbackConstants.CONTEXT_CLICK else HapticFeedbackConstants.KEYBOARD_TAP
            }

            InstrumentId.HI_HAT,
            InstrumentId.CRASH,
            InstrumentId.RIDE,
            -> {
                if (velocity < 0.82f) return
                HapticFeedbackConstants.CLOCK_TICK
            }
        }
        performHapticFeedback(feedbackConstant)
    }

    private class InstrumentRenderState(
        val definition: InstrumentDefinition,
    ) {
        val drawBounds = RectF()
        val primaryRect = RectF()
        val secondaryRect = RectF()
        val shadowRect = RectF()
        val label: String = definition.id.label.uppercase()
        var labelX: Float = 0f
        var labelY: Float = 0f
        var primaryShader: Shader? = null
        var secondaryShader: Shader? = null
    }

    private class InstrumentAnimationState {
        var strikeX: Float = 0.5f
        var strikeY: Float = 0.5f
        var velocity: Float = 0f
        var startTimeNanos: Long = 0L
        var activePointerCount: Int = 0
        var currentDeformation: Float = 0f
        var currentRotation: Float = 0f
        var currentFlash: Float = 0f
    }
}
