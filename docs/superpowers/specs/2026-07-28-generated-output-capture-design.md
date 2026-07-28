# Generated Output Capture Design

Date: 2026-07-28
Roadmap step: Step 1.2, Build an In-App Diagnostic Session Recorder
Status: Approved design, pending implementation plan

## 1. Purpose

Add `generated-output.wav` to each normal diagnostic-session ZIP. The file must contain the exact stereo signal produced by the native engine after voice rendering, room processing, master gain, and peak limiting, quantised to standard 16-bit PCM for compatibility.

The capture exists to correlate audible output with touch, strike, dispatch, marker, audio-diagnostic, and performance telemetry. It is diagnostic evidence, not a user-facing recording feature.

## 2. Approved decisions

The approved design uses:

- Full-session capture rather than a rolling window.
- A native single-producer/single-consumer float ring drained by Kotlin on `Dispatchers.IO`.
- Stereo signed 16-bit little-endian PCM WAV export.
- A ten-minute maximum capture duration.
- Silence substitution for dropped capture frames so the WAV timeline remains aligned with diagnostic timestamps.
- A valid partial WAV when the stream format changes, with capture stopping at the change.
- One WAV per diagnostic session. No resampling, segment stitching, or multiple output files in this slice.

## 3. Scope

### Included

- Native capture of final post-limiter stereo samples.
- Fixed-capacity native SPSC storage.
- Bounded JNI draining outside the real-time callback.
- Temporary raw PCM persistence on an I/O coroutine.
- Float-to-PCM16 conversion.
- Silence insertion for dropped logical frame ranges.
- WAV finalisation.
- ZIP augmentation with `generated-output.wav`.
- Manifest, summary, and checksum updates.
- Capture-state, timing, truncation, format-change, and dropped-frame metadata.
- Focused native, Kotlin, integration, and physical validation.

### Excluded

- Step 2.1 velocity-estimator changes.
- Production take recording or user music export.
- Audio input or microphone capture.
- Route-change resampling.
- Multiple WAV segments.
- RF64 or files larger than the classic RIFF/WAV 4 GiB limit.
- Lifecycle recovery export, guided tests, sharing, deletion, and malformed-session recovery, which remain separate Step 1.2 slices.

## 4. Real-time invariants

The Oboe callback must continue to perform no:

- File I/O.
- Heap allocation.
- Locking.
- Logging.
- JNI calls.
- Blocking waits.
- Float-to-integer conversion.

Normal audio output has priority over diagnostic capture. If the capture consumer falls behind, capture frames are dropped and counted. The audible stream, event queue, voice rendering, room processing, limiter, and Oboe write remain unchanged.

## 5. Architecture

### 5.1 Capture point

The capture point is inside `NativeAudioEngine::onAudioReady()` after room mix, master gain, and `applyPeakLimiter()`, immediately before or alongside writing the same left and right samples to the Oboe output buffer.

For each output frame:

1. Render and mix voices.
2. Apply room processing.
3. Apply master gain.
4. Apply the peak limiter.
5. Write the final left and right floats to Oboe.
6. When diagnostic output capture is active, copy the same two floats into the preallocated capture ring.

The capture must not alter the samples written to Oboe.

### 5.2 Native capture component

Add a focused `DiagnosticOutputCapture` component in `engine-audio`. It owns:

- A fixed-capacity interleaved stereo float ring.
- Atomic producer and consumer frame indices.
- A logical output-frame counter.
- Captured-frame and dropped-frame counters.
- Initial sample rate and channel count.
- Maximum capture-frame count for ten minutes.
- Capture-start monotonic timestamp or callback-relative offset.
- Capture state and stop reason.

The ring stores complete stereo frames only. It never exposes or overwrites a half-written frame.

### 5.3 Capture capacity

The native ring is a short transport buffer, not ten minutes of storage. Its size must be fixed at compile time or preallocated before capture begins. The initial implementation should hold enough audio for at least 250 ms at the maximum supported diagnostic sample rate of 96 kHz stereo.

