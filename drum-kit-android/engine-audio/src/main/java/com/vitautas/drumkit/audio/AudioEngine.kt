package com.vitautas.drumkit.audio

import android.content.Context
import android.content.res.AssetManager
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.SnareArticulation

object AudioEngine {
    init {
        System.loadLibrary("drumkit")
    }

    fun start(context: Context): Boolean = nativeStart(context.assets)

    fun stop() {
        nativeStop()
    }

    fun trigger(strike: DrumStrike) {
        triggerWithDiagnostics(strike)
    }

    /**
     * Dispatches audio first, then returns the request-side decision for debug recording.
     * Native callback outcomes are intentionally not inferred here.
     */
    fun triggerWithDiagnostics(strike: DrumStrike): AudioDispatchDecision {
        val decision = AudioDispatchDecisionFactory.create(strike)
        nativeTrigger(
            instrument = decision.instrument.nativeCode,
            articulation = decision.articulation?.nativeCode ?: SnareArticulation.CENTER.nativeCode,
            velocity = decision.sanitizedVelocity,
            normalizedX = decision.sanitizedNormalizedX,
            normalizedY = decision.sanitizedNormalizedY,
        )
        return decision
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

    private external fun nativeStart(assetManager: AssetManager): Boolean
    private external fun nativeStop()
    private external fun nativeTrigger(
        instrument: Int,
        articulation: Int,
        velocity: Float,
        normalizedX: Float,
        normalizedY: Float,
    )
    private external fun nativeSetMasterVolume(value: Float)
    private external fun nativeSetRoomMix(value: Float)
    private external fun nativeIsRunning(): Boolean
    private external fun nativeGetSampleRate(): Int
    private external fun nativeGetFramesPerBurst(): Int
    private external fun nativeGetUnderrunCount(): Int
}
