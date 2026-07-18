from pathlib import Path

ROOT = Path("drum-kit-android")


def replace_exact(path: Path, old: str, new: str, expected: int = 1) -> None:
    text = path.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != expected:
        raise SystemExit(f"{path}: expected {expected} copies, found {actual}: {old[:120]!r}")
    path.write_text(text.replace(old, new), encoding="utf-8")


geometry = ROOT / "core-model/src/main/java/com/vitautas/drumkit/model/InstrumentGeometry.kt"
if "fun hitBounds(layout: InstrumentLayout" in geometry.read_text(encoding="utf-8"):
    print("Surface-coordinate correction already applied")
    raise SystemExit(0)

replace_exact(
    geometry,
    """    fun playableBounds(layout: InstrumentLayout, aspectRatio: Float): GeometryBounds {\n        require(aspectRatio.isFinite() && aspectRatio > 0f) {\n            \"aspect ratio must be positive and finite\"\n        }\n        return boundsFor(layout.hitRegion, aspectRatio)\n    }\n""",
    """    fun playableBounds(layout: InstrumentLayout, aspectRatio: Float): GeometryBounds {\n        require(aspectRatio.isFinite() && aspectRatio > 0f) {\n            \"aspect ratio must be positive and finite\"\n        }\n        return layout.playableSurfaceBounds.toGeometryBounds()\n    }\n\n    fun hitBounds(layout: InstrumentLayout, aspectRatio: Float): GeometryBounds {\n        require(aspectRatio.isFinite() && aspectRatio > 0f) {\n            \"aspect ratio must be positive and finite\"\n        }\n        return boundsFor(layout.hitRegion, aspectRatio)\n    }\n""",
)
replace_exact(
    geometry,
    """        val bounds = boundsFor(layout.hitRegion, aspectRatio)\n        val unrotatedX = bounds.left + normalizedX * bounds.width\n""",
    """        val bounds = layout.playableSurfaceBounds.toGeometryBounds()\n        val unrotatedX = bounds.left + normalizedX * bounds.width\n""",
)
replace_exact(
    geometry,
    """        val bounds = boundsFor(layout.hitRegion, aspectRatio)\n        return InstrumentHit(\n            definition = definition,\n            normalizedX = ((unrotated.x - bounds.left) / bounds.width).coerceIn(0f, 1f),\n            normalizedY = ((unrotated.y - bounds.top) / bounds.height).coerceIn(0f, 1f),\n        )\n""",
    """        val bounds = layout.playableSurfaceBounds.toGeometryBounds()\n        return InstrumentHit(\n            definition = definition,\n            normalizedX = ((unrotated.x - bounds.left) / bounds.width).coerceIn(0f, 1f),\n            normalizedY = ((unrotated.y - bounds.top) / bounds.height).coerceIn(0f, 1f),\n        )\n""",
)

kit_models = ROOT / "core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt"
replace_exact(
    kit_models,
    """    override fun contains(x: Float, y: Float): Boolean {\n        val dx = x - center.x\n        val dy = y - center.y\n        return dx * dx + dy * dy <= radius * radius\n    }\n""",
    """    override fun contains(x: Float, y: Float): Boolean = contains(x, y, 1f)\n\n    override fun contains(x: Float, y: Float, aspectRatio: Float): Boolean {\n        require(aspectRatio.isFinite() && aspectRatio > 0f) {\n            \"aspect ratio must be positive and finite\"\n        }\n        val dx = (x - center.x) * aspectRatio\n        val dy = y - center.y\n        return dx * dx + dy * dy <= radius * radius\n    }\n""",
)

hit_tests = ROOT / "core-model/src/test/java/com/vitautas/drumkit/model/HitRegionTest.kt"
replace_exact(
    hit_tests,
    """    fun circleUsesIndependentCenterAndRadius() {\n        val region = CircleHitRegion(NormalizedPoint(0.5f, 0.5f), 0.2f)\n\n        assertTrue(region.contains(0.6f, 0.5f))\n        assertFalse(region.contains(0.8f, 0.5f))\n    }\n""",
    """    fun circleUsesIndependentCenterAndRadius() {\n        val region = CircleHitRegion(NormalizedPoint(0.5f, 0.5f), 0.2f)\n\n        assertTrue(region.contains(0.6f, 0.5f))\n        assertFalse(region.contains(0.8f, 0.5f))\n        assertTrue(region.contains(0.5f + 0.19f / landscapeAspectRatio, 0.5f, landscapeAspectRatio))\n        assertFalse(region.contains(0.69f, 0.5f, landscapeAspectRatio))\n    }\n""",
)
replace_exact(
    hit_tests,
    "val hit = StudioKitGeometry.playableBounds(definition.layout, landscapeAspectRatio)\n",
    "val hit = StudioKitGeometry.hitBounds(definition.layout, landscapeAspectRatio)\n",
)

geometry_tests = ROOT / "core-model/src/test/java/com/vitautas/drumkit/model/InstrumentGeometryTest.kt"
replace_exact(
    geometry_tests,
    """    @Test\n    fun snareVisualCenterIsAcousticCenter() {\n""",
    """    @Test\n    fun insetKickHitCenterKeepsVisualSurfaceLocalCoordinates() {\n        val kick = definition(InstrumentId.KICK)\n        val surface = StudioKitGeometry.playableBounds(kick.layout, landscapeAspectRatio)\n        val hitBounds = StudioKitGeometry.hitBounds(kick.layout, landscapeAspectRatio)\n        val expectedX = (hitBounds.centerX - surface.left) / surface.width\n        val expectedY = (hitBounds.centerY - surface.top) / surface.height\n\n        val hit = StudioKitGeometry.hitTest(hitBounds.centerX, hitBounds.centerY, landscapeAspectRatio)\n        assertEquals(InstrumentId.KICK, hit?.definition?.id)\n        assertEquals(expectedX, hit?.normalizedX ?: Float.NaN, 0.00001f)\n        assertEquals(expectedY, hit?.normalizedY ?: Float.NaN, 0.00001f)\n\n        val roundTrip = StudioKitGeometry.screenPoint(\n            layout = kick.layout,\n            normalizedX = expectedX,\n            normalizedY = expectedY,\n            aspectRatio = landscapeAspectRatio,\n        )\n        assertEquals(hitBounds.centerX, roundTrip.x, 0.00001f)\n        assertEquals(hitBounds.centerY, roundTrip.y, 0.00001f)\n    }\n\n    @Test\n    fun snareVisualCenterIsAcousticCenter() {\n""",
)

mapping = ROOT / "docs/source-mapping.md"
replace_exact(
    mapping,
    """The corrective audit separates complete artwork bounds, rendered playable-surface bounds, and touch hit regions into three explicit contracts. Artwork no longer changes size when hit boxes are tuned. All kit-level hit APIs now delegate to the same viewport-aware geometry used by `DrumSurfaceView`. Head and cymbal hit ellipses are inset from visible rims and hardware, and the former kick/snare overlap is removed at the reference landscape viewport.\n""",
    """The corrective audit separates complete artwork bounds, rendered playable-surface bounds, and touch hit regions into three explicit contracts. Artwork no longer changes size when hit boxes are tuned. All kit-level hit APIs now delegate to the same viewport-aware geometry used by `DrumSurfaceView`. Head and cymbal hit ellipses are inset from visible rims and hardware, and the former kick/snare overlap is removed at the reference landscape viewport. Containment uses the inset region while normalized strike coordinates remain local to the rendered playable surface, keeping animation and position-sensitive audio aligned with the physical tap.\n""",
)

print("Applied surface-coordinate correction")
