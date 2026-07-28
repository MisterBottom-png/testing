from pathlib import Path
from textwrap import dedent

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "drum-kit-android"

estimator = dedent(
    """\
    package com.vitautas.drumkit.input

    import com.vitautas.drumkit.model.StrikeVelocitySource
    import kotlin.math.abs
    import kotlin.math.hypot

    /**
     * Deterministically derives strike velocity from input measurements. Wall-clock time is
     * never used as a pseudo-random input, so replaying the same measurements gives the same
     * result.
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
                    StrikeVelocityEstimate(
                        velocity = pressureToVelocity(pressure),
                        source = StrikeVelocitySource.PRESSURE,
                    )
                }

                historicalPressure != null -> historicalPressure
                contactSize != null -> contactSize
                historicalMotion != null -> historicalMotion
                else -> StrikeVelocityEstimate(
                    velocity = MediumVelocity,
                    source = StrikeVelocitySource.DETERMINISTIC_FALLBACK,
                )
            }
            return raw.copy(
                velocity = applyProfile(raw.velocity).coerceIn(MinimumVelocity, MaximumVelocity),
            )
        }

        private fun updatePressureReliability(pressure: Float?) {
            if (pressure == null || pressure.isDefaultPressure()) {
                lastPressure = null
                repeatedPressureCount = 0
                return
            }
            repeatedPressureCount = if (
                lastPressure != null && abs(lastPressure!! - pressure) < PressureChangeThreshold
            ) {
                repeatedPressureCount + 1
            } else {
                1
            }
            lastPressure = pressure
        }

        private fun pressureIsMeaningful(pressure: Float): Boolean =
            !pressure.isDefaultPressure() && repeatedPressureCount < FixedPressureObservationCount

        private fun historicalPressureVelocity(input: StrikeVelocityInput): StrikeVelocityEstimate? {
            var minimum = Float.POSITIVE_INFINITY
            var maximum = Float.NEGATIVE_INFINITY
            var validCount = 0
            for (sample in input.history) {
                val pressure = sample.pressure.finiteOrNull()
                    ?.takeIf { it > MinimumPressure && !it.isDefaultPressure() }
                    ?: continue
                minimum = minOf(minimum, pressure)
                maximum = maxOf(maximum, pressure)
                validCount += 1
            }
            if (validCount < 2 || maximum - minimum < PressureChangeThreshold) return null
            return StrikeVelocityEstimate(
                velocity = pressureToVelocity(maximum),
                source = StrikeVelocitySource.HISTORY,
            )
        }

        private fun contactSizeVelocity(size: Float): StrikeVelocityEstimate? {
            val validSize = size.finiteOrNull()?.takeIf { it > MinimumContactSize } ?: return null
            val normalized = ((validSize - ContactSizeLow) / (ContactSizeHigh - ContactSizeLow))
                .coerceIn(0f, 1f)
            return StrikeVelocityEstimate(
                velocity = 0.38f + normalized * 0.38f,
                source = StrikeVelocitySource.CONTACT_SIZE,
            )
        }

        private fun historicalMotionVelocity(input: StrikeVelocityInput): StrikeVelocityEstimate? {
            val sample = input.history.lastOrNull() ?: return null
            val durationMillis = input.eventTimeMillis - sample.eventTimeMillis
            if (durationMillis !in 1L..MotionHistoryWindowMillis) return null
            val x = input.x.finiteOrNull() ?: return null
            val y = input.y.finiteOrNull() ?: return null
            val historicalX = sample.x.finiteOrNull() ?: return null
            val historicalY = sample.y.finiteOrNull() ?: return null
            val distancePerMillis = hypot(x - historicalX, y - historicalY) / durationMillis.toFloat()
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

        private fun Float.isDefaultPressure(): Boolean =
            abs(this - DefaultPressure) < PressureChangeThreshold

        private fun Float.finiteOrNull(): Float? = takeIf { it.isFinite() }

        private companion object {
            const val MinimumVelocity = 0.22f
            const val MaximumVelocity = 1f
            const val MediumVelocity = 0.62f
            const val MinimumPressure = 0.02f
            const val MinimumContactSize = 0.001f
            const val DefaultPressure = 0.5f
            const val PressureChangeThreshold = 0.015f
            const val FixedPressureObservationCount = 4
            const val ContactSizeLow = 0.006f
            const val ContactSizeHigh = 0.060f
            const val MotionHistoryWindowMillis = 80L
        }
    }

    internal enum class StrikeVelocityProfile {
        FIXED,
        SOFT,
        BALANCED,
        HARD,
    }

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
    """
)

