#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/audio"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/audio/GameAudioController.kt" <<'__AD_FILE_3_0__'
package com.vitautas.antimatter.nativegame.audio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.SoundPool
import com.vitautas.antimatter.core.model.EngineEvent
import com.vitautas.antimatter.core.model.GameSettings
import com.vitautas.antimatter.core.model.ProgressLayer
import com.vitautas.antimatter.nativegame.R
import kotlin.math.min

class GameAudioController(private val context: Context) : AutoCloseable {
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val attributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_GAME)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    private val soundPool = SoundPool.Builder()
        .setMaxStreams(5)
        .setAudioAttributes(attributes)
        .build()

    private val tapId = soundPool.load(context, R.raw.sfx_tap, 1)
    private val purchaseId = soundPool.load(context, R.raw.sfx_purchase, 1)
    private val invalidId = soundPool.load(context, R.raw.sfx_invalid, 1)
    private val achievementId = soundPool.load(context, R.raw.sfx_achievement, 1)
    private val prestigeId = soundPool.load(context, R.raw.sfx_prestige, 1)

    private var ambient: MediaPlayer? = null
    private var currentLayer: ProgressLayer? = null
    private var settings = GameSettings()
    private var hasFocus = false
    private var isForeground = false
    private var lastPurchaseSoundAt = 0L

    private val focusListener = AudioManager.OnAudioFocusChangeListener { change ->
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> ambient?.pause()
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> ambient?.setVolume(0.08f, 0.08f)
            AudioManager.AUDIOFOCUS_GAIN -> applyMusicState()
        }
    }

    private val focusRequest: AudioFocusRequest by lazy {
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAudioAttributes(attributes)
            .setOnAudioFocusChangeListener(focusListener)
            .build()
    }

    fun apply(settings: GameSettings, layer: ProgressLayer) {
        this.settings = settings
        if (currentLayer != layer) {
            currentLayer = layer
            rebuildAmbient(layer)
        }
        applyMusicState()
    }

    fun onForeground() {
        isForeground = true
        applyMusicState()
    }

    fun onBackground() {
        isForeground = false
        ambient?.pause()
        abandonFocus()
    }

    fun play(event: EngineEvent) {
        if (!isForeground || !settings.soundEnabled || settings.soundVolume <= 0f) return
        val now = System.currentTimeMillis()
        val soundId = when (event.type) {
            EngineEvent.Type.PURCHASE -> {
                if (now - lastPurchaseSoundAt < 90L) return
                lastPurchaseSoundAt = now
                purchaseId
            }
            EngineEvent.Type.INVALID_ACTION, EngineEvent.Type.ERROR -> invalidId
            EngineEvent.Type.ACHIEVEMENT, EngineEvent.Type.MILESTONE -> achievementId
            EngineEvent.Type.PRESTIGE, EngineEvent.Type.IMPORT -> prestigeId
            EngineEvent.Type.NAVIGATION, EngineEvent.Type.SAVE -> tapId
        }
        val volume = settings.soundVolume.coerceIn(0f, 1f) * when (event.significance) {
            EngineEvent.Significance.LIGHT -> 0.55f
            EngineEvent.Significance.MEDIUM -> 0.78f
            EngineEvent.Significance.HEAVY -> 1f
        }
        soundPool.play(soundId, volume, volume, 1, 0, 1f)
    }

    private fun rebuildAmbient(layer: ProgressLayer) {
        ambient?.release()
        val resource = when (layer) {
            ProgressLayer.ANTIMATTER -> R.raw.ambient_antimatter
            ProgressLayer.INFINITY -> R.raw.ambient_infinity
            ProgressLayer.ETERNITY -> R.raw.ambient_eternity
            ProgressLayer.REALITY, ProgressLayer.CELESTIALS -> R.raw.ambient_reality
        }
        val musicAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
            .build()
        ambient = MediaPlayer.create(context, resource, musicAttributes, 0)?.apply {
            isLooping = true
        }
    }

    private fun applyMusicState() {
        val player = ambient ?: return
        if (!isForeground || !settings.musicEnabled || settings.musicVolume <= 0f) {
            player.pause()
            abandonFocus()
            return
        }
        if (!hasFocus && !requestFocus()) return
        val volume = min(0.65f, settings.musicVolume.coerceIn(0f, 1f))
        player.setVolume(volume, volume)
        if (!player.isPlaying) player.start()
    }

    private fun requestFocus(): Boolean {
        hasFocus = audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        return hasFocus
    }

    private fun abandonFocus() {
        if (!hasFocus) return
        audioManager.abandonAudioFocusRequest(focusRequest)
        hasFocus = false
    }

    override fun close() {
        isForeground = false
        ambient?.release()
        ambient = null
        soundPool.release()
        abandonFocus()
    }
}

