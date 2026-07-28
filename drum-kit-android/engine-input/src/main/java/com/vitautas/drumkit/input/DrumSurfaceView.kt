package com.vitautas.drumkit.input

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.os.Build
import android.util.AttributeSet
import android.util.SparseArray
import android.util.SparseBooleanArray
import android.util.TypedValue
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.View
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentDefinition
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.InstrumentRenderLayerKind
import com.vitautas.drumkit.model.InstrumentRendererKey
import com.vitautas.drumkit.model.StrikeInputTarget
import com.vitautas.drumkit.model.SnareContactTracker
import com.vitautas.drumkit.model.StudioKitCamera
import com.vitautas.drumkit.model.StudioKitDefinition
import com.vitautas.drumkit.model.StudioKitInputGeometry
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
    private val artworkFactory = LayeredInstrumentArtworkFactory(density)
    private val activePointers = SparseArray<InstrumentId>()
    private val activePedalPointers = SparseBooleanArray()
    private val renderStates = ArrayList<InstrumentRenderState>(StudioKitDefinition.instruments.size)
    private val renderStatesByInstrument = arrayOfNulls<InstrumentRenderState>(InstrumentId.entries.size)
    private val animationStates = Array(InstrumentId.entries.size) { InstrumentAnimationState() }
    private val kickPedalAnimation = KickPedalAnimationState()
    private val kickPedalRenderer = KickPedalRenderer(density)
    private val velocityEstimator = StrikeVelocityEstimator()
    private val snareContactTracker = SnareContactTracker()
    private val kickDefinition = StudioKitDefinition.instruments.first { it.id == InstrumentId.KICK }
    private var rackMountX = 0f
    private var rackMountY = 0f
    private var artworkBackend = ArtworkCacheBackend.BITMAP

    private val stagePaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val spotlightPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x70000000 }
    private val artworkPaint = Paint(
        Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG,
    )
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
    private val floorClipRect = RectF()
    private val scratchRect = RectF()
    private val instrumentOcclusionPath = Path()
    private val surfaceRotationMatrix = Matrix()
    private var labelsVisibleSinceNanos = System.nanoTime()
    private val labelFadeRunnable = Runnable { postInvalidateOnAnimation() }

    init {
        isFocusable = true
        isClickable = true
        contentDescription = "Playable acoustic drum kit with kick pedal"
    }

    override fun onSizeChanged(width: Int, height: Int, oldWidth: Int, oldHeight: Int) {
        super.onSizeChanged(width, height, oldWidth, oldHeight)
        if (width <= 0 || height <= 0) return

        artworkBackend = ArtworkCacheBackendPolicy.select(Build.VERSION.SDK_INT, isHardwareAccelerated)
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
        floorClipRect.set(0f, StudioKitCamera.HORIZON_Y * height, width.toFloat(), height.toFloat())
        kickPedalRenderer.configure(width.toFloat(), height.toFloat())

        val kickBounds = kickDefinition.layout.drawBounds
        rackMountX = kickBounds.centerX * width.toFloat()
        rackMountY = (kickBounds.top + kickBounds.height * 0.14f) * height.toFloat()

        releaseArtworkCaches()
        renderStates.clear()
        renderStatesByInstrument.fill(null)
        instrumentOcclusionPath.reset()
        for (definition in StudioKitDefinition.renderOrder) {
            val state = InstrumentRenderState(definition)
            configureRenderState(state, width.toFloat(), height.toFloat())
            renderStates += state
            renderStatesByInstrument[definition.id.ordinal] = state
            instrumentOcclusionPath.addPath(state.surfaceOcclusionPath)
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
        }

        for (renderState in renderStates) {
            drawInstrumentShadow(canvas, renderState)
        }
        for (renderLayer in StudioKitDefinition.renderLayers) {
            val renderState = renderStatesByInstrument[renderLayer.instrumentId.ordinal] ?: continue
            when (renderLayer.kind) {
                InstrumentRenderLayerKind.SUPPORT -> drawInstrumentSupport(canvas, renderState)
                InstrumentRenderLayerKind.SURFACE -> drawInstrumentSurface(
                    canvas,
                    renderState,
                    animationStates[renderState.definition.id.ordinal],
                )
            }
        }
        if (kickPedalRenderer.draw(canvas, kickPedalAnimation, nowNanos)) {
            animationActive = true
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

    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (width <= 0 || height <= 0) return

        val desiredBackend = ArtworkCacheBackendPolicy.select(Build.VERSION.SDK_INT, isHardwareAccelerated)
        if (desiredBackend != artworkBackend) {
            rebuildArtworkCaches(desiredBackend)
        }
        labelsVisibleSinceNanos = System.nanoTime()
        removeCallbacks(labelFadeRunnable)
        postDelayed(labelFadeRunnable, LabelHoldMillis + 16L)
        postInvalidateOnAnimation()
    }

    override fun onDetachedFromWindow() {
        removeCallbacks(labelFadeRunnable)
        clearActivePointers()
        super.onDetachedFromWindow()
    }

    fun releaseResources() {
        removeCallbacks(labelFadeRunnable)
        clearActivePointers()
        releaseArtworkCaches()
        renderStates.clear()
        renderStatesByInstrument.fill(null)
        instrumentOcclusionPath.reset()
    }

    private fun handlePointerDown(event: MotionEvent, pointerIndex: Int) {
        if (width <= 0 || height <= 0) return

        val x = event.getX(pointerIndex)
        val y = event.getY(pointerIndex)
        val screenX = x / width.toFloat()
        val screenY = y / height.toFloat()
        val aspectRatio = width.toFloat() / height.toFloat()
        val hit = StudioKitInputGeometry.hitTest(screenX, screenY, aspectRatio) ?: return
        val definition = hit.definition
        val pointerId = event.getPointerId(pointerIndex)
        val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)
        val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)
        val velocityEstimate = velocityEstimator.estimate(
            StrikeVelocityInput(
                pressure = pressure,
                contactSize = contactSize,
                x = x,
                y = y,
                eventTimeMillis = event.eventTime,
                history = List(event.historySize) { historyIndex ->
                    StrikeVelocityHistoricalSample(
                        pressure = event.getHistoricalPressure(pointerIndex, historyIndex),
                        contactSize = event.getHistoricalSize(pointerIndex, historyIndex),
                        x = event.getHistoricalX(pointerIndex, historyIndex),
                        y = event.getHistoricalY(pointerIndex, historyIndex),
                        eventTimeMillis = event.getHistoricalEventTime(historyIndex),
                    )
                },
            ),
        )
        val velocity = velocityEstimate.velocity
        val eventTimeNanos = event.eventTime * NanosPerMillisecond
        val requestedArticulation = if (definition.id == InstrumentId.SNARE) {
            snareContactTracker.resolveAndRecord(
                pointerId = pointerId,
                normalizedX = hit.normalizedX,
                normalizedY = hit.normalizedY,
                velocity = velocity,
                eventTimeNanos = eventTimeNanos,
            )
        } else {
            null
        }
        val nowNanos = System.nanoTime()

        onStrike?.invoke(
            DrumStrike(
                pointerId = pointerId,
                instrument = definition.id,
                velocity = velocity,
                normalizedX = hit.normalizedX,
                normalizedY = hit.normalizedY,
                pressure = pressure,
                contactSize = contactSize,
                eventTimeNanos = eventTimeNanos,
                velocitySource = velocityEstimate.source,
                requestedArticulation = requestedArticulation,
            ),
        )

        activePointers.put(pointerId, definition.id)
        if (hit.inputTarget == StrikeInputTarget.KICK_PEDAL) {
            activePedalPointers.put(pointerId, true)
            kickPedalAnimation.press(nowNanos, velocity)
        }
        animationStates[definition.id.ordinal].apply {
            strikeX = hit.normalizedX
            strikeY = hit.normalizedY
            this.velocity = velocity
            startTimeNanos = nowNanos
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
        if (activePedalPointers.get(pointerId)) {
            activePedalPointers.delete(pointerId)
            kickPedalAnimation.release(System.nanoTime())
        }
        activePointers.remove(pointerId)
        snareContactTracker.remove(pointerId)
        postInvalidateOnAnimation()
    }

    private fun clearActivePointers() {
        activePointers.clear()
        activePedalPointers.clear()
        snareContactTracker.clear()
        kickPedalAnimation.cancel()
        for (state in animationStates) {
            state.activePointerCount = 0
        }
        postInvalidateOnAnimation()
    }

    private fun releaseArtworkCaches() {
        for (state in renderStates) {
            state.artwork?.release()
            state.artwork = null
        }
    }

    private fun rebuildArtworkCaches(backend: ArtworkCacheBackend) {
        releaseArtworkCaches()
        artworkBackend = backend
        for (state in renderStates) {
            state.artwork = createArtwork(state)
        }
    }

    private fun createArtwork(state: InstrumentRenderState): InstrumentArtworkCache = artworkFactory.create(
        definition = state.definition,
        bodyRect = state.primaryRect,
        playableRect = state.secondaryRect.takeUnless { it.isEmpty } ?: state.primaryRect,
        backend = artworkBackend,
    )

    private fun configureRenderState(state: InstrumentRenderState, viewWidth: Float, viewHeight: Float) {
        val normalized = state.definition.layout.drawBounds
        val playable = state.definition.layout.playableSurfaceBounds
        val bounds = state.drawBounds
        bounds.set(
            normalized.left * viewWidth,
            normalized.top * viewHeight,
            normalized.right * viewWidth,
            normalized.bottom * viewHeight,
        )
        state.playableRect.set(
            playable.left * viewWidth,
            playable.top * viewHeight,
            playable.right * viewWidth,
            playable.bottom * viewHeight,
        )
        state.labelX = state.definition.layout.labelPosition.x * viewWidth
        state.labelY = state.definition.layout.labelPosition.y * viewHeight

        when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL,
            InstrumentRendererKey.HI_HAT,
            -> {
                state.primaryRect.set(state.playableRect)
                state.shadowRect.set(
                    state.primaryRect.left + state.primaryRect.width() * 0.10f,
                    state.primaryRect.bottom - bounds.height() * 0.02f,
                    state.primaryRect.right - state.primaryRect.width() * 0.10f,
                    state.primaryRect.bottom + bounds.height() * 0.10f,
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
                state.secondaryRect.set(state.playableRect)
                state.shadowRect.set(
                    state.primaryRect.left + state.primaryRect.width() * 0.05f,
                    state.primaryRect.bottom - bounds.height() * 0.02f,
                    state.primaryRect.right - state.primaryRect.width() * 0.05f,
                    state.primaryRect.bottom + bounds.height() * 0.10f,
                )
            }

            InstrumentRendererKey.KICK -> {
                state.primaryRect.set(
                    bounds.left,
                    bounds.top + bounds.height() * 0.06f,
                    bounds.right,
                    bounds.bottom - bounds.height() * 0.04f,
                )
                state.secondaryRect.set(state.playableRect)
                state.shadowRect.set(
                    state.primaryRect.left + state.primaryRect.width() * 0.04f,
                    state.primaryRect.bottom - bounds.height() * 0.03f,
                    state.primaryRect.right - state.primaryRect.width() * 0.04f,
                    state.primaryRect.bottom + bounds.height() * 0.08f,
                )
            }
        }
        configureGroundedShadow(state, viewHeight)
        configureSurfaceOcclusionPath(state)
        state.artwork = createArtwork(state)
    }

    private fun configureGroundedShadow(state: InstrumentRenderState, viewHeight: Float) {
        val source = state.primaryRect
        val widthScale = when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL -> 0.62f
            InstrumentRendererKey.HI_HAT -> 0.52f
            InstrumentRendererKey.DRUM -> 0.78f
            InstrumentRendererKey.SNARE -> 0.76f
            InstrumentRendererKey.KICK -> 0.88f
        }
        val floorY = StudioKitCamera.FLOOR_PLANE_Y * viewHeight
        val shadowWidth = source.width() * widthScale
        val shadowHeight = maxOf(density * 5f, state.drawBounds.height() * 0.055f)
        val centerX = source.centerX()
        state.shadowRect.set(
            centerX - shadowWidth * 0.5f,
            floorY - shadowHeight * 0.72f,
            centerX + shadowWidth * 0.5f,
            floorY + shadowHeight * 0.28f,
        )
    }

    private fun configureSurfaceOcclusionPath(state: InstrumentRenderState) {
        val path = state.surfaceOcclusionPath
        path.reset()
        when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL,
            InstrumentRendererKey.HI_HAT,
            -> path.addOval(state.primaryRect, Path.Direction.CW)

            InstrumentRendererKey.DRUM,
            InstrumentRendererKey.SNARE,
            -> {
                val shell = state.primaryRect
                path.addRoundRect(
                    shell,
                    shell.width() * 0.16f,
                    shell.height() * 0.12f,
                    Path.Direction.CW,
                )
                path.addOval(state.secondaryRect, Path.Direction.CW)
            }

            InstrumentRendererKey.KICK -> {
                path.addOval(state.primaryRect, Path.Direction.CW)
                path.addOval(state.secondaryRect, Path.Direction.CW)
            }
        }

        val rotationDegrees = state.definition.layout.rotationDegrees
        if (rotationDegrees != 0f) {
            val bounds = state.drawBounds
            surfaceRotationMatrix.reset()
            surfaceRotationMatrix.setRotate(rotationDegrees, bounds.centerX(), bounds.centerY())
            path.transform(surfaceRotationMatrix)
        }
    }

    private fun drawInstrumentShadow(canvas: Canvas, state: InstrumentRenderState) {
        val saveCount = canvas.save()
        canvas.clipRect(floorClipRect)
        canvas.clipOutPath(instrumentOcclusionPath)
        val shadow = state.shadowRect
        canvas.rotate(
            state.definition.layout.rotationDegrees * 0.35f,
            shadow.centerX(),
            shadow.centerY(),
        )
        canvas.drawOval(shadow, shadowPaint)
        canvas.restoreToCount(saveCount)
    }

    private fun drawInstrumentSupport(canvas: Canvas, state: InstrumentRenderState) {
        when (state.definition.id) {
            InstrumentId.CRASH,
            InstrumentId.RIDE,
            InstrumentId.HI_HAT,
            -> drawCymbalStand(canvas, state)

            InstrumentId.TOM_HIGH,
            InstrumentId.TOM_MID,
            -> drawRackTomMount(canvas, state)

            InstrumentId.KICK -> drawKickLegs(canvas, state)
            InstrumentId.FLOOR_TOM -> drawFloorTomLegs(canvas, state)
            InstrumentId.SNARE -> drawSnareStand(canvas, state)
        }
    }

    private fun drawCymbalStand(canvas: Canvas, state: InstrumentRenderState) {
        val floorY = state.definition.layout.supportFloorY?.times(height.toFloat()) ?: return
        val disc = state.primaryRect
        val bounds = state.drawBounds
        val centerX = disc.centerX()
        val jointY = floorY - maxOf(bounds.height() * 0.08f, density * 10f)
        val footSpread = bounds.width() * 0.18f

        canvas.drawLine(centerX, disc.centerY(), centerX, jointY, standPaint)
        canvas.drawLine(centerX, jointY, centerX - footSpread, floorY, standPaint)
        canvas.drawLine(centerX, jointY, centerX + footSpread, floorY, standPaint)
    }

    private fun drawRackTomMount(canvas: Canvas, state: InstrumentRenderState) {
        val shell = state.primaryRect
        val startX = if (state.definition.id == InstrumentId.TOM_HIGH) {
            shell.right - shell.width() * 0.22f
        } else {
            shell.left + shell.width() * 0.22f
        }
        val startY = shell.bottom - shell.height() * 0.08f

        canvas.drawLine(startX, startY, rackMountX, rackMountY, hardwarePaint)
        canvas.drawCircle(rackMountX, rackMountY, density * 3f, hardwarePaint)
    }

    private fun drawKickLegs(canvas: Canvas, state: InstrumentRenderState) {
        val floorY = state.definition.layout.supportFloorY?.times(height.toFloat()) ?: return
        val shell = state.primaryRect
        val bounds = state.drawBounds

        canvas.drawLine(
            shell.left + shell.width() * 0.18f,
            shell.bottom - shell.height() * 0.08f,
            bounds.left - bounds.width() * 0.02f,
            floorY,
            standPaint,
        )
        canvas.drawLine(
            shell.right - shell.width() * 0.18f,
            shell.bottom - shell.height() * 0.08f,
            bounds.right + bounds.width() * 0.02f,
            floorY,
            standPaint,
        )
    }

    private fun drawFloorTomLegs(canvas: Canvas, state: InstrumentRenderState) {
        val floorY = state.definition.layout.supportFloorY?.times(height.toFloat()) ?: return
        val shell = state.primaryRect
        val bounds = state.drawBounds

        canvas.drawLine(
            shell.left + shell.width() * 0.16f,
            shell.bottom - shell.height() * 0.12f,
            bounds.left + bounds.width() * 0.04f,
            floorY,
            standPaint,
        )
        canvas.drawLine(
            shell.right - shell.width() * 0.16f,
            shell.bottom - shell.height() * 0.12f,
            bounds.right - bounds.width() * 0.04f,
            floorY,
            standPaint,
        )
    }

    private fun drawSnareStand(canvas: Canvas, state: InstrumentRenderState) {
        val floorY = state.definition.layout.supportFloorY?.times(height.toFloat()) ?: return
        val shell = state.primaryRect
        val bounds = state.drawBounds
        val centerX = shell.centerX()
        val stemTopY = shell.bottom - shell.height() * 0.08f
        val jointY = floorY - (floorY - shell.bottom) * 0.28f
        val footSpread = bounds.width() * 0.18f

        canvas.drawLine(centerX, stemTopY, centerX, jointY, standPaint)
        canvas.drawLine(centerX, jointY, centerX - footSpread, floorY, standPaint)
        canvas.drawLine(centerX, jointY, centerX + footSpread, floorY, standPaint)
    }

    private fun drawInstrumentSurface(
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
        val artwork = state.artwork ?: return
        val head = state.secondaryRect
        artwork.drawBody(canvas, artworkPaint)

        val impactX = head.left + animation.strikeX * head.width()
        val impactY = head.top + animation.strikeY * head.height()
        val headSaveCount = canvas.save()
        if (animation.currentDeformation > 0f) {
            canvas.scale(
                1f + animation.currentDeformation * 0.012f,
                1f - animation.currentDeformation * if (snare) 0.035f else 0.055f,
                impactX,
                impactY,
            )
        }
        artwork.drawPlayable(canvas, artworkPaint)
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
        val artwork = state.artwork ?: return
        val head = state.secondaryRect
        artwork.drawBody(canvas, artworkPaint)

        val impactX = head.left + animation.strikeX * head.width()
        val impactY = head.top + animation.strikeY * head.height()
        val headSaveCount = canvas.save()
        if (animation.currentDeformation > 0f) {
            val scale = 1f - animation.currentDeformation * 0.045f
            canvas.scale(scale, scale, impactX, impactY)
        }
        artwork.drawPlayable(canvas, artworkPaint)
        canvas.restoreToCount(headSaveCount)
        drawFlash(canvas, head, animation)
    }

    private fun drawCymbal(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
        hiHat: Boolean,
    ) {
        val artwork = state.artwork ?: return
        val disc = state.primaryRect
        val bounds = state.drawBounds
        val impactX = disc.left + animation.strikeX * disc.width()
        val impactY = disc.top + animation.strikeY * disc.height()

        artwork.drawBody(canvas, artworkPaint)
        val discSaveCount = canvas.save()
        canvas.rotate(animation.currentRotation, impactX, impactY)
        if (hiHat) {
            canvas.translate(0f, -animation.currentDeformation * bounds.height() * 0.07f)
        }
        artwork.drawPlayable(canvas, artworkPaint)
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
        val playableRect = RectF()
        val primaryRect = RectF()
        val secondaryRect = RectF()
        val shadowRect = RectF()
        val surfaceOcclusionPath = Path()
        val label: String = definition.id.label.uppercase()
        var labelX: Float = 0f
        var labelY: Float = 0f
        var artwork: InstrumentArtworkCache? = null
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
