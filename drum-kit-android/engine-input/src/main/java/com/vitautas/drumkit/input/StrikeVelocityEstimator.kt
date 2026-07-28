package com.vitautas.drumkit.input

import com.vitautas.drumkit.model.StrikeVelocitySource
import kotlin.math.hypot

/**
 * Deterministically derives strike velocity from input measurements. It deliberately never uses
 * wall-clock time: replaying the same [StrikeVelocityInput] produces the same result.
 */
internal class StrikeVelocityEstimator(
    private val profile: StrikeVelocityProfile = StrikeVelocityProfile.BALANCED,
) {
    private var lastPressure: Float? = null
    private var repeatedPressureCount = 0

    fun estimate(input: StrikeVelocityInput): StrikeVelocityEstimate {
        val pressure = input.pressure.finiteOrNull()?.takeIf { it > MinimumPressure }
        updatePressureReliability(pressure)

        val historicalPressure = historicalPressureVelocity(input)
        val contactSize = contactSizeVelocity(input.contactSize)
        val historicalMotion = historicalMotionVelocity(input)
        val raw = when {
            pressure != null && pressureIsMeaningful(pressure) -> {
                StrikeVelocityEstimate(pressureToVelocity(pressure), StrikeVelocitySource.PRESSURE)
            }

            historicalPressure != null -> historicalPressure
            contactSize != null -> contactSize
            historicalMotion != null -> historicalMotion
            else -> StrikeVelocityEstimate(MediumVelocity, StrikeVelocitySource.DETERMINISTIC_FALLBACK)
        }
        return raw.copy(velocity = applyProfile(raw.velocity).coerceIn(MinimumVelocity, MaximumVelocity))
    }

    private fun updatePressureReliability(pressure: Float?) {
        if (pressure == null || pressure.isDefaultPressure()) {
            lastPressure = null
            repeatedPressureCount = 0
            return
        }
        repeatedPressureCount = if (lastPressure != null && kotlin.math.abs(lastPressure!! - pressure) < PressureChangeThreshold) {
            repeatedPressureCount + 1
        } else {
            1
        }
        lastPressure = pressure
    }

    private fun pressureIsMeaningful(pressure: Float): Boolean =
        !pressure.isDefaultPressure() && repeatedPressureCount < FixedPressureObservationCount

    private fun historicalPressureVelocity(input: StrikeVelocityInput): StrikeVelocityEstimate? {
        val pressures = input.history.mapNotNull { it.pressure.finiteOrNull() }
            .filter { it > MinimumPressure && !it.isDefaultPressure() }
        if (pressures.size < 2) return null
        val maximumPressure = pressures.maxOrNull() ?: return null
        val minimumPressure = pressures.minOrNull() ?: return null
        if (maximumPressure - minimumPressure < PressureChangeThreshold) return null
        return StrikeVelocityEstimate(pressureToVelocity(maximumPressure), StrikeVelocitySource.HISTORY)
    }

    private fun contactSizeVelocity(size: Float): StrikeVelocityEstimate? {
        val validSize = size.finiteOrNull()?.takeIf { it > MinimumContactSize } ?: return null
        val normalized = ((validSize - ContactSizeLow) / (ContactSizeHigh - ContactSizeLow)).coerceIn(0f, 1f)
        return StrikeVelocityEstimate(0.38f + normalized * 0.38f, StrikeVelocitySource.CONTACT_SIZE)
    }

    private fun historicalMotionVelocity(input: StrikeVelocityInput): StrikeVelocityEstimate? {
        val sample = input.history.lastOrNull() ?: return null
        val durationMillis = input.eventTimeMillis - sample.eventTimeMillis
        if (durationMillis !in 1L..MotionHistoryWindowMillis) return null
        val x = input.x.finiteOrNull() ?: return null
        val y = input.y.finiteOrNull() ?: return null
        val historyX = sample.x.finiteOrNull() ?: return null
        val historyY = sample.y.finiteOrNull() ?: return null
        val distancePerMillis = hypot(x - historyX, y - historyY) / durationMillis.toFloat()
        return StrikeVelocityEstimate(
            velocity = (0.40f + distancePerMillis * 0.08f).coerceIn(0.40f, 0.78f),
            source = StrikeVelocitySource.HISTORY,
        )
    }

    private fun pressureToVelocity(pressure: Float): Float =
        0.24f + pressure.coerceIn(0f, 1.2f) * 0.72f

    private fun applyProfile(velocity: Float): Float = when (profile) {
        StrikeVelocityProfile.FIXED -> MediumVelocity
        StrikeVelocityProfile.SOFT -> 0.18f + velocity * 0.72f
        StrikeVelocityProfile.BALANCED -> velocity
        StrikeVelocityProfile.HARD -> 0.08f + velocity * 0.92f
    }

    private fun Float.isDefaultPressure(): Boolean = kotlin.math.abs(this - DefaultPressure) < PressureChangeThreshold
    private fun Float.finiteOrNull(): Float? = takeIf { it.isFinite() }

    private companion object {
        const val MinimumVelocity = 0.22f
        const val MaximumVelocity = 1f
        const val MediumVelocity = 0.62f
        const val MinimumPressure = 0.02f
        const val MinimumContactSize = 0.01f
        const val DefaultPressure = 0.5f
        const val PressureChangeThreshold = 0.015f
        const val FixedPressureObservationCount = 4
        const val ContactSizeLow = 0.05f
        const val ContactSizeHigh = 0.80f
        const val MotionHistoryWindowMillis = 80L
    }
}

internal enum class StrikeVelocityProfile { FIXED, SOFT, BALANCED, HARD }

internal data class StrikeVelocityInput(
    val pressure: Float,
    val contactSize: Float,
    val x: Float,
    val y: Float,
    val eventTimeMillis: Long,
    val history: List<StrikeVelocityHistoricalSample> = emptyList(),
)

internal data class StrikeVelocityHistoricalSample(
    val pressure: Float,
    val contactSize: Float,
    val x: Float,
    val y: Float,
    val eventTimeMillis: Long,
)

internal data class StrikeVelocityEstimate(
    val velocity: Float,
    val source: StrikeVelocitySource,
)
