package com.vitautas.drumkit.audio

import android.content.Context
import android.content.res.AssetManager
import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike
import com.vitautas.drumkit.model.InstrumentId
import com.vitautas.drumkit.model.SnareArticulationResolver

object AudioEngine {
    init {
        System.loadLibrary("drumkit")
    }

    fun start(context: Context): Boolean = nativeStart(context.assets)

    fun stop() {
        nativeStop()
    }

    fun trigger(strike: DrumStrike) {
        val articulation = if (strike.instrument == InstrumentId.SNARE) {
            SnareArticulationResolver.resolve(
                normalizedX = strike.normalizedX,
                normalizedY = strike.normalizedY,
                velocity = strike.velocity,
            )
        } else {
            strike.snareArticulation
        }

        nativeTrigger(
            instrument = strike.instrument.nativeCode,
            articulation = articulation.nativeCode,
            velocity = strike.velocity,
            normalizedX = strike.normalizedX,
            normalizedY = strike.normalizedY,
        )
    }

    fun setMasterVolume(value: Float) {
        nativeSetMasterVolume(value.coerceIn(0f, 1f))
    }

    fun setRoomMix(value: Float) {
        nativeSetRoomMix(value.coerceIn(0f, 1f))
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
