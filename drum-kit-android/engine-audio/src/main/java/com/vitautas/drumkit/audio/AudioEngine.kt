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
        val velocity = AudioInputSanitizer.velocity(strike.velocity)
        val normalizedX = AudioInputSanitizer.coordinate(strike.normalizedX)
        val normalizedY = AudioInputSanitizer.coordinate(strike.normalizedY)
        val articulation = StrikeArticulationSelector.resolve(
            strike = strike,
            velocity = velocity,
            normalizedX = normalizedX,
            normalizedY = normalizedY,
        )

        nativeTrigger(
            instrument = strike.instrument.nativeCode,
            articulation = articulation.nativeCode,
            velocity = velocity,
            normalizedX = normalizedX,
            normalizedY = normalizedY,
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
