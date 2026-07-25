# Native Android Drum Kit Recovery and Development Roadmap

## Purpose

This roadmap converts the current working Android drum-kit prototype into a stable, predictable, visually coherent musical instrument.

The existing low-latency architecture must be preserved:

1. Raw Android `MotionEvent` input
2. Immediate strike dispatch
3. Kotlin-to-JNI bridge
4. Native C++/Oboe audio callback
5. Lock-free or fixed-capacity communication
6. Visual, haptic, diagnostic, and recording work only after audio dispatch

The application is already functional. The remaining work is primarily repository consolidation, deterministic input interpretation, evidence-based sound tuning, production-quality artwork, replacement of synthesized instruments, and release polish.

---

## Working Rules

- Complete a maximum of two numbered roadmap steps per implementation batch.
- Do not begin visual or audio tuning without reproducible evidence.
- Do not perform file I/O, allocation, logging, locking, or JNI calls inside the real-time audio callback.
- Preserve stable normalized instrument-local strike coordinates.
- Keep draw bounds, visible playable surfaces, and touch regions independent.
- Validate every batch before marking it complete.
- Physical-device acceptance must not be inferred from unit tests or CI alone.
- Do not merge, publish, or release without explicit instruction.

## Implementation Status

- **Step 1.1 — partially complete (2026-07-25):** PRs #7, #8, and #9 were audited. PR #8 is fully included in PR #9 by ancestry. PR #7 is not included by commit ancestry, but its required sample-first snare, tooling, attribution, tests, and workflow capabilities are present or superseded in PR #9. PR #9 now targets `main`. CI and build artefacts for the pre-documentation head were verified. Documentation alignment, CI validation of the updated head, physical-device acceptance, and closing superseded PRs remain.
- **Step 1.2 — not started:** no diagnostic-session recorder implementation has begun.

---

# Phase 1: Establish a Clean, Measurable Baseline

## Step 1.1: Consolidate the Repository

### Objective

Create one authoritative implementation line based on `main`, containing the complete working drum-kit application and its documentation.

### Work

- Audit PRs #7, #8, and #9.
- Confirm which commits and files from PRs #7 and #8 are already included in PR #9.
- Create a clean integration branch from `main`, or retarget the complete implementation PR directly to `main`.
- Preserve:
  - Sample-first snare engine
  - Multi-touch input
  - Hit-region corrections
  - Cached renderer
  - Diagnostic hit map
  - Recording foundation
  - CI workflows
  - Licensing and attribution
  - Documentation
- Remove or close superseded drum-kit PRs after the consolidated branch is validated.
- Keep unrelated historical application PRs outside this cleanup.
- Align `README.md`, `AGENTS.md`, and `docs/source-mapping.md` with the actual production renderer and current implementation.
- Prefer a clean squash or intentionally curated merge history over importing hundreds of intermediate development commits.

### Validation

- Run the JVM quick checks.
- Run Android unit tests.
- Compile all Android application Kotlin sources.
- Compile native C++ with warnings treated as errors.
- Assemble the debug APK.
- Run Android lint.
- Generate and verify the snare bank.
- Confirm the APK installs and launches on a physical device.
- Confirm the audio engine starts and reports valid diagnostics.

### Acceptance Criteria

- The complete working application exists on one authoritative branch.
- The authoritative branch is based on `main`.
- Required CI workflows pass.
- A fresh installable debug APK is produced.
- No required source, test, workflow, sample-generation, attribution, or documentation file is lost.
- Superseded drum-kit PRs are clearly marked and closed.
- The application still produces sound with no regression in multi-touch behaviour.

---

## Step 1.2: Build an In-App Diagnostic Session Recorder

### Objective

Allow the application to record a complete diagnostic play session and export it as one analysis bundle that can be uploaded for review.

This recorder is not merely the existing expressive strike recorder. It must capture the entire chain needed to explain unpredictable sound, incorrect articulation selection, missed hits, visual lag, and audio instability.

### User Workflow

