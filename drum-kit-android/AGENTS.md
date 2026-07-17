# AGENTS.md

## Scope

These instructions apply to the entire `drum-kit-android/` project.

The project is a native, offline Android musical instrument derived from the supplied `hyper_realistic_android_drum_kit.html` prototype and the native implementation plan. The HTML prototype is a reference for layout, instrument mapping, interaction ideas, and procedural sound behavior. It is not a runtime dependency and must not be embedded in a `WebView`.

When instructions conflict, use this priority:

1. User or task-specific requirements
2. This file
3. `docs/source-mapping.md`
4. `README.md`
5. The implementation plan and HTML prototype
6. Existing local conventions

## Product invariant

The application must feel like a playable instrument, not a collection of delayed buttons.

Prioritize work in this order:

1. Touch-to-sound latency and audio stability
2. Correct multi-touch behavior
3. Expressive input and articulation
4. Visual responsiveness
5. Secondary settings and polish

Never let rendering, animation, persistence, analytics, or UI state delay audio dispatch.

## Current project status

The repository contains a production-oriented foundation, not the finished drum kit.

Implemented:

- Kotlin and Jetpack Compose application shell
- Landscape-only immersive activity
- Raw multi-touch input through a custom Android `View`
- Normalized instrument geometry and hit testing
- Pressure, contact-size, position, and velocity data capture
- Kotlin-to-C++ JNI bridge
- Native C++20 audio engine using Oboe
- Fixed-capacity event queue and preallocated voice pool
- Synthesized placeholder sounds for eight instruments
- Master volume, room mix, haptics, and basic diagnostics

Deliberately deferred:

- Production samples, velocity layers, and round robins
- Five-zone snare behavior
- Continuous pressure damping and pitch bend
- Continuous hi-hat openness and pedal events
- Cymbal bell, bow, edge, choke, and mute behavior
- Recording, export, MIDI, calibration, and production OpenGL rendering

Do not disguise deferred behavior with brittle UI-only approximations. Implement the underlying input, model, audio, and rendering contracts together.

## Repository layout

- `app/`: activity lifecycle, immersive mode, theme, and dependency wiring
- `core-model/`: instrument IDs, normalized geometry, strike data, and diagnostics models
- `engine-input/`: raw `MotionEvent` handling, multi-touch tracking, hit testing, haptics, and current Canvas rendering
- `engine-audio/`: Kotlin JNI facade, CMake configuration, Oboe stream, event queue, voice rendering, mixing, and diagnostics
- `feature-kit/`: Compose play screen, controls, and embedding of the playable surface
- `docs/source-mapping.md`: retained mapping from the HTML prototype to native IDs, codes, panning, behavior, and deferred scope

Keep dependency direction simple:

- `core-model` must remain platform-light and reusable.
- `engine-input` may depend on `core-model`.
- `engine-audio` may depend on `core-model`.
- `feature-kit` may depend on `core-model` and `engine-input`.
- `app` performs final wiring between UI and audio.
- Do not make `feature-kit` call the native engine directly unless the architecture is intentionally revised.
- Avoid circular module dependencies.

## Toolchain

Build from the `drum-kit-android/` directory.

Required versions:

- JDK 17
- Android SDK 36
- Android Gradle Plugin 8.13.x
- Gradle 8.13
- NDK 27.0.12077973
- CMake 3.22.1
- Kotlin 2.3.x
- C++20
- Oboe 1.10.x

The repository currently uses the system `gradle` command rather than a committed Gradle wrapper. Do not write instructions that assume `./gradlew` exists unless a wrapper is intentionally added.

## Build and validation commands

Minimum validation for every change:

```bash
gradle --no-daemon :app:assembleDebug :app:lintDebug
```

For release-sensitive changes:

```bash
gradle --no-daemon :app:assembleRelease :app:lintRelease
```

When unit tests exist or are added:

```bash
gradle --no-daemon testDebugUnitTest
```

When an Android device or emulator is available:

