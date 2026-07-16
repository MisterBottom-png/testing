#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens"
cat >> "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/screens/GameScreens.kt" <<'__AD9_022_03__'
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    GraphicsQuality.entries.forEach { quality ->
                        Surface(
                            modifier = Modifier.weight(1f).clickable {
                                onSettingsChange { current -> current.copy(graphicsQuality = quality) }
                            },
                            shape = RoundedCornerShape(13.dp),
                            color = if (settings.graphicsQuality == quality) palette.accent.copy(alpha = 0.18f) else Color.White.copy(alpha = 0.04f),
                            border = BorderStroke(1.dp, if (settings.graphicsQuality == quality) palette.accent.copy(alpha = 0.55f) else Color.White.copy(alpha = 0.08f)),
                        ) {
                            Text(
                                quality.name.lowercase().replaceFirstChar { it.uppercase() },
                                modifier = Modifier.padding(vertical = 13.dp),
                                style = MaterialTheme.typography.labelMedium,
                                color = if (settings.graphicsQuality == quality) palette.accent else MaterialTheme.colorScheme.onSurfaceVariant,
                                textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                            )
                        }
                    }
                }
            }
        }
        item {
            SettingsGroup("Save data", palette) {
                Row(horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                    OutlinedButton(onClick = onImport, modifier = Modifier.weight(1f)) { Text("Import") }
                    OutlinedButton(onClick = onExport, modifier = Modifier.weight(1f)) { Text("Export") }
                    Button(onClick = onSave, modifier = Modifier.weight(1f)) { Text("Save") }
                }
                if (recoverySaveAvailable) {
                    Spacer(Modifier.height(10.dp))
                    OutlinedButton(onClick = onRestoreRecovery, modifier = Modifier.fillMaxWidth()) {
                        Text("Restore pre-import backup")
                    }
                }
                Spacer(Modifier.height(10.dp))
                Text(
                    "Imports and exports use the original Antimatter Dimensions serializer. A validated pre-import recovery save is retained automatically.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        item {
            SettingsGroup("Compatibility", palette) {
                Text(
                    "Open the complete original interface for advanced systems not yet represented natively, including Glyph selection and the full late-game archive.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(12.dp))
                OutlinedButton(onClick = onOpenCompatibility, modifier = Modifier.fillMaxWidth().height(50.dp)) {
                    Text("Open Compatibility View")
                }
            }
        }
        item { Spacer(Modifier.height(90.dp)) }
    }
}

@Composable
private fun SettingsGroup(
    title: String,
    palette: LayerPalette,
    content: @Composable ColumnScope.() -> Unit,
) {
    GlowCard(palette, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(title, style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
private fun ToggleSetting(title: String, body: String, checked: Boolean, onChecked: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Column(Modifier.weight(1f)) {
            Text(title, style = MaterialTheme.typography.titleMedium)
            Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Switch(
            checked = checked,
            onCheckedChange = onChecked,
            colors = SwitchDefaults.colors(checkedThumbColor = MaterialTheme.colorScheme.onPrimary, checkedTrackColor = MaterialTheme.colorScheme.primary),
        )
    }
}

@Composable
private fun VolumeSetting(title: String, value: Float, enabled: Boolean, onValue: (Float) -> Unit) {
    Column(Modifier.padding(top = 7.dp, bottom = 5.dp)) {
        Row {
            Text(title, style = MaterialTheme.typography.labelMedium, modifier = Modifier.weight(1f))
            Text("${(value * 100).toInt()}%", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        }
        Slider(value = value, onValueChange = onValue, enabled = enabled, valueRange = 0f..1f)
    }
}

@Composable
private fun SectionHeader(eyebrow: String, title: String, body: String) {
    Column(Modifier.padding(horizontal = 3.dp, vertical = 5.dp)) {
        Text(eyebrow, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(5.dp))
        Text(title, style = MaterialTheme.typography.headlineLarge, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(6.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
__AD9_022_03__
