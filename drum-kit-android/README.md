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
- Master volume, simple room mix, haptics, and basic diagnostics
- Basic Canvas renderer ready to be replaced by cached layered 2.5D artwork
- GitHub Actions build and lint workflow

## Modules

- `app`: activity, lifecycle, immersive mode, build configuration, and dependency wiring
- `core-model`: instrument IDs, normalized layout, hit regions, render metadata, and diagnostics models
- `engine-input`: multi-touch surface, hit testing, strike extraction, haptics, animation state, and rendering
- `engine-audio`: JNI bridge and Oboe real-time audio callback
- `feature-kit`: Compose play screen, compact controls, settings overlays, and surface embedding

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

The native engine has been checked locally with C++20, `-Wall`, `-Wextra`, and `-Werror`. A full Android build requires the Android SDK/NDK toolchain and is run by the repository workflow when the pull request is opened.

## Current scope

This is a production-oriented foundation, not the finished instrument. The current native engine synthesizes placeholder percussion so the complete touch-to-audio path can be tested before sample production, articulation layers, continuous hi-hat behavior, cymbal choking, recording, and final rendering are added.

The current renderer and controls are transitional. Draw bounds and hit regions still need to be separated, the full-width HUD needs to become compact overlays, and the procedural shapes need to become cached layered 2.5D artwork using one elevated drummer-view perspective.

## Next milestone

Implement the studio-instrument redesign without changing the low-latency architecture:

1. Separate draw bounds, typed hit regions, render z-order, and hit priority.
2. Replace the full-width HUD with compact corner controls and a settings panel.
3. Restrict audio diagnostics to debug builds.
4. Rebuild the kit layout around one consistent camera, light, and material system.
5. Add cached layered drum and cymbal render objects.
6. Add position- and velocity-based local deformation and cymbal flex.
7. Replace ordinary one-shot vibration with restrained system-respecting haptics.
8. Consider shaders or OpenGL only after measuring the Canvas/RenderNode renderer.

The raw `MotionEvent` input path, custom playable `View`, normalized strike coordinates, JNI bridge, native Oboe callback, lock-free queue, and velocity-aware events are architectural invariants.
