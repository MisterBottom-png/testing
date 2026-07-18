from pathlib import Path

ROOT = Path("drum-kit-android")


def replace_exact(path: Path, old: str, new: str, expected: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} copies, found {actual}: {old[:120]!r}")
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


kit_models = ROOT / "core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt"
if "val playableSurfaceBounds: NormalizedRect = drawBounds" in kit_models.read_text(encoding="utf-8"):
    print("Pre-2.6 corrections already applied")
    raise SystemExit(0)

replace_exact(
    kit_models,
    """    val rendererKey: InstrumentRendererKey,\n    val supportRenderZIndex: Int? = null,\n""",
    """    val rendererKey: InstrumentRendererKey,\n    val playableSurfaceBounds: NormalizedRect = drawBounds,\n    val supportRenderZIndex: Int? = null,\n""",
)
replace_exact(
    kit_models,
    """        require(rotationDegrees.isFinite()) { \"rotation must be finite\" }\n        require(supportRenderZIndex == null || supportRenderZIndex < renderZIndex) {\n""",
    """        require(rotationDegrees.isFinite()) { \"rotation must be finite\" }\n        require(\n            playableSurfaceBounds.left >= drawBounds.left &&\n                playableSurfaceBounds.top >= drawBounds.top &&\n                playableSurfaceBounds.right <= drawBounds.right &&\n                playableSurfaceBounds.bottom <= drawBounds.bottom,\n        ) { \"playable surface bounds must stay inside draw bounds\" }\n        require(supportRenderZIndex == null || supportRenderZIndex < renderZIndex) {\n""",
)
replace_exact(
    kit_models,
    """    fun hitTest(screenX: Float, screenY: Float, aspectRatio: Float = 1f): InstrumentDefinition? {\n        for (definition in hitTestOrder) {\n            if (definition.layout.hitRegion.contains(screenX, screenY, aspectRatio)) return definition\n        }\n        return null\n    }\n\n    fun matchingInstrumentCount(screenX: Float, screenY: Float, aspectRatio: Float = 1f): Int {\n        var count = 0\n        for (definition in instruments) {\n            if (definition.layout.hitRegion.contains(screenX, screenY, aspectRatio)) count += 1\n        }\n        return count\n    }\n""",
    """    fun hitTest(screenX: Float, screenY: Float, aspectRatio: Float = 1f): InstrumentDefinition? =\n        StudioKitGeometry.hitTest(screenX, screenY, aspectRatio)?.definition\n\n    fun matchingInstrumentCount(screenX: Float, screenY: Float, aspectRatio: Float = 1f): Int =\n        StudioKitGeometry.matchingInstrumentCount(screenX, screenY, aspectRatio)\n""",
)
replace_between(
    kit_models,
    "    private fun playableHitRegion(\n",
    "    private fun instrument(\n",
    """    private data class HitRegionInsets(\n        val left: Float,\n        val top: Float,\n        val right: Float,\n        val bottom: Float,\n    ) {\n        init {\n            require(left >= 0f && top >= 0f && right >= 0f && bottom >= 0f) {\n                \"hit-region insets must be non-negative\"\n            }\n            require(left + right < 1f && top + bottom < 1f) {\n                \"hit-region insets must preserve positive size\"\n            }\n        }\n    }\n\n    private fun visualSurfaceBounds(\n        drawBounds: NormalizedRect,\n        rendererKey: InstrumentRendererKey,\n    ): NormalizedRect {\n        val width = drawBounds.width\n        val height = drawBounds.height\n        return when (rendererKey) {\n            InstrumentRendererKey.CYMBAL,\n            InstrumentRendererKey.HI_HAT,\n            -> NormalizedRect(\n                left = drawBounds.left,\n                top = drawBounds.top + height * 0.18f,\n                right = drawBounds.right,\n                bottom = drawBounds.bottom - height * 0.28f,\n            )\n\n            InstrumentRendererKey.DRUM,\n            InstrumentRendererKey.SNARE,\n            -> NormalizedRect(\n                left = drawBounds.left,\n                top = drawBounds.top,\n                right = drawBounds.right,\n                bottom = drawBounds.top + height * StudioKitCamera.DRUM_HEAD_HEIGHT_FRACTION_OF_DRAW_BOUNDS,\n            )\n\n            InstrumentRendererKey.KICK -> NormalizedRect(\n                left = drawBounds.left + width * 0.04f,\n                top = drawBounds.top + height * 0.12f,\n                right = drawBounds.right - width * 0.04f,\n                bottom = drawBounds.bottom - height * 0.10f,\n            )\n        }\n    }\n\n    private fun playableHitRegion(\n        instrumentId: InstrumentId,\n        surfaceBounds: NormalizedRect,\n    ): HitRegion {\n        val insets = when (instrumentId) {\n            InstrumentId.CRASH,\n            InstrumentId.RIDE,\n            -> HitRegionInsets(left = 0.04f, top = 0.10f, right = 0.04f, bottom = 0.10f)\n\n            InstrumentId.HI_HAT ->\n                HitRegionInsets(left = 0.05f, top = 0.12f, right = 0.05f, bottom = 0.12f)\n\n            InstrumentId.TOM_HIGH,\n            InstrumentId.TOM_MID,\n            InstrumentId.FLOOR_TOM,\n            -> HitRegionInsets(left = 0.05f, top = 0.08f, right = 0.05f, bottom = 0.08f)\n\n            InstrumentId.SNARE ->\n                HitRegionInsets(left = 0.06f, top = 0.08f, right = 0.06f, bottom = 0.08f)\n\n            InstrumentId.KICK ->\n                HitRegionInsets(left = 0.18f, top = 0.18f, right = 0.08f, bottom = 0.10f)\n        }\n        val hitBounds = inset(surfaceBounds, insets)\n        return EllipseHitRegion(bounds = hitBounds)\n    }\n\n    private fun inset(bounds: NormalizedRect, insets: HitRegionInsets): NormalizedRect =\n        NormalizedRect(\n            left = bounds.left + bounds.width * insets.left,\n            top = bounds.top + bounds.height * insets.top,\n            right = bounds.right - bounds.width * insets.right,\n            bottom = bounds.bottom - bounds.height * insets.bottom,\n        )\n\n""",
)
replace_between(
    kit_models,
    "    private fun instrument(\n",
    "\n}\n\ndata class DrumStrike(",
    """    private fun instrument(\n        id: InstrumentId,\n        drawBounds: NormalizedRect,\n        renderZIndex: Int,\n        hitTestPriority: Int,\n        rotationDegrees: Float,\n        labelPosition: NormalizedPoint,\n        rendererKey: InstrumentRendererKey,\n        pan: Float,\n    ): InstrumentDefinition {\n        val playableSurfaceBounds = visualSurfaceBounds(drawBounds, rendererKey)\n        return InstrumentDefinition(\n            layout = InstrumentLayout(\n                instrumentId = id,\n                drawBounds = drawBounds,\n                hitRegion = playableHitRegion(id, playableSurfaceBounds),\n                renderZIndex = renderZIndex,\n                hitTestPriority = hitTestPriority,\n                rotationDegrees = rotationDegrees,\n                labelPosition = labelPosition,\n                rendererKey = rendererKey,\n                playableSurfaceBounds = playableSurfaceBounds,\n                supportRenderZIndex = when (id) {\n                    InstrumentId.TOM_HIGH,\n                    InstrumentId.TOM_MID,\n                    -> StudioKitDepth.RACK_TOM_MOUNT\n\n                    else -> renderZIndex - 1\n                },\n                supportFloorY = when (id) {\n                    InstrumentId.TOM_HIGH,\n                    InstrumentId.TOM_MID,\n                    -> null\n\n                    else -> StudioKitCamera.FLOOR_PLANE_Y\n                },\n            ),\n            pan = pan,\n        )\n    }\n""",
)

