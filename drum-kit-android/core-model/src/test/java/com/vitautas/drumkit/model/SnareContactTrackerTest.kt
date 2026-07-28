package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Test

class SnareContactTrackerTest {
    @Test
    fun oppositeRimContactsWithinWindowSelectCrossStick() {
        val tracker = SnareContactTracker()
        tracker.resolveAndRecord(1, 0.04f, 0.5f, 0.5f, 1_000L)

        assertEquals(
            SnareArticulation.CROSS_STICK,
            tracker.resolveAndRecord(2, 0.96f, 0.5f, 0.5f, 100_000_000L),
        )
    }

    @Test
    fun expiredOrClearedContactCannotSelectCrossStick() {
        val tracker = SnareContactTracker()
        tracker.resolveAndRecord(1, 0.04f, 0.5f, 0.5f, 1_000L)
        assertEquals(
            SnareArticulation.EDGE,
            tracker.resolveAndRecord(2, 0.96f, 0.5f, 0.5f, 600_000_000L),
        )
        tracker.clear()
        assertEquals(
            SnareArticulation.EDGE,
            tracker.resolveAndRecord(3, 0.96f, 0.5f, 0.5f, 700_000_000L),
        )
    }

    @Test
    fun removingRestingPointerClearsGestureState() {
        val tracker = SnareContactTracker()
        tracker.resolveAndRecord(1, 0.04f, 0.5f, 0.5f, 1_000L)
        tracker.remove(1)

        assertEquals(
            SnareArticulation.EDGE,
            tracker.resolveAndRecord(2, 0.96f, 0.5f, 0.5f, 100_000_000L),
        )
    }
}
