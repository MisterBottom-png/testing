# Native Android Drum Kit

A native Android foundation derived from the supplied single-file HTML drum kit, implementation plan, recovery and development roadmap, and 2.5D studio-instrument redesign brief.

The source prototype is treated as a layout, instrument-mapping, and interaction reference only. The application does not use a WebView. The execution order and status are tracked in `docs/Drum_Kit_Recovery_and_Development_Roadmap.md`; extracted mapping and foundation scope are documented in `docs/source-mapping.md`.

## Included foundation

- Kotlin and Jetpack Compose application shell
- Immersive sensor-landscape activity for the playable instrument
- Modern adaptive and themed launcher icon
- Modular project structure
- Raw Android multi-touch input through a custom `View`
- Position, pressure, contact-size, and velocity-aware strike events
- Dedicated single-chain kick pedal with priority touch targeting, a fixed beater impact point, and animated footboard, cam, chain, spring, and beater mechanics
- Native C++ audio engine using Oboe
- Lock-free fixed-capacity event queue between UI and audio callback
- Sample-first acoustic snare with five articulations, six velocity layers, and four round robins per layer
- Preallocated synthesized voice pool for kick, three toms, hi-hat, crash, and ride
- Independent normalized draw bounds, visual playable-surface bounds, and typed hit regions
- Separate render z-index and hit-test priority
- Fixed elevated drummer-view camera and camera-aligned instrument placement
- Explicit surface and support depth, cached occlusion masks, and one shared floor plane
- Compact kit, recording, and mixer controls with an expandable settings panel
- Safe-drawing inset handling for compact overlays while the instrument canvas retains the full edge-to-edge window
- Fixed-capacity expressive strike-performance recording
- Debug-only audio diagnostics
- Debug-only diagnostic-session foundation with raw accepted/rejected touch capture, selected input-target tracing, periodic audio diagnostics, user markers, request-side reconstruction, native queue/sample/voice tracing, bounded buffers, ZIP/checksum export, and user-selected ZIP saving
- Cached layered Canvas artwork, geometry, and masks created during size changes
- Stable bitmap artwork caching on all supported devices; the experimental RenderNode backend remains disabled pending device validation
- Position- and velocity-aware drum, kick, cymbal, hi-hat, and kick-pedal animation state
- System-respecting, restrained instrument haptics
- GitHub Actions tests, build, lint, generated snare-bank validation, and downloadable debug APK artifact

## Modules

- `app`: activity lifecycle, immersive mode, debug configuration, diagnostic-session coordination and export, audio-focus coordination, and dependency wiring
- `core-model`: pure Kotlin/JVM instrument IDs, normalized draw geometry, typed hit regions, render metadata, strike data, snare articulation mapping, pedal input geometry, and diagnostics models
- `engine-input`: raw multi-touch, priority hit testing, strike extraction, pedal mechanics, haptics, animation state, and Canvas rendering
- `engine-audio`: JNI bridge, preloaded snare sample bank, and Oboe real-time audio callback
- `feature-kit`: Compose play screen, compact controls, fixed-capacity performance capture, settings overlays, and playable-surface embedding

## Build requirements

- Android Studio compatible with Android Gradle Plugin 9.3.x
- JDK 17
- Android SDK 37 from the Android 17 preview channel
- Android SDK Build Tools 37.0.0 from the Android 17 preview channel
- Target SDK 36 while landscape compatibility is required on large screens
- NDK 29.0.14206865
- CMake 3.22.1 or newer
- Gradle 9.5.0 when building outside Android Studio
- Kotlin 2.4.10 through Android Gradle Plugin built-in Kotlin support and the Kotlin/JVM plugin
- Compose BOM 2026.06.01
- Python 3.12 with NumPy, RemoteZip, and SoundFile when generating the snare bank locally

From this directory:

```bash
python tools/build_snare_bank.py \
  --output engine-audio/src/main/assets/snare/snare-bank.pcm \
  --manifest build/snare-bank-manifest.json
gradle --no-daemon --warning-mode=fail :core-model:check testDebugUnitTest :app:assembleDebug :app:lintDebug
```

The generated PCM bank is intentionally not committed. GitHub Actions downloads the licensed source recordings, builds and verifies the 120-sample bank, packages it without compression, and publishes the bank manifest beside the APK. Source attribution is recorded in `THIRD_PARTY_NOTICES.md` and packaged with the audio assets.

The GitHub Actions workflows pin the required tool versions and treat Gradle warnings as failures. `Drum Kit Quick Check` runs only the pure JVM `core-model` checks. `Drum Kit Android Validation` covers Android module and application unit tests plus application Kotlin compilation. `Drum Kit Android Lint` runs independently so lint does not delay APK delivery. The on-demand APK workflow checks out the requested PR head directly, embeds and verifies that source commit in `BuildConfig`, uses the preinstalled Ubuntu 24.04 Android toolchain, builds an arm64-only debug APK, and publishes `app-debug.apk` as the `drum-kit-debug-apk` artifact. Release builds retain the full configured ABI set.

