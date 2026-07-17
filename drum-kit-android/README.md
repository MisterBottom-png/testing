# Native Android Drum Kit

A native, offline Android instrument derived from the supplied single-file HTML prototype, implementation plan, and drum-acoustics research.

The browser prototype remains a reference for layout, mapping, and interaction ideas. It is not embedded in a `WebView` and is not a runtime dependency.

## Current implementation

- Kotlin and Jetpack Compose application shell
- Landscape-only immersive activity
- Raw multi-touch input through a custom Android `View`
- Position, pressure, and contact-size strike capture
- Native C++20 audio engine using Oboe
- Lock-free fixed-capacity event queue and preallocated voice pool
- Sample-first acoustic snare with five articulations
- Six velocity layers and four round robins per snare articulation
- Equal-power interpolation between adjacent velocity layers
- Small pitch, gain, and filter variation between repetitions
- Complete 48 kHz PCM snare bank loaded before playback
- Dry-first output with low-level parallel room processing
- Synthesized placeholders retained for the other seven instruments
- Master volume, room mix, haptics, and audio diagnostics
- GitHub Actions tests, assembly, lint, PCM-bank verification, and APK artifact publishing

## Snare model

The snare no longer uses the oscillator-and-noise placeholder from the HTML reference. Acoustic recordings supply the attack and body for centre, off-centre, edge expression, rimshot, and cross-stick playback. The initial production bank contains 120 stereo samples: five articulations, six velocity layers, and four round robins.

The deterministic preprocessing pipeline:

1. Selects source hits by recorded power.
2. Builds a controlled stereo mix from close and overhead microphones.
3. Removes DC offset and aligns attacks to a common onset frame.
4. Applies one duration and fade policy across the bank.
5. Applies one global normalization gain rather than normalizing files independently.
6. Resamples the cross-stick sources to 48 kHz.
7. Quantizes once to interleaved PCM with deterministic dither.
8. Writes a source manifest and SHA-256 bank digest.

See `docs/snare-sampling.md` and `THIRD_PARTY_NOTICES.md` for the technical and licensing details.

## Modules

- `app`: activity, lifecycle, immersive mode, and dependency wiring
- `core-model`: instrument IDs, normalized layout, articulation selection, and diagnostics models
- `engine-input`: multi-touch surface and strike extraction
- `engine-audio`: JNI bridge, PCM bank loading, and Oboe real-time audio callback
- `feature-kit`: Compose play screen and controls

## Build requirements

- JDK 17
- Android SDK 36
- Android Gradle Plugin 8.13.x
- Gradle 8.13
- NDK 27.0.12077973
- CMake 3.22.1

From this directory:

```bash
gradle --no-daemon testDebugUnitTest :app:assembleDebug :app:lintDebug
```

The snare bank is generated before the Android build:

```bash
python tools/build_snare_bank.py \
  --output engine-audio/src/main/assets/snare/snare-bank.pcm \
  --manifest build/snare-bank-manifest.json
```

The GitHub Actions workflow installs the required toolchains, creates and verifies the bank, runs tests and lint, builds the debug APK, and publishes the APK and bank manifest as workflow artifacts.

## Remaining validation and scope

The other seven instruments intentionally remain synthesized placeholders until the snare passes repeated fast-stroke listening tests on physical Android devices. Device validation must cover double strokes, flams, rapid centre-to-edge movement, rimshot versus cross-stick distinction, clipping, voice stealing, underruns, and audio-route changes.

Continuous hold-to-damp, drag-to-bend, hi-hat openness, cymbal choking, recording, MIDI, calibration, and production rendering remain later milestones.
