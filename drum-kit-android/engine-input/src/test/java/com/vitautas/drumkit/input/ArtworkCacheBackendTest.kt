package com.vitautas.drumkit.input

import org.junit.Assert.assertEquals
import org.junit.Test

class ArtworkCacheBackendTest {
    @Test
    fun api29HardwareCanvasUsesStableBitmapCache() {
        assertEquals(
            ArtworkCacheBackend.BITMAP,
            ArtworkCacheBackendPolicy.select(sdkInt = 29, hardwareAccelerated = true),
        )
    }

    @Test
    fun api28UsesBitmapFallback() {
        assertEquals(
            ArtworkCacheBackend.BITMAP,
            ArtworkCacheBackendPolicy.select(sdkInt = 28, hardwareAccelerated = true),
        )
    }

    @Test
    fun softwareCanvasUsesBitmapFallbackOnModernAndroid() {
        assertEquals(
            ArtworkCacheBackend.BITMAP,
            ArtworkCacheBackendPolicy.select(sdkInt = 36, hardwareAccelerated = false),
        )
    }
}
