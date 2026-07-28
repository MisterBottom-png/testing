# Current Drum Kit Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove three reproducible defects from the current `main` drum-kit application: timestamp-dependent strike velocity, accidental snare cross-stick selection, and mismatched initial mixer values.

**Architecture:** Keep the existing raw `MotionEvent` → `DrumStrike` → JNI → Oboe path intact. Extract deterministic input interpretation into testable Kotlin classes, pass deliberate snare articulation through the existing strike model, and place mixer defaults in `core-model` so the UI and audio facade consume the same values. Audio dispatch remains ahead of recording, animation, haptics, and diagnostics.

**Tech Stack:** Kotlin 2.4.10, Android View input, Jetpack Compose, JUnit 4, JNI, C++20, Oboe, Gradle 9.5.0.

## Global Constraints

- Work only on `agent/drum-kit-current-bug-fixes`, based on `main` commit `8b6a50f50021d606269dbc3af988e9b684cbb582`.
- Preserve JDK 17, Android SDK 37 preview, Build Tools 37.0.0, AGP 9.3.x, Gradle 9.5.0, NDK 29.0.14206865, CMake 3.22.1, Kotlin 2.4.10, C++20, and Oboe 1.10.x.
- Do not perform allocation, file I/O, locking, logging, or JNI callbacks inside the Oboe data callback.
- Dispatch audio before visual, haptic, recording, or diagnostic work.
- Preserve raw multi-touch pointer IDs and stable `[0, 1]` playable-surface-local coordinates.
- Keep draw bounds, playable-surface bounds, hit regions, render order, and hit priority independent.
- Treat all warnings as errors.
- Do not merge or publish a release without explicit user instruction.

---

### Task 1: Make Strike Velocity Deterministic

**Files:**
- Create: `engine-input/src/test/java/com/vitautas/drumkit/input/StrikeVelocityEstimatorTest.kt`
- Create: `engine-input/src/main/java/com/vitautas/drumkit/input/StrikeVelocityEstimator.kt`
- Modify: `core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt`
- Modify: `engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt`

**Interfaces:**
- Produces: `StrikeVelocityEstimator.estimate(input: StrikeVelocityInput): StrikeVelocityEstimate`
- Produces: `StrikeVelocityInput`, `StrikeVelocityHistoricalSample`, and `StrikeVelocityEstimate`
- Produces: `StrikeVelocitySource` on `DrumStrike`, defaulting to `DETERMINISTIC_FALLBACK` for source compatibility
- Consumes: Android pressure, contact size, current pointer coordinates, event time, and historical motion samples

- [ ] **Step 1: Write the failing deterministic replay test**

Create a test that constructs fixed/default pressure input twice with different event timestamps and asserts the complete estimates are equal and report `DETERMINISTIC_FALLBACK`.

```kotlin
@Test
fun fixedPressureFallsBackDeterministically() {
    val estimator = StrikeVelocityEstimator()
    val input = input(pressure = 0.5f, contactSize = 0f, eventTimeMillis = 100L)

    val first = estimator.estimate(input)
    val replay = estimator.estimate(input.copy(eventTimeMillis = 9_999L))

    assertEquals(StrikeVelocitySource.DETERMINISTIC_FALLBACK, first.source)
    assertEquals(first, replay)
}
```

Also add focused tests for monotonic changing pressure, invalid values, restrained contact-size extremes, historical pressure, and historical movement.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-input:testDebugUnitTest \
  --tests com.vitautas.drumkit.input.StrikeVelocityEstimatorTest
```

Expected: compilation fails because `StrikeVelocityEstimator`, its input types, and `StrikeVelocitySource` do not exist. This is the intended RED result.

- [ ] **Step 3: Add the minimal deterministic estimator**

Implement a stateful estimator that:

```kotlin
internal class StrikeVelocityEstimator(
    private val profile: StrikeVelocityProfile = StrikeVelocityProfile.BALANCED,
) {
    fun estimate(input: StrikeVelocityInput): StrikeVelocityEstimate
}
```

Selection order must be meaningful current pressure, changing historical pressure, valid contact size, recent historical motion, then a fixed `0.62f` fallback. It must never derive velocity from timestamp modulo arithmetic. Clamp all outputs to `0.22f..1f`, reject non-finite measurements, treat pressure near `0.5f` as the common fixed/default value, and mark the selected path with `StrikeVelocitySource`.

- [ ] **Step 4: Integrate the estimator into raw pointer-down handling**

In `DrumSurfaceView`, keep one estimator instance. Build `StrikeVelocityInput` from the active pointer and `MotionEvent` history, then put `estimate.velocity` and `estimate.source` into `DrumStrike`. Remove the private timestamp-based `estimateVelocity()` function completely.

- [ ] **Step 5: Run focused and module tests and verify GREEN**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-input:testDebugUnitTest
```

