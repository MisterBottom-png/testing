#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/preview"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/preview/DesignPreviews.kt" <<'__AD_FILE_6_0__'
package com.vitautas.antimatter.nativegame.ui.preview

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import com.vitautas.antimatter.core.model.AchievementState
import com.vitautas.antimatter.core.model.DimensionState
import com.vitautas.antimatter.core.model.GameSettings
import com.vitautas.antimatter.core.model.GameSnapshot
import com.vitautas.antimatter.core.model.MilestoneState
import com.vitautas.antimatter.core.model.ProgressLayer
import com.vitautas.antimatter.core.model.ResetActionState
import com.vitautas.antimatter.core.model.UpgradeState
import com.vitautas.antimatter.nativegame.ui.components.CosmicBackground
import com.vitautas.antimatter.nativegame.ui.screens.AchievementsScreen
import com.vitautas.antimatter.nativegame.ui.screens.DimensionsScreen
import com.vitautas.antimatter.nativegame.ui.screens.ProgressScreen
import com.vitautas.antimatter.nativegame.ui.screens.SettingsScreen
import com.vitautas.antimatter.nativegame.ui.theme.AntimatterTheme

private val previewSnapshot = GameSnapshot(
    ready = true,
    layer = ProgressLayer.INFINITY,
    antimatter = "1.34e42",
    antimatterPerSecond = "8.21e39",
    infinityPoints = "4.21e12",
    dimensions = (1..8).map { tier ->
        DimensionState(
            tier = tier,
            name = listOf("First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth")[tier - 1] + " Dimension",
            amount = "${tier}.42e${20 - tier}",
            bought = tier * 20L,
            multiplier = "1.0e${tier + 4}",
            productionPerSecond = "7.3e${18 - tier}",
            cost = "1.0e${tier * 3 + 10}",
            unlocked = tier <= 6,
            affordable = tier <= 3,
            buyMode = "Buy 10",
        )
    },
    resets = listOf(
        ResetActionState("dimension_boost", "Dimension Boost", "Requires 140 Eighth Dimensions", "Owned: 37", true, true),
        ResetActionState("galaxy", "Antimatter Galaxy", "Requires 320 Eighth Dimensions", "Owned: 12", true, true),
        ResetActionState("infinity", "Infinity", "Collapse this Infinity", "Gain 2.44e9 IP", true, true),
        ResetActionState("eternity", "Eternity", "Reset Infinity progress", "Requires 1.80e308 IP", true, false),
    ),
    upgrades = listOf(
        UpgradeState("totalTimeMult", "Dimensions gain a time multiplier", "Current effect: 8.21×", "1", "Purchased", true, false, true),
        UpgradeState("buy10Mult", "Improve the buy-10 multiplier", "Permanent Infinity upgrade", "5.00e4", "Not purchased", true, true, false),
    ),
    achievements = listOf(
        AchievementState(11, "You gotta start somewhere", "Buy a First Antimatter Dimension", true),
        AchievementState(21, "To infinity!", "Reach Infinity", true),
        AchievementState(71, "Eternally thine", "Reach Eternity", false),
    ),
    achievementUnlockedCount = 43,
    achievementTotalCount = 144,
    milestones = listOf(
        MilestoneState("dim1", "First production", "Purchase a First Dimension", true, 1f),
        MilestoneState("galaxy", "Galactic compression", "Create an Antimatter Galaxy", true, 1f),
        MilestoneState("eternity", "Outlast Infinity", "Reach Eternity", false, 0.35f),
    ),
    tickspeedCost = "1.00e38",
    tickspeedAffordable = true,
)

@Composable
private fun PreviewSurface(content: @Composable () -> Unit) {
    AntimatterTheme(previewSnapshot.layer) { palette ->
        Box(Modifier.fillMaxSize()) {
            CosmicBackground(
                layer = previewSnapshot.layer,
                palette = palette,
                quality = GameSettings().graphicsQuality,
                reducedMotion = true,
                reducedEffects = false,
            )
            content()
        }
    }
}

@Preview(name = "Dimensions phone", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun DimensionsPhonePreview() = AntimatterTheme(previewSnapshot.layer) { palette ->
    Box(Modifier.fillMaxSize()) {
        CosmicBackground(previewSnapshot.layer, palette, GameSettings().graphicsQuality, true, false)
        DimensionsScreen(previewSnapshot, palette, true, { _, _ -> }, {}, { _, _ -> })
    }
}

@Preview(name = "Progress tablet", widthDp = 800, heightDp = 1100, showBackground = true)
@Composable
private fun ProgressTabletPreview() = AntimatterTheme(previewSnapshot.layer) { palette ->
    Box(Modifier.fillMaxSize()) {
        CosmicBackground(previewSnapshot.layer, palette, GameSettings().graphicsQuality, true, false)
        ProgressScreen(previewSnapshot, palette, {}, {}, { _, _ -> }, {})
    }
}

@Preview(name = "Achievements", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun AchievementsPreview() = AntimatterTheme(previewSnapshot.layer) { palette ->
    Box(Modifier.fillMaxSize()) {
        CosmicBackground(previewSnapshot.layer, palette, GameSettings().graphicsQuality, true, false)
        AchievementsScreen(previewSnapshot, palette) { _, _ -> }
    }
}

@Preview(name = "Settings", widthDp = 412, heightDp = 915, showBackground = true)
@Composable
private fun SettingsPreview() = AntimatterTheme(previewSnapshot.layer) { palette ->
    Box(Modifier.fillMaxSize()) {
        CosmicBackground(previewSnapshot.layer, palette, GameSettings().graphicsQuality, true, false)
        SettingsScreen(GameSettings(), palette, {}, {}, {}, {}, false, {}, {})
    }
}

__AD_FILE_6_0__