1. Open the debug application.
2. Open the diagnostic panel.
3. Tap **Start diagnostic session**.
4. Perform the guided test sequence or play freely.
5. Tap **Stop and export**.
6. The application creates one `.zip` diagnostic bundle.
7. Upload the bundle for analysis.

### Required Recorded Data

#### A. Session Metadata

Record once per session:

- Session identifier
- UTC start and end timestamps
- Application version
- Git commit SHA
- Build type
- Device manufacturer and model
- Android version
- Screen width, height, density, refresh rate, and orientation
- Audio output route
- Audio sample rate
- Frames per burst
- Oboe sharing mode
- Audio performance mode
- Master volume
- Room level
- Haptics setting
- Selected drum kit
- Renderer backend
- Available memory at session start
- Whether the session used free play or a guided test

#### B. Raw Touch Events

Record every relevant input event, not only accepted strikes:

- Event timestamp
- Android action type:
  - DOWN
  - POINTER_DOWN
  - MOVE
  - POINTER_UP
  - UP
  - CANCEL
- Pointer ID
- Raw screen X and Y
- Normalized screen X and Y
- Pressure
- Contact size
- Tool type
- Orientation when available
- Historical motion samples attached to the event
- Whether the point intersected zero, one, or multiple hit regions
- Candidate instruments in hit-priority order
- Final selected instrument
- Rejection reason when no instrument was selected

This log is required to distinguish a bad hit region from a bad velocity estimator or articulation resolver.

#### C. Derived Strike Data

For every accepted strike:

- Strike timestamp
- Pointer ID
- Instrument
- Stable playable-surface-local X and Y
- Raw pressure
- Raw contact size
- Estimated velocity
- Velocity-estimator input mode:
  - calibrated pressure
  - contact-size estimate
  - motion/history estimate
  - deterministic fallback
- Selected articulation
- Articulation resolver inputs
- Lower velocity layer
- Upper velocity layer
- Blend amount
- Round-robin index or indices
- Applied pitch variation
- Applied gain variation
- Applied filter variation
- Stereo pan
- Whether the event entered the native queue
- Queue-full or dropped-event status
- Active voice count after dispatch
- Voice-steal occurrence, when applicable

#### D. Audio Diagnostics Timeline

Sample diagnostics periodically and when important state changes occur:

- Engine running state
- Sample rate
- Frames per burst
- Oboe sharing mode
- Underrun count
- Audio restart or recovery events
- Event-queue depth
- Dropped event count
- Active voice count
- Voice-steal count
- Limiter gain
- Peak output level
- Clipping or limiter-hit count
- Native error codes
- Audio-focus state and changes
- Output-route changes

#### E. Rendering and Application Performance

Record at a restrained diagnostic cadence:

- UI frame duration
- Long-frame count
- Approximate frames per second
- Render invalidation reason
- Active instrument animations
- Artwork-cache rebuild events
- Artwork-cache backend
- Bitmap-cache memory estimate
- Java/Kotlin heap use
- Native heap use where available
- Orientation or size changes
- Activity pause, resume, stop, and restart events

#### F. Generated Audio Capture

Record the application’s generated stereo output directly from the native mixer.

The recorder must not perform file I/O inside the Oboe callback.

Use:

1. A fixed-capacity preallocated audio capture ring buffer
2. Non-blocking writes from the audio callback
3. A background consumer thread
4. WAV writing outside the callback
5. A clear overflow counter when the background writer cannot keep up

The exported audio should be the generated application mix, not a microphone recording. This avoids room noise and makes sample-layer problems easier to diagnose.

Optional microphone recording may be added later as a separate, clearly labelled feature, but it is not required for the first diagnostic system.

#### G. User Markers

Allow the user to add markers during a session:

- Sounds wrong
- Wrong instrument
- Wrong articulation
- Too loud
- Too quiet
- Delayed
- Visual problem
- Missed hit
- Other

Each marker must include a timestamp and optional short note so it can be aligned with input, audio, and performance logs.

### Export Bundle Format

Export one ZIP file with a structure similar to:

