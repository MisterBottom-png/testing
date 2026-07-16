#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-project}"
mkdir -p "$ROOT"

mkdir -p "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/components"
cat > "$ROOT/app/src/main/java/com/vitautas/antimatter/nativegame/ui/components/CosmicComponents.kt" <<'__AD_FILE_5_0__'
package com.vitautas.antimatter.nativegame.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vitautas.antimatter.core.model.GraphicsQuality
import com.vitautas.antimatter.core.model.ProgressLayer
import com.vitautas.antimatter.nativegame.ui.theme.LayerPalette
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.Random
import kotlin.math.sin

@Immutable
private data class Star(val x: Float, val y: Float, val radius: Float, val alpha: Float, val drift: Float)

@Composable
fun CosmicBackground(
    layer: ProgressLayer,
    palette: LayerPalette,
    quality: GraphicsQuality,
    reducedMotion: Boolean,
    reducedEffects: Boolean,
    modifier: Modifier = Modifier,
) {
    val count = when {
        reducedEffects -> 20
        quality == GraphicsQuality.LOW -> 32
        quality == GraphicsQuality.HIGH -> 90
        else -> 56
    }
    val stars = remember(layer, count) {
        val random = Random(8921L + layer.ordinal * 113L)
        List(count) {
            Star(
                x = random.nextFloat(),
                y = random.nextFloat(),
                radius = 0.5f + random.nextFloat() * 2.2f,
                alpha = 0.16f + random.nextFloat() * 0.62f,
                drift = 0.3f + random.nextFloat() * 1.7f,
            )
        }
    }
    val phase = if (reducedMotion) {
        0f
    } else {
        val transition = rememberInfiniteTransition(label = "cosmic drift")
        val animatedPhase by transition.animateFloat(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(
                animation = tween(18_000, easing = LinearEasing),
                repeatMode = RepeatMode.Restart,
            ),
            label = "star phase",
        )
        animatedPhase
    }
    Canvas(modifier.fillMaxSize()) {
        drawRect(
            brush = Brush.verticalGradient(
                colors = listOf(palette.background, palette.backgroundDeep),
            ),
        )
        if (!reducedEffects) {
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(palette.glow.copy(alpha = 0.25f), Color.Transparent),
                    center = Offset(size.width * 0.18f, size.height * 0.12f),
                    radius = size.minDimension * 0.65f,
                ),
                radius = size.minDimension * 0.65f,
                center = Offset(size.width * 0.18f, size.height * 0.12f),
            )
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(palette.accentSecondary.copy(alpha = 0.10f), Color.Transparent),
                    center = Offset(size.width * 0.90f, size.height * 0.78f),
                    radius = size.minDimension * 0.55f,
                ),
                radius = size.minDimension * 0.55f,
                center = Offset(size.width * 0.90f, size.height * 0.78f),
            )
        }
        stars.forEachIndexed { index, star ->
            val wave = if (reducedMotion) 0f else sin((phase + index * 0.071f) * 6.283f) * star.drift
            drawCircle(
                color = Color.White.copy(alpha = star.alpha),
                radius = star.radius,
                center = Offset(star.x * size.width + wave, star.y * size.height),
            )
        }
        if (!reducedEffects && quality == GraphicsQuality.HIGH) {
            drawOval(
                color = palette.accent.copy(alpha = 0.06f),
                topLeft = Offset(size.width * -0.2f, size.height * 0.50f),
                size = Size(size.width * 1.4f, size.height * 0.28f),
                style = Stroke(width = 2.dp.toPx()),
            )
        }
    }
}

@Composable
fun GlowCard(
    palette: LayerPalette,
    modifier: Modifier = Modifier,
    emphasized: Boolean = false,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(22.dp)
    Surface(
        modifier = modifier
            .clip(shape)
            .border(
                width = 1.dp,
                color = if (emphasized) palette.accent.copy(alpha = 0.55f) else Color.White.copy(alpha = 0.09f),
                shape = shape,
            ),
        color = if (emphasized) palette.surfaceRaised else palette.surface,
        shape = shape,
        tonalElevation = 0.dp,
        shadowElevation = if (emphasized) 8.dp else 1.dp,
        content = content,
    )
}

@Composable
fun AnimatedResourceValue(
    value: String,
    reducedMotion: Boolean,
    modifier: Modifier = Modifier,
) {
    if (reducedMotion) {
        Text(
            text = value,
            modifier = modifier,
            style = MaterialTheme.typography.displayLarge.copy(fontFamily = FontFamily.Monospace),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    } else {
        AnimatedContent(
            targetState = value,
            modifier = modifier,
            transitionSpec = {
                (fadeIn(tween(120)) togetherWith fadeOut(tween(90))).using(SizeTransform(clip = false))
            },
            label = "resource value",
        ) { displayed ->
            Text(
                text = displayed,
                style = MaterialTheme.typography.displayLarge.copy(fontFamily = FontFamily.Monospace),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

@Composable
fun StatusPill(
    text: String,
    color: Color,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier
            .clip(CircleShape)
            .background(color.copy(alpha = 0.14f))
            .border(1.dp, color.copy(alpha = 0.35f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(7.dp).background(color, CircleShape))
        Spacer(Modifier.width(7.dp))
        Text(text, style = MaterialTheme.typography.labelMedium, color = color)
    }
}

@Composable
fun HoldActionButton(
    text: String,
    enabled: Boolean,
    palette: LayerPalette,
    modifier: Modifier = Modifier,
    contentDescription: String = text,
    onClick: () -> Unit,
    onRepeat: () -> Unit = onClick,
) {
    val scope = rememberCoroutineScope()
    val shape = RoundedCornerShape(15.dp)
    val density = LocalDensity.current
    Surface(
        modifier = modifier
            .height(52.dp)
            .semantics {
                role = Role.Button
                this.contentDescription = contentDescription
                if (!enabled) disabled()
                onClick(action = {
                    if (enabled) onClick()
                    enabled
                })
            }
            .pointerInput(enabled, density) {
                detectTapGestures(
                    onPress = {
                        if (enabled) {
                            onClick()
                            val repeatJob = scope.launch {
                                delay(430)
                                while (isActive) {
                                    onRepeat()
                                    delay(105)
                                }
                            }
                            tryAwaitRelease()
                            repeatJob.cancel()
                        }
                    },
                )
            },
        color = if (enabled) palette.accent.copy(alpha = 0.16f) else Color.White.copy(alpha = 0.04f),
        shape = shape,
        border = androidx.compose.foundation.BorderStroke(
            1.dp,
            if (enabled) palette.accent.copy(alpha = 0.55f) else Color.White.copy(alpha = 0.10f),
        ),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(
                text = text,
                color = if (enabled) palette.accent else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 12.dp),
            )
        }
    }
}

@Composable
fun MilestoneProgress(
    progress: Float,
    reached: Boolean,
    palette: LayerPalette,
) {
    @Suppress("DEPRECATION")
    LinearProgressIndicator(
        progress = progress.coerceIn(0f, 1f),
        modifier = Modifier.fillMaxWidth().height(6.dp).clip(CircleShape),
        color = if (reached) palette.success else palette.accent,
        trackColor = Color.White.copy(alpha = 0.08f),
    )
}

@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxWidth().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text("◇", fontSize = 36.sp, color = MaterialTheme.colorScheme.primary)
        Spacer(Modifier.height(12.dp))
        Text(title, style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(6.dp))
        Text(
            body,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

__AD_FILE_5_0__
