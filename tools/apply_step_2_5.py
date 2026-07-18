from pathlib import Path

ROOT = Path("drum-kit-android")


def edit(path: Path, old: str, new: str, count: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} copies, found {actual}: {old[:120]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def replace_between(path: Path, start: str, end: str, replacement: str) -> None:
    text = path.read_text(encoding="utf-8")
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"{path}: missing start marker {start!r}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"{path}: missing end marker {end!r}")
    path.write_text(text[:start_index] + replacement + text[end_index:], encoding="utf-8")


surface = ROOT / "engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt"
if "private val artworkFactory = LayeredInstrumentArtworkFactory" in surface.read_text(encoding="utf-8"):
    print("Step 2.5 surface integration already applied")
    raise SystemExit(0)

edit(surface, "    private val density = resources.displayMetrics.density\n    private val activePointers = SparseArray<InstrumentId>()\n", "    private val density = resources.displayMetrics.density\n    private val artworkFactory = LayeredInstrumentArtworkFactory(density)\n    private val activePointers = SparseArray<InstrumentId>()\n")
edit(surface, "    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x70000000 }\n    private val shellPaint = Paint(Paint.ANTI_ALIAS_FLAG)\n    private val headPaint = Paint(Paint.ANTI_ALIAS_FLAG)\n    private val cymbalPaint = Paint(Paint.ANTI_ALIAS_FLAG)\n    private val standPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {\n", "    private val shadowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x70000000 }\n    private val artworkPaint = Paint(\n        Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG,\n    )\n    private val standPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {\n")
edit(surface, "    private val rimPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {\n        color = 0xffd3d6d8.toInt()\n        style = Paint.Style.STROKE\n        strokeWidth = density * 3f\n    }\n", "")
edit(surface, "        renderStates.clear()\n", "        releaseArtworkCaches()\n        renderStates.clear()\n")
edit(surface, "    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        super.onDetachedFromWindow()\n    }\n", "    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        releaseArtworkCaches()\n        super.onDetachedFromWindow()\n    }\n")
edit(surface, "    private fun estimateVelocity(pressure: Float, contactSize: Float, eventTime: Long): Float {\n", "    private fun releaseArtworkCaches() {\n        for (state in renderStates) {\n            state.artwork?.release()\n            state.artwork = null\n        }\n    }\n\n    private fun estimateVelocity(pressure: Float, contactSize: Float, eventTime: Long): Float {\n")
edit(surface, "                state.primaryShader = RadialGradient(\n                    state.primaryRect.centerX() - state.primaryRect.width() * 0.16f,\n                    state.primaryRect.centerY() - state.primaryRect.height() * 0.28f,\n                    state.primaryRect.width() * 0.62f,\n                    intArrayOf(0xffffe3a0.toInt(), 0xffc58a35.toInt(), 0xff704213.toInt()),\n                    floatArrayOf(0f, 0.56f, 1f),\n                    Shader.TileMode.CLAMP,\n                )\n", "")
edit(surface, "                state.primaryShader = LinearGradient(\n                    state.primaryRect.left,\n                    state.primaryRect.top,\n                    state.primaryRect.right,\n                    state.primaryRect.bottom,\n                    if (state.definition.layout.rendererKey == InstrumentRendererKey.SNARE) {\n                        intArrayOf(0xff292d31.toInt(), 0xffe1e4e6.toInt(), 0xff555b60.toInt())\n                    } else {\n                        intArrayOf(0xff26070b.toInt(), 0xff7d202c.toInt(), 0xff170408.toInt())\n                    },\n                    null,\n                    Shader.TileMode.CLAMP,\n                )\n                state.secondaryShader = RadialGradient(\n                    state.secondaryRect.centerX() - state.secondaryRect.width() * 0.12f,\n                    state.secondaryRect.centerY() - state.secondaryRect.height() * 0.25f,\n                    state.secondaryRect.width() * 0.58f,\n                    intArrayOf(0xfffaf7ef.toInt(), 0xffd5d0c5.toInt(), 0xff6a6a67.toInt()),\n                    floatArrayOf(0f, 0.68f, 1f),\n                    Shader.TileMode.CLAMP,\n                )\n", "")
edit(surface, "                state.primaryShader = RadialGradient(\n                    state.primaryRect.centerX() - state.primaryRect.width() * 0.18f,\n                    state.primaryRect.centerY() - state.primaryRect.height() * 0.22f,\n                    state.primaryRect.width() * 0.62f,\n                    intArrayOf(0xff8c2731.toInt(), 0xff35070d.toInt(), 0xff090a0c.toInt()),\n                    floatArrayOf(0f, 0.58f, 1f),\n                    Shader.TileMode.CLAMP,\n                )\n                state.secondaryShader = RadialGradient(\n                    state.secondaryRect.centerX() - state.secondaryRect.width() * 0.18f,\n                    state.secondaryRect.centerY() - state.secondaryRect.height() * 0.18f,\n                    state.secondaryRect.width() * 0.58f,\n                    intArrayOf(0xff373b40.toInt(), 0xff14171b.toInt(), 0xff050607.toInt()),\n                    floatArrayOf(0f, 0.62f, 1f),\n                    Shader.TileMode.CLAMP,\n                )\n", "")
edit(surface, "        configureGroundedShadow(state, viewHeight)\n        configureSurfaceOcclusionPath(state)\n", "        configureGroundedShadow(state, viewHeight)\n        configureSurfaceOcclusionPath(state)\n        state.artwork = artworkFactory.create(\n            definition = state.definition,\n            bodyRect = state.primaryRect,\n            playableRect = state.secondaryRect.takeUnless { it.isEmpty } ?: state.primaryRect,\n        )\n")
replacement = '''    private fun drawDrum(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
        snare: Boolean,
    ) {
        val artwork = state.artwork ?: return
        val head = state.secondaryRect
        artwork.drawBody(canvas, artworkPaint)

        val impactX = head.left + animation.strikeX * head.width()
        val impactY = head.top + animation.strikeY * head.height()
        val headSaveCount = canvas.save()
        if (animation.currentDeformation > 0f) {
            canvas.scale(
                1f + animation.currentDeformation * 0.012f,
                1f - animation.currentDeformation * if (snare) 0.035f else 0.055f,
                impactX,
                impactY,
            )
        }
        artwork.drawPlayable(canvas, artworkPaint)
        canvas.restoreToCount(headSaveCount)

        if (animation.currentDeformation > 0f) {
            val radiusX = head.width() * (0.10f + animation.velocity * 0.08f)
            val radiusY = head.height() * (0.08f + animation.velocity * 0.06f)
            scratchRect.set(impactX - radiusX, impactY - radiusY, impactX + radiusX, impactY + radiusY)
            impactPaint.alpha = (animation.currentDeformation * 90f).toInt().coerceIn(0, 90)
            canvas.drawOval(scratchRect, impactPaint)
        }
        drawFlash(canvas, head, animation)
    }

    private fun drawKick(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
    ) {
        val artwork = state.artwork ?: return
        val head = state.secondaryRect
        artwork.drawBody(canvas, artworkPaint)

        val impactX = head.left + animation.strikeX * head.width()
        val impactY = head.top + animation.strikeY * head.height()
        val headSaveCount = canvas.save()
        if (animation.currentDeformation > 0f) {
            val scale = 1f - animation.currentDeformation * 0.045f
            canvas.scale(scale, scale, impactX, impactY)
        }
        artwork.drawPlayable(canvas, artworkPaint)
        canvas.restoreToCount(headSaveCount)
        drawFlash(canvas, head, animation)
    }

    private fun drawCymbal(
        canvas: Canvas,
        state: InstrumentRenderState,
        animation: InstrumentAnimationState,
        hiHat: Boolean,
    ) {
        val artwork = state.artwork ?: return
        val disc = state.primaryRect
        val bounds = state.drawBounds
        val impactX = disc.left + animation.strikeX * disc.width()
        val impactY = disc.top + animation.strikeY * disc.height()

        artwork.drawBody(canvas, artworkPaint)
        val discSaveCount = canvas.save()
        canvas.rotate(animation.currentRotation, impactX, impactY)
        if (hiHat) {
            canvas.translate(0f, -animation.currentDeformation * bounds.height() * 0.07f)
        }
        artwork.drawPlayable(canvas, artworkPaint)
        drawFlash(canvas, disc, animation)
        canvas.restoreToCount(discSaveCount)
    }

'''
replace_between(surface, "    private fun drawDrum(\n", "    private fun drawFlash(\n", replacement)
edit(surface, "        var primaryShader: Shader? = null\n        var secondaryShader: Shader? = null\n", "        var artwork: InstrumentArtworkCache? = null\n")

mapping = ROOT / "docs/source-mapping.md"
edit(mapping, "Phase 2 Step 2.4 merges support and surface layers by explicit depth instead of drawing every stand behind every drum. Rack-tom mounts remain behind the kick, while foreground snare, floor-tom, and hi-hat supports remain in front of background drums and behind their own surfaces. Canonical rotated surface masks are cached during `onSizeChanged()` and reused to clip grounded shadows out of shells, heads, kicks, and cymbals without steady-state allocation. Animated deformation does not alter the canonical occlusion mask or playable hit region.\n\n", "Phase 2 Step 2.4 merges support and surface layers by explicit depth instead of drawing every stand behind every drum. Rack-tom mounts remain behind the kick, while foreground snare, floor-tom, and hi-hat supports remain in front of background drums and behind their own surfaces. Canonical rotated surface masks are cached during `onSizeChanged()` and reused to clip grounded shadows out of shells, heads, kicks, and cymbals without steady-state allocation. Animated deformation does not alter the canonical occlusion mask or playable hit region.\n\n## Cached layered instrument artwork\n\nPhase 2 Step 2.5 replaces the transitional per-frame shell, head, kick, and cymbal primitives with renderer-key artwork profiles and cached Canvas layers built during `onSizeChanged()`. Drum caches separate shell, bottom hoop, lugs, reflections, and wear from the animated batter head and top hoop. The snare uses a brushed-steel material profile. The kick separates its wine shell and rear hoop from the animated dark front head, port, badge, and front hoop. Cymbal caches include bronze edge shading, six lathe rings, deterministic hammering marks, raised bells, highlights, felt/bolt hardware, and a darker lower hi-hat disc. Body and playable layers remain separate so existing position- and velocity-driven deformation continues without rebuilding static detail. Cached bitmaps are released on resize and view detachment.\n\n")
edit(mapping, "- Cached static rectangles, gradients, labels, and shaders created in `onSizeChanged()`\n", "- Cached static rectangles, labels, occlusion paths, and layered instrument artwork created in `onSizeChanged()`\n")
edit(mapping, "- Explicit drummer-view surface depth, independently layered support hardware, cached occlusion masks, and one shared floor plane\n", "- Explicit drummer-view surface depth, independently layered support hardware, cached occlusion masks, layered material profiles, and one shared floor plane\n")
edit(mapping, "- Production layered drum and cymbal assets\n", "")
edit(mapping, "Step 2.4 hardware occlusion, cached surface masks, a shared floor plane", "Step 2.4 hardware occlusion, Step 2.5 cached layered artwork, cached surface masks, a shared floor plane")

readme = ROOT / "README.md"
edit(readme, "- Cached Canvas geometry and shaders created during size changes\n", "- Cached layered Canvas artwork, geometry, and masks created during size changes\n")
edit(readme, "This is a production-oriented foundation, not the finished instrument. The native engine still synthesizes placeholder percussion, and the renderer still uses procedural Canvas layers rather than final pre-rendered or fully RenderNode-cached instrument artwork.\n", "This is a production-oriented foundation, not the finished instrument. The native engine still synthesizes placeholder percussion. The renderer now uses reusable material profiles and cached layered Canvas artwork, while complete RenderNode caching and externally authored texture packs remain deferred.\n")
edit(readme, "The current redesign implementation separates drawing from touch geometry, resolves overlaps explicitly, applies one fixed camera, merges independently modeled support and surface layers by drummer-view depth, clips grounded shadows around cached canonical instrument masks, anchors supported instruments to one normalized floor plane, removes the permanent HUD, restricts diagnostics to debuggable builds, fades labels, caches renderer objects outside steady-state drawing, and drives local instrument-specific feedback rather than lifting the whole instrument.\n", "The current redesign implementation separates drawing from touch geometry, resolves overlaps explicitly, applies one fixed camera, merges independently modeled support and surface layers by drummer-view depth, clips grounded shadows around cached canonical instrument masks, renders wine-shell drums, a brushed-steel snare, a detailed dark kick, bronze cymbals, and paired hi-hat discs from cached body/playable artwork layers, anchors supported instruments to one normalized floor plane, removes the permanent HUD, restricts diagnostics to debuggable builds, fades labels, caches renderer objects outside steady-state drawing, and drives local instrument-specific feedback rather than lifting the whole instrument.\n")
edit(readme, "1. Replace transitional procedural surfaces with cached layered assets or RenderNodes.\n2. Profile rapid multi-touch rendering on representative phones and tablets.\n3. Tune hit regions and overlap priority using physical-device play tests.\n4. Add the expressive snare zones, sample layers, round robins, damping, and pitch gestures.\n5. Add strike-take playback and later PCM/WAV recording export.\n6. Consider AGSL or OpenGL only after profiling proves the Canvas/RenderNode path insufficient.\n", "1. Move complete static instrument layers to RenderNode caching where profiling justifies it.\n2. Profile rapid multi-touch rendering on representative phones and tablets.\n3. Tune hit regions and overlap priority using physical-device play tests.\n4. Add the expressive snare zones, sample layers, round robins, damping, and pitch gestures.\n5. Add strike-take playback and later PCM/WAV recording export.\n6. Consider AGSL or OpenGL only after profiling proves the Canvas/RenderNode path insufficient.\n")

print("Applied Step 2.5 surface integration and documentation")
