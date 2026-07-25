package com.vitautas.drumkit.feature.kit

class DrumKitSessionController {
    private var stopRecordingHandler: (() -> Unit)? = null

    fun onAppStopping() {
        stopRecordingHandler?.invoke()
    }

    internal fun bindStopRecordingHandler(handler: () -> Unit) {
        stopRecordingHandler = handler
    }

    internal fun unbindStopRecordingHandler(handler: () -> Unit) {
        if (stopRecordingHandler === handler) {
            stopRecordingHandler = null
        }
    }
}
