from pathlib import Path
import re

ROOT = Path("drum-kit-android")


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_all(text: str, old: str, new: str, expected: int, label: str) -> str:
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"{label}: expected {expected} matches, found {count}")
    return text.replace(old, new)


# Version catalog: retain current stable build stack and add direct AndroidX dependencies.
path = "gradle/libs.versions.toml"
text = read(path)
text = replace_once(
    text,
    'activityCompose = "1.13.0"\noboe = "1.10.0"',
    'activityCompose = "1.13.0"\nandroidxCore = "1.19.0"\nandroidxAnnotation = "1.10.0"\noboe = "1.10.0"',
    "version catalog versions",
)
text = replace_once(
    text,
    'androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }\n',
    'androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }\n'
    'androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "androidxCore" }\n'
    'androidx-annotation = { module = "androidx.annotation:annotation", version.ref = "androidxAnnotation" }\n',
    "version catalog libraries",
)
write(path, text)

# Remove the obsolete standalone Kotlin Gradle plugin bridge; AGP 9 uses built-in Kotlin.
path = "build.gradle.kts"
text = read(path)
text = replace_once(
    text,
    'buildscript {\n    repositories {\n        google()\n        mavenCentral()\n    }\n    dependencies {\n        // Keep aligned with the Kotlin version in gradle/libs.versions.toml.\n        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.0")\n    }\n}\n\n',
    '',
    "root Kotlin buildscript bridge",
)
write(path, text)

# Modernize every Android module baseline and make Kotlin/lint warnings authoritative.
modules = ["app", "core-model", "engine-input", "engine-audio", "feature-kit"]
for module in modules:
    path = f"{module}/build.gradle.kts"
    text = read(path)
    text = replace_once(text, "    compileSdk = 36\n", "    compileSdk = 37\n    buildToolsVersion = \"37.0.0\"\n", f"{module} compile SDK")
    if module == "app":
        text = replace_once(text, "        targetSdk = 36", "        targetSdk = 37", "app target SDK")
    if module == "engine-audio":
        text = replace_once(text, '    ndkVersion = "28.2.13676358"', '    ndkVersion = "29.0.14206865"', "NDK r29")

    android_end = "    compileOptions {\n        sourceCompatibility = JavaVersion.VERSION_17\n        targetCompatibility = JavaVersion.VERSION_17\n    }\n"
    lint_block = (
        android_end
        + "\n    lint {\n"
        + "        abortOnError = true\n"
        + "        warningsAsErrors = true\n"
        + ("        checkDependencies = true\n" if module == "app" else "")
        + "    }\n"
    )
    text = replace_once(text, android_end, lint_block, f"{module} lint policy")
    text = replace_once(
        text,
        "}\n\ndependencies {",
        "}\n\nkotlin {\n    compilerOptions {\n        allWarningsAsErrors.set(true)\n    }\n}\n\ndependencies {",
        f"{module} Kotlin warning policy",
    )
    write(path, text)

# Direct dependencies and focused engine-input tests.
path = "app/build.gradle.kts"
text = read(path)
text = replace_once(
    text,
    "    implementation(libs.androidx.activity.compose)\n",
    "    implementation(libs.androidx.activity.compose)\n    implementation(libs.androidx.core.ktx)\n",
    "app direct core dependency",
)
write(path, text)

path = "engine-input/build.gradle.kts"
text = read(path)
text = replace_once(
    text,
    '    implementation(project(":core-model"))\n',
    '    implementation(project(":core-model"))\n    implementation(libs.androidx.annotation)\n\n    testImplementation(libs.junit)\n',
    "engine-input dependencies",
)
write(path, text)

# Enable configuration cache in addition to the existing parallel and build caches.
path = "gradle.properties"
text = read(path)
text = replace_once(
    text,
    "org.gradle.caching=true\n",
    "org.gradle.caching=true\norg.gradle.configuration-cache=true\n",
    "configuration cache",
)
write(path, text)

