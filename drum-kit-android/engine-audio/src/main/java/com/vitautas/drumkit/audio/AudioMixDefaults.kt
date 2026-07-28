package com.vitautas.drumkit.audio

internal object AudioMixDefaults {
    const val MASTER_VOLUME = 0.76f
    const val ROOM_MIX = 0.32f
}

internal inline fun applyAudioMixDefaults(
    setMasterVolume: (Float) -> Unit,
    setRoomMix: (Float) -> Unit,
) {
    setMasterVolume(AudioMixDefaults.MASTER_VOLUME)
    setRoomMix(AudioMixDefaults.ROOM_MIX)
}
