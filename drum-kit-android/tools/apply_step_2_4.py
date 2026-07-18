from pathlib import Path

ROOT = Path("drum-kit-android")


def edit(path: Path, old: str, new: str, count: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} copies, found {actual}: {old[:120]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


models = ROOT / "core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt"
if "enum class InstrumentRenderLayerKind" in models.read_text(encoding="utf-8"):
    print("Step 2.4 already applied")
    raise SystemExit(0)

edit(models, "    const val BACK_CYMBAL = 10\n", "    const val BACK_CYMBAL = 10\n    const val RACK_TOM_MOUNT = 15\n")
edit(
    models,
    "}\n\ndata class NormalizedPoint(\n",
    """}

enum class InstrumentRenderLayerKind {
    SUPPORT,
    SURFACE,
}

data class InstrumentRenderLayer(
    val instrumentId: InstrumentId,
    val kind: InstrumentRenderLayerKind,
    val zIndex: Int,
)

data class NormalizedPoint(
""",
)
edit(
    models,
    "    val rendererKey: InstrumentRendererKey,\n    val supportFloorY: Float? = null,\n",
    "    val rendererKey: InstrumentRendererKey,\n    val supportRenderZIndex: Int? = null,\n    val supportFloorY: Float? = null,\n",
)
edit(
    models,
    '        require(rotationDegrees.isFinite()) { "rotation must be finite" }\n',
    '''        require(rotationDegrees.isFinite()) { "rotation must be finite" }
        require(supportRenderZIndex == null || supportRenderZIndex < renderZIndex) {
            "support hardware must render behind its instrument surface"
        }
''',
)
edit(
    models,
    "    val renderOrder: List<InstrumentDefinition> = instruments.sortedBy { it.layout.renderZIndex }\n",
    '''    val renderOrder: List<InstrumentDefinition> = instruments.sortedBy { it.layout.renderZIndex }

    val renderLayers: List<InstrumentRenderLayer> = buildList(instruments.size * 2) {
        for (definition in instruments) {
            definition.layout.supportRenderZIndex?.let { supportZIndex ->
                add(InstrumentRenderLayer(definition.id, InstrumentRenderLayerKind.SUPPORT, supportZIndex))
            }
            add(InstrumentRenderLayer(definition.id, InstrumentRenderLayerKind.SURFACE, definition.layout.renderZIndex))
        }
    }.sortedWith(
        compareBy<InstrumentRenderLayer> { it.zIndex }
            .thenBy { it.kind.ordinal }
            .thenBy { it.instrumentId.ordinal },
    )
''',
)
edit(
    models,
    "            rendererKey = rendererKey,\n            supportFloorY = when (id) {\n",
    '''            rendererKey = rendererKey,
            supportRenderZIndex = when (id) {
                InstrumentId.TOM_HIGH,
                InstrumentId.TOM_MID,
                -> StudioKitDepth.RACK_TOM_MOUNT

                else -> renderZIndex - 1
            },
            supportFloorY = when (id) {
''',
)

view = ROOT / "engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt"
edit(view, "import android.graphics.LinearGradient\n", "import android.graphics.LinearGradient\nimport android.graphics.Matrix\n")
edit(view, "import android.graphics.Paint\n", "import android.graphics.Paint\nimport android.graphics.Path\n")
edit(view, "import com.vitautas.drumkit.model.InstrumentId\n", "import com.vitautas.drumkit.model.InstrumentId\nimport com.vitautas.drumkit.model.InstrumentRenderLayerKind\n")
edit(
    view,
    "    private val renderStates = ArrayList<InstrumentRenderState>(StudioKitDefinition.instruments.size)\n",
    "    private val renderStates = ArrayList<InstrumentRenderState>(StudioKitDefinition.instruments.size)\n    private val renderStatesByInstrument = arrayOfNulls<InstrumentRenderState>(InstrumentId.entries.size)\n",
)
edit(
    view,
    "    private val spotlightRect = RectF()\n    private val scratchRect = RectF()\n",
    '''    private val spotlightRect = RectF()
    private val floorClipRect = RectF()
    private val scratchRect = RectF()
    private val instrumentOcclusionPath = Path()
    private val surfaceRotationMatrix = Matrix()
''',
)
edit(
    view,
    "        spotlightRect.set(-width * 0.10f, -height * 0.25f, width * 1.10f, height * 0.95f)\n",
    '''        spotlightRect.set(-width * 0.10f, -height * 0.25f, width * 1.10f, height * 0.95f)
        floorClipRect.set(0f, StudioKitCamera.HORIZON_Y * height, width.toFloat(), height.toFloat())
''',
)
edit(
    view,
    '''        renderStates.clear()
        for (definition in StudioKitDefinition.renderOrder) {
            val state = InstrumentRenderState(definition)
            configureRenderState(state, width.toFloat(), height.toFloat())
            renderStates += state
        }
''',
    '''        renderStates.clear()
        renderStatesByInstrument.fill(null)
        instrumentOcclusionPath.reset()
        for (definition in StudioKitDefinition.renderOrder) {
            val state = InstrumentRenderState(definition)
            configureRenderState(state, width.toFloat(), height.toFloat())
            renderStates += state
            renderStatesByInstrument[definition.id.ordinal] = state
            instrumentOcclusionPath.addPath(state.surfaceOcclusionPath)
        }
''',
)
edit(
    view,
    '''        for (renderState in renderStates) {
            drawInstrumentSupport(canvas, renderState)
        }
        for (renderState in renderStates) {
            val animationState = animationStates[renderState.definition.id.ordinal]
            drawInstrumentSurface(canvas, renderState, animationState)
        }
''',
    '''        for (renderLayer in StudioKitDefinition.renderLayers) {
            val renderState = renderStatesByInstrument[renderLayer.instrumentId.ordinal] ?: continue
            when (renderLayer.kind) {
                InstrumentRenderLayerKind.SUPPORT -> drawInstrumentSupport(canvas, renderState)
                InstrumentRenderLayerKind.SURFACE -> drawInstrumentSurface(
                    canvas,
                    renderState,
                    animationStates[renderState.definition.id.ordinal],
                )
            }
        }
''',
)
edit(
    view,
    "        }\n    }\n\n    private fun drawInstrumentShadow(canvas: Canvas, state: InstrumentRenderState) {\n",
    '''        }
        configureGroundedShadow(state, viewHeight)
        configureSurfaceOcclusionPath(state)
    }

    private fun configureGroundedShadow(state: InstrumentRenderState, viewHeight: Float) {
        val source = state.primaryRect
        val widthScale = when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL -> 0.62f
            InstrumentRendererKey.HI_HAT -> 0.52f
            InstrumentRendererKey.DRUM -> 0.78f
            InstrumentRendererKey.SNARE -> 0.76f
            InstrumentRendererKey.KICK -> 0.88f
        }
        val floorY = StudioKitCamera.FLOOR_PLANE_Y * viewHeight
        val shadowWidth = source.width() * widthScale
        val shadowHeight = maxOf(density * 5f, state.drawBounds.height() * 0.055f)
        val centerX = source.centerX()
        state.shadowRect.set(
            centerX - shadowWidth * 0.5f,
            floorY - shadowHeight * 0.72f,
            centerX + shadowWidth * 0.5f,
            floorY + shadowHeight * 0.28f,
        )
    }

    private fun configureSurfaceOcclusionPath(state: InstrumentRenderState) {
        val path = state.surfaceOcclusionPath
        path.reset()
        when (state.definition.layout.rendererKey) {
            InstrumentRendererKey.CYMBAL,
            InstrumentRendererKey.HI_HAT,
            -> path.addOval(state.primaryRect, Path.Direction.CW)

            InstrumentRendererKey.DRUM,
            InstrumentRendererKey.SNARE,
            -> {
                val shell = state.primaryRect
                path.addRoundRect(
                    shell,
                    shell.width() * 0.16f,
                    shell.height() * 0.12f,
                    Path.Direction.CW,
                )
                path.addOval(state.secondaryRect, Path.Direction.CW)
            }

            InstrumentRendererKey.KICK -> {
                path.addOval(state.primaryRect, Path.Direction.CW)
                path.addOval(state.secondaryRect, Path.Direction.CW)
            }
        }

        val rotationDegrees = state.definition.layout.rotationDegrees
        if (rotationDegrees != 0f) {
            val bounds = state.drawBounds
            surfaceRotationMatrix.reset()
            surfaceRotationMatrix.setRotate(rotationDegrees, bounds.centerX(), bounds.centerY())
            path.transform(surfaceRotationMatrix)
        }
    }

    private fun drawInstrumentShadow(canvas: Canvas, state: InstrumentRenderState) {
''',
)
edit(
    view,
    '''    private fun drawInstrumentShadow(canvas: Canvas, state: InstrumentRenderState) {
        val saveCount = canvas.save()
        val bounds = state.drawBounds
        canvas.rotate(
            state.definition.layout.rotationDegrees,
            bounds.centerX(),
            bounds.centerY(),
        )
        canvas.drawOval(state.shadowRect, shadowPaint)
        canvas.restoreToCount(saveCount)
    }
''',
    '''    private fun drawInstrumentShadow(canvas: Canvas, state: InstrumentRenderState) {
        val saveCount = canvas.save()
        canvas.clipRect(floorClipRect)
        canvas.clipOutPath(instrumentOcclusionPath)
        val shadow = state.shadowRect
        canvas.rotate(
            state.definition.layout.rotationDegrees * 0.35f,
            shadow.centerX(),
            shadow.centerY(),
        )
        canvas.drawOval(shadow, shadowPaint)
        canvas.restoreToCount(saveCount)
    }
''',
)
edit(view, "        val shadowRect = RectF()\n", "        val shadowRect = RectF()\n        val surfaceOcclusionPath = Path()\n")

(ROOT / "core-model/src/test/java/com/vitautas/drumkit/model/RenderLayerTest.kt").write_text(
    '''package com.vitautas.drumkit.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class RenderLayerTest {
    @Test
    fun everyInstrumentHasOneSupportAndOneSurfaceLayer() {
        assertEquals(StudioKitDefinition.instruments.size * 2, StudioKitDefinition.renderLayers.size)
        for (instrument in InstrumentId.entries) {
            assertEquals(1, count(instrument, InstrumentRenderLayerKind.SUPPORT))
            assertEquals(1, count(instrument, InstrumentRenderLayerKind.SURFACE))
        }
    }

    @Test
    fun supportHardwareRendersBehindItsOwnSurface() {
        for (instrument in InstrumentId.entries) {
            assertTrue(index(instrument, InstrumentRenderLayerKind.SUPPORT) < index(instrument, InstrumentRenderLayerKind.SURFACE))
        }
    }

    @Test
    fun rackTomMountsStayBehindKickWhileRackTomSurfacesStayInFront() {
        val kick = index(InstrumentId.KICK, InstrumentRenderLayerKind.SURFACE)
        assertTrue(index(InstrumentId.TOM_HIGH, InstrumentRenderLayerKind.SUPPORT) < kick)
        assertTrue(index(InstrumentId.TOM_MID, InstrumentRenderLayerKind.SUPPORT) < kick)
        assertTrue(kick < index(InstrumentId.TOM_HIGH, InstrumentRenderLayerKind.SURFACE))
        assertTrue(kick < index(InstrumentId.TOM_MID, InstrumentRenderLayerKind.SURFACE))
    }

    @Test
    fun foregroundSupportsAreNotFlattenedBehindBackgroundDrums() {
        val kick = index(InstrumentId.KICK, InstrumentRenderLayerKind.SURFACE)
        val rackTom = index(InstrumentId.TOM_MID, InstrumentRenderLayerKind.SURFACE)
        assertTrue(kick < index(InstrumentId.FLOOR_TOM, InstrumentRenderLayerKind.SUPPORT))
        assertTrue(kick < index(InstrumentId.HI_HAT, InstrumentRenderLayerKind.SUPPORT))
        assertTrue(kick < index(InstrumentId.SNARE, InstrumentRenderLayerKind.SUPPORT))
        assertTrue(rackTom < index(InstrumentId.SNARE, InstrumentRenderLayerKind.SUPPORT))
    }

    private fun count(id: InstrumentId, kind: InstrumentRenderLayerKind): Int =
        StudioKitDefinition.renderLayers.count { it.instrumentId == id && it.kind == kind }

    private fun index(id: InstrumentId, kind: InstrumentRenderLayerKind): Int =
        StudioKitDefinition.renderLayers.indexOfFirst { it.instrumentId == id && it.kind == kind }
}
''',
    encoding="utf-8",
)

docs = ROOT / "docs/source-mapping.md"
edit(docs, "- Exact segment clipping and hidden-hardware masks remain reserved for Step 2.4.\n", "")
edit(
    docs,
    "## Prototype behavior represented in the base\n",
    '''## Hardware occlusion and shadow masks

Phase 2 Step 2.4 merges support and surface layers by explicit depth instead of drawing every stand behind every drum. Rack-tom mounts remain behind the kick, while foreground snare, floor-tom, and hi-hat supports remain in front of background drums and behind their own surfaces. Canonical rotated surface masks are cached during `onSizeChanged()` and reused to clip grounded shadows out of shells, heads, kicks, and cymbals without steady-state allocation. Animated deformation does not alter the canonical occlusion mask or playable hit region.

## Prototype behavior represented in the base
''',
)
edit(docs, "- Correct hardware occlusion and clipping\n", "")
edit(docs, "- Explicit drummer-view surface depth, background support hardware, and one shared floor plane\n", "- Explicit drummer-view surface depth, independently layered support hardware, cached occlusion masks, and one shared floor plane\n")
edit(docs, "explicit Step 2.3 depth relationships, a shared floor plane", "explicit Step 2.3 depth relationships, Step 2.4 hardware occlusion, cached surface masks, a shared floor plane")

readme = ROOT / "README.md"
edit(readme, "- Explicit surface depth, background support-hardware passes, and one shared floor plane\n", "- Explicit surface and support depth, cached occlusion masks, and one shared floor plane\n")
edit(
    readme,
    "orders surfaces by drummer-view depth, renders support hardware behind playable surfaces, anchors supported instruments",
    "merges independently modeled support and surface layers by drummer-view depth, clips grounded shadows around cached canonical instrument masks, anchors supported instruments",
)
edit(readme, "1. Correct hardware occlusion and clip hidden stand or leg segments around shells and cymbals.\n2. Replace transitional procedural surfaces with cached layered assets or RenderNodes.\n3. Profile rapid multi-touch rendering on representative phones and tablets.\n4. Tune hit regions and overlap priority using physical-device play tests.\n5. Add the expressive snare zones, sample layers, round robins, damping, and pitch gestures.\n6. Add strike-take playback and later PCM/WAV recording export.\n7. Consider AGSL or OpenGL only after profiling proves the Canvas/RenderNode path insufficient.\n", "1. Replace transitional procedural surfaces with cached layered assets or RenderNodes.\n2. Profile rapid multi-touch rendering on representative phones and tablets.\n3. Tune hit regions and overlap priority using physical-device play tests.\n4. Add the expressive snare zones, sample layers, round robins, damping, and pitch gestures.\n5. Add strike-take playback and later PCM/WAV recording export.\n6. Consider AGSL or OpenGL only after profiling proves the Canvas/RenderNode path insufficient.\n")
