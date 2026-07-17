package com.vitautas.drumkit.audio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AudioInputSanitizerTest {
    @Test
    fun invalidStrikeValuesUseSafeDefaults() {
        assertEquals(0.8f, AudioInputSanitizer.velocity(Float.NaN), 0f)
        assertEquals(0.5f, AudioInputSanitizer.coordinate(Float.POSITIVE_INFINITY), 0f)
        assertEquals(0.5f, AudioInputSanitizer.coordinate(Float.NEGATIVE_INFINITY), 0f)
    }

    @Test
    fun finiteStrikeValuesAreClamped() {
        assertEquals(1f, AudioInputSanitizer.velocity(2f), 0f)
        assertEquals(0.05f, AudioInputSanitizer.velocity(-2f), 0f)
        assertEquals(1f, AudioInputSanitizer.coordinate(2f), 0f)
        assertEquals(0f, AudioInputSanitizer.coordinate(-2f), 0f)
    }

    @Test
    fun invalidControlLevelsAreIgnored() {
        assertNull(AudioInputSanitizer.level(Float.NaN))
        assertNull(AudioInputSanitizer.level(Float.POSITIVE_INFINITY))
        assertEquals(1f, AudioInputSanitizer.level(2f) ?: Float.NaN, 0f)
        assertEquals(0f, AudioInputSanitizer.level(-2f) ?: Float.NaN, 0f)
    }
}