# Use an API-annotated RenderNode implementation with a defensive bitmap fallback.
path = "engine-input/src/main/java/com/vitautas/drumkit/input/CachedArtworkLayer.kt"
text = read(path)
text = text.replace("import android.annotation.SuppressLint\n", "")
text = replace_once(
    text,
    "import android.os.Build\n",
    "import android.os.Build\nimport androidx.annotation.RequiresApi\n",
    "RenderNode annotation import",
)
old_branch = '''            ArtworkCacheBackend.RENDER_NODE -> {
                check(Build.VERSION.SDK_INT >= ArtworkCacheBackendPolicy.RENDER_NODE_MIN_SDK) {
                    "RenderNode artwork requires API ${ArtworkCacheBackendPolicy.RENDER_NODE_MIN_SDK}+"
                }
                Api29RenderNodeArtworkLayer(
                    name = name,
                    width = width,
                    height = height,
                    left = left,
                    top = top,
                    localRect = localRect,
                    drawLayer = drawLayer,
                )
            }
'''
new_branch = '''            ArtworkCacheBackend.RENDER_NODE -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                Api29RenderNodeArtworkLayer(
                    name = name,
                    width = width,
                    height = height,
                    left = left,
                    top = top,
                    localRect = localRect,
                    drawLayer = drawLayer,
                )
            } else {
                BitmapArtworkLayer(
                    width = width,
                    height = height,
                    left = left,
                    top = top,
                    localRect = localRect,
                    drawLayer = drawLayer,
                )
            }
'''
text = replace_once(text, old_branch, new_branch, "RenderNode defensive fallback")
text = replace_once(text, '@SuppressLint("NewApi")\nprivate class Api29RenderNodeArtworkLayer(', '@RequiresApi(Build.VERSION_CODES.Q)\nprivate class Api29RenderNodeArtworkLayer(', "RenderNode API annotation")
write(path, text)

# Integrate cache backends into the layered artwork factory.
path = "engine-input/src/main/java/com/vitautas/drumkit/input/LayeredInstrumentArtwork.kt"
text = read(path)
for old in ["import android.graphics.Bitmap\n", "import kotlin.math.ceil\n", "import kotlin.math.floor\n"]:
    text = text.replace(old, "")
