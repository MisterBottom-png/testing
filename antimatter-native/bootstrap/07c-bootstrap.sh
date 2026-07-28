#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens"
cat >> "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens/GameScreens.kt" <<'__AD9_021_02__'
                Text(if (milestone.reached) "◆" else "◇", color = if (milestone.reached) palette.success else palette.accent)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(milestone.title, style = MaterialTheme.typography.titleMedium)
                    Text(
                        milestone.description,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    if (milestone.reached) "DONE" else "${(milestone.progress * 100).toInt()}%",
                    style = MaterialTheme.typography.labelMedium,
                    color = if (milestone.reached) palette.success else palette.accent,
                )
            }
            Spacer(Modifier.height(12.dp))
            MilestoneProgress(milestone.progress, milestone.reached, palette)
        }
    }
}

@Composable
private fun UpgradeCard(
    upgrade: UpgradeState,
    palette: LayerPalette,
    onPurchase: (UpgradeState) -> Unit,
    onExplain: (String, String) -> Unit,
) {
    GlowCard(palette, Modifier.fillMaxWidth(), emphasized = upgrade.affordable) {
        Row(
            modifier = Modifier.clickable { onExplain(upgrade.title, upgrade.description) }.padding(15.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                Text(upgrade.title, style = MaterialTheme.typography.titleMedium)
                Text(
                    upgrade.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(6.dp))
                Text("${upgrade.level}  ·  ${upgrade.cost} IP", style = MaterialTheme.typography.labelMedium, color = palette.accent)
            }
            Spacer(Modifier.width(12.dp))
            OutlinedButton(
                onClick = { onPurchase(upgrade) },
                enabled = upgrade.affordable && !upgrade.purchased,
                border = BorderStroke(1.dp, palette.accent.copy(alpha = 0.55f)),
                shape = RoundedCornerShape(13.dp),
            ) { Text(if (upgrade.purchased) "Owned" else "Buy") }
        }
    }
}

@Composable
fun AchievementsScreen(
    snapshot: GameSnapshot,
    palette: LayerPalette,
    onExplain: (String, String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            SectionHeader(
                eyebrow = "ACHIEVEMENT ARCHIVE",
                title = "${snapshot.achievementUnlockedCount} / ${snapshot.achievementTotalCount}",
                body = "Unlocked achievements are shown first. The native list is intentionally concise; the complete archive remains available in Compatibility View.",
            )
        }
        if (snapshot.achievements.isEmpty()) {
            item { EmptyState("No achievement data yet", "The archive will appear once the preserved engine finishes loading.") }
        } else {
            items(snapshot.achievements, key = { it.id }) { achievement ->
                AchievementCard(achievement, palette, onExplain)
            }
        }
        item { Spacer(Modifier.height(90.dp)) }
    }
}

@Composable
private fun AchievementCard(
    achievement: AchievementState,
    palette: LayerPalette,
    onExplain: (String, String) -> Unit,
) {
    val color = if (achievement.unlocked) palette.success else MaterialTheme.colorScheme.onSurfaceVariant
    GlowCard(palette, Modifier.fillMaxWidth(), emphasized = achievement.unlocked) {
        Row(
            modifier = Modifier.clickable { onExplain(achievement.name, achievement.description) }.padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Surface(
                modifier = Modifier.size(44.dp),
                shape = RoundedCornerShape(14.dp),
                color = color.copy(alpha = 0.12f),
                border = BorderStroke(1.dp, color.copy(alpha = 0.34f)),
            ) { Box(contentAlignment = Alignment.Center) { Text(if (achievement.unlocked) "◆" else "◇", color = color) } }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(achievement.name, style = MaterialTheme.typography.titleMedium, color = if (achievement.unlocked) MaterialTheme.colorScheme.onSurface else color)
                Text(
                    achievement.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
    }
}

@Composable
fun SettingsScreen(
    settings: GameSettings,
    palette: LayerPalette,
    onSettingsChange: ((GameSettings) -> GameSettings) -> Unit,
    onImport: () -> Unit,
    onExport: () -> Unit,
    onSave: () -> Unit,
    recoverySaveAvailable: Boolean,
    onRestoreRecovery: () -> Unit,
    onOpenCompatibility: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionHeader(
                eyebrow = "SYSTEM CONTROL",
                title = "Settings",
                body = "Music, sound effects, haptics, motion, and visual effects can be adjusted independently.",
            )
        }
        item {
            SettingsGroup("Audio", palette) {
                ToggleSetting("Music", "Layer-aware ambient soundscape", settings.musicEnabled) {
                    onSettingsChange { current -> current.copy(musicEnabled = it) }
                }
                VolumeSetting("Music volume", settings.musicVolume, settings.musicEnabled) {
                    onSettingsChange { current -> current.copy(musicVolume = it) }
                }
                HorizontalDivider(color = Color.White.copy(alpha = 0.07f))
                ToggleSetting("Sound effects", "Purchases, milestones and prestige events", settings.soundEnabled) {
                    onSettingsChange { current -> current.copy(soundEnabled = it) }
                }
                VolumeSetting("Effects volume", settings.soundVolume, settings.soundEnabled) {
                    onSettingsChange { current -> current.copy(soundVolume = it) }
                }
            }
        }
        item {
            SettingsGroup("Interaction", palette) {
                ToggleSetting("Haptics", "Respects Android system haptic settings", settings.hapticsEnabled) {
                    onSettingsChange { current -> current.copy(hapticsEnabled = it) }
                }
                HorizontalDivider(color = Color.White.copy(alpha = 0.07f))
                ToggleSetting("Reduced motion", "Removes animated transitions and drifting effects", settings.reducedMotion) {
                    onSettingsChange { current -> current.copy(reducedMotion = it) }
                }
                HorizontalDivider(color = Color.White.copy(alpha = 0.07f))
                ToggleSetting("Reduced effects", "Disables glows, distortion and dense particles", settings.reducedEffects) {
                    onSettingsChange { current -> current.copy(reducedEffects = it) }
                }
            }
        }
        item {
            SettingsGroup("Graphics quality", palette) {
__AD9_021_02__