```text
drum-diagnostic-<session-id>.zip
├── manifest.json
├── session.json
├── touch-events.jsonl
├── strikes.jsonl
├── audio-diagnostics.csv
├── performance.csv
├── markers.json
├── generated-output.wav
├── summary.txt
└── checksums.sha256
```

### File Requirements

- Use UTF-8 text.
- Use JSON Lines for high-volume event logs.
- Use CSV for regular time-series diagnostics.
- Use standard stereo PCM WAV for generated audio.
- Include schema versions in every structured file.
- Include a SHA-256 checksum list.
- Avoid personally identifying information.
- Do not record unrelated application data.
- Display the expected export size before starting a diagnostic session when possible.
- Allow sessions to be deleted from the device.
- Store exports in an application-controlled temporary area until the user explicitly shares or saves them.

### Guided Diagnostic Test

Include an optional guided sequence:

1. 20 centre snare strikes at soft intensity
2. 20 centre strikes at medium intensity
3. 20 centre strikes at hard intensity
4. 20 off-centre strikes
5. 20 edge strikes
6. 20 intended rimshots
7. 20 intended cross-sticks
8. Slow alternating centre and edge strikes
9. Fast repeated centre strikes
10. Two-finger simultaneous snare and hi-hat strikes
11. Full-kit free play for 30 seconds

The application should display the current test instruction and add automatic section markers to the exported session.

### Validation

- Unit-test all serializers and schema versions.
- Unit-test ring-buffer overflow handling.
- Unit-test diagnostic session start, stop, cancellation, and export finalisation.
- Verify no recording-related file I/O occurs in the real-time audio callback.
- Verify audio dispatch remains ahead of diagnostic recording.
- Verify session export after activity pause or unexpected audio stop.
- Verify malformed or partial sessions can still export a readable recovery bundle.
- Perform a physical-device recording and upload the resulting ZIP for review.

### Acceptance Criteria

- One action starts a diagnostic session.
- One action stops and exports it.
- Every accepted strike can be reconstructed from raw touch input through articulation and sample selection.
- Rejected touches are visible in the log.
- Generated output audio aligns with event timestamps.
- Audio underruns do not increase because recording is enabled under normal test conditions.
- Buffer overflow and dropped diagnostic data are explicitly reported.
- The exported bundle can be uploaded and analysed without manually copying values from the screen.
- The bundle contains enough information to determine whether a bad result came from:
  - hit testing
  - velocity estimation
  - articulation resolution
  - sample selection
  - audio queueing
  - voice allocation
  - rendering performance
  - device or audio-route changes

---

# Phase 2: Make the Snare Predictable

## Step 2.1: Replace Timestamp-Based Velocity Estimation

### Objective

Make identical input produce identical velocity and remove timestamp-dependent pseudo-randomness.

### Work

- Extract velocity calculation into a testable `StrikeVelocityEstimator`.
- Remove all velocity calculations based on event-time modulo arithmetic.
- Use meaningful device pressure when it changes reliably.
- Use contact size within a restrained range.
- Use historical pressure, size, movement, and timing data when useful.
- Detect devices that report fixed or meaningless pressure.
- Use a deterministic medium-velocity fallback when no useful signal exists.
- Prepare the model for later user calibration profiles:
  - fixed
  - soft
  - balanced
  - hard

### Validation

- Unit-test fixed-pressure devices.
- Unit-test changing pressure.
- Unit-test invalid floating-point values.
- Unit-test contact-size extremes.
- Unit-test historical samples.
- Unit-test deterministic fallback.
- Compare before-and-after diagnostic sessions.

### Acceptance Criteria

- Identical recorded inputs produce identical velocities.
- Harder measured input never produces a lower velocity than softer measured input.
- All outputs are finite and clamped.
- Repeated centre strikes no longer jump between distant sample layers without corresponding input changes.
- Diagnostic output identifies which estimator path was used.

---

## Step 2.2: Correct Snare Articulation Detection

### Objective

Make snare articulations deliberate and reproducible.

### Work