A larger capacity may be chosen when justified by tests, but the ring must remain bounded and modest compared with whole-session audio.

### 5.4 Kotlin capture coordinator

Add `DiagnosticGeneratedOutputRecorder` in the app module. It is responsible for:

- Creating a temporary raw PCM destination under app cache storage.
- Starting native output capture.
- Running a dedicated draining coroutine on `Dispatchers.IO`.
- Reusing fixed float and byte arrays.
- Converting final float samples to PCM16.
- Writing silence for missing logical frame ranges.
- Tracking written, dropped, and substituted frames.
- Stopping and fully draining capture.
- Finalising a valid WAV.
- Adding the WAV and capture metadata to the diagnostic ZIP.
- Cleaning temporary files after successful export or terminal failure.

It does not start, stop, restart, or otherwise own the audio engine.

## 6. Native state model

Use explicit capture states:

- `idle`: no capture has been started.
- `capturing`: producer is accepting frames.
- `stopped_by_user`: Kotlin requested capture stop and remaining buffered frames may still be drained.
- `duration_limit`: the ten-minute maximum was reached.
- `format_changed`: callback sample rate or channel count no longer matches the capture format.
- `audio_stopped`: the native audio stream stopped while capture was active.
- `start_failed`: capture could not initialise.
- `completed`: Kotlin drained and finalised all available frames.

Native code owns producer-side transitions through `capturing`, `duration_limit`, `format_changed`, and `audio_stopped`. Kotlin records `completed` only after the final drain and WAV finalisation succeed.

## 7. Ten-minute limit

The maximum logical frame count is:

`sampleRate * 600 seconds`

The limit applies to the capture timeline, including dropped frames. When reached:

- Native stops accepting capture frames.
- Audio output continues normally.
- Stop reason becomes `duration_limit`.
- The diagnostic session itself continues.
- The UI reports that generated-output capture has stopped.
- Export includes the valid first ten minutes.

At 96 kHz, stereo PCM16 for ten minutes is about 230 MB and remains far below the classic WAV 4 GiB limit.

## 8. JNI contract

Expose bounded operations similar to the existing diagnostic dispatch-outcome drain.

### 8.1 Start

`startDiagnosticOutputCapture()` returns a compact status containing:

- Whether capture started.
- Sample rate.
- Channel count, fixed to two for the current engine.
- Maximum logical frames.
- Capture-start timing metadata.

Starting while already active must fail deterministically without resetting the active capture.

### 8.2 Drain

Expose a method conceptually equivalent to:

```kotlin
fun drainDiagnosticOutput(
    samples: FloatArray,
    metadata: LongArray,
): Int
```

The samples array contains interleaved stereo floats. The metadata must provide, at minimum:

- First logical frame index in the returned batch.
- Returned frame count.
- Total captured frames.
- Total dropped frames.
- Sample rate.
- Channel count.
- Native capture state.
- Stop reason.

The returned frame count must never exceed `samples.size / channelCount`.

### 8.3 Stop

`stopDiagnosticOutputCapture()` disables producer writes first. Buffered frames remain drainable. Calling stop more than once is idempotent.

### 8.4 Status

A lightweight status operation may be exposed when needed by the UI or final-drain loop. It must not allocate inside the callback or require callback participation.

## 9. Logical timeline and overflow

Each produced output frame advances a logical frame index while capture is active, even when the ring is full.

When there is room:

- Store the complete stereo frame.
- Associate it with the current logical frame position.
- Advance captured-frame counters.

When the ring is full:

- Do not block.
- Do not overwrite unread data.
- Increment dropped-frame counters.
- Continue advancing the logical frame position.

The drain contract returns the first logical frame index for each batch. Kotlin compares this value with the next expected logical frame. A positive gap is written as zero-valued stereo PCM frames before the returned samples.

This preserves WAV duration and timing alignment. Dropped audio is represented honestly as silence rather than removed time.

## 10. Float-to-PCM16 conversion