local_cache = '''internal class CachedArtworkLayer(
    private val bitmap: Bitmap,
    private val left: Float,
    private val top: Float,
) {
    fun draw(canvas: Canvas, paint: Paint) {
        canvas.drawBitmap(bitmap, left, top, paint)
    }

    fun release() {
        if (!bitmap.isRecycled) bitmap.recycle()
    }
}

'''
text = replace_once(text, local_cache, "", "remove legacy bitmap-only layer")
text = replace_once(
    text,
    "        playableRect: RectF,\n    ): InstrumentArtworkCache {",
    "        playableRect: RectF,\n        backend: ArtworkCacheBackend,\n    ): InstrumentArtworkCache {",
    "artwork create backend parameter",
)
text = replace_once(
    text,
    "            -> createDrumArtwork(bodyRect, playableRect, profile.material)\n\n            InstrumentRendererKey.KICK -> createKickArtwork(bodyRect, playableRect)\n            InstrumentRendererKey.CYMBAL -> createCymbalArtwork(playableRect, hiHat = false)\n            InstrumentRendererKey.HI_HAT -> createCymbalArtwork(playableRect, hiHat = true)",
    "            -> createDrumArtwork(definition.id.name, bodyRect, playableRect, profile.material, backend)\n\n            InstrumentRendererKey.KICK -> createKickArtwork(definition.id.name, bodyRect, playableRect, backend)\n            InstrumentRendererKey.CYMBAL -> createCymbalArtwork(definition.id.name, playableRect, hiHat = false, backend)\n            InstrumentRendererKey.HI_HAT -> createCymbalArtwork(definition.id.name, playableRect, hiHat = true, backend)",
    "renderer backend routing",
)
text = replace_once(
    text,
    "    private fun createDrumArtwork(\n        shellRect: RectF,\n        headRect: RectF,\n        material: InstrumentArtworkMaterial,\n    ): InstrumentArtworkCache = InstrumentArtworkCache(\n        bodyLayer = createLayer(shellRect, density * 5f) { canvas, localRect ->",
    "    private fun createDrumArtwork(\n        name: String,\n        shellRect: RectF,\n        headRect: RectF,\n        material: InstrumentArtworkMaterial,\n        backend: ArtworkCacheBackend,\n    ): InstrumentArtworkCache = InstrumentArtworkCache(\n        bodyLayer = createLayer(backend, \"$name-body\", shellRect, density * 5f) { canvas, localRect ->",
    "drum body cache backend",
)
text = replace_once(text, "        playableLayer = createLayer(headRect, density * 5f) { canvas, localRect ->", "        playableLayer = createLayer(backend, \"$name-playable\", headRect, density * 5f) { canvas, localRect ->", "drum playable cache backend")
text = replace_once(
    text,
    "    private fun createKickArtwork(shellRect: RectF, headRect: RectF): InstrumentArtworkCache =\n        InstrumentArtworkCache(\n            bodyLayer = createLayer(shellRect, density * 6f, ::drawKickBody),\n            playableLayer = createLayer(headRect, density * 6f, ::drawKickHead),\n        )",
    "    private fun createKickArtwork(\n        name: String,\n        shellRect: RectF,\n        headRect: RectF,\n        backend: ArtworkCacheBackend,\n    ): InstrumentArtworkCache = InstrumentArtworkCache(\n        bodyLayer = createLayer(backend, \"$name-body\", shellRect, density * 6f, ::drawKickBody),\n        playableLayer = createLayer(backend, \"$name-playable\", headRect, density * 6f, ::drawKickHead),\n    )",
    "kick cache backend",
)
text = replace_once(
    text,
    "    private fun createCymbalArtwork(discRect: RectF, hiHat: Boolean): InstrumentArtworkCache {",
    "    private fun createCymbalArtwork(\n        name: String,\n        discRect: RectF,\n        hiHat: Boolean,\n        backend: ArtworkCacheBackend,\n    ): InstrumentArtworkCache {",
    "cymbal backend signature",
)
text = replace_once(text, "            createLayer(lowerRect, density * 5f) { canvas, localRect ->", "            createLayer(backend, \"$name-lower\", lowerRect, density * 5f) { canvas, localRect ->", "hi-hat lower cache")
text = replace_once(text, "            playableLayer = createLayer(discRect, density * 5f) { canvas, localRect ->", "            playableLayer = createLayer(backend, \"$name-playable\", discRect, density * 5f) { canvas, localRect ->", "cymbal playable cache")
old_create_layer = '''    private fun createLayer(
        sourceRect: RectF,
        padding: Float,
        drawLayer: (Canvas, RectF) -> Unit,
    ): CachedArtworkLayer {
        val left = floor(sourceRect.left - padding)
        val top = floor(sourceRect.top - padding)
        val right = ceil(sourceRect.right + padding)
        val bottom = ceil(sourceRect.bottom + padding)
        val width = (right - left).toInt().coerceAtLeast(1)
        val height = (bottom - top).toInt().coerceAtLeast(1)
        val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        val localRect = RectF(
            sourceRect.left - left,
            sourceRect.top - top,
            sourceRect.right - left,
            sourceRect.bottom - top,
        )
        drawLayer(canvas, localRect)
        return CachedArtworkLayer(bitmap, left, top)
    }
'''
new_create_layer = '''    private fun createLayer(
        backend: ArtworkCacheBackend,
        name: String,
        sourceRect: RectF,
        padding: Float,
        drawLayer: (Canvas, RectF) -> Unit,
    ): CachedArtworkLayer = CachedArtworkLayerFactory.create(
        backend = backend,
        name = name,
        sourceRect = sourceRect,
        padding = padding,
        drawLayer = drawLayer,
    )
'''
text = replace_once(text, old_create_layer, new_create_layer, "layer factory delegation")
write(path, text)