Expected: all `engine-input` tests pass with no warnings.

- [ ] **Step 6: Commit the completed velocity repair**

```bash
git add core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt \
  engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt \
  engine-input/src/main/java/com/vitautas/drumkit/input/StrikeVelocityEstimator.kt \
  engine-input/src/test/java/com/vitautas/drumkit/input/StrikeVelocityEstimatorTest.kt
git commit -m "fix: make drum strike velocity deterministic"
```

### Task 2: Require Deliberate Snare Cross-Stick Input

**Files:**
- Modify: `core-model/src/test/java/com/vitautas/drumkit/model/SnareArticulationResolverTest.kt`
- Create: `core-model/src/test/java/com/vitautas/drumkit/model/SnareContactTrackerTest.kt`
- Modify: `core-model/src/main/java/com/vitautas/drumkit/model/SnareArticulationResolver.kt`
- Create: `core-model/src/main/java/com/vitautas/drumkit/model/SnareContactTracker.kt`
- Modify: `core-model/src/main/java/com/vitautas/drumkit/model/KitModels.kt`
- Modify: `engine-input/src/main/java/com/vitautas/drumkit/input/DrumSurfaceView.kt`
- Create: `engine-audio/src/main/java/com/vitautas/drumkit/audio/StrikeArticulationSelector.kt`
- Create: `engine-audio/src/test/java/com/vitautas/drumkit/audio/StrikeArticulationSelectorTest.kt`
- Modify: `engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt`

**Interfaces:**
- Produces: `SnareArticulationResolver.resolve(..., restingContacts: Collection<SnareContact> = emptyList())`
- Produces: `SnareContactTracker.resolveAndRecord(...)`, `remove(pointerId)`, and `clear()`
- Adds: `DrumStrike.requestedArticulation: SnareArticulation? = null`
- Produces: `StrikeArticulationSelector.resolve(strike: DrumStrike): SnareArticulation`
- Consumes: currently held snare contacts and the accepted strike’s stable local coordinates

- [ ] **Step 1: Replace tests that encode the defective behaviour**

Change the lower-head test to expect `OFF_CENTER`, change a soft isolated hoop strike to expect `EDGE`, retain hard-rim `RIMSHOT`, and add a tracker test proving two opposite rim contacts within 500 ms produce `CROSS_STICK`.

```kotlin
@Test
fun ordinaryLowerHeadStrikeDoesNotSelectCrossStick() {
    assertEquals(
        SnareArticulation.OFF_CENTER,
        SnareArticulationResolver.resolve(0.5f, 0.82f, 0.7f),
    )
}
```

```kotlin
@Test
fun oppositeRimContactsWithinWindowSelectCrossStick() {
    val tracker = SnareContactTracker()
    tracker.resolveAndRecord(1, 0.04f, 0.5f, 0.5f, 1_000L)

    assertEquals(
        SnareArticulation.CROSS_STICK,
        tracker.resolveAndRecord(2, 0.96f, 0.5f, 0.5f, 100_000_000L),
    )
}
```

Add lifecycle tests proving expired, removed, and cleared contacts cannot produce cross-stick.

- [ ] **Step 2: Run core-model tests and verify RED**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :core-model:test \
  --tests com.vitautas.drumkit.model.SnareArticulationResolverTest \
  --tests com.vitautas.drumkit.model.SnareContactTrackerTest
```

Expected: existing resolver assertions fail and tracker symbols are unresolved.

- [ ] **Step 3: Implement deliberate resolver and contact tracking**

Remove the broad lower-head rectangle and soft-rim cross-stick fallback. Use radial thresholds `0.32f` for centre, `0.68f` for off-centre, `0.88f` for rim contacts, `0.91f` for rimshot, and `0.62f` minimum rimshot velocity. Cross-stick is selected only when a current strike near the rim has a held contact near the opposite rim within 500 ms.

- [ ] **Step 4: Carry deliberate articulation through the strike path**

Add `requestedArticulation` to `DrumStrike` with a nullable default. In `DrumSurfaceView`, resolve and record snare contacts before dispatch, remove contacts on pointer-up, and clear them on cancel, detach, and resource release. Preserve the existing ordering where `onStrike` is invoked before animation and haptics.

- [ ] **Step 5: Make audio selection testable and honour the requested articulation**

Add a pure `StrikeArticulationSelector` that returns `CENTER` for non-snare instruments, otherwise returns `strike.requestedArticulation` when present, falling back to `SnareArticulationResolver`. Use it from `AudioEngine.trigger()` before JNI dispatch. Test deliberate cross-stick, fallback snare resolution, and non-snare behaviour without loading the native library.

- [ ] **Step 6: Run model and audio tests and verify GREEN**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :core-model:check \
  :engine-audio:testDebugUnitTest \
  :engine-input:testDebugUnitTest
```

