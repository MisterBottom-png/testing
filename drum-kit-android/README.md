# Native Android Drum Kit

A native Android foundation derived from the supplied single-file HTML drum kit, implementation plan, and 2.5D studio-instrument redesign brief.

The source prototype is treated as a layout, instrument-mapping, and interaction reference only. The application does not use a WebView. The extracted mapping and foundation scope are documented in `docs/source-mapping.md`.

## Included foundation

- Kotlin and Jetpack Compose application shell
- Landscape-only immersive activity
- Modular project structure
- Raw Android multi-touch input through a custom `View`
- Position, pressure, contact-size, and velocity-aware strike events
- Native C++ audio engine using Oboe
- Lock-free fixed-capacity event queue between UI and audio callback
- Preallocated synthesized voice pool for kick, snare, three toms, hi-hat, crash, and ride
- Independent normalized draw bounds and typed hit regions
- Separate render z-index and hit-test priority
- Compact kit, recording, and mixer controls with an expandable settings panel
- Debug-only audio diagnostics
- Cached Canvas geometry and shaders created during size changes
- Position- and velocity-aware drum, kick, cymbal, and hi-hat animation state
- System-respecting, restrained instrument haptics
- GitHub Actions build and lint workflow

## Modules

- `app`: activity, lifecycle, immersive mode, debug configuration, and dependency wiring
- `core-model`: instrument IDs, normalized draw geometry, typed hit regions, render metadata, strike data, and diagnostics models
- `engine-input`: raw multi-touch, priority hit testing, strike extraction, haptics, animation state, and Canvas rendering
- `engine-audio`: JNI bridge and Oboe real-time audio callback
- `feature-kit`: Compose play screen, compact controls, settings overlays, and playable-surface embedding

## Build requirements

- Android Studio compatible with Android Gradle Plugin 8.13.x
- JDK 17
- Android SDK 36
- NDK 27.0.12077973
- CMake 3.22.1 or newer
- Gradle 8.13 when building outside Android Studio

From this directory:

```bash
gradle :app:assembleDebug
```

The GitHub Actions workflow installs the required SDK, NDK, CMake, and Gradle versions explicitly.

## Validation status

The native engine has been checked locally with C++20, `-Wall`, `-Wextra`, and `-Werror`. Geometry and renderer Kotlin sources are syntax-checked during development, while the repository workflow performs the authoritative Android build, unit tests, and lint checks.

## Current scope

This is a production-oriented foundation, not the finished instrument. The native engine still synthesizes placeholder percussion, and the renderer still uses procedural Canvas layers rather than final pre-rendered or RenderNode-cached instrument artwork.

The first redesign implementation slice is complete: drawing and touch geometry are independent, overlap resolution is explicit, the permanent HUD is gone, diagnostics are restricted to debuggable builds, labels fade away, renderer objects are cached outside steady-state drawing, and strikes drive instrument-specific local feedback rather than lifting the whole instrument.

The compact recording control is intentionally disabled until a real recording contract exists. It is not wired to a decorative Boolean that lies to the user, a remarkably common interface tradition.

## Next milestone

1. Establish a single measured drummer-view camera and rebuild every instrument layer to that perspective.
2. Replace transitional procedural surfaces with cached layered assets or RenderNodes.
3. Profile rapid multi-touch rendering on representative phones and tablets.
4. Tune hit regions and overlap priority using physical-device play tests.
5. Add the expressive snare zones, sample layers, round robins, damping, and pitch gestures.
6. Add a functional recording engine before enabling the recording control.
7. Consider AGSL or OpenGL only after profiling proves the Canvas/RenderNode path insufficient.

The raw `MotionEvent` input path, custom playable `View`, normalized strike coordinates, JNI bridge, native Oboe callback, lock-free queue, and velocity-aware events remain architectural invariants.
