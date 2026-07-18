package com.vitautas.drumkit.model

import kotlin.math.sqrt

/**
 * Maps playable-surface-local snare coordinates to the initial five-articulation bank.
 *
 * Coordinates use the same stable [0, 1] head-local contract as rendering and audio.
 * Cross-stick remains a deliberate lower-head gesture until continuous stick-angle or
 * an explicit articulation control exists.
 */
object SnareArticulationResolver {
    private const val HeadCenter = 0.5f
    private const val HeadRadius = 0.5f

    fun resolve(
        normalizedX: Float,
        normalizedY: Float,
        velocity: Float,
    ): SnareArticulation {
        val x = normalizedX.finiteOr(HeadCenter).coerceIn(0f, 1f)
        val y = normalizedY.finiteOr(HeadCenter).coerceIn(0f, 1f)
        val strikeVelocity = velocity.finiteOr(0.5f).coerceIn(0f, 1f)

        if (y in 0.72f..0.92f && x in 0.16f..0.84f) {
            return SnareArticulation.CROSS_STICK
        }

        val normalizedDx = (x - HeadCenter) / HeadRadius
        val normalizedDy = (y - HeadCenter) / HeadRadius
        val radialDistance = sqrt(
            normalizedDx * normalizedDx + normalizedDy * normalizedDy,
        )

        if (radialDistance >= 0.88f) {
            return if (strikeVelocity >= 0.48f) {
                SnareArticulation.RIMSHOT
            } else {
                SnareArticulation.CROSS_STICK
            }
        }

        return when {
            radialDistance < 0.32f -> SnareArticulation.CENTER
            radialDistance < 0.68f -> SnareArticulation.OFF_CENTER
            else -> SnareArticulation.EDGE
        }
    }

    private fun Float.finiteOr(fallback: Float): Float = if (isFinite()) this else fallback
}
