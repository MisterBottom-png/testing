package com.vitautas.drumkit

import android.app.ActivityManager
import android.content.Context
import android.content.res.Configuration
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.view.WindowManager
import com.vitautas.drumkit.model.AudioDiagnostics

internal object DiagnosticMetadataFactory {
    fun create(
        context: Context,
        diagnostics: AudioDiagnostics,
        masterVolume: Float,
        roomLevel: Float,
    ): DiagnosticSessionMetadata {
        val windowManager = context.getSystemService(WindowManager::class.java)
        val bounds = windowManager.currentWindowMetrics.bounds
        val displayMetrics = context.resources.displayMetrics
        val refreshRate = context.display?.refreshRate ?: 0f
        val orientation = when (context.resources.configuration.orientation) {
            Configuration.ORIENTATION_LANDSCAPE -> "landscape"
            Configuration.ORIENTATION_PORTRAIT -> "portrait"
            else -> "undefined"
        }
        val memoryInfo = ActivityManager.MemoryInfo()
        context.getSystemService(ActivityManager::class.java).getMemoryInfo(memoryInfo)
        return DiagnosticSessionMetadata(
            applicationVersion = BuildConfig.VERSION_NAME,
            gitCommitSha = BuildConfig.GIT_COMMIT_SHA,
            buildType = BuildConfig.BUILD_TYPE,
            deviceManufacturer = Build.MANUFACTURER,
            deviceModel = Build.MODEL,
            androidVersion = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            screenWidthPx = bounds.width(),
            screenHeightPx = bounds.height(),
            densityDpi = displayMetrics.densityDpi,
            refreshRateHz = refreshRate,
            orientation = orientation,
            audioOutputRoute = describeOutputDevices(context.getSystemService(AudioManager::class.java)),
            audioSampleRate = diagnostics.sampleRate,
            framesPerBurst = diagnostics.framesPerBurst,
            oboeSharingMode = "not_exposed_by_current_diagnostics",
            audioPerformanceMode = "not_exposed_by_current_diagnostics",
            masterVolume = masterVolume,
            roomLevel = roomLevel,
            hapticsEnabled = null,
            selectedDrumKit = "Studio Kit",
            rendererBackend = "BITMAP",
            availableMemoryBytes = memoryInfo.availMem,
            sessionMode = "free_play",
        )
    }

    private fun describeOutputDevices(audioManager: AudioManager): String {
        val deviceTypes = audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
            .map(AudioDeviceInfo::getType)
            .distinct()
            .sorted()
        return if (deviceTypes.isEmpty()) {
            "system_default"
        } else {
            "available_types:${deviceTypes.joinToString("|")}"
        }
    }
}