drum_surface = ROOT / "engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt"
replace_exact(
    drum_surface,
    """    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        releaseArtworkCaches()\n        super.onDetachedFromWindow()\n    }\n""",
    """    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        super.onDetachedFromWindow()\n    }\n""",
)
replace_exact(
    drum_surface,
    """        val playable = StudioKitGeometry.playableBounds(\n            layout = state.definition.layout,\n            aspectRatio = viewWidth / viewHeight,\n        )\n""",
    """        val playable = state.definition.layout.playableSurfaceBounds\n""",
)

hit_tests = ROOT / "core-model/src/test/java/com/vitautas/drumkit/model/HitRegionTest.kt"
replace_between(
    hit_tests,
    "    @Test\n    fun snareUsesEntireRenderedHeadInsteadOfDetachedInset()",
    "    private fun definition(id: InstrumentId): InstrumentDefinition =",
    """    @Test\n    fun visualSurfaceBoundsAndHitRegionsAreIndependent() {\n        for (definition in StudioKitDefinition.instruments) {\n            val surface = definition.layout.playableSurfaceBounds\n            val hit = StudioKitGeometry.playableBounds(definition.layout, landscapeAspectRatio)\n\n            assertTrue(hit.left > surface.left)\n            assertTrue(hit.top > surface.top)\n            assertTrue(hit.right < surface.right)\n            assertTrue(hit.bottom < surface.bottom)\n        }\n    }\n\n    @Test\n    fun tunedStudioKitHitRegionsDoNotOverlapAtReferenceViewport() {\n        for (yIndex in 0..140) {\n            val y = yIndex / 140f\n            for (xIndex in 0..280) {\n                val x = xIndex / 280f\n                assertTrue(\n                    \"overlapping targets at ($x, $y)\",\n                    StudioKitDefinition.matchingInstrumentCount(x, y, landscapeAspectRatio) <= 1,\n                )\n            }\n        }\n    }\n\n    @Test\n    fun formerKickSnareOverlapResolvesToOneVisibleTarget() {\n        val snareX = 0.42f\n        val snareY = 0.57f\n\n        assertEquals(1, StudioKitDefinition.matchingInstrumentCount(snareX, snareY, landscapeAspectRatio))\n        assertEquals(InstrumentId.SNARE, StudioKitDefinition.hitTest(snareX, snareY, landscapeAspectRatio)?.id)\n        assertEquals(InstrumentId.KICK, StudioKitDefinition.hitTest(0.51f, 0.685f, landscapeAspectRatio)?.id)\n    }\n\n""",
)

