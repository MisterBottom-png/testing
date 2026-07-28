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
6. When diagnostic output capture is active, copy the same two floats and their logical frame index into the preallocated capture ring.

The capture must not alter the samples written to Oboe.

### 5.2 Native capture component

Add a focused `DiagnosticOutputCapture` component in `engine-audio`. It owns:

- A fixed-capacity ring of complete capture slots.
- One logical frame index and two stereo floats per slot.
- Atomic producer and consumer slot indices.
- A logical output-frame counter.
- Captured-frame and dropped-frame counters.
- Initial sample rate and channel count.
- Maximum capture-frame count for ten minutes.
- First-captured-frame monotonic timestamp.
- Producer state and terminal stop reason.

A slot is published only after its logical frame index and both channel samples are written. The consumer never sees or overwrites a half-written frame.

### 5.3 Capture capacity

The native ring is a short transport buffer, not ten minutes of storage. Use a fixed capacity of 32,768 stereo frames.

At 96 kHz this holds approximately 341 ms of output. A slot containing one 64-bit logical frame index and two 32-bit floats uses at most 16 bytes with ordinary alignment, so the ring consumes approximately 512 KiB.

Changing this capacity requires test evidence and must preserve bounded memory.

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

## 6. State and result model

Keep native producer state separate from Kotlin export result.

### 6.1 Native producer state

- `idle`: capture is inactive and no buffered frames remain.
- `capturing`: producer accepts frames.
- `stopped`: producer no longer accepts frames; buffered frames may remain drainable.

### 6.2 Native stop reason

- `none`: capture has not terminated.
- `stopped_by_user`: Kotlin requested capture stop.
- `duration_limit`: the ten-minute maximum was reached.
- `format_changed`: callback sample rate or channel count changed.
- `audio_stopped`: the native audio stream stopped while capture was active.
- `start_failed`: native capture could not initialise.

The first terminal reason wins. Repeated stop calls do not replace it.

### 6.3 Kotlin final result

- `completed`: a normal WAV was finalised after user stop.
- `partial`: a valid WAV was finalised after `duration_limit`, `format_changed`, `audio_stopped`, or capture overflow.
- `unavailable`: capture could not start or no valid WAV could be created.
- `failed`: capture began but file writing or WAV finalisation failed.

Kotlin assigns the final result only after the final native drain and file finalisation attempt.

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

At 96 kHz, stereo PCM16 for ten minutes is approximately 230 MB and remains far below the classic WAV 4 GiB limit.

## 8. JNI contract

Expose bounded operations similar to the existing diagnostic dispatch-outcome drain.

### 8.1 Start

`startDiagnosticOutputCapture()` returns a compact status containing:

- Whether capture started.
- Sample rate.
- Channel count, fixed to two for the current engine.
- Maximum logical frames.
- Capture activation monotonic timestamp.

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
- Native producer state.
- Native stop reason.
- First-captured-frame monotonic timestamp when available.

Each ring slot stores its logical frame index. One drain call returns only a single contiguous logical-frame run. The consumer stops the batch before the first index discontinuity, even when more slots are available. A subsequent drain begins at the next stored logical frame, allowing Kotlin to detect and fill the exact gap using only the first index of each batch.

The returned frame count must never exceed `samples.size / channelCount`.

### 8.3 Stop

`stopDiagnosticOutputCapture()` disables producer writes first. Buffered frames remain drainable. Calling stop more than once is idempotent and preserves the first terminal stop reason.

### 8.4 Status

A lightweight status operation may be exposed for UI state or the final-drain loop. It must not allocate inside the callback or require callback participation.

## 9. Logical timeline and overflow

Each produced output frame advances a logical frame index while capture is active, even when the ring is full.

When there is room:

- Store the logical frame index and complete stereo frame.
- Publish the slot with release semantics.
- Advance captured-frame counters.

When the ring is full:

- Do not block.
- Do not overwrite unread data.
- Increment dropped-frame counters.
- Continue advancing the logical frame position.

Kotlin compares each drained run's first logical frame index with the next expected logical frame. A positive gap is written as zero-valued stereo PCM frames before the returned samples.

This preserves WAV duration and timing alignment. Dropped audio is represented honestly as silence rather than removed time.

## 10. Float-to-PCM16 conversion

Conversion runs only on the Kotlin I/O path.

For each float sample:

1. Replace non-finite values with zero.
2. Clamp to `[-1.0, 1.0]`.
3. Map values at or below `-1.0` to `-32768`.
4. Map values at or above `1.0` to `32767`.
5. Otherwise round `value * 32767.0` to the nearest signed integer.
6. Write the signed 16-bit value in little-endian order.

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

Reserve a 44-byte WAV header in a seekable temporary file, append PCM payload after it, then patch the header only after the payload is complete. The WAV writer must be independently testable and must not report success until header and payload lengths agree.

Temporary files are removed after successful ZIP augmentation. On recoverable failure, stale temporary files are deleted before the recorder returns to idle.

## 12. Timing metadata

The WAV timeline begins at the first output callback frame accepted after native capture becomes active, not at the UI button timestamp.

Native code records the first accepted frame using the Android monotonic clock. The diagnostic session uses the corresponding monotonic timebase through `System.nanoTime()`. Kotlin computes:

`sessionStartOffsetNanos = firstCapturedFrameMonotonicNanos - diagnosticSessionStartMonotonicNanos`

Export metadata records:

- Diagnostic session start monotonic time for internal calculation.
- Capture activation monotonic time.
- First-captured-frame monotonic time.
- Session-relative first-frame offset.
- Sample rate.
- Total logical frames represented by the WAV.

When no frame was captured, first-frame timestamps and offsets are `null`. Wall-clock timestamps remain session metadata only and are not used for sample alignment.

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

Ring overflow affects diagnostic capture only. A structurally valid WAV is still produced with silence substitutions and exact counters. The final result is `partial` when any capture frames were dropped.

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
    "result": "completed",
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
    "sessionStartOffsetNanos": 1234567
  }
}
```

Field names may follow existing project naming conventions, but the represented information is required.

The human-readable summary includes:

- Final capture result and native stop reason.
- WAV duration.
- Sample rate, channels, and bit depth.
- Captured frames.
- Logical frames.
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
- Per-slot logical frame indices.
- Producer-consumer ordering.
- Ring wrap-around.
- Contiguous-run drain boundaries.
- Overflow without unread-frame overwrite.
- Logical frame continuity across drops.
- Dropped-frame counting.
- Ten-minute logical-frame limit.
- First terminal stop reason winning.
- Format-change detection.
- Audio-stop state.
- Disabled capture leaving output samples unchanged.

Extract the ring and state machine into a platform-neutral C++ component so these behaviours can be compiled and tested without an Android device. The Android build still validates JNI and engine integration.

### 18.2 Kotlin unit tests

Tests must cover:

- Float-to-PCM16 conversion.
- Exact saturation endpoints and non-finite handling.
- Stereo interleaving.
- Silence insertion between contiguous drain runs.
- Reused batch-buffer boundaries.
- WAV header fields.
- RIFF and data sizes.
- Header patching after payload completion.
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
- Capture memory is bounded to the fixed ring and reusable drain buffers.
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