Expected: all tests pass with no warnings.

- [ ] **Step 7: Commit the completed snare repair**

```bash
git add core-model engine-input engine-audio
git commit -m "fix: require deliberate snare cross-stick input"
```

### Task 3: Synchronise Initial Mixer Values

**Files:**
- Create: `core-model/src/main/java/com/vitautas/drumkit/model/AudioMixDefaults.kt`
- Create: `core-model/src/test/java/com/vitautas/drumkit/model/AudioMixDefaultsTest.kt`
- Modify: `feature-kit/src/main/java/com/vitautas/drumkit/feature/kit/DrumKitScreen.kt`
- Modify: `engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt`

**Interfaces:**
- Produces: `AudioMixDefaults.MASTER_VOLUME = 0.76f`
- Produces: `AudioMixDefaults.ROOM_MIX = 0.12f`
- Consumes: the same defaults from Compose state and successful native-engine startup

- [ ] **Step 1: Write the failing shared-default contract test**

```kotlin
@Test
fun defaultsMatchTheNativeStartupMix() {
    assertEquals(0.76f, AudioMixDefaults.MASTER_VOLUME, 0f)
    assertEquals(0.12f, AudioMixDefaults.ROOM_MIX, 0f)
}
```

Also assert both values are finite and inside `0f..1f`.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :core-model:test \
  --tests com.vitautas.drumkit.model.AudioMixDefaultsTest
```

Expected: compilation fails because `AudioMixDefaults` does not exist.

- [ ] **Step 3: Add and consume one shared Kotlin source of truth**

Create `AudioMixDefaults`, initialise the Compose volume and room state from it, and after `nativeStart()` succeeds explicitly apply both defaults through `nativeSetMasterVolume()` and `nativeSetRoomMix()`. This makes the visible mixer and running engine agree even if native object construction changes later.

- [ ] **Step 4: Run all Kotlin tests and compile the application**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :core-model:check \
  :engine-input:testDebugUnitTest \
  :engine-audio:testDebugUnitTest \
  :feature-kit:testDebugUnitTest \
  :app:compileDebugKotlin
```

Expected: all tests and compilation pass with no warnings.

- [ ] **Step 5: Commit the mixer repair**

```bash
git add core-model/src/main/java/com/vitautas/drumkit/model/AudioMixDefaults.kt \
  core-model/src/test/java/com/vitautas/drumkit/model/AudioMixDefaultsTest.kt \
  feature-kit/src/main/java/com/vitautas/drumkit/feature/kit/DrumKitScreen.kt \
  engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt
git commit -m "fix: synchronise initial drum mixer values"
```

### Task 4: Full Validation and Documentation

**Files:**
- Modify: `docs/Drum_Kit_Recovery_and_Development_Roadmap.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed Tasks 1–3
- Produces: accurate documentation of repaired behaviour and remaining physical-device validation

- [ ] **Step 1: Update documentation accurately**

Document that timestamp modulo velocity has been removed, cross-stick now requires deliberate opposite-rim contacts, and initial mixer state is shared. Do not claim physical-device validation unless a device run actually occurs.

- [ ] **Step 2: Run repository validation**

Run:

```bash
gradle --no-daemon --console=plain --warning-mode=fail \
  :core-model:check \
  :engine-input:testDebugUnitTest \
  :engine-audio:testDebugUnitTest \
  :feature-kit:testDebugUnitTest \
  :app:compileDebugKotlin \
  :app:lintDebug
```

Then run:

```bash
git diff --check
```

Expected: all checks pass and `git diff --check` produces no output.

- [ ] **Step 3: Commit documentation**

```bash
git add README.md docs/Drum_Kit_Recovery_and_Development_Roadmap.md
git commit -m "docs: record current drum kit bug fixes"
```

- [ ] **Step 4: Request review and preserve the branch for user inspection**

Open a draft pull request from `agent/drum-kit-current-bug-fixes` to `main`, include each reproduced defect, root cause, test-first evidence, final validation, and any physical-device checks not performed. Do not merge without explicit instruction.
