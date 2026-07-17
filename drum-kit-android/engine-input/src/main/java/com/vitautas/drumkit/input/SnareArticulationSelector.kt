package com.vitautas.drumkit.input

import com.vitautas.drumkit.model.SnareArticulation
import kotlin.math.hypot

object SnareArticulationSelector {
    private const val HeadCenterX = 0.5f
    private const val HeadCenterY = 0.21f
    private const val HeadRadiusX = 0.5f
    private const val HeadRadiusY = 0.21f

    fun select(
        normalizedX: Float,
        normalizedY: Float,
        velocity: Float,
    ): SnareArticulation {
        val x = normalizedX.coerceIn(0f, 1f)
        val y = normalizedY.coerceIn(0f, 1f)
        val strikeVelocity = velocity.coerceIn(0f, 1f)

        val crossStickBand = y in 0.40f..0.72f && x in 0.12f..0.88f
        if (crossStickBand) return SnareArticulation.CROSS_STICK

        val radialDistance = hypot(
            (x - HeadCenterX) / HeadRadiusX,
            (y - HeadCenterY) / HeadRadiusY,
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
}
