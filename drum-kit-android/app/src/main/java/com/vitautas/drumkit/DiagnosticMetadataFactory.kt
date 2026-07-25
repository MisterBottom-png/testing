package com.vitautas.drumkit

import android.app.ActivityManager
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.view.WindowManager
import com.vitautas.drumkit.model.AudioDiagnostics

internal object DiagnosticMetadataFactory {
    fun create(
        context: Context,
        diagnostics: AudioDiagnostics,
        masterVolume: Float,
        roomLevel: Float,
        audioRoute: DiagnosticAudioRoute = DiagnosticAudioRouteResolver.resolve(context),
    ): DiagnosticSessionMetadata {
        val windowManager = context.getSystemService(WindowManager::class.java)
        val displayMetrics = context.resources.displayMetrics
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
            screenWidthPx = displayMetrics.widthPixels,
            screenHeightPx = displayMetrics.heightPixels,
            densityDpi = displayMetrics.densityDpi,
            refreshRateHz = refreshRate(context, windowManager),
            orientation = orientation,
            audioOutputRoute = DiagnosticAudioLatencyAssessment.metadataDescription(
                route = audioRoute,
                sampleRate = diagnostics.sampleRate,
                framesPerBurst = diagnostics.framesPerBurst,
            ),
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

    @Suppress("DEPRECATION")
    private fun refreshRate(context: Context, windowManager: WindowManager): Float =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            context.display.refreshRate
        } else {
            windowManager.defaultDisplay.refreshRate
        }
}
