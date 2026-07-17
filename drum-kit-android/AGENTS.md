# AGENTS.md

## Scope

These instructions apply to the entire `drum-kit-android/` project.

The project is a native, offline Android musical instrument derived from the supplied `hyper_realistic_android_drum_kit.html` prototype, the native implementation plan, and the 2.5D studio-instrument redesign brief. The HTML prototype is a reference for layout, instrument mapping, interaction ideas, and sound behavior. It is not a runtime dependency and must not be embedded in a `WebView`.

When instructions conflict, use this priority:

1. User or task-specific requirements
2. This file
3. `docs/source-mapping.md`
4. `README.md`
5. The implementation plan, redesign brief, and HTML prototype
6. Existing local conventions

## Product invariant

The application must feel like a playable studio instrument, not a diagnostic dashboard wearing cymbals.

Prioritize work in this order:

1. Touch-to-sound latency and audio stability
2. Correct multi-touch behavior
3. Accurate hit regions and expressive input
4. Stable, coherent visual rendering
5. Compact controls, haptics, and secondary polish

Never let rendering, animation, haptics, persistence, diagnostics, or Compose state delay audio dispatch.

## Current project status

The repository contains a production-oriented foundation, not the finished drum kit.

Implemented:

- Kotlin and Jetpack Compose application shell
- Landscape-only immersive activity
- Raw multi-touch input through a custom Android `View`
- Normalized instrument geometry and rectangular hit testing
- Pressure, contact-size, position, and velocity data capture
- Kotlin-to-C++ JNI bridge
- Native C++20 audio engine using Oboe
- Fixed-capacity event queue and preallocated voice pool
- Synthesized placeholder sounds for eight instruments
- Master volume, room mix, haptics, and basic diagnostics
- Basic procedural Canvas drawing for drums and cymbals

Known redesign targets:

- Drawing and hit testing currently reuse rectangular bounds.
- Render order and hit priority are not independently modeled.
- Gradients and temporary geometry are created during drawing.
- Instruments use basic clip-art gradients rather than layered 2.5D artwork.
- Active feedback lifts whole instruments instead of deforming the struck surface.
- Labels are drawn inside playable areas and remain permanently visible.
- The Compose HUD occupies the full width of the playing screen.
- Diagnostics are visible in normal builds.
- Haptics use direct one-shot vibration on ordinary strikes.

Deliberately deferred unless a task explicitly includes them:

- Production samples, velocity layers, and round robins
- Five-zone snare behavior
- Continuous pressure damping and pitch bend
- Continuous hi-hat openness and pedal events
- Cymbal bell, bow, edge, choke, and mute behavior
- Recording export, MIDI, and calibration
- OpenGL rendering

Do not disguise deferred behavior with brittle UI-only approximations. Implement the underlying input, model, audio, and rendering contracts together.

## Repository layout

- `app/`: activity lifecycle, immersive mode, build configuration, theme, and dependency wiring
- `core-model/`: instrument IDs, layout models, hit regions, strike data, render metadata, and diagnostics
- `engine-input/`: raw `MotionEvent` handling, multi-touch tracking, hit testing, haptics, animation state, and custom View rendering
- `engine-audio/`: Kotlin JNI facade, CMake configuration, Oboe stream, event queue, voice rendering, mixing, and diagnostics
- `feature-kit/`: Compose play screen, compact controls, settings overlays, and embedding of the playable surface
- `docs/source-mapping.md`: retained mapping from prototype IDs to native codes, panning, behavior, and deferred scope

Keep dependency direction simple:

- `core-model` must remain platform-light and reusable.
- `engine-input` may depend on `core-model`.
- `engine-audio` may depend on `core-model`.
- `feature-kit` may depend on `core-model` and `engine-input`.
- `app` performs final wiring between UI and audio.
- Avoid circular module dependencies.
- Do not make `feature-kit` call the native engine directly unless the architecture is intentionally revised.

## Toolchain and validation

Build from the `drum-kit-android/` directory.

Required versions:

- JDK 17
- Android SDK 36
- Android SDK Build Tools 36.0.0
- Android Gradle Plugin 9.3.x
- Gradle 9.5.0
- NDK 28.2.13676358
- CMake 3.22.1
- Kotlin 2.4.x through Android Gradle Plugin built-in Kotlin support
- C++20
- Oboe 1.10.x

The repository currently uses the system `gradle` command rather than a committed wrapper. Do not assume `./gradlew` exists unless a wrapper is intentionally added.

Minimum validation:

```bash
gradle --no-daemon --warning-mode=fail :app:assembleDebug :app:lintDebug
```

Release-sensitive validation:

```bash
gradle --no-daemon --warning-mode=fail :app:assembleRelease :app:lintRelease
```

When tests or a device are available:

