package com.vitautas.drumkit.audio

import com.vitautas.drumkit.model.AudioDiagnostics
import com.vitautas.drumkit.model.DrumStrike

object AudioEngine {
    init {
        System.loadLibrary("drumkit")
    }

    fun start(): Boolean = nativeStart()

    fun stop() {
        nativeStop()
    }

    fun trigger(strike: DrumStrike) {
        nativeTrigger(
            instrument = strike.instrument.nativeCode,
            velocity = AudioInputSanitizer.velocity(strike.velocity),
            normalizedX = AudioInputSanitizer.coordinate(strike.normalizedX),
            normalizedY = AudioInputSanitizer.coordinate(strike.normalizedY),
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

    private external fun nativeStart(): Boolean
    private external fun nativeStop()
    private external fun nativeTrigger(
        instrument: Int,
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
