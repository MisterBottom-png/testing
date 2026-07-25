package com.vitautas.drumkit.model

import kotlin.math.sqrt

/** Maps stable snare-head coordinates and deliberate held contacts to the sample bank. */
object SnareArticulationResolver {
    private const val HeadCenter = 0.5f
    private const val HeadRadius = 0.5f
    private const val EdgeRadius = 0.68f
    private const val RimRadius = 0.88f
    private const val RimshotRadius = 0.91f
    private const val RimshotVelocity = 0.62f
    private const val OppositeRimDotProduct = -0.25f

    fun resolve(
        normalizedX: Float,
        normalizedY: Float,
        velocity: Float,
        restingContacts: Collection<SnareContact> = emptyList(),
    ): SnareArticulation {
        val x = normalizedX.finiteOr(HeadCenter).coerceIn(0f, 1f)
        val y = normalizedY.finiteOr(HeadCenter).coerceIn(0f, 1f)
        val strikeVelocity = velocity.finiteOr(0.5f).coerceIn(0f, 1f)
        val radialDistance = radialDistance(x, y)

        if (radialDistance >= RimRadius && restingContacts.any { contact ->
                isOppositeRimContact(x, y, contact)
            }
        ) {
            return SnareArticulation.CROSS_STICK
        }
        if (radialDistance >= RimshotRadius && strikeVelocity >= RimshotVelocity) {
            return SnareArticulation.RIMSHOT
        }
        return when {
            radialDistance < 0.32f -> SnareArticulation.CENTER
            radialDistance < EdgeRadius -> SnareArticulation.OFF_CENTER
            else -> SnareArticulation.EDGE
        }
    }

    private fun isOppositeRimContact(x: Float, y: Float, contact: SnareContact): Boolean {
        val contactX = contact.normalizedX.finiteOr(HeadCenter).coerceIn(0f, 1f)
        val contactY = contact.normalizedY.finiteOr(HeadCenter).coerceIn(0f, 1f)
        if (radialDistance(contactX, contactY) < RimRadius) return false
        val strikeDx = x - HeadCenter
        val strikeDy = y - HeadCenter
        val contactDx = contactX - HeadCenter
        val contactDy = contactY - HeadCenter
        val magnitude = sqrt(
            (strikeDx * strikeDx + strikeDy * strikeDy) *
                (contactDx * contactDx + contactDy * contactDy),
        )
        return magnitude > 0f && (strikeDx * contactDx + strikeDy * contactDy) / magnitude <= OppositeRimDotProduct
    }

    private fun radialDistance(x: Float, y: Float): Float {
        val normalizedDx = (x - HeadCenter) / HeadRadius
        val normalizedDy = (y - HeadCenter) / HeadRadius
        return sqrt(normalizedDx * normalizedDx + normalizedDy * normalizedDy)
    }

    private fun Float.finiteOr(fallback: Float): Float = if (isFinite()) this else fallback
}
