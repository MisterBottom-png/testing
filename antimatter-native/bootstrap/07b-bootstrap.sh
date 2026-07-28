#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens"
cat >> "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens/GameScreens.kt" <<'__AD9_020_01__'
                        modifier = Modifier.semantics { heading() },
                    )
                    Text(
                        if (locked) "Locked" else "${dimension.amount} owned  ·  ${dimension.bought} purchased",
                        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                Surface(
                    modifier = Modifier.size(48.dp).clickable {
                        onExplain(
                            dimension.name,
                            "Produces the previous Dimension tier. Its multiplier is ${dimension.multiplier}; current production is ${dimension.productionPerSecond} per second.",
                        )
                    },
                    shape = CircleShape,
                    color = Color.White.copy(alpha = 0.05f),
                ) { Box(contentAlignment = Alignment.Center) { Text("i") } }
            }
            if (!locked) {
                Spacer(Modifier.height(13.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MetricChip("× ${dimension.multiplier}", "multiplier", palette, Modifier.weight(1f))
                    MetricChip("${dimension.productionPerSecond}/s", "production", palette, Modifier.weight(1f))
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    "${dimension.buyMode}  ·  ${dimension.cost} AM",
                    style = MaterialTheme.typography.labelLarge,
                    color = if (dimension.affordable) palette.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(9.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    HoldActionButton(
                        text = "Buy",
                        enabled = dimension.affordable,
                        palette = palette,
                        modifier = Modifier.weight(1f),
                        contentDescription = "Buy ${dimension.name}",
                        onClick = onBuy,
                    )
                    HoldActionButton(
                        text = "Buy max",
                        enabled = dimension.affordable,
                        palette = palette,
                        modifier = Modifier.weight(1f),
                        contentDescription = "Buy maximum ${dimension.name}",
                        onClick = onBuyMax,
                        onRepeat = onBuyMax,
                    )
                }
            }
        }
    }
}

@Composable
private fun MetricChip(text: String, description: String, palette: LayerPalette, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier.semantics { contentDescription = "$description $text" },
        shape = RoundedCornerShape(12.dp),
        color = Color.White.copy(alpha = 0.045f),
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 9.dp),
            style = MaterialTheme.typography.labelMedium.copy(fontFamily = FontFamily.Monospace),
            color = palette.accent.copy(alpha = 0.88f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

@Composable
fun ProgressScreen(
    snapshot: GameSnapshot,
    palette: LayerPalette,
    onReset: (ResetActionState) -> Unit,
    onPurchaseUpgrade: (UpgradeState) -> Unit,
    onExplain: (String, String) -> Unit,
    onOpenCompatibility: () -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            SectionHeader(
                eyebrow = "PROGRESSION LAYERS",
                title = "Break the universe",
                body = "Reset actions trade current progress for permanent acceleration. Availability comes directly from the preserved game engine.",
            )
        }
        items(snapshot.resets.filter { it.unlocked }, key = { it.id }) { reset ->
            ResetCard(reset, palette, onReset, onOpenCompatibility)
        }
        item {
            Text(
                "MILESTONES",
                style = MaterialTheme.typography.labelMedium,
                color = palette.accent,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        items(snapshot.milestones, key = { it.id }) { milestone ->
            MilestoneCard(milestone, palette, onExplain)
        }
        if (snapshot.upgrades.isNotEmpty()) {
            item {
                Text(
                    "INFINITY UPGRADES",
                    style = MaterialTheme.typography.labelMedium,
                    color = palette.accent,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            items(snapshot.upgrades, key = { it.id }) { upgrade ->
                UpgradeCard(upgrade, palette, onPurchaseUpgrade, onExplain)
            }
        }
        item { Spacer(Modifier.height(90.dp)) }
    }
}

@Composable
private fun ResetCard(
    reset: ResetActionState,
    palette: LayerPalette,
    onReset: (ResetActionState) -> Unit,
    onOpenCompatibility: () -> Unit,
) {
    val isReality = reset.id == "reality"
    GlowCard(palette, Modifier.fillMaxWidth(), emphasized = reset.available) {
        Column(Modifier.padding(17.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(reset.title, style = MaterialTheme.typography.titleLarge)
                    Text(
                        reset.subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                StatusPill(
                    text = when {
                        reset.available -> "Ready"
                        reset.unlocked -> "Unavailable"
                        else -> "Locked"
                    },
                    color = if (reset.available) palette.success else MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Spacer(Modifier.height(13.dp))
            Text(reset.reward, style = MaterialTheme.typography.labelLarge, color = palette.accent)
            Spacer(Modifier.height(12.dp))
            Button(
                onClick = { if (isReality) onOpenCompatibility() else onReset(reset) },
                enabled = reset.available,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(15.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = palette.accent,
                    contentColor = MaterialTheme.colorScheme.onPrimary,
                    disabledContainerColor = Color.White.copy(alpha = 0.07f),
                    disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                ),
            ) {
                Text(if (isReality) "Open Glyph selection" else "Perform ${reset.title}")
            }
        }
    }
}

@Composable
private fun MilestoneCard(
    milestone: MilestoneState,
    palette: LayerPalette,
    onExplain: (String, String) -> Unit,
) {
    GlowCard(palette, Modifier.fillMaxWidth()) {
        Column(
            Modifier.clickable { onExplain(milestone.title, milestone.description) }.padding(15.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
__AD9_020_01__