```bash
gradle --no-daemon connectedDebugAndroidTest
```

The GitHub Actions workflow currently runs debug assembly and lint. Do not claim full Android validation when the required SDK, NDK, CMake, emulator, or physical device was unavailable. Report exactly what ran.

## Kotlin and Compose conventions

- Use official Kotlin formatting and four-space indentation.
- Preserve trailing commas in multiline declarations and calls.
- Prefer immutable data and explicit state ownership.
- Keep public APIs small and typed with domain models from `core-model`.
- Clamp external or device-provided floating-point values at module boundaries.
- Keep Composables focused on state presentation and coordination.
- Hoist state when it must survive recomposition or be shared.
- Avoid per-frame or per-touch coroutine launches for audio dispatch.
- Do not route playable-surface strikes through Compose click or tap gesture handlers.
- Keep accessibility descriptions for user-facing controls and the playable surface.
- Avoid hard-coded instrument mappings in multiple modules. Extend `core-model` and update all consumers together.

## Raw input rules

The playable surface requires raw `MotionEvent` access.

- Preserve independent pointer IDs throughout a gesture.
- Handle `ACTION_DOWN`, `ACTION_POINTER_DOWN`, `ACTION_UP`, `ACTION_POINTER_UP`, and `ACTION_CANCEL` correctly.
- Dispatch the initial strike immediately on pointer down.
- Do not wait for gesture recognition, animation, or Compose state updates before triggering audio.
- Normalize positions relative to the matched instrument bounds.
- Capture pressure, contact size, event time, and historical samples when implementing expressive gestures.
- Treat Android pressure as unreliable. Combine pressure with contact size, movement, timing, and later calibration rather than trusting one field blindly.
- Clear active contacts on cancellation and lifecycle interruption.
- Use shared geometry for rendering and hit testing so visible instruments and playable zones cannot drift apart.
- Validate rapid alternating strokes and simultaneous hits, not merely single taps.

## Real-time audio rules

The Oboe data callback is a hard real-time path.

Inside the audio callback and functions called from it:

- Do not allocate or free memory.
- Do not resize containers.
- Do not acquire mutexes or other blocking locks.
- Do not perform file, network, database, or preference I/O.
- Do not call Kotlin or Java through JNI.
- Do not log.
- Do not sleep or wait.
- Do not perform unbounded work.
- Reuse preallocated voices, buffers, commands, and effect state.

Communication into the callback must use fixed-capacity queues, atomics, or another demonstrably non-blocking design. Preserve the current single-producer/single-consumer assumptions unless the queue implementation is redesigned and tested.

Native changes must continue compiling with:

```text
-std=c++20 -Wall -Wextra -Werror
```

Additional native conventions:

- Use `kPascalCase` names for compile-time constants.
- Use trailing underscores for private data members.
- Prefer RAII ownership and fixed-size `std::array` storage in the real-time path.
- Check all Oboe results and recover cleanly from stream failures.
- Keep JNI entry points thin. Validation and model translation should happen before or immediately upon entering the native engine, not inside the callback.
- Keep `InstrumentId.nativeCode` synchronized with native instrument tables and JNI behavior. Changing a code requires coordinated Kotlin, C++, documentation, and test updates.
- Prevent clipping under dense polyphony and preserve underrun diagnostics.

## Rendering rules

The current playable surface uses a hardware-accelerated custom `View` and Canvas. A later OpenGL renderer is allowed, but audio and input contracts must remain independent of rendering technology.

- Visual feedback must never gate audio triggering.
- Avoid allocating `Paint`, `RectF`, shaders, paths, meshes, or bitmaps during steady-state drawing when they can be reused.
- Avoid layout movement when an instrument is struck.
- Keep hit animations immediate and short.
- Target stable 60 FPS on supported phones and tablets.
- Keep the shared camera perspective, overlap, lighting, hardware, and grounded-shadow principles from the source design.
- Respect landscape safe areas and display cutouts.
- Decorative layers must not intercept touch input.

