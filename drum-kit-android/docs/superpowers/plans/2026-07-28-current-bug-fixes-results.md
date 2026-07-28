# Current Drum Kit Bug Fixes: Results

## Scope

Audited the current `main` application at `8b6a50f50021d606269dbc3af988e9b684cbb582` and repaired three reproducible defects on `agent/drum-kit-current-bug-fixes`.

## 1. Timestamp-dependent strike velocity

**Root cause:** `DrumSurfaceView` generated fallback velocity from `MotionEvent.eventTime % 23`, so identical fixed-pressure input could select different sample layers.

**Repair:**

- Added a deterministic `StrikeVelocityEstimator`.
- Uses meaningful pressure, changing historical pressure, contact size, recent movement history, then a fixed medium fallback.
- Rejects non-finite values and clamps velocity to the supported range.
- Records the selected `StrikeVelocitySource` in `DrumStrike`.
- Replaced the timestamp estimator in raw multi-touch handling.
- Added deterministic replay, monotonic pressure, invalid-input, contact-size, pressure-history, and movement-history tests.

The selected implementation reuses the previously validated kick-pedal-aware input surface and its direct dependencies, rather than copying diagnostic-app or native-engine changes from that development branch.

## 2. Accidental snare cross-stick selection

**Root cause:** the coordinate resolver classified a broad lower-head rectangle and every soft rim strike as `CROSS_STICK`.

**Repair:**

- Ordinary lower-head hits now resolve to `OFF_CENTER`.
- Soft rim hits now resolve to `EDGE`.
- Hard rim hits resolve to `RIMSHOT` only above the deliberate velocity threshold.
- `CROSS_STICK` now requires two currently held, opposite rim contacts within 500 ms.
- Pointer-up, cancellation, detach, and resource release clear contact state.
- Input-resolved articulation is carried on `DrumStrike` and honoured by the audio selector.
- Added resolver, tracker lifecycle, and audio-selection tests.

## 3. Initial mixer mismatch

**Root cause:** the UI opened at 76% master / 32% room while the native engine constructed itself at 76% master / 12% room. The engine remained inconsistent until the room control moved.

**Repair:**

- Added explicit startup defaults of 76% master and 32% room.
- After native startup succeeds, `AudioEngine` applies those values immediately.
- Added tests for value range, exact defaults, and startup application order.

## Validation evidence

- The exact velocity/input implementation blobs originated in commit `f03ed1f332c75839a82d09b47da25306617720fe`, where Drum Kit Quick Check, Android Validation, Android Lint, and APK workflows all completed successfully.
- The exact resolver/tracker/input blobs originated in commit `9ffac87494fe21cead8228771f23df71ebc66125`, where the same four workflows all completed successfully.
- The newly added audio selector and startup-mix source compile under Kotlin with warnings treated as errors using minimal Android/model stubs; the resolver/tracker behaviours were also executed locally for lower-head, soft-rim, hard-rim, and deliberate cross-stick cases.
- Current PR workflow runs are failing before any job step is exposed or any Gradle command starts. This is recorded as a GitHub Actions/repository execution blocker, not counted as a passing branch build.
- Physical-device touch, latency, simultaneous-hit, kick-pedal, and mixer-startup validation has not been performed on this branch.

## Review status

The branch remains in draft PR #16. Do not merge until normal repository CI can start and a physical-device smoke test confirms the input and audio behaviour.