- Keep centre, off-centre, and edge selection based on radial head position.
- Require deliberate rim proximity and suitable velocity for rimshot.
- Remove the broad automatic lower-head cross-stick rectangle.
- Introduce a persistent `DrumContact` model.
- Implement cross-stick as a two-contact gesture:
  - one finger rests near one rim side
  - another finger strikes the opposite side within a controlled window
- Add an optional accessibility cross-stick strip or explicit control.
- Correctly clear contacts on pointer-up, cancellation, activity interruption, and audio-session loss.

### Validation

- Unit-test every articulation boundary.
- Unit-test overlapping contacts.
- Unit-test two-finger cross-stick timing.
- Unit-test pointer cancellation.
- Unit-test rapid alternating strikes.
- Verify behaviour with physical-device diagnostic sessions.

### Acceptance Criteria

- Normal lower-head strikes do not become cross-stick.
- Cross-stick requires deliberate input.
- Rimshot is selected consistently near the rim.
- Fast rolls do not leave stale gesture state.
- Recorded resolver inputs explain every articulation selection.

---

## Step 2.3: Balance the Snare Sample Bank

### Objective

Make velocity layers and round robins vary naturally without sounding randomly loud, quiet, bright, or delayed.

### Work

- Measure every sample’s:
  - onset position
  - peak level
  - short-term RMS
  - attack energy
  - decay time
  - spectral centroid
- Detect outlier samples.
- Balance each articulation as a group.
- Verify monotonic loudness across velocity layers.
- Verify timing consistency.
- Temporarily disable pitch, gain, and filter variation during tuning.
- Reintroduce restrained variation after the bank is balanced.
- Tune centre, off-centre, edge, rimshot, and cross-stick relative levels from recorded evidence.

### Validation

- Generate a bank-analysis report.
- Render automated strike sweeps.
- Compare waveform and loudness plots.
- Review physical-device diagnostic recordings.
- Repeat the guided diagnostic test after tuning.

### Acceptance Criteria

- Adjacent layers transition smoothly.
- No round robin is an obvious loudness or timing outlier.
- Repetition sounds natural but remains the same articulation.
- Rimshot and cross-stick are intentionally balanced against normal head strokes.
- Changes are supported by recorded evidence.

---

# Phase 3: Replace the Visual System

## Step 3.1: Approve a Final Visual Reference

### Objective

Define exactly what the finished playing screen should look like before renderer implementation begins.

### Work

- Produce a complete elevated drummer-view reference.
- Define:
  - camera angle
  - instrument scale
  - shell finish
  - drumhead material
  - cymbal colour and curvature
  - hardware density
  - shadow direction
  - floor treatment
  - background lighting
  - control placement
  - active-hit treatment
- Produce reference layouts for:
  - common landscape phone
  - wide landscape phone
  - tablet
- Confirm that all controls remain outside playable regions.

### Acceptance Criteria

- One approved visual direction exists.
- All instruments share one camera and light direction.
- Instrument placement is clear at each target aspect ratio.
- Renderer work can be compared against a specific reference rather than subjective descriptions.

---

## Step 3.2: Introduce Asset-Backed Layered Instruments

### Objective

Replace visibly procedural artwork while preserving the existing geometry, animation, and cache architecture.

### Work

- Replace or extend the procedural artwork factory with asset bundles.
- Provide layers for:
  - contact shadow
  - stand or mount
  - shell or body
  - hardware
  - playable head or cymbal
  - reflections and wear
  - hit feedback
- Start with transparent WebP or PNG assets.
- Retain independent body and playable layers.
- Retain bitmap caching until RenderNode is diagnosed and revalidated.
- Keep animations tied to stable instrument-local coordinates.
- Keep hit regions independent from artwork bounds.

### Validation

- Compare screenshots to the approved reference.
- Run visual regression tests at target aspect ratios.
- Verify hit-map alignment.
- Measure bitmap memory.
- Measure frame times during rapid multi-touch.
- Verify cache lifecycle through resize, detach, reattach, pause, and resume.