Conversion runs only on the Kotlin I/O path.

For each float sample:

1. Replace non-finite values with zero.
2. Clamp to `[-1.0, 1.0]`.
3. Convert to signed 16-bit PCM with deterministic saturation.
4. Write little-endian bytes.

The WAV format is:

- RIFF/WAVE.
- PCM format code 1.
- Two interleaved channels.
- Native capture sample rate.
- 16 bits per sample.
- Block alignment of four bytes.
- Byte rate of `sampleRate * 4`.

## 11. Temporary-file strategy

Kotlin writes PCM payload bytes to a temporary raw file in the app cache directory while capture is active.

The drainer must:

- Reuse its arrays.
- Write only from `Dispatchers.IO`.
- Avoid busy waiting when no frames are available.
- Continue until native capture is stopped and the ring is empty.
- Flush and close deterministically.

WAV finalisation may either prepend the header into a second temporary file or reserve and later patch a 44-byte header in a seekable file. The chosen implementation must be independently testable and leave no structurally invalid final WAV after a reported success.

Temporary files are removed after successful ZIP augmentation. On recoverable failure, stale temporary files are deleted before the recorder returns to idle.

## 12. Timing metadata

The WAV timeline begins at the first output callback frame accepted after native capture becomes active, not at the UI button timestamp.

Export metadata records enough information to align the WAV with the session timeline:

- Diagnostic session start monotonic time.
- Native capture activation time or session-relative offset.
- First captured logical frame offset.
- Sample rate.
- Total logical frames represented by the WAV.

The implementation must not claim precision finer than the available cross-layer clocks support.

## 13. Format changes and route changes

One WAV contains one audio format.

If callback sample rate or channel count changes during capture:

- Native stops capture with `format_changed` before writing frames in the new format.
- Existing buffered frames remain drainable.
- Kotlin finalises the valid partial WAV using the original format.
- The diagnostic session continues.
- Periodic audio diagnostics record the new stream configuration.
- No resampling, second WAV, or segment merge occurs in this slice.

## 14. Audio-stop behaviour

If the audio engine stops unexpectedly while capture is active:

- Native marks `audio_stopped`.
- Already buffered frames remain drainable.
- Kotlin finalises a partial WAV where possible.
- The diagnostic session continues until the existing workflow stops or later lifecycle recovery handles it.

This slice does not implement automatic diagnostic-session recovery after activity or process interruption.

## 15. Failure behaviour

Capture is subordinate to playing and bundle export.

### 15.1 Start failure

If capture cannot start:

- Playing continues.
- The diagnostic session continues.
- ZIP export continues without `generated-output.wav`.
- Manifest and summary record `start_failed` and the failure reason.

### 15.2 Temporary-file failure

If the raw file cannot be created or written:

- Kotlin requests native capture stop.
- Playing continues.
- Other diagnostics continue.
- ZIP export continues without a WAV if no valid file can be finalised.
- The error is recorded in manifest and summary.

### 15.3 Ring overflow

Ring overflow affects diagnostic capture only. A structurally valid WAV is still produced with silence substitutions and exact counters.

### 15.4 Finalisation failure

If WAV finalisation fails:

- Do not include an invalid WAV.
- Export the remaining diagnostic bundle.
- Record the finalisation failure.
- Remove temporary files.

## 16. Diagnostic bundle integration

A normal successful bundle adds:

- `generated-output.wav`.

The manifest removes `generated-output.wav` from `plannedFilesNotYetImplemented` and adds a generated-output section containing at least:

```json
{
  "generatedOutput": {
    "state": "completed",
    "stopReason": "stopped_by_user",
    "sampleRate": 48000,
    "channelCount": 2,
    "bitsPerSample": 16,
    "capturedFrames": 123456,
    "logicalFrames": 123456,
    "droppedFrames": 0,
    "silenceSubstitutionFrames": 0,
    "durationLimited": false,
    "formatChanged": false,
    "audioStopped": false,
    "sessionStartOffsetNanos": 0
  }
}
```