__AD_FILE_3_0__

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/data"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/data/GameSettingsRepository.kt" <<'__AD_FILE_3_1__'
package com.vitautas.antimatter.nativegame.data

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.vitautas.antimatter.core.model.GameSettings
import com.vitautas.antimatter.core.model.GraphicsQuality
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

private val Context.gameSettingsDataStore by preferencesDataStore(name = "native_game_settings")

class GameSettingsRepository(private val context: Context) {
    private object Keys {
        val musicEnabled = booleanPreferencesKey("music_enabled")
        val musicVolume = floatPreferencesKey("music_volume")
        val soundEnabled = booleanPreferencesKey("sound_enabled")
        val soundVolume = floatPreferencesKey("sound_volume")
        val hapticsEnabled = booleanPreferencesKey("haptics_enabled")
        val reducedMotion = booleanPreferencesKey("reduced_motion")
        val reducedEffects = booleanPreferencesKey("reduced_effects")
        val graphicsQuality = stringPreferencesKey("graphics_quality")
    }

    val settings: Flow<GameSettings> = context.gameSettingsDataStore.data
        .catch { error ->
            if (error is IOException) emit(androidx.datastore.preferences.core.emptyPreferences()) else throw error
        }
        .map(::toSettings)

    suspend fun update(transform: (GameSettings) -> GameSettings) {
        context.gameSettingsDataStore.edit { preferences ->
            val updated = transform(toSettings(preferences))
            preferences[Keys.musicEnabled] = updated.musicEnabled
            preferences[Keys.musicVolume] = updated.musicVolume.coerceIn(0f, 1f)
            preferences[Keys.soundEnabled] = updated.soundEnabled
            preferences[Keys.soundVolume] = updated.soundVolume.coerceIn(0f, 1f)
            preferences[Keys.hapticsEnabled] = updated.hapticsEnabled
            preferences[Keys.reducedMotion] = updated.reducedMotion
            preferences[Keys.reducedEffects] = updated.reducedEffects
            preferences[Keys.graphicsQuality] = updated.graphicsQuality.name
        }
    }

    private fun toSettings(preferences: Preferences): GameSettings = GameSettings(
        musicEnabled = preferences[Keys.musicEnabled] ?: true,
        musicVolume = preferences[Keys.musicVolume] ?: 0.45f,
        soundEnabled = preferences[Keys.soundEnabled] ?: true,
        soundVolume = preferences[Keys.soundVolume] ?: 0.70f,
        hapticsEnabled = preferences[Keys.hapticsEnabled] ?: true,
        reducedMotion = preferences[Keys.reducedMotion] ?: false,
        reducedEffects = preferences[Keys.reducedEffects] ?: false,
        graphicsQuality = preferences[Keys.graphicsQuality]
            ?.let { value -> runCatching { GraphicsQuality.valueOf(value) }.getOrNull() }
            ?: GraphicsQuality.BALANCED,
    )
}

__AD_FILE_3_1__

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/feedback"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/feedback/HapticController.kt" <<'__AD_FILE_3_2__'
package com.vitautas.antimatter.nativegame.feedback

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.View
import com.vitautas.antimatter.core.model.EngineEvent

class HapticController(private val context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        context.getSystemService(VibratorManager::class.java)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun perform(view: View?, event: EngineEvent, enabled: Boolean) {
        if (!enabled || !systemHapticsEnabled()) return
        when (event.significance) {
            EngineEvent.Significance.LIGHT -> view?.performHapticFeedback(
                if (event.type == EngineEvent.Type.INVALID_ACTION) {
                    HapticFeedbackConstants.REJECT
                } else {
                    HapticFeedbackConstants.KEYBOARD_TAP
                },
            )
            EngineEvent.Significance.MEDIUM -> if (event.type == EngineEvent.Type.ACHIEVEMENT) {
                vibrate(longArrayOf(0, 28, 55, 48), intArrayOf(0, 120, 0, 190))
            } else {
                vibrate(longArrayOf(0, 42), intArrayOf(0, 185))
            }
            EngineEvent.Significance.HEAVY -> vibrate(
                longArrayOf(0, 55, 60, 90, 75, 140),
                intArrayOf(0, 150, 0, 205, 0, 255),
            )
        }
    }

    fun navigation(view: View?, enabled: Boolean) {
        if (enabled && systemHapticsEnabled()) {
            view?.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
        }
    }

    private fun systemHapticsEnabled(): Boolean = runCatching {
        Settings.System.getInt(context.contentResolver, Settings.System.HAPTIC_FEEDBACK_ENABLED, 1) == 1
    }.getOrDefault(true)

    private fun vibrate(timings: LongArray, amplitudes: IntArray) {
        val target = vibrator ?: return
        if (!target.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            target.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
        } else {
            @Suppress("DEPRECATION")
            target.vibrate(timings, -1)
        }
    }
}

__AD_FILE_3_2__
