# Native Android Drum Kit

A native Android foundation derived from the supplied single-file HTML drum kit, implementation plan, and 2.5D studio-instrument redesign brief.

The source prototype is treated as a layout, instrument-mapping, and interaction reference only. The application does not use a WebView. The extracted mapping and foundation scope are documented in `docs/source-mapping.md`.

## Included foundation

- Kotlin and Jetpack Compose application shell
- Immersive, resizable activity optimized for landscape while adapting to current orientation and window size
- Modern adaptive and themed launcher icon
- Modular project structure
- Raw Android multi-touch input through a custom `View`
- Position, pressure, contact-size, and velocity-aware strike events
- Native C++ audio engine using Oboe
- Lock-free fixed-capacity event queue between UI and audio callback
- Preallocated synthesized voice pool for kick, snare, three toms, hi-hat, crash, and ride
- Independent normalized draw bounds, visual playable-surface bounds, and typed hit regions
- Separate render z-index and hit-test priority
- Fixed elevated drummer-view camera and camera-aligned instrument placement
- Explicit surface and support depth, cached occlusion masks, and one shared floor plane
- Compact kit, recording, and mixer controls with an expandable settings panel
- Fixed-capacity expressive strike-performance recording
- Debug-only audio diagnostics
- Cached layered Canvas artwork, geometry, and masks created during size changes
- RenderNode display-list caching on API 29+ hardware canvases with bitmap fallback on API 26–28 and software canvases
- Position- and velocity-aware drum, kick, cymbal, and hi-hat animation state
- System-respecting, restrained instrument haptics
- GitHub Actions tests, build, lint, and downloadable debug APK artifact

## Modules

- `app`: activity lifecycle, immersive mode, debug configuration, and dependency wiring
- `core-model`: instrument IDs, normalized draw geometry, typed hit regions, render metadata, strike data, and diagnostics models
- `engine-input`: raw multi-touch, priority hit testing, strike extraction, haptics, animation state, and Canvas rendering
- `engine-audio`: JNI bridge and Oboe real-time audio callback
- `feature-kit`: Compose play screen, compact controls, fixed-capacity performance capture, settings overlays, and playable-surface embedding

## Build requirements

- Android Studio compatible with Android Gradle Plugin 9.3.x
- JDK 17
- Android SDK 37 from the Android 17 preview channel
- Android SDK Build Tools 37.0.0 from the preview channel
- NDK 29.0.14206865
- CMake 3.22.1 or newer
- Gradle 9.5.0 when building outside Android Studio
- Kotlin 2.4.10 through Android Gradle Plugin built-in Kotlin support
- Compose BOM 2026.06.01

From this directory:

```bash
gradle --no-daemon --warning-mode=fail testDebugUnitTest :app:assembleDebug :app:lintDebug
```

The GitHub Actions workflows install the required SDK, Build Tools, NDK, CMake, and Gradle versions explicitly. Builds fail on Gradle deprecation warnings. Successful APK runs publish `app-debug.apk` as the `drum-kit-debug-apk` artifact.

## Validation status

GitHub Actions is the authoritative validation path. It runs unit tests, Kotlin and native C++ compilation, Android lint, and APK packaging with Gradle warnings treated as failures. Native C++ compilation continues to use C++20 with `-Wall`, `-Wextra`, and `-Werror`.

## Current scope

This is a production-oriented foundation, not the finished instrument. The native engine still synthesizes placeholder percussion. The renderer uses reusable material profiles and cached layered artwork. Static body and playable layers use RenderNode display lists on supported hardware and retain a bitmap fallback for older or software-rendered environments; externally authored texture packs remain deferred.

The current redesign implementation keeps complete draw bounds, rendered playable-surface bounds, and touch hit regions independent; uses one viewport-aware hit path for runtime input, tests, and diagnostics; removes the former kick/snare target overlap; applies one fixed camera; merges independently modeled support and surface layers by drummer-view depth; clips grounded shadows around cached canonical instrument masks; renders wine-shell drums, a brushed-steel snare, a detailed dark kick, bronze cymbals, and paired hi-hat discs from cached body/playable artwork layers; retains artwork across temporary View detach/reattach cycles; anchors supported instruments to one normalized floor plane; removes the permanent HUD; restricts diagnostics to debuggable builds; fades labels; caches renderer objects outside steady-state drawing; and drives local instrument-specific feedback rather than lifting the whole instrument.

The recording control now captures an expressive strike-event take using fixed-capacity primitive buffers. Audio dispatch remains first; recording copies timing, instrument, velocity, normalized position, pressure, and contact size afterward. The take is materialized only when recording stops. PCM/WAV export remains deferred.

## Next milestone

1. Profile rapid multi-touch rendering and cache memory on representative phones and tablets.
2. Validate and refine the corrected hit regions using physical-device play tests.
3. Add the expressive snare zones, sample layers, round robins, damping, and pitch gestures.
4. Add strike-take playback and later PCM/WAV recording export.
5. Consider AGSL or OpenGL only after profiling proves the Canvas/RenderNode path insufficient.

The raw `MotionEvent` input path, custom playable `View`, normalized strike coordinates, JNI bridge, native Oboe callback, lock-free queue, and velocity-aware events remain architectural invariants.