Field names may follow existing project naming conventions, but the represented information is required.

The human-readable summary includes:

- Capture state and stop reason.
- WAV duration.
- Sample rate, channels, and bit depth.
- Captured frames.
- Dropped frames.
- Silence-substitution frames.
- Whether the duration limit, format change, audio stop, or file failure occurred.

The WAV is covered by `checksums.sha256`. ZIP checksums are recomputed after all augmentations.

A valid partial WAV remains included for `duration_limit`, `format_changed`, `audio_stopped`, and ring-overflow cases.

## 17. UI behaviour

The existing diagnostic controls remain the only primary controls.

Status text may report:

- Generated-output capture active.
- Capture stopped at the ten-minute limit.
- Capture stopped because the audio format changed.
- Capture unavailable because temporary storage failed.

No new production UI, settings panel, recording mode, or user-facing export control is added.

## 18. Testing strategy

### 18.1 Native tests

Focused native tests must cover:

- Ring initial state.
- Start and idempotent stop.
- Complete stereo-frame writes.
- Producer-consumer ordering.
- Ring wrap-around.
- Overflow without unread-frame overwrite.
- Logical frame continuity across drops.
- Dropped-frame counting.
- Ten-minute logical-frame limit.
- Format-change detection.
- Audio-stop state.
- Disabled capture leaving output samples unchanged.

Where native unit-test infrastructure is impractical, extract the ring and state machine into a platform-neutral C++ component compiled by the existing validation workflow.

### 18.2 Kotlin unit tests

Tests must cover:

- Float-to-PCM16 conversion.
- Saturation and non-finite handling.
- Stereo interleaving.
- Silence insertion for logical gaps.
- Reused batch-buffer boundaries.
- WAV header fields.
- RIFF and data sizes.
- Zero-length and partial WAV finalisation where permitted.
- Ten-minute limit metadata.
- Format-change metadata.
- Audio-stop metadata.
- Temporary-file cleanup.
- Export without a WAV after start or file failure.
- ZIP augmentation.
- Manifest, summary, planned-file, and checksum changes.

### 18.3 Integration validation

Run the project’s normal checks:

- JVM quick checks.
- Android module and application unit tests.
- Application Kotlin and Compose compilation.
- Android lint.
- arm64 native C++ compilation with warnings treated as errors.
- Debug APK assembly.
- Embedded source-SHA verification.

### 18.4 Physical validation

A physical diagnostic session must confirm:

- The ZIP includes a playable `generated-output.wav`.
- WAV format fields match the recorded stream format.
- WAV duration agrees with logical frame counts.
- Audible strikes align with strike and marker timestamps within the documented timing model.
- Capture does not introduce new audio underruns.
- Phone-speaker and Bluetooth routes both produce honest metadata.
- Route or format change yields a valid partial WAV rather than corruption.

Physical validation is required before declaring the generated-output slice fully accepted.

## 19. Acceptance criteria

The implementation slice is complete when:

- A normal diagnostic session includes `generated-output.wav`.
- The WAV contains the post-room, post-master, post-limiter stereo output quantised to PCM16.
- The callback performs no file I/O, allocation, locking, logging, JNI calls, or blocking waits.
- Capture memory is bounded.
- Full-session capture supports up to ten minutes.
- Overflow preserves timeline length through silence substitution.
- A format change produces an honest valid partial WAV.
- Capture failure does not interrupt playing or prevent bundle export.
- Metadata and checksums describe the actual result.
- Focused tests and the project’s normal automated validation pass.
- Physical WAV quality, timing, route behaviour, and underrun behaviour are reviewed separately.

## 20. Deferred work

After this slice, Step 1.2 still includes:

- Guided diagnostic sequence and automatic markers.
- Lifecycle recovery export.
- Explicit share workflow and cached-bundle deletion.
- Malformed or partial-session recovery validation.

Step 2.1 deterministic velocity estimation remains untouched.
