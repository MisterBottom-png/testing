package com.vitautas.drumkit.audio

import android.content.Context
import android.content.res.AssetManager
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import java.util.concurrent.atomic.AtomicLong

object AudioEngine {
    private const val NativeDispatchDrainBatchSize = 64
    private const val MaxNativeDispatchDrainBatches = 8

    private val diagnosticTokenCounter = AtomicLong(1L)
    private val diagnosticTokenBuffer = LongArray(NativeDispatchDrainBatchSize)
    private val diagnosticIntegerBuffer = IntArray(
        NativeDispatchDrainBatchSize * NATIVE_DISPATCH_OUTCOME_INT_FIELD_COUNT,
    )
    private val diagnosticFloatBuffer = FloatArray(
        NativeDispatchDrainBatchSize * NATIVE_DISPATCH_OUTCOME_FLOAT_FIELD_COUNT,
    )

    init {
        System.loadLibrary("drumkit")
    }

    fun start(context: Context): Boolean = nativeStart(context.assets)

    fun stop() {
        nativeStop()
    }

    fun trigger(strike: DrumStrike) {
        dispatchAudioFirst(
            strike = strike,
            nativeTrigger = { instrument, articulation, velocity, normalizedX, normalizedY, diagnosticToken ->
                nativeTrigger(
                    instrument,
                    articulation,
                    velocity,
                    normalizedX,
                    normalizedY,
                    diagnosticToken,
                )
            },
            afterDispatch = { _, _, _, _, _, _ -> Unit },
        )
    }

    /**
     * Dispatches audio before constructing the request-side diagnostic decision.
     * Native callback outcomes are drained separately and never call into Kotlin.
     */
    fun triggerWithDiagnostics(strike: DrumStrike): AudioDispatchDecision {
        val diagnosticToken = nextDiagnosticToken()
        return dispatchAudioFirst(
            strike = strike,
            diagnosticToken = diagnosticToken,
            nativeTrigger = { instrument, articulation, velocity, normalizedX, normalizedY, token ->
                nativeTrigger(
                    instrument,
                    articulation,
                    velocity,
                    normalizedX,
                    normalizedY,
                    token,
                )
            },
            afterDispatch = { velocity, normalizedX, normalizedY, articulation, queueState, token ->
                AudioDispatchDecisionFactory.createFromDispatchedValues(
                    strike = strike,
                    sanitizedVelocity = velocity,
                    sanitizedNormalizedX = normalizedX,
                    sanitizedNormalizedY = normalizedY,
                    articulation = articulation,
                    diagnosticToken = token,
                    queueState = queueState,
                )
            },
        )
    }

    @Synchronized
    fun drainDiagnosticDispatchOutcomes(): NativeDispatchOutcomeBatch {
        val outcomes = ArrayList<NativeDispatchOutcome>(NativeDispatchDrainBatchSize)
        var batch = 0
        while (batch < MaxNativeDispatchDrainBatches) {
            val count = nativeDrainDiagnosticDispatchOutcomes(
                diagnosticTokenBuffer,
                diagnosticIntegerBuffer,
                diagnosticFloatBuffer,
            )
            check(count in 0..NativeDispatchDrainBatchSize) {
                "native diagnostic outcome count is invalid: $count"
            }
            NativeDispatchOutcomeDecoder.appendDecoded(
                tokens = diagnosticTokenBuffer,
                integers = diagnosticIntegerBuffer,
                floats = diagnosticFloatBuffer,
                count = count,
                destination = outcomes,
            )
            if (count < NativeDispatchDrainBatchSize) break
            batch += 1
        }
        return NativeDispatchOutcomeBatch(
            outcomes = outcomes,
            droppedOutcomeCount = nativeGetDroppedDiagnosticOutcomeCount().coerceAtLeast(0),
        )
    }

    fun setMasterVolume(value: Float) {
        AudioInputSanitizer.level(value)?.let(::nativeSetMasterVolume)
    }

    fun setRoomMix(value: Float) {
        AudioInputSanitizer.level(value)?.let(::nativeSetRoomMix)
    }

    fun diagnostics(): AudioDiagnostics = AudioDiagnostics(
        running = nativeIsRunning(),
        sampleRate = nativeGetSampleRate(),
        framesPerBurst = nativeGetFramesPerBurst(),
        underruns = nativeGetUnderrunCount(),
    )

    private fun nextDiagnosticToken(): Long {
        while (true) {
            val current = diagnosticTokenCounter.get().coerceAtLeast(1L)
            val next = if (current == Long.MAX_VALUE) 1L else current + 1L
            if (diagnosticTokenCounter.compareAndSet(current, next)) return current
        }
    }

    private external fun nativeStart(assetManager: AssetManager): Boolean
    private external fun nativeStop()
    private external fun nativeTrigger(
        instrument: Int,
        articulation: Int,
        velocity: Float,
        normalizedX: Float,
        normalizedY: Float,
        diagnosticToken: Long,
    ): Int
    private external fun nativeDrainDiagnosticDispatchOutcomes(
        tokens: LongArray,
        integers: IntArray,
        floats: FloatArray,
    ): Int
    private external fun nativeGetDroppedDiagnosticOutcomeCount(): Int
    private external fun nativeSetMasterVolume(value: Float)
    private external fun nativeSetRoomMix(value: Float)
    private external fun nativeIsRunning(): Boolean
    private external fun nativeGetSampleRate(): Int
    private external fun nativeGetFramesPerBurst(): Int
    private external fun nativeGetUnderrunCount(): Int
}
