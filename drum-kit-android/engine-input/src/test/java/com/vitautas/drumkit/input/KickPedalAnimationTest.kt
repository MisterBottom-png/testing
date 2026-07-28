package com.vitautas.drumkit.input

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class KickPedalAnimationTest {
    @Test
    fun pressDepressesBoardAndDrivesBeaterForward() {
        val state = state()

        state.press(nowNanos = 0L, strikeVelocity = 0.8f)
        assertTrue(state.update(25L))

        assertTrue(state.currentFootboardDepression > 0.5f)
        assertTrue(state.currentBeaterTravel > 0.5f)
        assertEquals(1, state.activePointerCount)
    }

    @Test
    fun releaseReturnsFootboardAndBeaterToRest() {
        val state = state()
        state.press(nowNanos = 0L, strikeVelocity = 0.7f)
        state.update(50L)
        state.release(nowNanos = 50L)

        assertTrue(state.update(100L))
        assertTrue(state.currentFootboardDepression in 0f..1f)
        assertTrue(state.currentBeaterTravel in 0f..1f)
        assertFalse(state.update(220L))
        assertEquals(0f, state.currentFootboardDepression, 0.00001f)
        assertEquals(0f, state.currentBeaterTravel, 0.00001f)
    }

    @Test
    fun secondPressRetriggersBeaterWhileBoardIsHeld() {
        val state = state()
        state.press(nowNanos = 0L, strikeVelocity = 0.5f)
        state.update(180L)
        val heldTravel = state.currentBeaterTravel

        state.press(nowNanos = 180L, strikeVelocity = 1f)
        state.update(205L)

        assertEquals(2, state.activePointerCount)
        assertTrue(state.currentBeaterTravel > heldTravel)
        assertEquals(1f, state.velocity, 0.00001f)
    }

    @Test
    fun cancelClearsMechanicalState() {
        val state = state()
        state.press(nowNanos = 0L, strikeVelocity = Float.NaN)
        state.update(30L)

        state.cancel()

        assertFalse(state.update(40L))
        assertEquals(0, state.activePointerCount)
        assertEquals(0f, state.currentImpactFlash, 0.00001f)
    }

    private fun state(): KickPedalAnimationState = KickPedalAnimationState(
        pressDurationNanos = 40L,
        releaseDurationNanos = 100L,
        beaterForwardDurationNanos = 40L,
        beaterReturnDurationNanos = 80L,
        beaterReleaseDurationNanos = 80L,
        flashDurationNanos = 60L,
    )
}
