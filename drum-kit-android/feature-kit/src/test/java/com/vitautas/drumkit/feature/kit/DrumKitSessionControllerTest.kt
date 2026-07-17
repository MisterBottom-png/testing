package com.vitautas.drumkit.feature.kit

import org.junit.Assert.assertEquals
import org.junit.Test

class DrumKitSessionControllerTest {
    @Test
    fun appStopInvokesTheBoundRecordingFinalizer() {
        val controller = DrumKitSessionController()
        var stopCount = 0
        val handler = { stopCount += 1 }

        controller.bindStopRecordingHandler(handler)
        controller.onAppStopping()

        assertEquals(1, stopCount)
    }

    @Test
    fun unboundHandlerIsNotInvoked() {
        val controller = DrumKitSessionController()
        var stopCount = 0
        val handler = { stopCount += 1 }

        controller.bindStopRecordingHandler(handler)
        controller.unbindStopRecordingHandler(handler)
        controller.onAppStopping()

        assertEquals(0, stopCount)
    }
}
