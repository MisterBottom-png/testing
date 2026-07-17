package com.vitautas.drumkit.audio

internal object AudioInputSanitizer {
    private const val DefaultVelocity = 0.8f
    private const val DefaultCoordinate = 0.5f

    fun velocity(value: Float): Float = finiteOrDefault(value, DefaultVelocity).coerceIn(0.05f, 1f)

    fun coordinate(value: Float): Float = finiteOrDefault(value, DefaultCoordinate).coerceIn(0f, 1f)

    fun level(value: Float): Float? = if (value.isFinite()) value.coerceIn(0f, 1f) else null

    private fun finiteOrDefault(value: Float, defaultValue: Float): Float =
        if (value.isFinite()) value else defaultValue
}
