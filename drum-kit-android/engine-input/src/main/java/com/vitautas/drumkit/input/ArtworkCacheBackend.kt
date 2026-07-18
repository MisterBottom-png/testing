package com.vitautas.drumkit.input

internal enum class ArtworkCacheBackend {
    BITMAP,
    RENDER_NODE,
}

internal object ArtworkCacheBackendPolicy {
    const val RENDER_NODE_MIN_SDK = 29

    fun select(sdkInt: Int, hardwareAccelerated: Boolean): ArtworkCacheBackend =
        if (sdkInt >= RENDER_NODE_MIN_SDK && hardwareAccelerated) {
            ArtworkCacheBackend.RENDER_NODE
        } else {
            ArtworkCacheBackend.BITMAP
        }
}