# Select and rebuild the backend with View attachment state, and expose permanent disposal.
path = "engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt"
text = read(path)
text = replace_once(text, "import android.graphics.Shader\n", "import android.graphics.Shader\nimport android.os.Build\n", "Build import")
text = replace_once(text, "    private var rackMountY = 0f\n", "    private var rackMountY = 0f\n    private var artworkBackend = ArtworkCacheBackend.BITMAP\n", "artwork backend state")
text = replace_once(
    text,
    "        if (width <= 0 || height <= 0) return\n\n        stagePaint.shader",
    "        if (width <= 0 || height <= 0) return\n\n        artworkBackend = ArtworkCacheBackendPolicy.select(Build.VERSION.SDK_INT, isHardwareAccelerated)\n        stagePaint.shader",
    "size backend selection",
)
old_attach = '''    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (width <= 0 || height <= 0) return

        labelsVisibleSinceNanos = System.nanoTime()
'''
new_attach = '''    override fun onAttachedToWindow() {
        super.onAttachedToWindow()
        if (width <= 0 || height <= 0) return

        val desiredBackend = ArtworkCacheBackendPolicy.select(Build.VERSION.SDK_INT, isHardwareAccelerated)
        if (desiredBackend != artworkBackend) {
            rebuildArtworkCaches(desiredBackend)
        }
        labelsVisibleSinceNanos = System.nanoTime()
'''
text = replace_once(text, old_attach, new_attach, "attach backend refresh")
text = replace_once(
    text,
    "    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        super.onDetachedFromWindow()\n    }\n",
    "    override fun onDetachedFromWindow() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        super.onDetachedFromWindow()\n    }\n\n    fun releaseResources() {\n        removeCallbacks(labelFadeRunnable)\n        clearActivePointers()\n        releaseArtworkCaches()\n        renderStates.clear()\n        renderStatesByInstrument.fill(null)\n        instrumentOcclusionPath.reset()\n    }\n",
    "permanent View resource release",
)
text = replace_once(
    text,
    "    private fun releaseArtworkCaches() {\n        for (state in renderStates) {\n            state.artwork?.release()\n            state.artwork = null\n        }\n    }\n",
    "    private fun releaseArtworkCaches() {\n        for (state in renderStates) {\n            state.artwork?.release()\n            state.artwork = null\n        }\n    }\n\n    private fun rebuildArtworkCaches(backend: ArtworkCacheBackend) {\n        releaseArtworkCaches()\n        artworkBackend = backend\n        for (state in renderStates) {\n            state.artwork = createArtwork(state)\n        }\n    }\n\n    private fun createArtwork(state: InstrumentRenderState): InstrumentArtworkCache = artworkFactory.create(\n        definition = state.definition,\n        bodyRect = state.primaryRect,\n        playableRect = state.secondaryRect.takeUnless { it.isEmpty } ?: state.primaryRect,\n        backend = artworkBackend,\n    )\n",
    "cache rebuild helpers",
)
text = replace_once(
    text,
    "        state.artwork = artworkFactory.create(\n            definition = state.definition,\n            bodyRect = state.primaryRect,\n            playableRect = state.secondaryRect.takeUnless { it.isEmpty } ?: state.primaryRect,\n        )",
    "        state.artwork = createArtwork(state)",
    "render-state cache creation",
)
write(path, text)

# Use modern AndroidView permanent-release callback.
path = "feature-kit/src/main/java/com/vitautas/drumkit/feature/kit/DrumKitScreen.kt"
text = read(path)
text = replace_once(
    text,
    "            update = { surface ->\n                surface.onStrike = strikeDispatcher\n                surface.hapticsEnabled = haptics\n            },\n            modifier = Modifier.fillMaxSize(),\n",
    "            update = { surface ->\n                surface.onStrike = strikeDispatcher\n                surface.hapticsEnabled = haptics\n            },\n            onReset = null,\n            onRelease = { surface -> surface.releaseResources() },\n            modifier = Modifier.fillMaxSize(),\n",
    "AndroidView release callback",
)
write(path, text)

# Prefer the generated variant constant to manual application flag inspection.
path = "app/src/main/java/com/vitautas/drumkit/MainActivity.kt"
text = read(path)
text = text.replace("import android.content.pm.ApplicationInfo\n", "")
text = replace_once(
    text,
    "        val showDiagnostics = (applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0",
    "        val showDiagnostics = BuildConfig.DEBUG",
    "debug variant detection",
)
write(path, text)

# Replace Oboe's deprecated raw callback pointers with lifetime-stable shared handles.
path = "engine-audio/src/main/cpp/native-audio.cpp"
text = read(path)
text = replace_once(
    text,
    "public:\n    bool start() {",
    "public:\n    NativeAudioEngine()\n        : dataCallback_(this, [](oboe::AudioStreamDataCallback*) {}),\n          errorCallback_(this, [](oboe::AudioStreamErrorCallback*) {}) {}\n\n    bool start() {",
    "shared callback constructor",
)
text = replace_once(text, "            ->setDataCallback(this)\n            ->setErrorCallback(this);", "            ->setDataCallback(dataCallback_)\n            ->setErrorCallback(errorCallback_);", "Oboe shared callback setters")
text = replace_once(
    text,
    "    mutable std::mutex streamMutex_;\n",
    "    std::shared_ptr<oboe::AudioStreamDataCallback> dataCallback_;\n    std::shared_ptr<oboe::AudioStreamErrorCallback> errorCallback_;\n    mutable std::mutex streamMutex_;\n",
    "callback member handles",
)
write(path, text)