agents = ROOT / "AGENTS.md"
replace_between(
    agents,
    "Implemented:\n",
    "Deliberately deferred unless a task explicitly includes them:\n",
    """Implemented:\n\n- Kotlin and Jetpack Compose application shell\n- Landscape-only immersive activity\n- Raw multi-touch input through a custom Android `View`\n- Independent draw bounds, visual playable-surface bounds, and typed hit regions\n- Viewport-aware rotation shared by rendering, hit testing, strike coordinates, and diagnostics\n- Independent render depth and hit-test priority\n- Cached layered Canvas artwork, support hardware, occlusion masks, and grounded shadows\n- Position-, velocity-, and instrument-specific deformation and rebound\n- Pressure, contact-size, position, and velocity data capture\n- Kotlin-to-C++ JNI bridge and native C++20 Oboe audio engine\n- Fixed-capacity event queue, voice pool, and expressive performance recorder\n- Compact controls, debug-only diagnostics, and system-respecting haptics\n\nKnown remaining redesign targets:\n\n- Complete RenderNode caching where profiling justifies it\n- Representative-device frame-time and bitmap-memory profiling\n- Physical-device hit-region refinement and accessibility play testing\n- Production samples, velocity layers, round robins, and expressive zones\n- Continuous hi-hat, damping, pitch, choke, and recording-export behavior\n\n""",
)
replace_exact(
    agents,
    """- Draw bounds\n- Hit region\n- Render z-index\n""",
    """- Draw bounds\n- Visual playable-surface bounds\n- Hit region\n- Render z-index\n""",
)
replace_exact(
    agents,
    """- Draw bounds describe where artwork is composed.\n- Hit regions describe where input is accepted.\n""",
    """- Draw bounds describe where the complete instrument artwork is composed.\n- Visual playable-surface bounds describe the rendered head or cymbal independently from touch acceptance.\n- Hit regions describe where input is accepted and must not be reused to size artwork.\n""",
)

readme = ROOT / "README.md"
replace_exact(
    readme,
    "- Independent normalized draw bounds and typed hit regions\n",
    "- Independent normalized draw bounds, visual playable-surface bounds, and typed hit regions\n",
)
replace_exact(
    readme,
    """The current redesign implementation separates drawing from touch geometry, resolves overlaps explicitly, applies one fixed camera, merges independently modeled support and surface layers by drummer-view depth, clips grounded shadows around cached canonical instrument masks, renders wine-shell drums, a brushed-steel snare, a detailed dark kick, bronze cymbals, and paired hi-hat discs from cached body/playable artwork layers, anchors supported instruments to one normalized floor plane, removes the permanent HUD, restricts diagnostics to debuggable builds, fades labels, caches renderer objects outside steady-state drawing, and drives local instrument-specific feedback rather than lifting the whole instrument.\n""",
    """The current redesign implementation keeps complete draw bounds, rendered playable-surface bounds, and touch hit regions independent; uses one viewport-aware hit path for runtime input, tests, and diagnostics; removes the former kick/snare target overlap; applies one fixed camera; merges independently modeled support and surface layers by drummer-view depth; clips grounded shadows around cached canonical instrument masks; renders wine-shell drums, a brushed-steel snare, a detailed dark kick, bronze cymbals, and paired hi-hat discs from cached body/playable artwork layers; retains artwork across temporary View detach/reattach cycles; anchors supported instruments to one normalized floor plane; removes the permanent HUD; restricts diagnostics to debuggable builds; fades labels; caches renderer objects outside steady-state drawing; and drives local instrument-specific feedback rather than lifting the whole instrument.\n""",
)
replace_exact(
    readme,
    "3. Tune hit regions and overlap priority using physical-device play tests.\n",
    "3. Validate and refine the corrected hit regions using physical-device play tests.\n",
)