```bash
gradle --no-daemon --warning-mode=fail testDebugUnitTest
gradle --no-daemon connectedDebugAndroidTest
```

Do not claim validation that did not run. Report missing SDK, NDK, CMake, emulator, or device constraints precisely.

## Kotlin and Compose conventions

- Use official Kotlin formatting and four-space indentation.
- Preserve trailing commas in multiline declarations and calls.
- Prefer immutable data and explicit state ownership.
- Keep public APIs small and typed with domain models from `core-model`.
- Clamp external or device-provided floating-point values at module boundaries.
- Keep Composables focused on state presentation and coordination.
- Avoid per-frame or per-touch coroutine launches for audio dispatch.
- Do not route playable-surface strikes through Compose click or tap handlers.
- Keep accessibility descriptions for user-facing controls and the playable surface.
- Avoid hard-coded instrument mappings in multiple modules.
- Keep Compose responsible for menus, selectors, sheets, settings, recording controls, and overlays.
- Keep the custom Android `View` responsible for instrument rendering and raw touch input.
- Every interactive Compose control must provide at least a 48 x 48 dp touch target.

## Instrument layout model

Visual placement and touch detection are separate contracts. They may share a normalized coordinate system, but they must not reuse one rectangle as both artwork bounds and playable geometry.

Each instrument layout entry must provide, directly or through typed sub-models:

- `InstrumentId`
- Draw bounds
- Hit region
- Render z-index
- Hit-test priority
- Rotation
- Label position or anchor
- Asset key or renderer key

Keep audio metadata such as pan in reusable instrument definitions rather than screen-specific rendering code.

Model hit regions as an exhaustive typed hierarchy supporting:

- Ellipse
- Circle
- Polygon
- Rectangle

Rules:

- Draw bounds describe where artwork is composed.
- Hit regions describe where input is accepted.
- Render z-index determines visual overlap only.
- Hit-test priority resolves overlapping playable regions only.
- Rotation must be applied consistently to artwork, labels, and hit-region transforms where required.
- Transparent asset corners must not be playable unless explicitly included.
- Keep normalized strike coordinates in the existing `[0, 1]` contract.
- Derive strike coordinates from a stable instrument-local coordinate system, not transient animation geometry.
- Animations must not move or resize the canonical hit region.

Prefer source-independent models such as `InstrumentLayout`, `HitRegion`, `RenderSpec`, and `LabelPlacement`. Do not scatter screen-specific `when` blocks as the extension mechanism.

## Raw input and hit testing

The playable surface requires raw `MotionEvent` access.

- Preserve independent pointer IDs throughout a gesture.
- Handle `ACTION_DOWN`, `ACTION_POINTER_DOWN`, `ACTION_UP`, `ACTION_POINTER_UP`, and `ACTION_CANCEL` correctly.
- Dispatch the initial strike immediately on pointer down.
- Trigger audio before haptic or visual state work.
- Do not wait for gesture recognition, animation, invalidation, or Compose state updates before triggering audio.
- Preserve pressure, contact size, event time, and normalized strike coordinates.
- Capture historical samples when implementing expressive gestures.
- Treat Android pressure as unreliable and combine it with contact size, movement, timing, and later calibration.
- Clear active contacts on cancellation and lifecycle interruption.
- Preserve simultaneous hits and multiple pointers on the same instrument.
- Test candidates by explicit hit priority, not visual list order.
- Keep hit-test priority separate from render z-index.
- Use ellipse, circle, polygon, or rectangle containment according to the declared region type.
- Transform touch coordinates into instrument-local space before testing rotated regions.
- Avoid allocation in the hot touch path where practical.
- Validate rapid alternating strokes, overlapping instruments, simultaneous hits, pressure, and contact-size input.

## Real-time audio rules

The Oboe data callback is a hard real-time path.

Inside the audio callback and functions called from it:

- Do not allocate or free memory.
- Do not resize containers.
- Do not acquire mutexes or other blocking locks.
- Do not perform file, network, database, preference, or logging I/O.
- Do not call Kotlin or Java through JNI.
- Do not sleep, wait, or perform unbounded work.
- Reuse preallocated voices, buffers, commands, and effect state.

Communication into the callback must use fixed-capacity queues, atomics, or another demonstrably non-blocking design. Preserve the current single-producer/single-consumer assumptions unless the queue is intentionally redesigned and tested.

Native changes must continue compiling with:

```text
-std=c++20 -Wall -Wextra -Werror
```

Additional native conventions:

- Use `kPascalCase` for compile-time constants.
- Use trailing underscores for private data members.
- Prefer RAII and fixed-size `std::array` storage in the real-time path.
- Check Oboe results and recover cleanly from stream failures.
- Keep JNI entry points thin.
- Keep `InstrumentId.nativeCode` synchronized with native instrument tables and JNI behavior.
- Prevent clipping under dense polyphony and preserve underrun diagnostics.

