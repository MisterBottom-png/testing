package com.vitautas.drumkit.audio

internal object AudioMixDefaults {
    const val MASTER_VOLUME = 0.76f
    const val ROOM_MIX = 0.32f
}

internal class AudioMixState(
    masterVolume: Float = AudioMixDefaults.MASTER_VOLUME,
    roomMix: Float = AudioMixDefaults.ROOM_MIX,
) {
    var masterVolume: Float = masterVolume
        private set
    var roomMix: Float = roomMix
        private set

    fun updateMasterVolume(value: Float) {
        masterVolume = value
    }

    fun updateRoomMix(value: Float) {
        roomMix = value
    }

    fun apply(
        setMasterVolume: (Float) -> Unit,
        setRoomMix: (Float) -> Unit,
    ) {
        setMasterVolume(masterVolume)
        setRoomMix(roomMix)
    }
}