mapping = ROOT / "docs/source-mapping.md"
replace_exact(
    mapping,
    """Phase 2 Step 2.5 replaces the transitional per-frame shell, head, kick, and cymbal primitives with renderer-key artwork profiles and cached Canvas layers built during `onSizeChanged()`. Drum caches separate shell, bottom hoop, lugs, reflections, and wear from the animated batter head and top hoop. The snare uses a brushed-steel material profile. The kick separates its wine shell and rear hoop from the animated dark front head, port, badge, and front hoop. Cymbal caches include bronze edge shading, six lathe rings, deterministic hammering marks, raised bells, highlights, felt/bolt hardware, and a darker lower hi-hat disc. Body and playable layers remain separate so existing position- and velocity-driven deformation continues without rebuilding static detail. Cached bitmaps are released on resize and view detachment.\n""",
    """Phase 2 Step 2.5 replaces the transitional per-frame shell, head, kick, and cymbal primitives with renderer-key artwork profiles and cached Canvas layers built during `onSizeChanged()`. Drum caches separate shell, bottom hoop, lugs, reflections, and wear from the animated batter head and top hoop. The snare uses a brushed-steel material profile. The kick separates its wine shell and rear hoop from the animated dark front head, port, badge, and front hoop. Cymbal caches include bronze edge shading, six lathe rings, deterministic hammering marks, raised bells, highlights, felt/bolt hardware, and a darker lower hi-hat disc. Body and playable layers remain separate so existing position- and velocity-driven deformation continues without rebuilding static detail. Cached bitmaps are released and rebuilt on resize and retained across temporary View detach/reattach cycles.\n\n## Pre-2.6 corrective audit\n\nThe corrective audit separates complete artwork bounds, rendered playable-surface bounds, and touch hit regions into three explicit contracts. Artwork no longer changes size when hit boxes are tuned. All kit-level hit APIs now delegate to the same viewport-aware geometry used by `DrumSurfaceView`. Head and cymbal hit ellipses are inset from visible rims and hardware, and the former kick/snare overlap is removed at the reference landscape viewport.\n""",
)
replace_exact(
    mapping,
    "- Independent draw bounds and playable hit regions\n",
    "- Independent draw bounds, visual playable-surface bounds, and playable hit regions\n",
)
replace_exact(
    mapping,
    """The repository now covers the practical core of Phase 0, the audio-stream portion of Phase 1, the raw multi-touch path from Phase 2, a synthesized placeholder version of the Phase 3 instrument map, the first structural slice of the 2.5D UI redesign, fixed-capacity expressive strike-performance capture, the fixed camera contract, the camera-aligned Phase 2 kit placement, explicit Step 2.3 depth relationships, Step 2.4 hardware occlusion, Step 2.5 cached layered artwork, cached surface masks, a shared floor plane, shared viewport-aware input geometry, and lifecycle-hardened audio operation.\n""",
    """The repository now covers the practical core of Phase 0, the audio-stream portion of Phase 1, the raw multi-touch path from Phase 2, a synthesized placeholder version of the Phase 3 instrument map, the first structural slice of the 2.5D UI redesign, fixed-capacity expressive strike-performance capture, the fixed camera contract, the camera-aligned Phase 2 kit placement, explicit Step 2.3 depth relationships, Step 2.4 hardware occlusion, Step 2.5 cached layered artwork, the pre-2.6 geometry and cache-lifecycle corrections, cached surface masks, a shared floor plane, shared viewport-aware input geometry, and lifecycle-hardened audio operation.\n""",
)

print("Applied guarded pre-2.6 corrections")
