#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui"
cat >> "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/AntimatterGameApp.kt" <<'__AD9_014_01__'
                            Box(Modifier.weight(1f)) {
                                DestinationContent(
                                    destination = destination,
                                    snapshot = snapshot,
                                    settings = settings,
                                    palette = palette,
                                    compact = false,
                                    onBuyDimension = onBuyDimension,
                                    onBuyTickspeed = onBuyTickspeed,
                                    onResetRequested = { pendingReset = it },
                                    onPurchaseUpgrade = onPurchaseUpgrade,
                                    onExplain = { title, body -> explanation = Explanation(title, body) },
                                    onSettingsChange = onSettingsChange,
                                    onImport = onImport,
                                    onExport = onExport,
                                    onSave = onSave,
                                    onRestoreRecovery = onRestoreRecovery,
                                    onOpenCompatibility = { destination = Destination.LEGACY },
                                )
                            }
                        }
                    }
                } else {
                    Scaffold(
                        containerColor = Color.Transparent,
                        contentWindowInsets = WindowInsets.navigationBars,
                        bottomBar = {
                            GameBottomNavigation(
                                destination = destination,
                                palette = palette,
                                onDestination = { destination = it },
                            )
                        },
                    ) { padding ->
                        Column(Modifier.fillMaxSize().padding(padding)) {
                            GameHeader(snapshot, status, settings, palette)
                            Box(Modifier.weight(1f)) {
                                DestinationContent(
                                    destination = destination,
                                    snapshot = snapshot,
                                    settings = settings,
                                    palette = palette,
                                    compact = true,
                                    onBuyDimension = onBuyDimension,
                                    onBuyTickspeed = onBuyTickspeed,
                                    onResetRequested = { pendingReset = it },
                                    onPurchaseUpgrade = onPurchaseUpgrade,
                                    onExplain = { title, body -> explanation = Explanation(title, body) },
                                    onSettingsChange = onSettingsChange,
                                    onImport = onImport,
                                    onExport = onExport,
                                    onSave = onSave,
                                    onRestoreRecovery = onRestoreRecovery,
                                    onOpenCompatibility = { destination = Destination.LEGACY },
                                )
                            }
                        }
                    }
                }
            }

            if (legacyVisible) {
                Surface(
                    modifier = Modifier.statusBarsPadding().padding(10.dp).align(Alignment.TopStart),
                    shape = RoundedCornerShape(16.dp),
                    color = Color(0xE6101320),
                    border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.45f)),
                    shadowElevation = 10.dp,
                ) {
                    Row(
                        modifier = Modifier.padding(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text("Compatibility View", modifier = Modifier.padding(horizontal = 8.dp), style = MaterialTheme.typography.labelLarge)
                        Button(
                            onClick = { destination = Destination.SETTINGS },
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                        ) { Text("Return to native UI") }
                    }
                }
            }

            if (!wide && legacyVisible.not()) {
                SnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 82.dp))
            } else if (wide) {
                SnackbarHost(snackbar, modifier = Modifier.align(Alignment.BottomCenter).padding(18.dp))
            }

            if (!snapshot.ready && !legacyVisible) {
                LoadingOverlay(status, palette)
            }
        }

        explanation?.let { info ->
            ModalBottomSheet(
                onDismissRequest = { explanation = null },
                containerColor = palette.surfaceRaised,
            ) {
                Column(Modifier.padding(start = 22.dp, end = 22.dp, bottom = 34.dp)) {
                    Text(info.title, style = MaterialTheme.typography.headlineMedium)
                    Spacer(Modifier.height(10.dp))
                    Text(info.body, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }

        pendingReset?.let { reset ->
            AlertDialog(
                onDismissRequest = { pendingReset = null },
                title = { Text(reset.title) },
                text = {
                    Text(
                        "${reset.subtitle}\n\n${reset.reward}\n\nThis uses the original reset calculation and save state.",
                    )
                },
                confirmButton = {
                    Button(
                        onClick = {
                            pendingReset = null
                            onReset(reset.id)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.accent),
                    ) { Text("Confirm reset") }
                },
                dismissButton = { OutlinedButton(onClick = { pendingReset = null }) { Text("Cancel") } },
                containerColor = palette.surfaceRaised,
            )
        }
    }
}

@Composable
private fun DestinationContent(
    destination: Destination,
    snapshot: GameSnapshot,
    settings: GameSettings,
    palette: LayerPalette,
    compact: Boolean,
    onBuyDimension: (Int, Boolean) -> Unit,
    onBuyTickspeed: (Boolean) -> Unit,
    onResetRequested: (ResetActionState) -> Unit,
    onPurchaseUpgrade: (String) -> Unit,
    onExplain: (String, String) -> Unit,
    onSettingsChange: ((GameSettings) -> GameSettings) -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onSave: () -> Unit,
    onRestoreRecovery: () -> Unit,
    onOpenCompatibility: () -> Unit,
) {
    when (destination) {
        Destination.DIMENSIONS -> DimensionsScreen(
            snapshot = snapshot,
            palette = palette,
            compact = compact,
            onBuyDimension = onBuyDimension,
            onBuyTickspeed = onBuyTickspeed,
            onExplain = onExplain,
        )
        Destination.PROGRESS -> ProgressScreen(
            snapshot = snapshot,
            palette = palette,
            onReset = onResetRequested,
            onPurchaseUpgrade = { onPurchaseUpgrade(it.id) },
            onExplain = onExplain,
            onOpenCompatibility = onOpenCompatibility,
        )
        Destination.ACHIEVEMENTS -> AchievementsScreen(snapshot, palette, onExplain)
        Destination.SETTINGS -> SettingsScreen(
            settings = settings,
            palette = palette,
            onSettingsChange = onSettingsChange,
            onImport = onImport,
__AD9_014_01__