## Validation status

GitHub Actions is the authoritative validation path. The JVM quick check, Android validation, and Android lint run independently on pull requests. Together they cover articulation mapping, core-model tests, Android module and application unit tests, application Kotlin compilation, and dependency-inclusive Android lint. The on-demand APK workflow generates and verifies the acoustic bank, performs focused arm64 native C++ compilation, verifies the embedded source commit, and packages the combined application. Release workflows generate the same bank before full-ABI native compilation, shrinking, lint, APK assembly, and bundle packaging. Native C++ compilation continues to use C++20 with `-Wall`, `-Wextra`, and `-Werror`.

## Current scope

This is a production-oriented foundation, not the finished instrument. The snare is sample-first and uses centre, off-centre, edge, rimshot, and cross-stick articulations with velocity interpolation and round robins. Kick, toms, hi-hat, crash, and ride still use placeholder synthesis. The renderer uses reusable material profiles and cached layered artwork. Static body and playable layers use the proven bitmap cache across supported Android versions; the RenderNode implementation remains in source for later profiling but is not selected by the production cache policy. Externally authored texture packs remain deferred.

The current redesign implementation keeps complete draw bounds, rendered playable-surface bounds, and touch hit regions independent; uses one viewport-aware hit path for runtime input, tests, and diagnostics; removes the former kick/snare target overlap; applies one fixed camera; merges independently modeled support and surface layers by drummer-view depth; clips grounded shadows around cached canonical instrument masks; renders wine-shell drums, a brushed-steel snare, a detailed dark kick, bronze cymbals, and paired hi-hat discs from cached body/playable artwork layers; retains artwork across temporary View detach/reattach cycles; anchors supported instruments to one normalized floor plane; keeps compact overlays inside safe drawing insets without shrinking the playable canvas; removes the permanent HUD; restricts diagnostics to debuggable builds; fades labels; caches renderer objects outside steady-state drawing; and drives local instrument-specific feedback rather than lifting the whole instrument. Two physical Samsung diagnostic sessions showed that expanding the visible kick-face ellipse still left ambiguous dead areas, so the kit now provides a dedicated single-chain pedal below the drum. Its touch target is larger than the rendered footboard, takes priority over the underlying kick face, emits one fixed beater impact point, supports simultaneous contacts, keeps the board depressed while held, and retriggers the beater independently on additional pedal strikes. The original kick face remains a secondary convenience target.

The audio layer preserves Android audio-focus handling, startup retry, exclusive-to-shared Oboe fallback, and unexpected-stream recovery. The snare bank is loaded before the stream opens, while the data callback performs no file access, decoding, allocation, locking, JNI calls, or logging. A fast-attack, slow-release peak limiter protects dense polyphony without applying permanent saturation to every output sample.

The recording control captures an expressive strike-event take using fixed-capacity primitive buffers. Audio dispatch remains first; recording copies timing, instrument, velocity, normalized position, pressure, and contact size afterward. The take is materialized only when recording stops. PCM/WAV export remains deferred.

The Step 1.2 diagnostic foundation is debug-only. One control starts a free-play diagnostic session and one control stops and exports it. The current ZIP records session/device/build metadata, raw accepted and rejected touch events with historical samples, instrument candidates, candidate input targets, and the selected input target; accepted strikes; periodic audio diagnostics; user markers; dropped-data counts; request-side velocity-source, articulation, velocity-layer, blend, and stereo-pan reconstruction; actual native queue acceptance; round-robin indices; pitch/gain/filter variations; active-voice counts; and voice-steal outcomes, plus a summary and SHA-256 checksums. Pedal touches are explicitly identified as `kick_pedal` in `touch-events.jsonl`, while surface hits remain `instrument_surface`. Native results move through a preallocated fixed-capacity SPSC ring and are drained from Kotlin outside the real-time callback. After export, Android's document picker opens so the ZIP can be saved to Downloads, Drive, or another document provider without broad storage permission; a `SAVE ZIP` control retries the latest cached bundle after cancellation or failure. The uploaded physical-device bundles passed checksum and trace-correlation review with zero dropped records and zero underruns; they also exposed constant-pressure velocity saturation for later Step 2.1 work. Rendering telemetry, generated-output WAV capture, guided tests, lifecycle recovery, sharing, deletion, and physical validation of the new pedal remain within the unfinished portion of Step 1.2.

## Next milestone

Continue `docs/Drum_Kit_Recovery_and_Development_Roadmap.md` sequentially. Step 1.1 is complete. Step 1.2 remains partially complete and should physically validate the pedal before continuing with rendering/application performance telemetry and generated-output WAV capture.

The raw `MotionEvent` input path, custom playable `View`, immediate audio dispatch, stable kick impact coordinates, JNI bridge, native Oboe callback, lock-free queues, and velocity-aware events remain architectural invariants.
