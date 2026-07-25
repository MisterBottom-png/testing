package com.vitautas.drumkit.audio

import android.content.Context
import android.content.res.AssetManager
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike

object AudioEngine {
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
            nativeTrigger = { instrument, articulation, velocity, normalizedX, normalizedY ->
                nativeTrigger(instrument, articulation, velocity, normalizedX, normalizedY)
            },
            afterDispatch = { _, _, _, _ -> Unit },
        )
    }

    /**
     * Dispatches audio before constructing the request-side diagnostic decision.
     * Native callback outcomes are intentionally not inferred here.
     */
    fun triggerWithDiagnostics(strike: DrumStrike): AudioDispatchDecision = dispatchAudioFirst(
        strike = strike,
        nativeTrigger = { instrument, articulation, velocity, normalizedX, normalizedY ->
            nativeTrigger(instrument, articulation, velocity, normalizedX, normalizedY)
        },
        afterDispatch = { velocity, normalizedX, normalizedY, articulation ->
            AudioDispatchDecisionFactory.createFromDispatchedValues(
                strike = strike,
                sanitizedVelocity = velocity,
                sanitizedNormalizedX = normalizedX,
                sanitizedNormalizedY = normalizedY,
                articulation = articulation,
            )
        },
    )

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