## Playing-screen layout

The instrument surface should occupy approximately 90% of the usable landscape screen. Controls must not cover playable instruments.

Required direction:

- Compact kit selector in the upper-left corner
- Compact settings and recording controls in the upper-right corner
- Room, Volume, and Haptics inside an expandable panel or settings sheet
- No permanent full-width control panel
- No unnecessary subtitle on the playing screen
- Audio diagnostics only in debug builds
- Labels outside playable drumheads and cymbal strike areas
- Labels allowed to fade out during normal playing
- Consistent dark surfaces for controls and overlays
- Safe-area and display-cutout handling in immersive landscape mode

Do not shrink the kit merely to make room for controls. Place compact overlays in non-playable safe zones and keep their interaction bounds explicit.

## Visual direction

Use one consistent elevated drummer-view camera angle.

All instruments must share:

- The same camera perspective
- The same light direction
- Consistent scale
- Consistent material rendering
- Consistent shadow direction
- Consistent overlap logic

Avoid mixing top-down drumheads, side-facing shells, and front-facing instruments.

Use a restrained studio palette:

- Matte graphite background
- Warm spotlight
- Deep wine, walnut, or satin-black shells
- Neutral drumheads
- Chrome hardware
- Natural bronze cymbals
- Orange only for active feedback and important controls

Shadows must be soft, grounded, and connected to the instrument. Detached black ovals are not an acceptable final shadow treatment.

## Layered 2.5D artwork

Replace primitive clip-art with transparent pre-rendered assets or cached Canvas layers created from one coherent style.

Each drum should support:

1. Contact shadow
2. Stand, mount, or legs
3. Shell
4. Bottom hoop
5. Lugs and chrome hardware
6. Drumhead
7. Top hoop
8. Reflections and wear
9. Hit-feedback layer

Each cymbal should support:

1. Stand
2. Felt washer
3. Bronze disc
4. Raised bell
5. Lathing texture
6. Hammering texture
7. Edge shading
8. Highlight layer
9. Hit-animation layer

Renderer or asset keys must map to reusable render objects. Do not encode the entire visual system in one monolithic `drawInstrument` branch.

## Instrument animation state

Maintain explicit visual state per instrument with at least:

- Strike position
- Strike velocity
- Animation start time
- Active pointer count
- Current deformation or rotation

Implement instrument-specific feedback:

- Local drumhead depression around the touch point
- Faster snare rebound
- Slower rebound for larger toms
- Kick-head inward compression
- Cymbal tilt and flex
- Hi-hat upper-disc movement
- Small velocity-based highlight flash
- Smooth decay back to rest

Use existing normalized strike coordinates and velocity as animation inputs.

Do not move the whole instrument upward as the primary strike effect. Stands, shells, and grounded shadows should remain anchored unless physically justified secondary movement is explicitly modeled.

## Renderer performance

The playable surface remains a hardware-accelerated custom `View` unless a task intentionally changes only the rendering backend.

- Audio dispatch must remain ahead of visual work.
- Do not allocate objects inside steady-state `onDraw()`.
- Create gradients, paths, masks, matrices, rectangles, and reusable paints during initialization or `onSizeChanged()`.
- Cache static artwork per instrument and size configuration.
- Rebuild caches only when size, density, theme, kit, or asset selection changes.
- Redraw only while animations are active or a static property changes.
- Use `postInvalidateOnAnimation()` for animation frames.
- Stop scheduling frames when all animations have decayed.
- Reduce unnecessary transparent overlays and full-screen gradients.
- Use `RenderNode` caching on supported Android versions.
- Keep a Canvas fallback for older devices.
- AGSL effects are optional enhancements and require a non-shader fallback.
- Keep rendering technology independent from input and audio contracts.
- Consider OpenGL only after profiling proves the 2.5D Canvas/RenderNode renderer insufficient.

Target stable 60 FPS during rapid multi-touch playing on supported phones and tablets.

## Haptics

Ordinary strike feedback must respect Android system settings and remain restrained.

- Prefer `View.performHapticFeedback()` with appropriate Android constants or predefined effects.
- Avoid direct `VibrationEffect.createOneShot()` for every ordinary strike.
- Use direct vibrator access only for deliberate effects that system haptic APIs cannot express, with capability checks and graceful fallback.
- Make kick feedback stronger than cymbal feedback.
- Scale carefully with strike velocity.
- Avoid strong vibration on every strike.
- Keep haptic work behind audio dispatch.
- Keep the user-facing haptics control in the settings panel or sheet.

## Lifecycle and Android behavior

