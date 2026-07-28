#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens/GameScreens.kt" <<'__AD9_019_00__'
package com.vitautas.antimatter.nativegame.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vitautas.antimatter.core.model.AchievementState
import com.vitautas.antimatter.core.model.DimensionState
import com.vitautas.antimatter.core.model.GameSettings
import com.vitautas.antimatter.core.model.GameSnapshot
import com.vitautas.antimatter.core.model.GraphicsQuality
import com.vitautas.antimatter.core.model.MilestoneState
import com.vitautas.antimatter.core.model.ResetActionState
import com.vitautas.antimatter.core.model.UpgradeState
import com.vitautas.antimatter.nativegame.ui.components.EmptyState
import com.vitautas.antimatter.nativegame.ui.components.GlowCard
import com.vitautas.antimatter.nativegame.ui.components.HoldActionButton
import com.vitautas.antimatter.nativegame.ui.components.MilestoneProgress
import com.vitautas.antimatter.nativegame.ui.components.StatusPill
import com.vitautas.antimatter.nativegame.ui.theme.LayerPalette

@Composable
fun DimensionsScreen(
    snapshot: GameSnapshot,
    palette: LayerPalette,
    compact: Boolean,
    onBuyDimension: (Int, Boolean) -> Unit,
    onBuyTickspeed: (Boolean) -> Unit,
    onExplain: (String, String) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionHeader(
                eyebrow = "PRODUCTION MATRIX",
                title = "Antimatter Dimensions",
                body = "Hold any purchase control to repeat. The original simulation still resolves every cost and multiplier.",
            )
        }
        item {
            TickspeedCard(
                cost = snapshot.tickspeedCost,
                affordable = snapshot.tickspeedAffordable,
                palette = palette,
                onBuy = { onBuyTickspeed(false) },
                onBuyMax = { onBuyTickspeed(true) },
                onExplain = onExplain,
            )
        }
        items(snapshot.dimensions, key = { it.tier }) { dimension ->
            DimensionCard(
                dimension = dimension,
                palette = palette,
                compact = compact,
                onBuy = { onBuyDimension(dimension.tier, false) },
                onBuyMax = { onBuyDimension(dimension.tier, true) },
                onExplain = onExplain,
            )
        }
        item { Spacer(Modifier.height(90.dp)) }
    }
}

@Composable
private fun TickspeedCard(
    cost: String,
    affordable: Boolean,
    palette: LayerPalette,
    onBuy: () -> Unit,
    onBuyMax: () -> Unit,
    onExplain: (String, String) -> Unit,
) {
    GlowCard(palette = palette, emphasized = affordable, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Tickspeed", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Accelerates all Antimatter Dimension production",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Surface(
                    modifier = Modifier.size(48.dp).clickable {
                        onExplain("Tickspeed", "Tickspeed upgrades make every unlocked Antimatter Dimension produce faster. Hold Buy max for rapid purchasing.")
                    },
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.06f),
                ) { Box(contentAlignment = Alignment.Center) { Text("?") } }
            }
            Spacer(Modifier.height(14.dp))
            Text("Cost  $cost AM", style = MaterialTheme.typography.labelLarge, color = palette.accent)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                HoldActionButton(
                    text = "Buy",
                    enabled = affordable,
                    palette = palette,
                    modifier = Modifier.weight(1f),
                    onClick = onBuy,
                )
                HoldActionButton(
                    text = "Buy max",
                    enabled = affordable,
                    palette = palette,
                    modifier = Modifier.weight(1f),
                    onClick = onBuyMax,
                    onRepeat = onBuyMax,
                )
            }
        }
    }
}

@Composable
private fun DimensionCard(
    dimension: DimensionState,
    palette: LayerPalette,
    compact: Boolean,
    onBuy: () -> Unit,
    onBuyMax: () -> Unit,
    onExplain: (String, String) -> Unit,
) {
    val locked = !dimension.unlocked
    GlowCard(
        palette = palette,
        emphasized = dimension.affordable,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(if (compact) 14.dp else 17.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Surface(
                    modifier = Modifier.size(42.dp),
                    shape = RoundedCornerShape(13.dp),
                    color = palette.accent.copy(alpha = if (locked) 0.06f else 0.15f),
                    border = BorderStroke(1.dp, palette.accent.copy(alpha = if (locked) 0.10f else 0.36f)),
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Text(
                            dimension.tier.toString(),
                            style = MaterialTheme.typography.titleLarge,
                            color = if (locked) MaterialTheme.colorScheme.onSurfaceVariant else palette.accent,
                        )
                    }
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        dimension.name,
                        style = MaterialTheme.typography.titleLarge,
__AD9_019_00__
