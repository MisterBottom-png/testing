package com.vitautas.drumkit

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import com.vitautas.drumkit.audio.AudioEngine

private const val AudioRetryDelayMillis = 750L

internal class AudioSessionController(
    context: Context,
    private val onAvailabilityChanged: (Boolean) -> Unit,
) {
    private val audioManager = context.getSystemService(AudioManager::class.java)
    private val mainHandler = Handler(Looper.getMainLooper())
    private val retryRunnable = Runnable {
        if (!started) return@Runnable
        if (focusGranted) {
            startEngineOrRetry()
        } else if (!focusRequested) {
            requestFocus()
        }
    }
    private val focusChangeListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
        when (focusChange) {
            AudioManager.AUDIOFOCUS_GAIN -> {
                focusRequested = true
                focusGranted = true
                startEngineOrRetry()
            }

            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK,
            -> pauseForFocusLoss(permanent = false)

            AudioManager.AUDIOFOCUS_LOSS -> pauseForFocusLoss(permanent = true)
        }
    }
    private val focusRequest = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
        .setAudioAttributes(
            AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_GAME)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build(),
        )
        .setAcceptsDelayedFocusGain(true)
        .setWillPauseWhenDucked(true)
        .setOnAudioFocusChangeListener(focusChangeListener, mainHandler)
        .build()

    private var started = false
    private var focusRequested = false
    private var focusGranted = false

    fun start() {
        if (started) return
        started = true
        requestFocus()
    }

    fun stop() {
        started = false
        focusGranted = false
        mainHandler.removeCallbacks(retryRunnable)
        AudioEngine.stop()
        if (focusRequested) {
            audioManager.abandonAudioFocusRequest(focusRequest)
            focusRequested = false
        }
    }

    private fun requestFocus() {
        if (!started) return
        mainHandler.removeCallbacks(retryRunnable)
        when (audioManager.requestAudioFocus(focusRequest)) {
            AudioManager.AUDIOFOCUS_REQUEST_GRANTED -> {
                focusRequested = true
                focusGranted = true
                startEngineOrRetry()
            }

            AudioManager.AUDIOFOCUS_REQUEST_DELAYED -> {
                focusRequested = true
                focusGranted = false
                onAvailabilityChanged(false)
            }

            else -> {
                focusRequested = false
                focusGranted = false
                onAvailabilityChanged(false)
                scheduleRetry()
            }
        }
    }

    private fun startEngineOrRetry() {
        if (!started || !focusGranted) return
        mainHandler.removeCallbacks(retryRunnable)
        val available = AudioEngine.start()
        onAvailabilityChanged(available)
        if (!available) scheduleRetry()
    }

    private fun pauseForFocusLoss(permanent: Boolean) {
        focusGranted = false
        if (permanent) focusRequested = false
        mainHandler.removeCallbacks(retryRunnable)
        AudioEngine.stop()
        onAvailabilityChanged(false)
    }

    private fun scheduleRetry() {
        if (started) mainHandler.postDelayed(retryRunnable, AudioRetryDelayMillis)
    }
}