- Keep the primary play experience landscape-only and immersive.
- Restore immersive mode after focus changes and interruptions.
- Start and stop audio with lifecycle transitions without leaking the stream.
- Future route recovery must cover speakers, wired output, USB audio, Bluetooth, screen lock, and app backgrounding.
- Preserve offline core operation.
- Do not add mandatory permissions unrelated to the instrument.
- Keep release minification compatible with the JNI bridge and update R8 rules when native-facing names change.

## Source mapping and codes

Keep `docs/source-mapping.md` current when changing:

- Instrument names or IDs
- Native numeric codes
- Stereo panning
- Draw bounds or hit regions
- Render z-index or hit priority
- Label placement or renderer keys
- Retained behavior or deferred scope

The current instrument code contract is:

- `0`: kick
- `1`: snare
- `2`: high tom
- `3`: mid tom
- `4`: floor tom
- `5`: hi-hat
- `6`: crash
- `7`: ride

Changing a code requires coordinated Kotlin, C++, documentation, and test updates.

## Testing expectations

Prioritize unit tests for:

- Normalized draw-bound conversion
- Ellipse, circle, polygon, and rectangle containment
- Rotated hit-region transforms
- Overlap resolution by hit priority
- Independence of render z-index and hit priority
- Stable normalized strike coordinates
- Velocity and pressure normalization
- Animation decay and instrument-specific rebound curves
- Label placement and fade-state logic
- Kit definition parsing

Prioritize instrumented tests for:

- Landscape lock and immersive recovery
- Multi-touch dispatch and cancellation
- Multiple pointers on one instrument
- Overlapping instrument hit resolution
- Background and foreground transitions
- Settings persistence
- Debug-only diagnostics visibility
- Minimum 48 x 48 dp control targets
- Audio focus and route changes

Prioritize native tests or deterministic seams for:

- Event queue capacity and ordering
- Voice allocation and stealing
- Clipping and limiter behavior
- Pitch, damping, choke, and tail updates
- Stress polyphony and underrun resistance

Test multiple landscape aspect ratios. Verify that artwork, labels, controls, and hit zones remain correctly aligned without requiring identical draw and hit rectangles.

Manual validation must include fast strokes, double strokes, flams, simultaneous kick and snare, dense cymbal tails, overlapping hit areas, rapid multi-finger input, and repeated edge strikes. Leisurely index-finger tapping proves remarkably little.

## Recommended implementation order

1. Separate draw bounds, hit regions, render z-order, and hit priority.
2. Replace the full-width HUD with compact controls.
3. Hide diagnostics outside debug builds.
4. Rebuild the kit layout using one camera perspective.
5. Add layered drum and cymbal artwork.
6. Add cached per-instrument render objects.
7. Add velocity- and position-based animations.
8. Improve haptics.
9. Add optional shader effects.
10. Consider OpenGL only if the 2.5D renderer becomes insufficient.

Complete the model and hit-testing separation before detailed artwork. Otherwise every visual improvement becomes hostage to a rectangle that was never qualified for the job.

## Change discipline

- Make the smallest coherent change in the owning module.
- Preserve the existing architecture unless the task explicitly requires changing it.
- Do not introduce a large framework when Android platform APIs or existing modules are sufficient.
- Do not add Unity, Unreal, a cross-platform game engine, or a `WebView` implementation.
- Do not commit generated output, local SDK paths, IDE state, keystores, or native intermediates.
- Keep dependencies centralized in `gradle/libs.versions.toml`.
- Explain new dependencies and prefer mature, narrow libraries.
- Update documentation when behavior, module boundaries, build requirements, layout contracts, or milestone status changes.
- Keep synthesized proof-of-concept audio clearly labeled as placeholder audio.
- Measure before replacing Canvas/RenderNode with a more complex renderer.

## Definition of done

The redesign is complete when:

- The kit looks visually coherent and professionally arranged.
- The kit occupies approximately 90% of the usable screen.
- No controls cover playable instruments.
- Each instrument has an accurate typed playable region independent from its draw bounds.
- Render order and hit priority are explicitly modeled and independently correct.
- Shadows, lighting, materials, scale, and perspective are consistent.
- Labels sit outside playable heads and can fade during normal playing.
- Hit animations respond to strike position and velocity.
- Drums deform locally and cymbals flex or tilt without lifting the whole instrument as the main effect.
- Multi-touch, pressure, contact-size input, normalized strike coordinates, and native audio latency remain unchanged.
- Audio dispatch still precedes haptic and visual work.
- The Oboe callback remains allocation-free, lock-free, and non-blocking.
- Steady-state drawing avoids object allocation.
- Rendering remains smooth during rapid playing.
- Diagnostics are absent from release builds.
- Compact controls meet minimum touch-target requirements.
- Relevant tests and documentation are updated.
- Validation performed and validation not performed are both reported accurately.
- The screen resembles a musical instrument rather than a diagnostic dashboard wearing cymbals.