# CI toolchain and focused test coverage.
workflow_paths = [
    Path(".github/workflows/drum-kit-quick-check.yml"),
    Path(".github/workflows/drum-kit-apk.yml"),
    Path(".github/workflows/drum-kit-release.yml"),
]
for workflow in workflow_paths:
    text = workflow.read_text(encoding="utf-8")
    text = text.replace('"platforms;android-36"', '"platforms;android-37"')
    text = text.replace('"build-tools;36.0.0"', '"build-tools;37.0.0"')
    text = text.replace('"ndk;28.2.13676358"', '"ndk;29.0.14206865"')
    if workflow.name == "drum-kit-quick-check.yml":
        text = replace_once(text, ":engine-input:compileDebugKotlin", ":engine-input:testDebugUnitTest", "quick-check engine-input tests")
    workflow.write_text(text, encoding="utf-8")

# Documentation: record the modern baseline and completed Step 2.6 without claiming device profiling.
path = "README.md"
text = read(path)
text = text.replace("Android SDK 36", "Android SDK 37")
text = text.replace("Android SDK Build Tools 36.0.0", "Android SDK Build Tools 37.0.0")
text = text.replace("NDK 28.2.13676358", "NDK 29.0.14206865")
text = replace_once(text, "- Cached layered Canvas artwork, geometry, and masks created during size changes\n", "- Cached layered Canvas artwork, geometry, and masks created during size changes\n- RenderNode display-list caching on API 29+ hardware canvases with bitmap fallback on API 26–28 and software canvases\n", "README RenderNode feature")
text = replace_once(text, "The renderer now uses reusable material profiles and cached layered Canvas artwork, while complete RenderNode caching and externally authored texture packs remain deferred.", "The renderer uses reusable material profiles and cached layered artwork. Static body and playable layers use RenderNode display lists on supported hardware and retain a bitmap fallback for older or software-rendered environments; externally authored texture packs remain deferred.", "README current scope")
text = text.replace("1. Move complete static instrument layers to RenderNode caching where profiling justifies it.\n2. Profile rapid multi-touch rendering on representative phones and tablets.\n3. Validate", "1. Profile rapid multi-touch rendering and cache memory on representative phones and tablets.\n2. Validate")
text = text.replace("4. Add the expressive", "3. Add the expressive").replace("5. Add strike-take", "4. Add strike-take").replace("6. Consider AGSL", "5. Consider AGSL")
write(path, text)

path = "AGENTS.md"
text = read(path)
text = text.replace("Android SDK 36", "Android SDK 37")
text = text.replace("Android SDK Build Tools 36.0.0", "Android SDK Build Tools 37.0.0")
text = text.replace("NDK 28.2.13676358", "NDK 29.0.14206865")
text = replace_once(text, "- Cached layered Canvas artwork, support hardware, occlusion masks, and grounded shadows\n", "- Cached layered Canvas artwork, support hardware, occlusion masks, and grounded shadows\n- RenderNode display-list caching on API 29+ hardware canvases with bitmap fallback on API 26–28 and software canvases\n", "AGENTS RenderNode status")
text = text.replace("- Complete RenderNode caching where profiling justifies it\n", "")
write(path, text)

path = "docs/source-mapping.md"
text = read(path)
text = replace_once(
    text,
    "## Pre-2.6 corrective audit\n",
    "## RenderNode-backed static artwork\n\nPhase 2 Step 2.6 records complete static body and playable artwork layers into RenderNode display lists on API 29 and newer hardware-accelerated canvases. API 26–28 and software canvases retain the bitmap cache. Display lists are re-recorded if Android discards them, and Compose permanently releases cached resources through AndroidView's release callback. Input geometry, support ordering, animation transforms, and audio dispatch remain independent from the cache backend.\n\n## Pre-2.6 corrective audit\n",
    "source mapping Step 2.6",
)
text = text.replace("- RenderNode caching for complete static instrument layers\n", "")
write(path, text)

print("Modernization M1/M2 patch applied successfully")
