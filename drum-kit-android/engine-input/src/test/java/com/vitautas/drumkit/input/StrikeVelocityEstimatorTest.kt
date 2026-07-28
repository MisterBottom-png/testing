package com.vitautas.drumkit.input

import com.vitautas.drumkit.model.StrikeVelocitySource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class StrikeVelocityEstimatorTest {
    @Test
    fun fixedPressureFallsBackDeterministically() {
        val estimator = StrikeVelocityEstimator()
        val input = input(pressure = 0.5f, contactSize = 0f, eventTimeMillis = 100L)

        val first = estimator.estimate(input)
        val replay = estimator.estimate(input.copy(eventTimeMillis = 9_999L))

        assertEquals(StrikeVelocitySource.DETERMINISTIC_FALLBACK, first.source)
        assertEquals(first, replay)
    }

    @Test
    fun changingPressureIsMonotonic() {
        val estimator = StrikeVelocityEstimator()
        val soft = estimator.estimate(input(pressure = 0.20f))
        val hard = estimator.estimate(input(pressure = 0.90f))

        assertEquals(StrikeVelocitySource.PRESSURE, soft.source)
        assertEquals(StrikeVelocitySource.PRESSURE, hard.source)
        assertTrue(hard.velocity > soft.velocity)
    }

    @Test
    fun invalidMeasurementsNeverProduceInvalidVelocity() {
        val estimate = StrikeVelocityEstimator().estimate(
            input(
                pressure = Float.NaN,
                contactSize = Float.POSITIVE_INFINITY,
                x = Float.NaN,
                y = Float.NaN,
            ),
        )

        assertEquals(StrikeVelocitySource.DETERMINISTIC_FALLBACK, estimate.source)
        assertTrue(estimate.velocity.isFinite())
        assertTrue(estimate.velocity in 0.22f..1f)
    }

    @Test
    fun contactSizeIsRestrainedAtBothExtremes() {
        val estimator = StrikeVelocityEstimator()
        val tiny = estimator.estimate(input(pressure = 0.5f, contactSize = 0.001f))
        val huge = estimator.estimate(input(pressure = 0.5f, contactSize = 9f))

        assertEquals(StrikeVelocitySource.DETERMINISTIC_FALLBACK, tiny.source)
        assertEquals(StrikeVelocitySource.CONTACT_SIZE, huge.source)
        assertTrue(huge.velocity in 0.22f..1f)
    }

    @Test
    fun varyingHistoricalPressureIsUsedWhenCurrentPressureIsFixed() {
        val estimate = StrikeVelocityEstimator().estimate(
            input(
                pressure = 0.5f,
                contactSize = 0f,
                history = listOf(
                    sample(pressure = 0.20f, eventTimeMillis = 80L),
                    sample(pressure = 0.75f, eventTimeMillis = 90L),
                ),
            ),
        )

        assertEquals(StrikeVelocitySource.HISTORY, estimate.source)
        assertTrue(estimate.velocity > 0.7f)
    }

    @Test
    fun historicalMovementProvidesDeterministicFallbackSignal() {
        val input = input(
            pressure = 0.5f,
            contactSize = 0f,
            x = 40f,
            y = 20f,
            eventTimeMillis = 100L,
            history = listOf(
                sample(pressure = 0.5f, x = 2f, y = 1f, eventTimeMillis = 60L),
            ),
        )

        val first = StrikeVelocityEstimator().estimate(input)
        val replay = StrikeVelocityEstimator().estimate(input)

        assertEquals(StrikeVelocitySource.HISTORY, first.source)
        assertEquals(first, replay)
    }

    private fun input(
        pressure: Float = 0.5f,
        contactSize: Float = 0f,
        x: Float = 0f,
        y: Float = 0f,
        eventTimeMillis: Long = 100L,
        history: List<StrikeVelocityHistoricalSample> = emptyList(),
    ) = StrikeVelocityInput(pressure, contactSize, x, y, eventTimeMillis, history)

    private fun sample(
        pressure: Float,
        x: Float = 0f,
        y: Float = 0f,
        eventTimeMillis: Long,
    ) = StrikeVelocityHistoricalSample(pressure, 0f, x, y, eventTimeMillis)
}
