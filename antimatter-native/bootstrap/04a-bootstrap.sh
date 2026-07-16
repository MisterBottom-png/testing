#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/AntimatterGameApp.kt" <<'__AD9_013_00__'
package com.vitautas.antimatter.nativegame.ui

import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.vitautas.antimatter.core.model.EngineEvent
import com.vitautas.antimatter.core.model.EngineStatus
import com.vitautas.antimatter.core.model.GameSettings
import com.vitautas.antimatter.core.model.GameSnapshot
import com.vitautas.antimatter.core.model.ResetActionState
import com.vitautas.antimatter.nativegame.ui.components.AnimatedResourceValue
import com.vitautas.antimatter.nativegame.ui.components.CosmicBackground
import com.vitautas.antimatter.nativegame.ui.components.GlowCard
import com.vitautas.antimatter.nativegame.ui.components.StatusPill
import com.vitautas.antimatter.nativegame.ui.screens.AchievementsScreen
import com.vitautas.antimatter.nativegame.ui.screens.DimensionsScreen
import com.vitautas.antimatter.nativegame.ui.screens.ProgressScreen
import com.vitautas.antimatter.nativegame.ui.screens.SettingsScreen
import com.vitautas.antimatter.nativegame.ui.theme.AntimatterTheme
import com.vitautas.antimatter.nativegame.ui.theme.LayerPalette
import kotlinx.coroutines.flow.Flow

private enum class Destination(val title: String, val symbol: String) {
    DIMENSIONS("Dimensions", "Δ"),
    PROGRESS("Progress", "∞"),
    ACHIEVEMENTS("Archive", "◆"),
    SETTINGS("Settings", "⚙"),
    LEGACY("Compatibility", "⌘"),
}

private data class Explanation(val title: String, val body: String)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AntimatterGameApp(
    snapshot: GameSnapshot,
    status: EngineStatus,
    settings: GameSettings,
    events: Flow<EngineEvent>,
    engineView: WebView,
    externalMessage: String?,
    onExternalMessageConsumed: () -> Unit,
    onEngineEvent: (EngineEvent, android.view.View) -> Unit,
    onSettingsChange: ((GameSettings) -> GameSettings) -> Unit,
    onBuyDimension: (Int, Boolean) -> Unit,
    onBuyTickspeed: (Boolean) -> Unit,
    onReset: (String) -> Unit,
    onPurchaseUpgrade: (String) -> Unit,
    onSave: () -> Unit,
    onRestoreRecovery: () -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onLegacyVisibilityChanged: (Boolean) -> Unit,
) {
    AntimatterTheme(layer = snapshot.layer) { palette ->
        var destination by rememberSaveable { mutableStateOf(Destination.DIMENSIONS) }
        var explanation by remember { mutableStateOf<Explanation?>(null) }
        var pendingReset by remember { mutableStateOf<ResetActionState?>(null) }
        val snackbar = remember { SnackbarHostState() }
        val view = LocalView.current
        val legacyVisible = destination == Destination.LEGACY
        var previousDestination by remember { mutableStateOf<Destination?>(null) }

        LaunchedEffect(destination) {
            val previous = previousDestination
            if (previous != null && previous != Destination.LEGACY && destination != Destination.LEGACY) {
                onEngineEvent(EngineEvent(EngineEvent.Type.NAVIGATION), view)
            }
            previousDestination = destination
        }
        LaunchedEffect(legacyVisible) { onLegacyVisibilityChanged(legacyVisible) }
        LaunchedEffect(events) {
            events.collect { event ->
                onEngineEvent(event, view)
                event.message?.let { snackbar.showSnackbar(it) }
            }
        }
        LaunchedEffect(externalMessage) {
            externalMessage?.let {
                snackbar.showSnackbar(it)
                onExternalMessageConsumed()
            }
        }

        BackHandler(enabled = legacyVisible) { destination = Destination.SETTINGS }

        BoxWithConstraints(Modifier.fillMaxSize()) {
            val wide = maxWidth >= 760.dp
            CosmicBackground(
                layer = snapshot.layer,
                palette = palette,
                quality = settings.graphicsQuality,
                reducedMotion = settings.reducedMotion,
                reducedEffects = settings.reducedEffects,
            )

            AndroidView(
                factory = { engineView },
                modifier = if (legacyVisible) {
                    Modifier.fillMaxSize()
                } else {
                    Modifier.align(Alignment.BottomEnd).size(2.dp).alpha(0.01f)
                },
                update = { webView ->
                    webView.alpha = if (legacyVisible) 1f else 0.01f
                },
            )

            AnimatedVisibility(
                visible = !legacyVisible,
                enter = fadeIn(),
                exit = fadeOut(),
                modifier = Modifier.fillMaxSize(),
            ) {
                if (wide) {
                    Row(Modifier.fillMaxSize()) {
                        GameNavigationRail(
                            destination = destination,
                            palette = palette,
                            onDestination = { destination = it },
                        )
                        Column(Modifier.fillMaxSize()) {
                            GameHeader(snapshot, status, settings, palette)
__AD9_013_00__
