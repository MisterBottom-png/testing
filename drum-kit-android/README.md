# Native Android Drum Kit

A native Android foundation derived from the supplied single-file HTML drum kit and implementation plan.

The HTML prototype is retained under `reference/` for layout, instrument mapping, and interaction reference only. The application does not use a WebView.

## Included foundation

- Kotlin and Jetpack Compose application shell
- Landscape-only immersive activity
- Modular project structure
- Raw Android multi-touch input through a custom `View`
- Position and pressure-aware strike events
- Native C++ audio engine using Oboe
- Lock-free fixed-capacity event queue between UI and audio callback
- Preallocated synthesized voice pool for kick, snare, three toms, hi-hat, crash, and ride
- Master volume, simple room mix, haptics, and basic diagnostics
- GitHub Actions build and lint workflow

## Modules

- `app`: activity, lifecycle, immersive mode, and dependency wiring
- `core-model`: instrument IDs, normalized layout, and diagnostics models
- `engine-input`: multi-touch surface and strike extraction
- `engine-audio`: JNI bridge and Oboe real-time audio callback
- `feature-kit`: Compose play screen and controls

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

## Current scope

This is a production-oriented foundation, not the finished instrument. The current native engine synthesizes placeholder percussion so the complete touch-to-audio path can be tested before sample production, articulation layers, continuous hi-hat behavior, cymbal choking, recording, and detailed rendering are added.

## Next milestone

Implement the expressive snare spike described in the plan:

1. Five snare zones
2. Velocity layers and round robins
3. Hold-to-damp
4. Drag-to-bend
5. Rimshot and cross-stick prototypes
6. Local head deformation
7. Multi-touch validation and latency diagnostics