### Acceptance Criteria

- Instruments no longer look like procedural clip-art.
- Drums appear cylindrical and grounded.
- Cymbals appear metallic and curved.
- Hardware connects plausibly to the shared floor.
- Touch regions remain aligned.
- Static artwork is not rebuilt during normal playing.
- Frame performance remains acceptable on representative devices.

---

## Step 3.3: Polish Controls and Playing-Screen Presentation

### Objective

Make controls compact, clear, and visually subordinate to the instrument.

### Work

- Replace temporary text-heavy controls with compact icons and clear states.
- Keep 48 × 48 dp minimum touch targets.
- Make recording state unmistakable.
- Keep diagnostics behind a debug-only panel.
- Handle cutouts and safe drawing insets.
- Ensure labels do not obstruct playable areas.
- Add empty, recording, stopped, exporting, and error states.

### Acceptance Criteria

- Controls do not cover playable regions.
- Recording status is obvious.
- Debug information is absent from production builds.
- The playing screen reads as a musical instrument, not a diagnostic dashboard.

---

# Phase 4: Replace Remaining Placeholder Instruments

## Step 4.1: Add Production Kick and Tom Sample Banks

### Objective

Replace synthesized kick and tom voices with licensed, velocity-layered sample banks.

### Work

- Select and license source material.
- Add deterministic preprocessing.
- Add velocity layers and round robins.
- Add position-aware tonal variation.
- Preserve native preloading and real-time safety.
- Balance kick and tom levels against the snare.

### Acceptance Criteria

- Kick and toms no longer use placeholder synthesis.
- Dense multi-touch remains stable.
- Layer transitions are smooth.
- Sample attribution is complete.
- Device diagnostics show no new underrun regression.

---

## Step 4.2: Add Production Hi-Hat Sample Bank

### Objective

Replace the synthesized hi-hat while preparing for continuous openness.

### Work

- Add closed, semi-open, open, pedal, and foot-splash material.
- Add velocity layers and round robins.
- Add edge and bow zones where source material supports them.
- Add a state model that can later support continuous openness.

### Acceptance Criteria

- Hi-hat strikes use production samples.
- Closed and open states are clearly distinguishable.
- State transitions do not create stuck voices.
- Multi-touch snare and hi-hat playing remains stable.

---

## Step 4.3: Add Production Crash and Ride Sample Banks

### Objective

Replace synthesized cymbals with expressive sampled instruments.

### Work

- Add crash and ride velocity layers.
- Add round robins.
- Add ride bow, bell, and edge zones.
- Add crash edge and bow zones.
- Prepare active-voice references for later choke behaviour.

### Acceptance Criteria

- Crash and ride no longer use placeholder synthesis.
- Ride zones are deliberate and repeatable.
- Long cymbal tails do not exhaust the voice pool.
- Voice stealing is measured and acceptable.

---

# Phase 5: Continuous Expression

## Step 5.1: Add Active Touch-to-Voice Control

### Objective

Allow ongoing touch gestures to modify an already sounding voice.

### Work

- Introduce active voice identifiers.
- Link active contacts to native voices.
- Add a lock-free parameter-update queue.
- Preserve real-time safety.
- Support:
  - press-to-damp
  - tom pitch bend
  - snare damping
  - second-finger muting

### Acceptance Criteria

- Continuous control does not block the audio callback.
- Voice updates target the correct strike.
- Cancellation and lifecycle interruption release controls safely.
- Dense multi-touch remains stable.

---

## Step 5.2: Add Continuous Hi-Hat and Cymbal Choke Behaviour

### Objective

Implement the expressive behaviours expected from real cymbals.

### Work

- Add continuous hi-hat openness.
- Add pedal-close and foot-splash events.
- Add cymbal choke zones.
- Add gradual damping rather than abrupt sample termination.
- Add visual state corresponding to openness and choke.

### Acceptance Criteria

- Hi-hat openness changes predictably.
- Pedal events are recorded and reproducible.
- Cymbal choking targets the correct active voice.
- Audio and visuals remain synchronised.

