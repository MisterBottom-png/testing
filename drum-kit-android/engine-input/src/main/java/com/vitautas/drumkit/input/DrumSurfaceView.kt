package com.vitautas.drumkit.input

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.AttributeSet
import android.util.SparseArray
import android.view.MotionEvent
import android.view.View
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentDefinition
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.InstrumentShape
import com.vitautas.drumkit.model.StudioKitDefinition

class DrumSurfaceView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    var onStrike: ((DrumStrike) -> Unit)? = null
    var hapticsEnabled: Boolean = true

    private val activePointers = SparseArray<InstrumentId>()
    private val stagePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x66000000 }
    private val shellPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val headPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density * 3f
        color = 0xffb9c1c9.toInt()
    }
    private val cymbalPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = resources.displayMetrics.density * 5f
        color = 0xffffb44a.toInt()
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textAlign = Paint.Align.CENTER
        textSize = resources.displayMetrics.scaledDensity * 12f
        isFakeBoldText = true
        setShadowLayer(4f, 0f, 2f, Color.BLACK)
    }
    private val reusableRect = RectF()

    init {
        isFocusable = true
        isClickable = true
        contentDescription = "Playable acoustic drum kit"
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        drawStage(canvas)
        StudioKitDefinition.instruments.forEach { drawInstrument(canvas, it) }
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

            MotionEvent.ACTION_CANCEL -> {
                activePointers.clear()
                invalidate()
            }
        }
        return true
    }

    override fun performClick(): Boolean {
        super.performClick()
        return true
    }

    private fun handlePointerDown(event: MotionEvent, pointerIndex: Int) {
        val x = event.getX(pointerIndex)
        val y = event.getY(pointerIndex)
        val definition = hitTest(x, y) ?: return
        val pointerId = event.getPointerId(pointerIndex)
        val bounds = pixelBounds(definition)
        val nx = ((x - bounds.left) / bounds.width()).coerceIn(0f, 1f)
        val ny = ((y - bounds.top) / bounds.height()).coerceIn(0f, 1f)
        val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)
        val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)
        val velocity = estimateVelocity(pressure, contactSize, event.eventTime)

        activePointers.put(pointerId, definition.id)
        onStrike?.invoke(
            DrumStrike(
                pointerId = pointerId,
                instrument = definition.id,
                velocity = velocity,
                normalizedX = nx,
                normalizedY = ny,
                pressure = pressure,
                contactSize = contactSize,
                eventTimeNanos = event.eventTime * 1_000_000L,
            ),
        )
        performInstrumentHaptic(definition.id, velocity)
        invalidate()
    }

    private fun handlePointerUp(pointerId: Int) {
        activePointers.remove(pointerId)
        invalidate()
    }

    private fun estimateVelocity(pressure: Float, contactSize: Float, eventTime: Long): Float {
        val pressureVelocity = if (pressure > 0.02f && pressure != 0.5f) {
            0.24f + pressure.coerceIn(0f, 1.2f) * 0.72f
        } else {
            0.58f + ((eventTime % 23L).toFloat() / 100f)
        }
        return (pressureVelocity + contactSize.coerceIn(0f, 1f) * 0.12f).coerceIn(0.22f, 1f)
    }

    private fun hitTest(x: Float, y: Float): InstrumentDefinition? =
        StudioKitDefinition.instruments.firstOrNull { pixelBounds(it).contains(x, y) }

    private fun pixelBounds(definition: InstrumentDefinition): RectF {
        val bounds = definition.bounds
        return RectF(
            bounds.left * width,
            bounds.top * height,
            bounds.right * width,
            bounds.bottom * height,
        )
    }

    private fun drawStage(canvas: Canvas) {
        stagePaint.shader = LinearGradient(
            0f,
            0f,
            0f,
            height.toFloat(),
            intArrayOf(0xff171d27.toInt(), 0xff090c11.toInt(), 0xff040506.toInt()),
            floatArrayOf(0f, 0.5f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), stagePaint)

        stagePaint.shader = RadialGradient(
            width * 0.5f,
            height * 0.92f,
            width * 0.45f,
            intArrayOf(0x33ee9841, 0x00000000),
            floatArrayOf(0f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(
            width * 0.08f,
            height * 0.72f,
            width * 0.92f,
            height * 1.08f,
            stagePaint,
        )
    }

    private fun drawInstrument(canvas: Canvas, definition: InstrumentDefinition) {
        reusableRect.set(pixelBounds(definition))
        val active = isActive(definition.id)
        val lift = if (active) height * 0.006f else 0f
        reusableRect.offset(0f, -lift)

        canvas.drawOval(
            reusableRect.left + reusableRect.width() * 0.08f,
            reusableRect.bottom - reusableRect.height() * 0.02f,
            reusableRect.right - reusableRect.width() * 0.08f,
            reusableRect.bottom + reusableRect.height() * 0.11f,
            shadowPaint,
        )

        when (definition.shape) {
            InstrumentShape.CYMBAL -> drawCymbal(canvas, reusableRect, active)
            InstrumentShape.DRUM -> drawDrum(canvas, reusableRect, active, definition.id == InstrumentId.SNARE)
            InstrumentShape.KICK -> drawKick(canvas, reusableRect, active)
        }

        canvas.drawText(
            definition.id.label.uppercase(),
            reusableRect.centerX(),
            reusableRect.bottom - reusableRect.height() * 0.05f,
            labelPaint,
        )
    }

    private fun drawCymbal(canvas: Canvas, rect: RectF, active: Boolean) {
        val disc = RectF(rect.left, rect.top + rect.height() * 0.20f, rect.right, rect.bottom - rect.height() * 0.27f)
        cymbalPaint.shader = RadialGradient(
            disc.centerX() - disc.width() * 0.16f,
            disc.centerY() - disc.height() * 0.25f,
            disc.width() * 0.64f,
            intArrayOf(0xfff4dfa0.toInt(), 0xffc38a35.toInt(), 0xff744716.toInt()),
            floatArrayOf(0f, 0.52f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(disc, cymbalPaint)
        rimPaint.color = 0xffe6bd6c.toInt()
        canvas.drawOval(disc, rimPaint)
        canvas.drawCircle(disc.centerX(), disc.centerY(), disc.width() * 0.07f, rimPaint)
        if (active) canvas.drawOval(disc, glowPaint)
    }

    private fun drawDrum(canvas: Canvas, rect: RectF, active: Boolean, snare: Boolean) {
        val shell = RectF(
            rect.left + rect.width() * 0.10f,
            rect.top + rect.height() * 0.23f,
            rect.right - rect.width() * 0.10f,
            rect.bottom - rect.height() * 0.10f,
        )
        shellPaint.shader = LinearGradient(
            shell.left,
            shell.top,
            shell.right,
            shell.bottom,
            if (snare) {
                intArrayOf(0xff24292e.toInt(), 0xffe5e9ec.toInt(), 0xff596169.toInt())
            } else {
                intArrayOf(0xff260507.toInt(), 0xffa52d35.toInt(), 0xff4e090d.toInt())
            },
            null,
            Shader.TileMode.CLAMP,
        )
        canvas.drawRoundRect(shell, shell.width() * 0.18f, shell.height() * 0.15f, shellPaint)

        val head = RectF(rect.left, rect.top, rect.right, rect.top + rect.height() * 0.42f)
        headPaint.shader = RadialGradient(
            head.centerX() - head.width() * 0.12f,
            head.centerY() - head.height() * 0.25f,
            head.width() * 0.58f,
            intArrayOf(0xffffffff.toInt(), 0xffd8d5cf.toInt(), 0xff686c70.toInt()),
            floatArrayOf(0f, 0.67f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(head, headPaint)
        rimPaint.color = 0xffc8ced3.toInt()
        canvas.drawOval(head, rimPaint)
        if (active) canvas.drawOval(head, glowPaint)
    }

    private fun drawKick(canvas: Canvas, rect: RectF, active: Boolean) {
        val shell = RectF(
            rect.left + rect.width() * 0.04f,
            rect.top + rect.height() * 0.12f,
            rect.right - rect.width() * 0.04f,
            rect.bottom - rect.height() * 0.10f,
        )
        shellPaint.shader = RadialGradient(
            shell.centerX() - shell.width() * 0.18f,
            shell.centerY() - shell.height() * 0.22f,
            shell.width() * 0.62f,
            intArrayOf(0xffad3239.toInt(), 0xff4f090d.toInt(), 0xff090b0e.toInt()),
            floatArrayOf(0f, 0.58f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(shell, shellPaint)
        rimPaint.color = 0xffc4cbd0.toInt()
        canvas.drawOval(shell, rimPaint)

        val head = RectF(shell).apply { inset(shell.width() * 0.10f, shell.height() * 0.10f) }
        headPaint.shader = RadialGradient(
            head.centerX() - head.width() * 0.18f,
            head.centerY() - head.height() * 0.18f,
            head.width() * 0.58f,
            intArrayOf(0xff39404a.toInt(), 0xff11151b.toInt(), 0xff050608.toInt()),
            floatArrayOf(0f, 0.62f, 1f),
            Shader.TileMode.CLAMP,
        )
        canvas.drawOval(head, headPaint)
        if (active) canvas.drawOval(shell, glowPaint)
    }

    private fun isActive(id: InstrumentId): Boolean {
        for (index in 0 until activePointers.size()) {
            if (activePointers.valueAt(index) == id) return true
        }
        return false
    }

    private fun performInstrumentHaptic(instrument: InstrumentId, velocity: Float) {
        if (!hapticsEnabled) return
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        if (!vibrator.hasVibrator()) return
        val duration = when (instrument) {
            InstrumentId.KICK -> 12L
            InstrumentId.SNARE,
            InstrumentId.TOM_HIGH,
            InstrumentId.TOM_MID,
            InstrumentId.FLOOR_TOM,
            -> 7L
            else -> 4L
        }
        val amplitude = (60 + velocity * 150).toInt().coerceIn(1, 255)
        vibrator.vibrate(VibrationEffect.createOneShot(duration, amplitude))
    }
}
