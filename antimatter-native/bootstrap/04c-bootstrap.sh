#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui"
cat >> "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/AntimatterGameApp.kt" <<'__AD9_015_02__'
            onExport = onExport,
            onSave = onSave,
            recoverySaveAvailable = snapshot.recoverySaveAvailable,
            onRestoreRecovery = onRestoreRecovery,
            onOpenCompatibility = onOpenCompatibility,
        )
        Destination.LEGACY -> Unit
    }
}

@Composable
private fun GameHeader(
    snapshot: GameSnapshot,
    status: EngineStatus,
    settings: GameSettings,
    palette: LayerPalette,
) {
    Column(
        modifier = Modifier.fillMaxWidth().statusBarsPadding().padding(start = 18.dp, end = 18.dp, top = 10.dp, bottom = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "ANTIMATTER",
                        style = MaterialTheme.typography.labelMedium,
                        color = palette.accent,
                        fontWeight = FontWeight.Black,
                    )
                    Spacer(Modifier.width(8.dp))
                    StatusPill(snapshot.layer.displayName, palette.accent)
                }
                Spacer(Modifier.height(5.dp))
                AnimatedResourceValue(snapshot.antimatter, settings.reducedMotion, Modifier.fillMaxWidth())
                Text(
                    "+${snapshot.antimatterPerSecond} / sec",
                    style = MaterialTheme.typography.labelLarge.copy(fontFamily = FontFamily.Monospace),
                    color = palette.success,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(12.dp))
            Surface(
                modifier = Modifier.size(48.dp).semantics { contentDescription = "Game engine ${status.state.name.lowercase()}" },
                shape = CircleShape,
                color = if (status.state == EngineStatus.State.READY) palette.success.copy(alpha = 0.12f) else palette.accent.copy(alpha = 0.10f),
                border = BorderStroke(1.dp, if (status.state == EngineStatus.State.READY) palette.success.copy(alpha = 0.35f) else palette.accent.copy(alpha = 0.30f)),
            ) {
                Box(contentAlignment = Alignment.Center) {
                    Text(if (status.state == EngineStatus.State.READY) "◉" else "◌", color = if (status.state == EngineStatus.State.READY) palette.success else palette.accent)
                }
            }
        }
        if (snapshot.layer.ordinal > 0) {
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MiniResource("IP", snapshot.infinityPoints, palette, Modifier.weight(1f))
                MiniResource("EP", snapshot.eternityPoints, palette, Modifier.weight(1f))
                MiniResource("RM", snapshot.realityMachines, palette, Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun MiniResource(label: String, value: String, palette: LayerPalette, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = Color.White.copy(alpha = 0.045f),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, Color.White.copy(alpha = 0.07f)),
    ) {
        Column(Modifier.padding(horizontal = 10.dp, vertical = 7.dp)) {
            Text(label, style = MaterialTheme.typography.labelMedium, color = palette.accent)
            Text(value, style = MaterialTheme.typography.labelLarge.copy(fontFamily = FontFamily.Monospace), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

@Composable
private fun GameBottomNavigation(destination: Destination, palette: LayerPalette, onDestination: (Destination) -> Unit) {
    NavigationBar(
        containerColor = Color(0xF20A0D17),
        tonalElevation = 0.dp,
    ) {
        Destination.entries.filter { it != Destination.LEGACY }.forEach { item ->
            NavigationBarItem(
                selected = destination == item,
                onClick = { onDestination(item) },
                icon = { Text(item.symbol, style = MaterialTheme.typography.titleLarge) },
                label = { Text(item.title, maxLines = 1) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = palette.accent,
                    selectedTextColor = palette.accent,
                    indicatorColor = palette.accent.copy(alpha = 0.13f),
                    unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                    unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
            )
        }
    }
}

@Composable
private fun GameNavigationRail(destination: Destination, palette: LayerPalette, onDestination: (Destination) -> Unit) {
    NavigationRail(
        modifier = Modifier.fillMaxHeight().width(96.dp).statusBarsPadding(),
        containerColor = Color(0xD9080B14),
    ) {
        Spacer(Modifier.height(22.dp))
        Text("AD", style = MaterialTheme.typography.titleLarge, color = palette.accent)
        Spacer(Modifier.height(28.dp))
        Destination.entries.filter { it != Destination.LEGACY }.forEach { item ->
            NavigationRailItem(
                selected = destination == item,
                onClick = { onDestination(item) },
                icon = { Text(item.symbol, style = MaterialTheme.typography.titleLarge) },
                label = { Text(item.title, maxLines = 1) },
                colors = androidx.compose.material3.NavigationRailItemDefaults.colors(
                    selectedIconColor = palette.accent,
                    selectedTextColor = palette.accent,
                    indicatorColor = palette.accent.copy(alpha = 0.13f),
                ),
            )
        }
    }
}

@Composable
private fun LoadingOverlay(status: EngineStatus, palette: LayerPalette) {
    val failed = status.state == EngineStatus.State.ERROR
    Box(Modifier.fillMaxSize().background(Color(0xB9050710)), contentAlignment = Alignment.Center) {
        GlowCard(palette, Modifier.padding(28.dp).fillMaxWidth(), emphasized = true) {
            Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                if (failed) {
                    Text("!", style = MaterialTheme.typography.headlineLarge, color = palette.danger)
                } else {
                    CircularProgressIndicator(color = palette.accent)
                }
                Spacer(Modifier.height(18.dp))
                Text(
                    if (failed) "Simulation failed to initialize" else "Initializing preserved simulation",
                    style = MaterialTheme.typography.titleLarge,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    status.detail ?: if (failed) {
                        "The packaged game engine could not start. Restart the app and verify that the game assets were bundled."
                    } else {
                        "Loading save migrations, numerical engine and offline progression…"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
__AD9_015_02__