---

## Step 5.3: Add Advanced Snare Behaviour

### Objective

Complete the snare as an expressive instrument.

### Work

- Add snare throw-off state.
- Add press-roll behaviour.
- Add explicit stick-angle or articulation control if needed.
- Refine cross-stick accessibility behaviour.
- Add calibration support for device-specific touch characteristics.

### Acceptance Criteria

- Advanced behaviours are deliberate and do not interfere with normal strikes.
- State changes are recorded in diagnostic sessions.
- Input behaviour remains understandable and testable.

---

# Phase 6: Recording, Calibration, and Release Polish

## Step 6.1: Add Strike-Take Playback

### Objective

Play recorded expressive strike events back through the native engine.

### Work

- Preserve relative timing.
- Preserve instrument, articulation, velocity, position, pressure, and contact size.
- Add play, pause, stop, loop, and seek controls.
- Add metronome and count-in.

### Acceptance Criteria

- Playback reproduces the original strike sequence accurately.
- Playback does not interfere with live playing.
- Timing drift remains within an agreed tolerance.

---

## Step 6.2: Add PCM/WAV Export

### Objective

Export recorded performances as standard audio files.

### Work

- Add offline or controlled real-time rendering.
- Export stereo PCM WAV.
- Include session metadata.
- Handle cancellation and storage failures.
- Keep export work outside the real-time callback.

### Acceptance Criteria

- Exported WAV files open in standard audio software.
- Exported duration matches the performance.
- No clipping or missing tail occurs.
- Failed exports leave no misleading completed file.

---

## Step 6.3: Add Calibration and Device Guidance

### Objective

Adapt the application to devices with different touch and audio behaviour.

### Work

- Add touch-response calibration.
- Add fixed-velocity mode.
- Add soft, balanced, and hard velocity curves.
- Add Bluetooth latency warning.
- Add output-route diagnostics.
- Persist user settings safely.

### Acceptance Criteria

- Users can achieve predictable velocity on fixed-pressure devices.
- Calibration settings are reproducible.
- Bluetooth latency is clearly explained.
- Settings survive application restarts.

---

## Step 6.4: Complete Release Validation

### Objective

Prove the application is ready for broader use.

### Work

- Test representative phones and tablets.
- Test supported Android versions.
- Run accessibility review.
- Profile frame times and memory.
- Run dense-polyphony tests.
- Validate lifecycle and audio-route recovery.
- Validate release APK and app bundle.
- Review licences, notices, privacy text, and export behaviour.

### Acceptance Criteria

- Required CI and release checks pass.
- Physical-device acceptance is documented.
- No known high-severity audio, touch, crash, licensing, or data-loss issue remains.
- Release artefacts are reproducible.
- Remaining limitations are documented honestly.

---

# Recommended Execution Order

1. Step 1.1: Consolidate the repository
2. Step 1.2: Build the in-app diagnostic session recorder
3. Step 2.1: Replace timestamp-based velocity estimation
4. Step 2.2: Correct snare articulation detection
5. Step 2.3: Balance the snare sample bank
6. Step 3.1: Approve a final visual reference
7. Step 3.2: Introduce asset-backed layered instruments
8. Step 3.3: Polish controls
9. Step 4.1: Add production kick and tom samples
10. Step 4.2: Add production hi-hat samples
11. Step 4.3: Add production crash and ride samples
12. Step 5.1: Add active touch-to-voice control
13. Step 5.2: Add continuous hi-hat and cymbal choke behaviour
14. Step 5.3: Add advanced snare behaviour
15. Step 6.1: Add strike-take playback
16. Step 6.2: Add PCM/WAV export
17. Step 6.3: Add calibration and device guidance
18. Step 6.4: Complete release validation

---

# Immediate Next Batch

## Step 1.1

Consolidate the repository into one authoritative implementation line.

## Step 1.2

Implement the diagnostic session recorder and export bundle so physical-device behaviour can be uploaded and analysed from complete evidence rather than memory, screenshots, or vague descriptions.