## Lifecycle and Android behavior

- Keep the primary play experience landscape-only and immersive.
- Restore immersive mode after focus changes and interruptions.
- Start and stop audio with lifecycle transitions without leaking the stream.
- Future route-change recovery must cover speakers, wired output, USB audio, Bluetooth, screen lock, and app backgrounding.
- Preserve offline core operation. Do not add required remote assets, cloud calls, or network-dependent startup.
- Do not add mandatory permissions unrelated to the instrument.
- Keep release minification compatible with the JNI bridge and update ProGuard/R8 rules when native-facing class or method names change.

## Source mapping and model changes

`docs/source-mapping.md` records the retained prototype mapping. Keep it current whenever changing:

- Instrument names or IDs
- Native numeric codes
- Initial stereo panning
- Normalized layout
- Retained prototype behavior
- Deferred behavior or milestone scope

The current instrument code contract is:

- `0`: kick
- `1`: snare
- `2`: high tom
- `3`: mid tom
- `4`: floor tom
- `5`: hi-hat
- `6`: crash
- `7`: ride

Prefer source-independent `InstrumentDefinition` and articulation models so future kits can reuse the engines. Do not scatter screen-specific `when` blocks as the main extension mechanism.

## Testing expectations

Add tests with behavior, not file count, as the goal.

Prioritize unit tests for:

- Normalized bounds and zone calculations
- Velocity curves and pressure normalization
- Articulation selection
- Round-robin selection
- Hi-hat openness mapping
- Voice priority and stealing
- Kit definition parsing

Prioritize instrumented tests for:

- Landscape lock and immersive recovery
- Multi-touch dispatch and cancellation
- Background and foreground transitions
- Settings persistence
- Audio focus and route changes

Prioritize native tests or deterministic test seams for:

- Event queue capacity and ordering
- Voice allocation and stealing
- Clipping and limiter behavior
- Pitch, damping, choke, and tail updates
- Stress polyphony and underrun resistance

For geometry or rendering changes, test multiple landscape aspect ratios and verify that visible instruments, labels, controls, and hit zones remain aligned.

Manual musical validation should include fast single strokes, double strokes, flams, simultaneous kick and snare, dense cymbal tails, and rapid multi-finger input. A UI that survives leisurely index-finger tapping has proved remarkably little.

## Change discipline

- Make the smallest coherent change in the owning module.
- Preserve the existing architecture unless the task explicitly requires changing it.
- Do not introduce a large framework when Android platform APIs or existing modules are sufficient.
- Do not add Unity, Unreal, a cross-platform game engine, or a `WebView` implementation.
- Do not commit generated build output, local SDK paths, IDE state, keystores, or native intermediates.
- Keep dependencies centralized in `gradle/libs.versions.toml`.
- Explain new dependencies and prefer mature Android or native libraries with a narrow purpose.
- Update documentation when behavior, module boundaries, build requirements, or milestone status changes.
- Preserve placeholders as clearly identified placeholders. Do not describe synthesized proof-of-concept audio as production acoustic sampling.

## Definition of done

A change is complete when:

- It builds in every affected module.
- Android Lint passes for affected application code.
- Native code compiles with warnings treated as errors.
- Tests cover new deterministic behavior where practical.
- Touch-to-audio dispatch remains immediate and multi-touch-safe.
- The audio callback remains allocation-free, lock-free, and non-blocking.
- Rendering and hit geometry remain aligned.
- Lifecycle behavior is not regressed.
- Relevant README or source-mapping documentation is updated.
- Validation performed and validation not performed are both reported accurately.

## Near-term implementation priority

The next major milestone is the expressive snare spike:

1. Five snare zones
2. Velocity layers and round robins
3. Hold-to-damp
4. Drag-to-bend
5. Rimshot and cross-stick prototypes
6. Local head deformation
7. Multi-touch and latency diagnostics

Build the audio and touch behavior before investing in detailed production visuals. A photorealistic drum that responds late is just expensive percussion-themed wallpaper.
