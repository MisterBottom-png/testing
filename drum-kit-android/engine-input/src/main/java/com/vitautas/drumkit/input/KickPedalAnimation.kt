package com.vitautas.drumkit.input

private const val DefaultPressDurationNanos = 45_000_000L
private const val DefaultReleaseDurationNanos = 160_000_000L
private const val DefaultBeaterForwardDurationNanos = 42_000_000L
private const val DefaultBeaterReturnDurationNanos = 110_000_000L
private const val DefaultBeaterReleaseDurationNanos = 95_000_000L
private const val DefaultFlashDurationNanos = 90_000_000L

internal class KickPedalAnimationState(
    private val pressDurationNanos: Long = DefaultPressDurationNanos,
    private val releaseDurationNanos: Long = DefaultReleaseDurationNanos,
    private val beaterForwardDurationNanos: Long = DefaultBeaterForwardDurationNanos,
    private val beaterReturnDurationNanos: Long = DefaultBeaterReturnDurationNanos,
    private val beaterReleaseDurationNanos: Long = DefaultBeaterReleaseDurationNanos,
    private val flashDurationNanos: Long = DefaultFlashDurationNanos,
) {
    init {
        require(pressDurationNanos > 0L)
        require(releaseDurationNanos > 0L)
        require(beaterForwardDurationNanos > 0L)
        require(beaterReturnDurationNanos > 0L)
        require(beaterReleaseDurationNanos > 0L)
        require(flashDurationNanos > 0L)
    }

    var activePointerCount: Int = 0
        private set
    var velocity: Float = 0f
        private set
    var currentFootboardDepression: Float = 0f
        private set
    var currentBeaterTravel: Float = 0f
        private set
    var currentImpactFlash: Float = 0f
        private set

    private var pressStartedAtNanos: Long = 0L
    private var pressFromDepression: Float = 0f
    private var releaseStartedAtNanos: Long = 0L
    private var releaseFromDepression: Float = 0f
    private var lastStrikeAtNanos: Long = 0L
    private var beaterReleaseStartedAtNanos: Long = 0L
    private var beaterReleaseFrom: Float = 0f

    fun press(nowNanos: Long, strikeVelocity: Float) {
        update(nowNanos)
        val firstActivePointer = activePointerCount == 0
        activePointerCount += 1
        velocity = strikeVelocity.finiteOr(0.7f).coerceIn(0.05f, 1f)
        if (firstActivePointer) {
            pressFromDepression = currentFootboardDepression
            pressStartedAtNanos = nowNanos
            releaseStartedAtNanos = 0L
        }
        lastStrikeAtNanos = nowNanos
        beaterReleaseStartedAtNanos = 0L
    }

    fun release(nowNanos: Long) {
        if (activePointerCount <= 0) return
        update(nowNanos)
        activePointerCount -= 1
        if (activePointerCount == 0) {
            releaseFromDepression = currentFootboardDepression
            releaseStartedAtNanos = nowNanos
            beaterReleaseFrom = currentBeaterTravel
            beaterReleaseStartedAtNanos = nowNanos
        }
    }

    fun cancel() {
        activePointerCount = 0
        velocity = 0f
        currentFootboardDepression = 0f
        currentBeaterTravel = 0f
        currentImpactFlash = 0f
        pressStartedAtNanos = 0L
        pressFromDepression = 0f
        releaseStartedAtNanos = 0L
        releaseFromDepression = 0f
        lastStrikeAtNanos = 0L
        beaterReleaseStartedAtNanos = 0L
        beaterReleaseFrom = 0f
    }

    fun update(nowNanos: Long): Boolean {
        currentFootboardDepression = footboardDepression(nowNanos)
        currentBeaterTravel = beaterTravel(nowNanos)
        currentImpactFlash = impactFlash(nowNanos)
        return activePointerCount > 0 ||
            currentFootboardDepression > 0.0001f ||
            currentBeaterTravel > 0.0001f ||
            currentImpactFlash > 0.0001f
    }

    private fun footboardDepression(nowNanos: Long): Float = if (activePointerCount > 0) {
        val progress = progress(nowNanos - pressStartedAtNanos, pressDurationNanos)
        lerp(pressFromDepression, 1f, easeOutCubic(progress))
    } else if (releaseStartedAtNanos > 0L) {
        val progress = progress(nowNanos - releaseStartedAtNanos, releaseDurationNanos)
        if (progress >= 1f) {
            releaseStartedAtNanos = 0L
            releaseFromDepression = 0f
            0f
        } else {
            releaseFromDepression * (1f - easeOutCubic(progress))
        }
    } else {
        0f
    }

    private fun beaterTravel(nowNanos: Long): Float {
        if (activePointerCount == 0 && beaterReleaseStartedAtNanos > 0L) {
            val progress = progress(nowNanos - beaterReleaseStartedAtNanos, beaterReleaseDurationNanos)
            if (progress >= 1f) {
                beaterReleaseStartedAtNanos = 0L
                beaterReleaseFrom = 0f
                return 0f
            }
            return beaterReleaseFrom * (1f - easeOutCubic(progress))
        }
        if (lastStrikeAtNanos == 0L) return 0f

        val elapsed = (nowNanos - lastStrikeAtNanos).coerceAtLeast(0L)
        if (elapsed <= beaterForwardDurationNanos) {
            return easeOutCubic(progress(elapsed, beaterForwardDurationNanos))
        }

        val returnElapsed = elapsed - beaterForwardDurationNanos
        val heldPosition = if (activePointerCount > 0) 0.68f else 0f
        if (returnElapsed <= beaterReturnDurationNanos) {
            return lerp(
                1f,
                heldPosition,
                easeInOutCubic(progress(returnElapsed, beaterReturnDurationNanos)),
            )
        }
        return heldPosition
    }

    private fun impactFlash(nowNanos: Long): Float {
        if (lastStrikeAtNanos == 0L) return 0f
        val progress = progress(nowNanos - lastStrikeAtNanos, flashDurationNanos)
        return velocity * (1f - progress)
    }

    private fun progress(elapsedNanos: Long, durationNanos: Long): Float =
        (elapsedNanos.toFloat() / durationNanos.toFloat()).coerceIn(0f, 1f)

    private fun easeOutCubic(value: Float): Float {
        val inverse = 1f - value
        return 1f - inverse * inverse * inverse
    }

    private fun easeInOutCubic(value: Float): Float = if (value < 0.5f) {
        4f * value * value * value
    } else {
        val shifted = -2f * value + 2f
        1f - shifted * shifted * shifted / 2f
    }

    private fun lerp(start: Float, end: Float, amount: Float): Float = start + (end - start) * amount

    private fun Float.finiteOr(defaultValue: Float): Float = if (isFinite()) this else defaultValue
}
