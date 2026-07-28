package com.vitautas.drumkit.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AudioMixDefaultsTest {
    @Test
    fun defaultsMatchTheVisibleStartupMixer() {
        assertEquals(0.76f, AudioMixDefaults.MASTER_VOLUME, 0f)
        assertEquals(0.32f, AudioMixDefaults.ROOM_MIX, 0f)
        assertTrue(AudioMixDefaults.MASTER_VOLUME.isFinite())
        assertTrue(AudioMixDefaults.ROOM_MIX.isFinite())
        assertTrue(AudioMixDefaults.MASTER_VOLUME in 0f..1f)
        assertTrue(AudioMixDefaults.ROOM_MIX in 0f..1f)
    }

    @Test
    fun startupAppliesMasterBeforeRoom() {
        val applied = mutableListOf<Pair<String, Float>>()

        applyAudioMixDefaults(
            setMasterVolume = { applied += "master" to it },
            setRoomMix = { applied += "room" to it },
        )

        assertEquals(
            listOf(
                "master" to AudioMixDefaults.MASTER_VOLUME,
                "room" to AudioMixDefaults.ROOM_MIX,
            ),
            applied,
        )
    }
}