estimator_path = (
    APP
    / "engine-input/src/main/java/com/vitautas/drumkit/input/StrikeVelocityEstimator.kt"
)
estimator_path.write_text(estimator)

model_path = APP / "core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt"
model = model_path.read_text()
marker = "data class DrumStrike(\n"
enum_block = dedent(
    """\
    enum class StrikeVelocitySource {
        PRESSURE,
        CONTACT_SIZE,
        HISTORY,
        DETERMINISTIC_FALLBACK,
    }

    """
)
if model.count(marker) != 1:
    raise SystemExit("Unexpected DrumStrike marker count")
model = model.replace(marker, enum_block + marker, 1)
field = "    val eventTimeNanos: Long,\n"
replacement = (
    field
    + "    val velocitySource: StrikeVelocitySource = "
    + "StrikeVelocitySource.DETERMINISTIC_FALLBACK,\n"
)
if model.count(field) != 1:
    raise SystemExit("Unexpected eventTimeNanos field count")
model = model.replace(field, replacement, 1)
model_path.write_text(model)

view_path = APP / "engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt"
view = view_path.read_text()
factory_line = "    private val artworkFactory = LayeredInstrumentArtworkFactory(density)\n"
if view.count(factory_line) != 1:
    raise SystemExit("Unexpected artworkFactory marker count")
view = view.replace(
    factory_line,
    factory_line + "    private val velocityEstimator = StrikeVelocityEstimator()\n",
    1,
)
old_velocity = dedent(
    """\
            val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)
            val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)
            val velocity = estimateVelocity(pressure, contactSize, event.eventTime)
            val eventTimeNanos = event.eventTime * NanosPerMillisecond
    """
)
new_velocity = dedent(
    """\
            val pressure = event.getPressure(pointerIndex).coerceAtLeast(0f)
            val contactSize = event.getSize(pointerIndex).coerceAtLeast(0f)
            val velocityEstimate = velocityEstimator.estimate(
                StrikeVelocityInput(
                    pressure = pressure,
                    contactSize = contactSize,
                    x = x,
                    y = y,
                    eventTimeMillis = event.eventTime,
                    history = List(event.historySize) { historyIndex ->
                        StrikeVelocityHistoricalSample(
                            pressure = event.getHistoricalPressure(pointerIndex, historyIndex),
                            contactSize = event.getHistoricalSize(pointerIndex, historyIndex),
                            x = event.getHistoricalX(pointerIndex, historyIndex),
                            y = event.getHistoricalY(pointerIndex, historyIndex),
                            eventTimeMillis = event.getHistoricalEventTime(historyIndex),
                        )
                    },
                ),
            )
            val velocity = velocityEstimate.velocity
            val eventTimeNanos = event.eventTime * NanosPerMillisecond
    """
)
if view.count(old_velocity) != 1:
    raise SystemExit("Unexpected old velocity block count")
view = view.replace(old_velocity, new_velocity, 1)
strike_field = "                eventTimeNanos = eventTimeNanos,\n"
if view.count(strike_field) != 1:
    raise SystemExit("Unexpected strike event time field count")
view = view.replace(
    strike_field,
    strike_field + "                velocitySource = velocityEstimate.source,\n",
    1,
)
old_method = dedent(
    """\
        private fun estimateVelocity(pressure: Float, contactSize: Float, eventTime: Long): Float {
            val pressureVelocity = if (pressure > 0.02f && pressure != 0.5f) {
                0.24f + pressure.coerceIn(0f, 1.2f) * 0.72f
            } else {
                0.58f + ((eventTime % 23L).toFloat() / 100f)
            }
            return (pressureVelocity + contactSize.coerceIn(0f, 1f) * 0.12f).coerceIn(0.22f, 1f)
        }

    """
)
if view.count(old_method) != 1:
    raise SystemExit("Unexpected timestamp estimator method count")
view = view.replace(old_method, "", 1)
view_path.write_text(view)
