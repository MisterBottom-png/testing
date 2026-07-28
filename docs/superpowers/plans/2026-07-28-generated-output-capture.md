# Generated Output Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a checksum-covered `generated-output.wav` to normal Step 1.2 diagnostic bundles by capturing the native post-room, post-master, post-limiter stereo output without compromising the real-time audio callback.

**Architecture:** A platform-neutral, fixed-capacity native SPSC ring stores complete stereo float frames together with logical frame indices. Kotlin drains contiguous runs through bounded JNI calls and writes PCM16 into a seekable cache file on `Dispatchers.IO`; a final ZIP augmenter streams the WAV into the diagnostic bundle, updates manifest and summary metadata, and recomputes checksums. Capture failures remain subordinate to playing and to the rest of diagnostic export.

**Tech Stack:** C++20, Oboe, JNI, Kotlin/JVM, Android API 26+, Java `RandomAccessFile`, Kotlin coroutines already supplied transitively by Compose, JUnit 4, Gradle 9.5.0, Android Gradle Plugin 9.3.x, GitHub Actions.

## Global Constraints

- Work only within roadmap Step 1.2 generated-output capture. Do not begin guided diagnostics, lifecycle recovery, sharing/deletion, malformed-session recovery, or Step 2.1 velocity estimation.
- Capture the exact final stereo samples after room processing, master gain, and `applyPeakLimiter()`.
- Keep the Oboe callback free of file I/O, heap allocation, locking, logging, JNI calls, blocking waits, and float-to-integer conversion.
- Use one fixed 32,768-frame native ring. Each slot stores one `uint64_t` logical frame index and two `float` samples.
- Support at most 600 seconds of logical audio at the stream sample rate.
- Export stereo signed 16-bit little-endian PCM in a classic 44-byte RIFF/WAVE header.
- Preserve logical timing across capture overflow by inserting zero-valued frames for gaps.
- Stop capture at the first audio format change and finalise one valid partial WAV. Do not resample, stitch segments, or create multiple WAV files.
- Playing and the rest of diagnostic export must continue when output capture is unavailable or fails.
- Do not add a production recording mode, microphone input, external dependency, RF64 support, or new primary controls.
- Preserve PR #10 as draft. Do not merge or release.

---

## File Structure

### Native capture and JNI

- Create `drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h`
  - Header-only platform-neutral ring and state machine, templated by capacity so host tests can use tiny rings.
- Create `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp`
  - Dependency-free host executable covering state, ordering, overflow, duration, format changes, and audio-stop behaviour.
- Create `drum-kit-android/tools/test_diagnostic_output_capture.sh`
  - Reproducible local/CI host compilation and execution command.
- Modify `drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp`
  - Own the runtime capture instance, copy post-limiter output into it, and expose JNI start/drain/stop/status operations.
- Modify `.github/workflows/drum-kit-android-validation.yml`
  - Run the host C++ test before Android Gradle validation.

### Engine-audio Kotlin protocol

- Create `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt`
  - Producer-state/stop-reason enums, start/status/drain models, and strict metadata decoding.
- Create `drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt`
  - Wire-value, sentinel, count, and invalid-metadata tests.
- Modify `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt`
  - Reusable metadata buffers and synchronised public capture operations.

### PCM/WAV persistence and session coordination

- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt`
  - Seekable 44-byte-header writer, deterministic float conversion, silence writing, and finalisation.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt`
  - Byte-exact PCM and RIFF tests.
- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt`
  - Preparation, native start, bounded drain, gap substitution, terminal result, file cleanup, and finalisation.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`
  - Fake-source tests for normal, overflow, partial, unavailable, and failed captures.
- Modify `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt`
  - Retain the monotonic session-start timestamp in `DiagnosticSessionCapture` for WAV alignment.
- Modify `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt`
  - Verify the monotonic timestamp is captured and preserved.

### Bundle and UI integration

- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt`
  - Streaming ZIP rewrite, manifest/summary transformation, WAV insertion, and SHA-256 recomputation.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt`
  - Successful, partial, unavailable, checksum, and large-stream tests.
- Modify `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt`
  - Prepare/start capture with the diagnostic session, drain during recording, stop producer first, finalise before ZIP augmentation, and expose compact status text.
- Modify `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionBundleRecorderTest.kt`
  - Update the expected planned-file text after final generated-output augmentation tests own WAV assertions.
- Modify `drum-kit-android/README.md`
  - Document generated-output capture and its bounded failure behaviour.
- Modify `drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md`
  - Mark the generated-output implementation as implemented/automated-validated but physically unverified until a device bundle is reviewed.

---

### Task 1: Platform-Neutral Native Capture Ring

**Files:**
- Create: `drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h`
- Create: `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp`
- Create: `drum-kit-android/tools/test_diagnostic_output_capture.sh`
- Modify: `.github/workflows/drum-kit-android-validation.yml:37-70`

**Interfaces:**
- Consumes: final stereo float samples, current sample rate/channel count, and a monotonic frame timestamp supplied by the native audio engine.
- Produces:
  - `enum class DiagnosticOutputProducerState : int32_t { Idle = 0, Capturing = 1, Stopped = 2 }`
  - `enum class DiagnosticOutputStopReason : int32_t { None = 0, StoppedByUser = 1, DurationLimit = 2, FormatChanged = 3, AudioStopped = 4, StartFailed = 5 }`
  - `template <size_t CapacityFrames> class DiagnosticOutputCapture`
  - `bool start(int32_t sampleRate, int32_t channelCount, int64_t activationNanos)`
  - `void writeFrame(float left, float right, int32_t sampleRate, int32_t channelCount, int64_t frameNanos)`
  - `DiagnosticOutputDrainResult drain(float* destination, size_t destinationFrameCapacity)`
  - `void stop(DiagnosticOutputStopReason reason)`
  - `void markAudioStopped()`
  - `DiagnosticOutputStatus status() const`
  - `using RuntimeDiagnosticOutputCapture = DiagnosticOutputCapture<32768>`

- [ ] **Step 1: Write the failing host tests**

Create a dependency-free test executable with a small assertion helper and explicit cases. Use a tiny template capacity to force wrap and overflow:

```cpp
#include "diagnostic-output-capture.h"

#include <cmath>
#include <cstdlib>
#include <iostream>

namespace {

void require(bool condition, const char* message) {
    if (!condition) {
        std::cerr << "FAILED: " << message << '\n';
        std::exit(1);
    }
}

void testStartAndContiguousDrain() {
    DiagnosticOutputCapture<4> capture;
    require(capture.start(48000, 2, 1'000'000), "capture should start");
    capture.writeFrame(0.25f, -0.25f, 48000, 2, 1'000'100);
    capture.writeFrame(0.50f, -0.50f, 48000, 2, 1'000'200);

    float samples[8]{};
    const auto result = capture.drain(samples, 4);
    require(result.frameCount == 2, "two frames should drain");
    require(result.firstLogicalFrame == 0, "first logical frame should be zero");
    require(std::abs(samples[0] - 0.25f) < 0.0001f, "left sample should match");
    require(std::abs(samples[3] + 0.50f) < 0.0001f, "right sample should match");
}

void testOverflowCreatesNextRunGap() {
    DiagnosticOutputCapture<2> capture;
    require(capture.start(48000, 2, 10), "capture should start");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 11);
    capture.writeFrame(0.3f, 0.4f, 48000, 2, 12);
    capture.writeFrame(0.5f, 0.6f, 48000, 2, 13);

    float first[4]{};
    const auto firstRun = capture.drain(first, 2);
    require(firstRun.frameCount == 2, "ring should retain two frames");
    require(firstRun.droppedFrames == 1, "overflow should count one dropped frame");

    capture.writeFrame(0.7f, 0.8f, 48000, 2, 14);
    float second[4]{};
    const auto secondRun = capture.drain(second, 2);
    require(secondRun.frameCount == 1, "one post-gap frame should drain");
    require(secondRun.firstLogicalFrame == 3, "next run should expose exact gap");
}

}  // namespace

int main() {
    testStartAndContiguousDrain();
    testOverflowCreatesNextRunGap();
    // Call the additional tests added below.
    std::cout << "diagnostic-output-capture tests passed\n";
    return 0;
}
```

Add separate test functions for:

- initial `Idle` status;
- invalid start with sample rate `0` or channel count other than `2` returning `false` and `StartFailed`;
- repeated start while capturing leaving the active capture unchanged;
- wrap-around ordering;
- no overwrite of unread frames;
- first-captured timestamp set only by the first successfully stored frame;
- contiguous-run drain stopping before a logical discontinuity;
- logical frame count advancing across drops;
- duration limit using `startForMaximumFramesForTest(48000, 2, activationNanos, 3)` or an equivalent constructor-visible test hook that does not affect the runtime default;
- format change stopping before the new-format frame is stored;
- `markAudioStopped()` retaining buffered frames;
- idempotent stop preserving the first terminal reason;
- disabled/stopped writes changing no counters.

- [ ] **Step 2: Run the host test to verify it fails**

Run:

```bash
cd drum-kit-android
mkdir -p build/native-tests
c++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -Iengine-audio/src/main/cpp \
  engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp \
  -o build/native-tests/diagnostic-output-capture-test
```

Expected: compilation fails because `diagnostic-output-capture.h` does not exist.

- [ ] **Step 3: Implement the minimal bounded ring and state machine**

Create a header-only template. Use monotonically increasing producer/consumer sequences rather than reserving one sentinel slot, so all `CapacityFrames` slots are usable:

```cpp
#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <limits>

constexpr uint64_t kNoDiagnosticOutputFrame = std::numeric_limits<uint64_t>::max();
constexpr int64_t kNoDiagnosticOutputTimestamp = -1;

enum class DiagnosticOutputProducerState : int32_t {
    Idle = 0,
    Capturing = 1,
    Stopped = 2,
};

enum class DiagnosticOutputStopReason : int32_t {
    None = 0,
    StoppedByUser = 1,
    DurationLimit = 2,
    FormatChanged = 3,
    AudioStopped = 4,
    StartFailed = 5,
};

struct DiagnosticOutputStatus {
    DiagnosticOutputProducerState state = DiagnosticOutputProducerState::Idle;
    DiagnosticOutputStopReason stopReason = DiagnosticOutputStopReason::None;
    int32_t sampleRate = 0;
    int32_t channelCount = 0;
    uint64_t maximumLogicalFrames = 0;
    uint64_t logicalFrames = 0;
    uint64_t capturedFrames = 0;
    uint64_t droppedFrames = 0;
    int64_t activationNanos = kNoDiagnosticOutputTimestamp;
    int64_t firstCapturedFrameNanos = kNoDiagnosticOutputTimestamp;
    bool bufferedFramesRemain = false;
};

struct DiagnosticOutputDrainResult : DiagnosticOutputStatus {
    uint64_t firstLogicalFrame = kNoDiagnosticOutputFrame;
    size_t frameCount = 0;
};

template <size_t CapacityFrames>
class DiagnosticOutputCapture {
    static_assert(CapacityFrames > 0, "capture capacity must be positive");

    struct Slot {
        uint64_t logicalFrame = 0;
        float left = 0.0f;
        float right = 0.0f;
    };

public:
    bool start(int32_t sampleRate, int32_t channelCount, int64_t activationNanos) {
        return startInternal(
            sampleRate,
            channelCount,
            activationNanos,
            static_cast<uint64_t>(sampleRate) * 600U
        );
    }

    bool startForMaximumFramesForTest(
        int32_t sampleRate,
        int32_t channelCount,
        int64_t activationNanos,
        uint64_t maximumLogicalFrames
    ) {
        return startInternal(sampleRate, channelCount, activationNanos, maximumLogicalFrames);
    }

    // Implement writeFrame, drain, stop, markAudioStopped, status, and private reset/start helpers.

private:
    std::array<Slot, CapacityFrames> slots_{};
    std::atomic<uint64_t> readSequence_{0};
    std::atomic<uint64_t> writeSequence_{0};
    std::atomic<uint64_t> logicalFrames_{0};
    std::atomic<uint64_t> capturedFrames_{0};
    std::atomic<uint64_t> droppedFrames_{0};
    std::atomic<int64_t> firstCapturedFrameNanos_{kNoDiagnosticOutputTimestamp};
    std::atomic<DiagnosticOutputProducerState> state_{DiagnosticOutputProducerState::Idle};
    std::atomic<DiagnosticOutputStopReason> stopReason_{DiagnosticOutputStopReason::None};
    int32_t sampleRate_ = 0;
    int32_t channelCount_ = 0;
    uint64_t maximumLogicalFrames_ = 0;
    int64_t activationNanos_ = kNoDiagnosticOutputTimestamp;
};

using RuntimeDiagnosticOutputCapture = DiagnosticOutputCapture<32768>;
```

Implementation rules inside the header:

- `startInternal` rejects invalid formats and `maximumLogicalFrames == 0`, sets `StartFailed`, and returns `false`.
- A successful start resets sequences/counters, writes format fields, then publishes `Capturing` with release semantics.
- `writeFrame` loads state with acquire semantics and returns immediately unless capturing.
- A format mismatch calls `stop(FormatChanged)` before storing the frame.
- Each callback frame consumes one logical index. When the ring is full, increment only `droppedFrames`; never advance `writeSequence`.
- For a successful slot write, write logical index and samples first, then publish `writeSequence + 1` with release semantics.
- Set `firstCapturedFrameNanos` with compare-exchange only after a frame is successfully stored.
- After the final allowed logical frame is represented, stop with `DurationLimit`.
- `drain` loads published `writeSequence` with acquire semantics, copies one contiguous logical run, and stops before the first discontinuity.
- `drain` advances `readSequence` only after destination samples are written.
- `stop` uses compare-exchange so the first terminal reason wins.

- [ ] **Step 4: Add the reusable host-test script and workflow step**

Create `tools/test_diagnostic_output_capture.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/build/native-tests"
mkdir -p "$OUTPUT_DIR"

c++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -I"$ROOT_DIR/engine-audio/src/main/cpp" \
  "$ROOT_DIR/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp" \
  -o "$OUTPUT_DIR/diagnostic-output-capture-test"

"$OUTPUT_DIR/diagnostic-output-capture-test"
```

Add this step before Gradle setup in `.github/workflows/drum-kit-android-validation.yml`:

```yaml
      - name: Run diagnostic output native tests
        shell: bash
        run: bash tools/test_diagnostic_output_capture.sh
```

- [ ] **Step 5: Run the focused native tests**

Run:

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
```

Expected output:

```text
diagnostic-output-capture tests passed
```

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  .github/workflows/drum-kit-android-validation.yml \
  drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h \
  drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp \
  drum-kit-android/tools/test_diagnostic_output_capture.sh
git commit -m "test(audio): add bounded diagnostic output ring"
```

---

### Task 2: Kotlin Capture Protocol and Decoder

**Files:**
- Create: `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt`
- Create: `drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt`
- Modify: `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt:11-158`

**Interfaces:**
- Consumes: native integer wire values and one reusable interleaved `FloatArray` supplied by the app drainer.
- Produces:

```kotlin
enum class DiagnosticOutputProducerState(val wireValue: Int) {
    IDLE(0), CAPTURING(1), STOPPED(2);
}

enum class DiagnosticOutputStopReason(val wireValue: Int) {
    NONE(0), STOPPED_BY_USER(1), DURATION_LIMIT(2), FORMAT_CHANGED(3),
    AUDIO_STOPPED(4), START_FAILED(5);
}

data class DiagnosticOutputStartResult(
    val started: Boolean,
    val sampleRate: Int,
    val channelCount: Int,
    val maximumLogicalFrames: Long,
    val activationMonotonicNanos: Long?,
    val stopReason: DiagnosticOutputStopReason,
)

data class DiagnosticOutputDrainInfo(
    val returnedFrames: Int,
    val firstLogicalFrame: Long?,
    val logicalFrames: Long,
    val capturedFrames: Long,
    val droppedFrames: Long,
    val sampleRate: Int,
    val channelCount: Int,
    val producerState: DiagnosticOutputProducerState,
    val stopReason: DiagnosticOutputStopReason,
    val activationMonotonicNanos: Long?,
    val firstCapturedFrameMonotonicNanos: Long?,
    val bufferedFramesRemain: Boolean,
)
```

`AudioEngine` produces:

```kotlin
fun startDiagnosticOutputCapture(): DiagnosticOutputStartResult
@Synchronized fun drainDiagnosticOutput(samples: FloatArray): DiagnosticOutputDrainInfo
fun stopDiagnosticOutputCapture()
fun diagnosticOutputStatus(): DiagnosticOutputDrainInfo
```

- [ ] **Step 1: Write decoder tests that fail before the protocol exists**

Use fixed metadata indices and explicit sentinels:

```kotlin
@Test
fun decodesContiguousDrainMetadata() {
    val metadata = longArrayOf(
        12L,       // first logical frame
        4L,        // returned frames
        20L,       // logical frames
        19L,       // captured frames
        1L,        // dropped frames
        48_000L,
        2L,
        1L,        // CAPTURING
        0L,        // NONE
        1_000L,    // activation nanos
        1_100L,    // first captured nanos
        1L,        // buffered frames remain
    )

    val result = DiagnosticOutputCaptureDecoder.decodeDrain(metadata, samplesSize = 16)

    assertEquals(4, result.returnedFrames)
    assertEquals(12L, result.firstLogicalFrame)
    assertEquals(1L, result.droppedFrames)
    assertEquals(DiagnosticOutputProducerState.CAPTURING, result.producerState)
    assertTrue(result.bufferedFramesRemain)
}

@Test
fun convertsNegativeSentinelsToNull() {
    val metadata = longArrayOf(-1L, 0L, 0L, 0L, 0L, 48_000L, 2L, 2L, 1L, -1L, -1L, 0L)
    val result = DiagnosticOutputCaptureDecoder.decodeDrain(metadata, samplesSize = 128)
    assertNull(result.firstLogicalFrame)
    assertNull(result.activationMonotonicNanos)
    assertNull(result.firstCapturedFrameMonotonicNanos)
}
```

Also test:

- unknown producer-state wire value throws `IllegalStateException`;
- unknown stop-reason wire value throws `IllegalStateException`;
- negative counters are rejected;
- returned frames exceeding `samplesSize / 2` are rejected;
- non-stereo channel counts are rejected after a successful start;
- a stopped empty result decodes with `bufferedFramesRemain == false`.

- [ ] **Step 2: Run the decoder test to verify it fails**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  --tests com.vitautas.drumkit.audio.DiagnosticOutputCaptureDecoderTest
```

Expected: Kotlin compilation fails because the capture protocol types do not exist.

- [ ] **Step 3: Implement strict wire decoding**

Create `DiagnosticOutputCapture.kt` with named metadata constants:

```kotlin
internal const val DIAGNOSTIC_OUTPUT_METADATA_FIELD_COUNT = 12
internal const val DIAGNOSTIC_OUTPUT_FIRST_FRAME_INDEX = 0
internal const val DIAGNOSTIC_OUTPUT_RETURNED_FRAME_COUNT_INDEX = 1
internal const val DIAGNOSTIC_OUTPUT_LOGICAL_FRAME_COUNT_INDEX = 2
internal const val DIAGNOSTIC_OUTPUT_CAPTURED_FRAME_COUNT_INDEX = 3
internal const val DIAGNOSTIC_OUTPUT_DROPPED_FRAME_COUNT_INDEX = 4
internal const val DIAGNOSTIC_OUTPUT_SAMPLE_RATE_INDEX = 5
internal const val DIAGNOSTIC_OUTPUT_CHANNEL_COUNT_INDEX = 6
internal const val DIAGNOSTIC_OUTPUT_STATE_INDEX = 7
internal const val DIAGNOSTIC_OUTPUT_STOP_REASON_INDEX = 8
internal const val DIAGNOSTIC_OUTPUT_ACTIVATION_NANOS_INDEX = 9
internal const val DIAGNOSTIC_OUTPUT_FIRST_CAPTURED_NANOS_INDEX = 10
internal const val DIAGNOSTIC_OUTPUT_BUFFERED_REMAIN_INDEX = 11

internal object DiagnosticOutputCaptureDecoder {
    fun decodeDrain(metadata: LongArray, samplesSize: Int): DiagnosticOutputDrainInfo {
        require(metadata.size >= DIAGNOSTIC_OUTPUT_METADATA_FIELD_COUNT)
        val returnedFrames = metadata[DIAGNOSTIC_OUTPUT_RETURNED_FRAME_COUNT_INDEX].toInt()
        require(returnedFrames >= 0 && returnedFrames <= samplesSize / 2)
        val channelCount = metadata[DIAGNOSTIC_OUTPUT_CHANNEL_COUNT_INDEX].toInt()
        if (returnedFrames > 0) require(channelCount == 2)
        return DiagnosticOutputDrainInfo(
            returnedFrames = returnedFrames,
            firstLogicalFrame = metadata[DIAGNOSTIC_OUTPUT_FIRST_FRAME_INDEX].takeIf { it >= 0L },
            logicalFrames = metadata[DIAGNOSTIC_OUTPUT_LOGICAL_FRAME_COUNT_INDEX].requireNonNegative("logicalFrames"),
            capturedFrames = metadata[DIAGNOSTIC_OUTPUT_CAPTURED_FRAME_COUNT_INDEX].requireNonNegative("capturedFrames"),
            droppedFrames = metadata[DIAGNOSTIC_OUTPUT_DROPPED_FRAME_COUNT_INDEX].requireNonNegative("droppedFrames"),
            sampleRate = metadata[DIAGNOSTIC_OUTPUT_SAMPLE_RATE_INDEX].toInt().coerceAtLeast(0),
            channelCount = channelCount.coerceAtLeast(0),
            producerState = DiagnosticOutputProducerState.fromWire(metadata[DIAGNOSTIC_OUTPUT_STATE_INDEX].toInt()),
            stopReason = DiagnosticOutputStopReason.fromWire(metadata[DIAGNOSTIC_OUTPUT_STOP_REASON_INDEX].toInt()),
            activationMonotonicNanos = metadata[DIAGNOSTIC_OUTPUT_ACTIVATION_NANOS_INDEX].takeIf { it >= 0L },
            firstCapturedFrameMonotonicNanos = metadata[DIAGNOSTIC_OUTPUT_FIRST_CAPTURED_NANOS_INDEX].takeIf { it >= 0L },
            bufferedFramesRemain = metadata[DIAGNOSTIC_OUTPUT_BUFFERED_REMAIN_INDEX] != 0L,
        )
    }
}
```

Implement `fromWire` with `entries.firstOrNull` and a clear exception message. Keep the models immutable.

- [ ] **Step 4: Add reusable buffers and public operations to `AudioEngine`**

Add:

```kotlin
private const val NativeDiagnosticOutputDrainFrames = 4_096
private val diagnosticOutputMetadataBuffer = LongArray(DIAGNOSTIC_OUTPUT_METADATA_FIELD_COUNT)

@Synchronized
fun startDiagnosticOutputCapture(): DiagnosticOutputStartResult {
    diagnosticOutputMetadataBuffer.fill(0L)
    val started = nativeStartDiagnosticOutputCapture(diagnosticOutputMetadataBuffer)
    return DiagnosticOutputCaptureDecoder.decodeStart(started, diagnosticOutputMetadataBuffer)
}

@Synchronized
fun drainDiagnosticOutput(samples: FloatArray): DiagnosticOutputDrainInfo {
    require(samples.isNotEmpty() && samples.size % 2 == 0) {
        "diagnostic output sample buffer must contain complete stereo frames"
    }
    diagnosticOutputMetadataBuffer.fill(0L)
    val count = nativeDrainDiagnosticOutput(samples, diagnosticOutputMetadataBuffer)
    check(count >= 0) { "native diagnostic output drain failed: $count" }
    diagnosticOutputMetadataBuffer[DIAGNOSTIC_OUTPUT_RETURNED_FRAME_COUNT_INDEX] = count.toLong()
    return DiagnosticOutputCaptureDecoder.decodeDrain(diagnosticOutputMetadataBuffer, samples.size)
}

@Synchronized
fun stopDiagnosticOutputCapture() = nativeStopDiagnosticOutputCapture()

@Synchronized
fun diagnosticOutputStatus(): DiagnosticOutputDrainInfo {
    diagnosticOutputMetadataBuffer.fill(0L)
    nativeGetDiagnosticOutputStatus(diagnosticOutputMetadataBuffer)
    return DiagnosticOutputCaptureDecoder.decodeDrain(diagnosticOutputMetadataBuffer, samplesSize = 0)
}
```

Declare native methods with `LongArray` metadata. Do not expose the metadata wire format to the app module.

- [ ] **Step 5: Run engine-audio unit tests**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest
```

Expected: all engine-audio JVM tests pass. Native method bodies are added in Task 3, so do not call the new `AudioEngine` methods in local JVM tests.

- [ ] **Step 6: Commit Task 2**

```bash
git add \
  drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt \
  drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt \
  drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt
git commit -m "feat(audio): define diagnostic output capture protocol"
```

---

### Task 3: Oboe Capture Point and JNI Bridge

**Files:**
- Modify: `drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp:1-1100`
- Test: `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp`

**Interfaces:**
- Consumes: `RuntimeDiagnosticOutputCapture` and Kotlin metadata field order from Task 2.
- Produces JNI methods:

```cpp
nativeStartDiagnosticOutputCapture(long[] metadata): boolean
nativeDrainDiagnosticOutput(float[] samples, long[] metadata): int
nativeStopDiagnosticOutputCapture(): void
nativeGetDiagnosticOutputStatus(long[] metadata): void
```

- [ ] **Step 1: Extend the native tests for runtime-format and stop transitions**

Add tests proving the component behaviour required by engine integration:

```cpp
void testFormatChangeStopsBeforeNewFrame() {
    DiagnosticOutputCapture<8> capture;
    require(capture.start(48000, 2, 100), "capture should start");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    capture.writeFrame(0.3f, 0.4f, 96000, 2, 102);

    float samples[16]{};
    const auto drained = capture.drain(samples, 8);
    require(drained.frameCount == 1, "new-format frame must not be stored");
    require(drained.stopReason == DiagnosticOutputStopReason::FormatChanged, "format change should be terminal");
}

void testAudioStopKeepsBufferedFrames() {
    DiagnosticOutputCapture<8> capture;
    require(capture.start(48000, 2, 100), "capture should start");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    capture.markAudioStopped();
    const auto status = capture.status();
    require(status.state == DiagnosticOutputProducerState::Stopped, "audio stop should stop producer");
    require(status.bufferedFramesRemain, "buffered frame should remain drainable");
}
```

Run `bash tools/test_diagnostic_output_capture.sh`; expect these tests to pass before touching Oboe integration.

- [ ] **Step 2: Add the runtime capture member and monotonic helper**

At the top of `sampled-audio-engine.cpp`:

```cpp
#include "diagnostic-output-capture.h"
#include <time.h>

int64_t monotonicNanos() {
    timespec value{};
    if (clock_gettime(CLOCK_MONOTONIC, &value) != 0) {
        return kNoDiagnosticOutputTimestamp;
    }
    return static_cast<int64_t>(value.tv_sec) * 1'000'000'000LL + value.tv_nsec;
}
```

Add to `NativeAudioEngine`:

```cpp
RuntimeDiagnosticOutputCapture diagnosticOutputCapture_{};
```

Do not place capture reset inside `clearRealtimeState()`, because an unexpected stream close must leave buffered capture frames available for Kotlin to drain.

- [ ] **Step 3: Copy the final output frame without changing audio**

In `onAudioReady`, stop discarding `audioStream`. Resolve callback format once:

```cpp
const int callbackSampleRate = audioStream != nullptr
    ? audioStream->getSampleRate()
    : sampleRate_.load(std::memory_order_relaxed);
const int callbackChannelCount = audioStream != nullptr
    ? audioStream->getChannelCount()
    : kChannelCount;
const bool captureActive = diagnosticOutputCapture_.status().state ==
    DiagnosticOutputProducerState::Capturing;
const int64_t callbackNanos = captureActive ? monotonicNanos() : kNoDiagnosticOutputTimestamp;
```

After limiter application and alongside the existing Oboe writes:

```cpp
output[frame * kChannelCount] = left;
output[frame * kChannelCount + 1] = right;
if (captureActive) {
    diagnosticOutputCapture_.writeFrame(
        left,
        right,
        callbackSampleRate,
        callbackChannelCount,
        callbackNanos
    );
}
```

`captureActive` is only a callback-local optimisation. `writeFrame` must still recheck atomic state so a concurrent stop takes effect safely.

- [ ] **Step 4: Preserve capture on stream failures and normal engine stop**

Before closing a running stream in `NativeAudioEngine::stop()` and inside `onErrorAfterClose()`, call:

```cpp
diagnosticOutputCapture_.markAudioStopped();
```

The method is a no-op unless capture is currently active. It must not replace an earlier `DurationLimit`, `FormatChanged`, or `StoppedByUser` reason.

- [ ] **Step 5: Implement JNI metadata filling**

Add one helper outside the callback:

```cpp
constexpr int kDiagnosticOutputMetadataFieldCount = 12;

void writeDiagnosticOutputMetadata(
    JNIEnv* env,
    jlongArray target,
    const DiagnosticOutputDrainResult& value
) {
    if (target == nullptr || env->GetArrayLength(target) < kDiagnosticOutputMetadataFieldCount) {
        return;
    }
    const std::array<jlong, kDiagnosticOutputMetadataFieldCount> fields = {
        value.firstLogicalFrame == kNoDiagnosticOutputFrame
            ? -1
            : static_cast<jlong>(value.firstLogicalFrame),
        static_cast<jlong>(value.frameCount),
        static_cast<jlong>(value.logicalFrames),
        static_cast<jlong>(value.capturedFrames),
        static_cast<jlong>(value.droppedFrames),
        static_cast<jlong>(value.sampleRate),
        static_cast<jlong>(value.channelCount),
        static_cast<jlong>(value.state),
        static_cast<jlong>(value.stopReason),
        static_cast<jlong>(value.activationNanos),
        static_cast<jlong>(value.firstCapturedFrameNanos),
        value.bufferedFramesRemain ? 1 : 0,
    };
    env->SetLongArrayRegion(target, 0, fields.size(), fields.data());
}
```

Use a corresponding status-to-drain conversion for start/status responses. JNI methods may copy arrays or allocate local objects because they never run on the audio callback.

For drain:

- validate non-null arrays;
- cap frames to `floatArrayLength / 2`;
- obtain float elements;
- call `diagnosticOutputCapture_.drain`;
- release float elements with mode `0`;
- fill metadata;
- return the drained frame count.

- [ ] **Step 6: Run native host tests and Android compilation**

Run:

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  :app:compileDebugKotlin
```

Expected: host tests pass and the app compiles with all JNI declarations resolved at native build time in the later APK workflow.

- [ ] **Step 7: Commit Task 3**

```bash
git add \
  drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp \
  drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp
git commit -m "feat(audio): capture final native output frames"
```

---

### Task 4: Deterministic PCM16 and WAV Writer

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt`

**Interfaces:**
- Consumes: interleaved stereo float runs and logical silence-frame counts.
- Produces:

```kotlin
internal class DiagnosticPcm16WavWriter(
    private val file: File,
    val sampleRate: Int,
    val channelCount: Int = 2,
) : AutoCloseable {
    val dataBytesWritten: Long
    val framesWritten: Long
    fun writeInterleavedFrames(samples: FloatArray, frameCount: Int, scratch: ByteArray)
    fun writeSilenceFrames(frameCount: Long, scratch: ByteArray)
    fun finish(): File
    fun abort()
}
```

- [ ] **Step 1: Write byte-exact failing tests**

Create tests for conversion endpoints and header arithmetic:

```kotlin
@Test
fun convertsFiniteAndNonFiniteSamplesToPcm16() {
    val file = temporaryFile("samples.wav")
    val writer = DiagnosticPcm16WavWriter(file, sampleRate = 48_000)
    val samples = floatArrayOf(-1f, 1f, 0f, Float.NaN, -0.5f, 0.5f)
    writer.writeInterleavedFrames(samples, frameCount = 3, scratch = ByteArray(32))
    writer.finish()

    val bytes = file.readBytes()
    assertArrayEquals(
        byteArrayOf(
            0x00, 0x80.toByte(), 0xff.toByte(), 0x7f,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0xc0.toByte(), 0x00, 0x40,
        ),
        bytes.copyOfRange(44, 56),
    )
}

@Test
fun writesCorrectStereoHeader() {
    val file = temporaryFile("header.wav")
    val writer = DiagnosticPcm16WavWriter(file, sampleRate = 48_000)
    writer.writeSilenceFrames(2, ByteArray(16))
    writer.finish()

    val bytes = file.readBytes()
    assertEquals("RIFF", bytes.copyOfRange(0, 4).decodeToString())
    assertEquals(44 + 8, bytes.size)
    assertEquals(48_000, bytes.littleEndianInt(24))
    assertEquals(192_000, bytes.littleEndianInt(28))
    assertEquals(4, bytes.littleEndianShort(32))
    assertEquals(16, bytes.littleEndianShort(34))
    assertEquals(8, bytes.littleEndianInt(40))
}
```

Also test:

- values below `-1` and above `1` saturate;
- `Float.POSITIVE_INFINITY` and `Float.NEGATIVE_INFINITY` become zero;
- odd sample counts and frame counts exceeding the source buffer fail;
- silence writing works across a scratch-buffer boundary;
- `finish()` is idempotent only by returning the already-finalised file without rewriting;
- `abort()` deletes the temporary file;
- payload sizes above `0xffffffffL` are rejected before a corrupt header can be reported successful.

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticPcm16WavWriterTest
```

Expected: Kotlin compilation fails because the writer does not exist.

- [ ] **Step 3: Implement the seekable writer**

Use `RandomAccessFile` and reserve the header before payload writes:

```kotlin
private const val WavHeaderBytes = 44
private const val BytesPerSample = 2

internal class DiagnosticPcm16WavWriter(
    private val file: File,
    val sampleRate: Int,
    val channelCount: Int = 2,
) : AutoCloseable {
    private val output = RandomAccessFile(file, "rw")
    private var finalised = false
    var dataBytesWritten: Long = 0L
        private set

    val framesWritten: Long
        get() = dataBytesWritten / (channelCount * BytesPerSample)

    init {
        require(sampleRate > 0)
        require(channelCount == 2)
        output.setLength(0L)
        output.write(ByteArray(WavHeaderBytes))
    }

    private fun pcm16(value: Float): Short = when {
        !value.isFinite() -> 0
        value <= -1f -> Short.MIN_VALUE
        value >= 1f -> Short.MAX_VALUE
        else -> (value * Short.MAX_VALUE.toFloat()).roundToInt().toShort()
    }
}
```

Write little-endian shorts into the caller-provided scratch buffer, flush scratch chunks to `RandomAccessFile`, and update `dataBytesWritten` only after successful writes. `finish()` validates the classic RIFF size, patches all header fields, syncs/close the file, and returns it.

- [ ] **Step 4: Run the writer tests**

Run the focused command from Step 2.

Expected: all `DiagnosticPcm16WavWriterTest` tests pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt
git commit -m "feat(diagnostics): add PCM16 WAV writer"
```

---

### Task 5: Generated-Output Recorder and Timeline Alignment

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`
- Modify: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt:84-96,216-239`
- Modify: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt`

**Interfaces:**
- Consumes: `AudioEngine` capture operations, prepared cache file, and `DiagnosticSessionCapture.startedAtMonotonicNanos`.
- Produces:

```kotlin
internal enum class DiagnosticGeneratedOutputResultState(val wireName: String) {
    COMPLETED("completed"), PARTIAL("partial"), UNAVAILABLE("unavailable"), FAILED("failed")
}

internal data class DiagnosticGeneratedOutputCapture(
    val wavFile: File?,
    val resultState: DiagnosticGeneratedOutputResultState,
    val stopReason: DiagnosticOutputStopReason,
    val sampleRate: Int,
    val channelCount: Int,
    val bitsPerSample: Int,
    val logicalFrames: Long,
    val capturedFrames: Long,
    val droppedFrames: Long,
    val silenceSubstitutionFrames: Long,
    val activationMonotonicNanos: Long?,
    val firstCapturedFrameMonotonicNanos: Long?,
    val sessionStartOffsetNanos: Long?,
    val failureReason: String?,
)

internal interface DiagnosticOutputCaptureSource {
    fun start(): DiagnosticOutputStartResult
    fun drain(samples: FloatArray): DiagnosticOutputDrainInfo
    fun stop()
    fun status(): DiagnosticOutputDrainInfo
}

internal class DiagnosticGeneratedOutputRecorder(
    private val source: DiagnosticOutputCaptureSource = AudioEngineDiagnosticOutputCaptureSource,
) {
    fun prepare(outputDirectory: File): DiagnosticGeneratedOutputPreparation
    fun start(preparation: DiagnosticGeneratedOutputPreparation): DiagnosticOutputStartResult
    fun drainAvailable(): DiagnosticOutputDrainInfo
    fun requestStop()
    fun finish(sessionStartedAtMonotonicNanos: Long): DiagnosticGeneratedOutputCapture
    fun cancel()
}
```

All methods that create/write/finalise/delete files are called from `Dispatchers.IO` by the screen. `start`, `requestStop`, and native source operations do no file work.

- [ ] **Step 1: Add the monotonic start timestamp test**

Update the session recorder test:

```kotlin
@Test
fun captureRetainsMonotonicSessionStart() {
    var nanos = 5_000L
    val recorder = DiagnosticSessionRecorder(
        monotonicClockNanos = { nanos },
        wallClockMillis = { 100L },
        sessionIdFactory = { "timed-session" },
    )
    recorder.start(metadata())
    nanos = 8_000L

    val capture = recorder.stop()

    assertEquals(5_000L, capture.startedAtMonotonicNanos)
    assertEquals(3_000L, capture.durationNanos)
}
```

Run the focused session recorder test and verify it fails because `startedAtMonotonicNanos` is absent.

- [ ] **Step 2: Preserve monotonic start in the capture model**

Add:

```kotlin
internal data class DiagnosticSessionCapture(
    val sessionId: String,
    val startedAtMonotonicNanos: Long,
    // existing fields remain in their current order after this new field
)
```

Populate it from `startedAtNanos` in `stopSnapshot()`. Keep the field internal; do not add the absolute monotonic value to `session.json`.

Run `DiagnosticSessionRecorderTest`; expect pass.

- [ ] **Step 3: Write failing recorder tests with a deterministic fake source**

Create a fake that returns queued contiguous runs:

```kotlin
private class FakeDiagnosticOutputSource(
    private val startResult: DiagnosticOutputStartResult,
    private val drains: ArrayDeque<Pair<FloatArray, DiagnosticOutputDrainInfo>>,
) : DiagnosticOutputCaptureSource {
    var stopCalls = 0

    override fun start(): DiagnosticOutputStartResult = startResult

    override fun drain(samples: FloatArray): DiagnosticOutputDrainInfo {
        val next = drains.removeFirstOrNull()
            ?: return stoppedEmptyInfo(startResult)
        next.first.copyInto(samples)
        return next.second
    }

    override fun stop() {
        stopCalls += 1
    }

    override fun status(): DiagnosticOutputDrainInfo = stoppedEmptyInfo(startResult)
}
```

Test normal capture:

```kotlin
@Test
fun writesContiguousRunsAndFinalisesNormalCapture() {
    val source = fakeSource(
        run(firstFrame = 0, samples = floatArrayOf(0.25f, -0.25f, 0.5f, -0.5f)),
    )
    val recorder = DiagnosticGeneratedOutputRecorder(source)
    val prepared = recorder.prepare(tempDirectory())
    recorder.start(prepared)
    recorder.drainAvailable()
    recorder.requestStop()

    val result = recorder.finish(sessionStartedAtMonotonicNanos = 1_000L)

    assertEquals(DiagnosticGeneratedOutputResultState.COMPLETED, result.resultState)
    assertEquals(2L, result.logicalFrames)
    assertEquals(0L, result.silenceSubstitutionFrames)
    assertTrue(result.wavFile?.isFile == true)
}
```

Test overflow timing:

```kotlin
@Test
fun insertsSilenceForLogicalGap() {
    val source = fakeSource(
        run(firstFrame = 0, samples = floatArrayOf(0.1f, 0.2f)),
        run(firstFrame = 3, samples = floatArrayOf(0.3f, 0.4f), droppedFrames = 2),
    )
    val recorder = DiagnosticGeneratedOutputRecorder(source)
    val prepared = recorder.prepare(tempDirectory())
    recorder.start(prepared)
    recorder.drainAvailable()
    recorder.drainAvailable()
    recorder.requestStop()

    val result = recorder.finish(1_000L)

    assertEquals(4L, result.logicalFrames)
    assertEquals(2L, result.silenceSubstitutionFrames)
    assertEquals(DiagnosticGeneratedOutputResultState.PARTIAL, result.resultState)
}
```

Also test:

- preparation failure returns `UNAVAILABLE` and creates no WAV;
- native start failure deletes the prepared file;
- duration limit, format change, and audio stop return `PARTIAL` with a valid WAV;
- a stopped empty capture with zero represented frames is `UNAVAILABLE` and omits WAV;
- writer failure requests native stop and returns `FAILED`;
- `finish` drains until producer is stopped and `bufferedFramesRemain == false`;
- repeated `requestStop` is safe;
- `cancel` stops native capture, closes writer, and deletes temporary files;
- `sessionStartOffsetNanos` is `firstCapturedFrameMonotonicNanos - sessionStartedAtMonotonicNanos`;
- negative calculated offsets are retained because native activation may precede Kotlin session start only in a test/failure condition and must not be silently rewritten.

- [ ] **Step 4: Run recorder tests to verify they fail**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputRecorderTest
```

Expected: compilation fails because the recorder and source interface do not exist.

- [ ] **Step 5: Implement preparation, drain, gap filling, and terminal result**

Use fixed reusable buffers:

```kotlin
private const val DiagnosticOutputDrainFrames = 4_096
private val floatBuffer = FloatArray(DiagnosticOutputDrainFrames * 2)
private val byteBuffer = ByteArray(DiagnosticOutputDrainFrames * 4)
private var nextExpectedLogicalFrame = 0L
```

`prepare` creates `diagnostic-generated-output-<UUID>.wav.tmp` and a writer with the current native sample rate only after `start` succeeds. To preserve the approved order, preparation creates the empty path; `start` obtains the authoritative native sample rate, constructs the writer, and deletes the file on failure.

`drainAvailable`:

```kotlin
val info = source.drain(floatBuffer)
val first = info.firstLogicalFrame
if (info.returnedFrames > 0) {
    checkNotNull(first)
    check(first >= nextExpectedLogicalFrame) { "diagnostic output logical frame order regressed" }
    val gap = first - nextExpectedLogicalFrame
    if (gap > 0L) {
        writer.writeSilenceFrames(gap, byteBuffer)
        silenceSubstitutionFrames += gap
    }
    writer.writeInterleavedFrames(floatBuffer, info.returnedFrames, byteBuffer)
    nextExpectedLogicalFrame = first + info.returnedFrames
}
latestInfo = info
return info
```

`finish` calls `drainAvailable()` until the source is stopped and empty. Add a bounded no-progress guard of 1,000 empty iterations; exceeding it returns `FAILED` rather than spinning forever. No sleep occurs inside the recorder; the screen’s live polling supplies cadence, while final draining is expected to make immediate progress after producer stop.

Result classification:

- `COMPLETED` only when stop reason is `STOPPED_BY_USER`, no dropped frames occurred, and a valid WAV finalised.
- `PARTIAL` for duration limit, format change, audio stop, or any dropped frames when a valid WAV exists.
- `UNAVAILABLE` for preparation/start failure or zero represented frames.
- `FAILED` for write/finalisation/order/no-progress failures.

- [ ] **Step 6: Run recorder and session tests**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputRecorderTest \
  --tests com.vitautas.drumkit.DiagnosticSessionRecorderTest
```

Expected: both test classes pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt
git commit -m "feat(diagnostics): record generated output timeline"
```

---

### Task 6: Streaming Diagnostic ZIP Augmentation

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt`
- Modify: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionBundleRecorderTest.kt:18-68`

**Interfaces:**
- Consumes: the fully augmented performance ZIP and `DiagnosticGeneratedOutputCapture`.
- Produces:

```kotlin
internal object DiagnosticGeneratedOutputBundleAugmenter {
    fun augmentBundle(bundle: File, capture: DiagnosticGeneratedOutputCapture)
}
```

- [ ] **Step 1: Write failing ZIP augmentation tests**

Build a source ZIP containing the current performance manifest shape and small diagnostic entries. Test a successful capture:

```kotlin
@Test
fun addsWavMetadataAndRecomputedChecksum() {
    val bundle = createPerformanceBundle(
        manifest = performanceManifest(plannedFiles = listOf("generated-output.wav")),
        summary = "Generated-output WAV capture is not yet implemented.\n",
    )
    val wav = createValidWav(frameCount = 4)
    val capture = generatedCapture(wavFile = wav, resultState = COMPLETED, logicalFrames = 4)

    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(bundle, capture)

    ZipFile(bundle).use { zip ->
        assertNotNull(zip.getEntry("generated-output.wav"))
        val manifest = zip.readUtf8("manifest.json")
        assertTrue(manifest.contains("step_1_2_generated_output_partial"))
        assertTrue(manifest.contains("\"plannedFilesNotYetImplemented\": []"))
        assertTrue(manifest.contains("\"resultState\": \"completed\""))
        val checksums = zip.readUtf8("checksums.sha256")
        assertTrue(checksums.contains("generated-output.wav"))
        assertChecksumsMatch(zip)
    }
}
```

Also test:

- partial WAV is included with `resultState: partial` and exact stop reason;
- unavailable/failed capture omits the WAV but still removes it from planned files and records the error;
- existing `performance.csv`, dispatch files, touch files, and unknown future entries are retained byte-for-byte;
- old `checksums.sha256` is never retained;
- summary contains duration, format, counters, result, stop reason, and failure text;
- a multi-megabyte WAV is copied through streams and its ZIP size matches the file size;
- a failed rewrite leaves the original bundle intact and removes the temporary ZIP.

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputBundleAugmenterTest
```

Expected: compilation fails because the augmenter does not exist.

- [ ] **Step 3: Implement a streaming rewrite**

Do not load `generated-output.wav` into a `ByteArray`. Use a digesting copy helper:

```kotlin
private fun copyWithSha256(input: InputStream, output: OutputStream): Pair<Long, String> {
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
    var total = 0L
    while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        output.write(buffer, 0, count)
        digest.update(buffer, 0, count)
        total += count
    }
    return total to digest.digest().joinToString("") { "%02x".format(it) }
}
```

Rewrite order:

1. transformed `manifest.json`;
2. known existing diagnostic entries in their current order;
3. any unknown retained entries except `summary.txt` and `checksums.sha256`;
4. `generated-output.wav` when a valid file exists;
5. transformed `summary.txt`;
6. newly generated `checksums.sha256`.

For each entry, calculate the digest while writing the exact bytes to the new ZIP and append one checksum line. Use a temporary sibling file named `.<bundle>.generated-output.tmp`, then the same atomic-move/fallback pattern used by existing augmenters.

Manifest transformation must:

- replace `step_1_2_performance_trace_partial` with `step_1_2_generated_output_partial`;
- add `generated-output.wav` to `includedFiles` only when present;
- replace `"plannedFilesNotYetImplemented": ["generated-output.wav"]` with `[]`;
- insert a `generatedOutput` object before `droppedData`;
- add `generatedOutputFrames` to `droppedData` using the exact native dropped count;
- JSON-escape failure text and never include raw newlines.

- [ ] **Step 4: Update the older bundle expectation**

`DiagnosticSessionBundleRecorderTest` exercises the intermediate touch-only bundle, so retain its current assertion that generated output is not yet present at that intermediate stage. Change only wording that became stale due performance telemetry already being implemented; do not assert final generated-output contents in the base recorder test.

- [ ] **Step 5: Run bundle tests**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputBundleAugmenterTest \
  --tests com.vitautas.drumkit.DiagnosticSessionBundleRecorderTest \
  --tests com.vitautas.drumkit.DiagnosticPerformanceRecorderTest
```

Expected: all selected tests pass and prior performance checksum tests remain intact.

- [ ] **Step 6: Commit Task 6**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionBundleRecorderTest.kt
git commit -m "feat(diagnostics): add generated output to bundles"
```

---

### Task 7: Diagnostic Screen Lifecycle Integration

**Files:**
- Modify: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt:56-330`
- Test: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`

**Interfaces:**
- Consumes: recorder and augmenter interfaces from Tasks 5 and 6.
- Produces: a session workflow where generated-output preparation/start/drain/stop/finalisation is ordered around the existing base, dispatch, and performance recorders.

- [ ] **Step 1: Add orchestration-state tests to the recorder**

Add tests that prove the exact public ordering contract needed by Compose:

```kotlin
@Test
fun stopDisablesProducerBeforeFinalDrain() {
    val source = RecordingFakeSource()
    val recorder = preparedAndStartedRecorder(source)

    recorder.requestStop()
    recorder.finish(sessionStartedAtMonotonicNanos = 1_000L)

    assertEquals(listOf("start", "stop", "drain"), source.calls.take(3))
}

@Test
fun liveDrainCanRunRepeatedlyBeforeStop() {
    val source = sourceWithRuns(run(0, frame(0.1f, 0.2f)), emptyCapturingRun())
    val recorder = preparedAndStartedRecorder(source)

    recorder.drainAvailable()
    recorder.drainAvailable()

    assertEquals(2, source.drainCalls)
}
```

Run the recorder test. Adjust only recorder code if these tests expose an ordering defect.

- [ ] **Step 2: Add generated-output state to the composable**

At recorder construction:

```kotlin
val generatedOutputRecorder = remember { DiagnosticGeneratedOutputRecorder() }
var isStarting by remember { mutableStateOf(false) }
var generatedOutputStatus by remember { mutableStateOf<String?>(null) }
```

Disable `START DIAG` while `isStarting` is true. Do not add another button.

- [ ] **Step 3: Prepare the file before starting the diagnostic clocks**

Change the non-recording button branch to launch a coroutine:

```kotlin
isStarting = true
status = "Preparing generated-output capture"
scope.launch {
    val preparation = withContext(Dispatchers.IO) {
        generatedOutputRecorder.prepare(File(context.cacheDir, "diagnostics/output"))
    }
    val diagnostics = AudioEngine.diagnostics()
    val resolvedRoute = DiagnosticAudioRouteResolver.resolve(context)
    val metadata = DiagnosticMetadataFactory.create(
        context = context,
        diagnostics = diagnostics,
        masterVolume = masterVolume,
        roomLevel = roomLevel,
        audioRoute = resolvedRoute,
    )
    val staleOutcomes = AudioEngine.drainDiagnosticDispatchOutcomes()
    val sessionId = recorder.start(metadata)
    dispatchTraceRecorder.start(staleOutcomes.droppedOutcomeCount)
    performanceRecorder.start(
        metadata = metadata,
        viewportWidthPx = viewportSize.width.toInt().takeIf { it > 0 } ?: metadata.screenWidthPx,
        viewportHeightPx = viewportSize.height.toInt().takeIf { it > 0 } ?: metadata.screenHeightPx,
        density = density,
    )
    val outputStart = generatedOutputRecorder.start(preparation)
    recorder.recordAudioDiagnostics(diagnostics)
    isRecording = true
    isStarting = false
    generatedOutputStatus = if (outputStart.started) "Output capture active" else "Output capture unavailable"
    status = "Recording ${sessionId.take(8)}"
}
```

Wrap the coroutine body in `runCatching`; on failure cancel every recorder that started, reset `isStarting`, and report a concise status. Preparation failure itself is not fatal and returns an unavailable preparation object.

- [ ] **Step 4: Drain generated output during the existing 50 ms poll loop**

Inside each repeat iteration, before `delay(NativeOutcomePollIntervalMillis)`:

```kotlin
val outputInfo = withContext(Dispatchers.IO) {
    generatedOutputRecorder.drainAvailable()
}
generatedOutputStatus = when (outputInfo.stopReason) {
    DiagnosticOutputStopReason.DURATION_LIMIT -> "Output capture reached 10-minute limit"
    DiagnosticOutputStopReason.FORMAT_CHANGED -> "Output capture stopped after format change"
    DiagnosticOutputStopReason.AUDIO_STOPPED -> "Output capture stopped with audio engine"
    else -> generatedOutputStatus
}
```

The 32,768-frame ring holds about 341 ms at 96 kHz, so a 50 ms consumer cadence provides substantial headroom without adding a new timer.

- [ ] **Step 5: Stop the producer before snapshotting and finalise on I/O**

At the start of the recording stop branch:

```kotlin
generatedOutputRecorder.requestStop()
val capture = recorder.stop()
val performanceCapture = performanceRecorder.stop()
```

In the export coroutine, before base ZIP export:

```kotlin
val generatedOutputCapture = withContext(Dispatchers.IO) {
    generatedOutputRecorder.finish(capture.baseCapture.startedAtMonotonicNanos)
}
```

After dispatch and performance augmentation, run generated-output augmentation last:

```kotlin
DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(
    bundle = result.file,
    capture = generatedOutputCapture,
)
```

Running last ensures its checksum list covers every earlier augmentation and the binary WAV.

- [ ] **Step 6: Show compact capture status without adding controls**

Append `generatedOutputStatus` to the existing status label only when non-null. Keep text short enough for landscape:

```kotlin
val visibleStatus = listOfNotNull(status, generatedOutputStatus).joinToString(" · ")
Text(text = visibleStatus, /* existing styling */)
```

Reset the status after successful export or cancellation.

- [ ] **Step 7: Run application tests and compilation**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  :app:compileDebugKotlin
```

Expected: all app unit tests pass and Compose compilation succeeds with warnings treated as errors.

- [ ] **Step 8: Commit Task 7**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt
git commit -m "feat(diagnostics): integrate generated output capture"
```

---

### Task 8: Documentation, Full Validation, APK, and Physical Handoff

**Files:**
- Modify: `drum-kit-android/README.md:9-90`
- Modify: `drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md:4-8,63 onward`
- Modify: PR #10 body after all automated checks pass

**Interfaces:**
- Consumes: completed implementation and validation evidence.
- Produces: accurate status documentation, exact-head APK, and a bounded physical validation checklist.

- [ ] **Step 1: Update documentation with implemented versus physically verified status**

README changes must state:

- `generated-output.wav` contains post-room/post-master/post-limiter stereo PCM16;
- native capture uses a bounded 32,768-frame ring;
- Kotlin writes through cache storage outside the callback;
- dropped capture frames become silence and are counted;
- ten-minute, format-change, and audio-stop cases produce partial WAVs;
- capture failure does not stop playing or the remaining ZIP export.

Roadmap status must use exact wording equivalent to:

```markdown
- **Generated-output capture — implemented and automated-validated, physical review pending:** the diagnostic ZIP now includes a checksum-covered PCM16 WAV for normal sessions. Native capture is bounded and real-time safe; overflow, duration-limit, format-change, audio-stop, and file-failure states are explicit. Physical playback/timing and underrun validation remain required before this Step 1.2 slice is fully accepted.
```

Do not mark Step 1.2 complete.

- [ ] **Step 2: Run the narrow checks first**

Run:

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  :app:testDebugUnitTest
```

Expected: host native tests and all focused JVM tests pass.

- [ ] **Step 3: Run the project’s normal automated checks**

Run:

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :core-model:check \
  :engine-input:testDebugUnitTest \
  :engine-audio:testDebugUnitTest \
  :feature-kit:testDebugUnitTest \
  :app:testDebugUnitTest \
  :app:compileDebugKotlin \
  :app:lintDebug
```

Expected: exit code `0`, no warnings promoted to errors, and no test failures.

- [ ] **Step 4: Inspect the implementation against the real-time checklist**

Perform and record a source review confirming:

- `onAudioReady()` performs only atomic state/counter operations and writes to preallocated slots for capture;
- no capture path in `onAudioReady()` opens files, allocates containers, locks mutexes, logs, calls JNI, waits, or converts floats to PCM integers;
- `clearRealtimeState()` does not erase buffered generated-output capture;
- all file and ZIP work is called from `Dispatchers.IO`;
- generated-output augmentation runs after dispatch and performance augmentation;
- `generated-output.wav` is not loaded wholly into memory.

- [ ] **Step 5: Commit documentation**

```bash
git add \
  drum-kit-android/README.md \
  drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md
git commit -m "docs: record generated output capture status"
```

- [ ] **Step 6: Verify GitHub Actions on the exact final head**

Wait for and inspect:

- Drum Kit Quick Check;
- Drum Kit Android Validation, including the new host C++ test;
- Drum Kit Android Lint.

If any check fails, use `superpowers:systematic-debugging`, inspect the failing logs, and change only the generated-output slice.

- [ ] **Step 7: Request and verify an exact-head debug APK**

Apply the repository’s existing APK request label to PR #10. Verify the APK workflow:

- checks out the exact PR head;
- verifies the snare bank;
- compiles arm64 native C++ with project warning settings;
- assembles the debug APK;
- verifies the embedded source SHA;
- uploads APK, build log, and snare manifest artifacts.

Record artifact ID, digest, exact source SHA, and expiry date in the PR body.

- [ ] **Step 8: Update PR #10 without changing draft status**

Add:

- generated-output architecture;
- exact files and metadata added;
- real-time invariants;
- overflow/silence, duration, format-change, audio-stop, and failure semantics;
- automated validation run numbers;
- APK artifact details;
- explicit statement that physical WAV validation remains.

Do not mark the PR ready, merge it, or claim Step 1.2 complete.

- [ ] **Step 9: Perform the physical validation handoff**

Install the exact-head APK and record a 20–30 second phone-speaker session containing kick, snare, cymbals, rapid pedal retriggers, and a marker. Export the ZIP and verify:

```text
generated-output.wav exists and opens
format is stereo PCM16
sample rate matches session.json/audio diagnostics
WAV duration = logicalFrames / sampleRate within one frame
checksums.sha256 matches generated-output.wav
audible strikes align with strike/marker timing under the documented offset
underrun count did not increase
```

Repeat a short Galaxy Buds session to verify honest Bluetooth route/burst metadata. A deliberate route change during a session must yield a playable partial WAV with `format_changed` or `audio_stopped`, not a corrupt file.

- [ ] **Step 10: Record acceptance accurately**

After reviewing the uploaded physical ZIP:

- mark each generated-output acceptance criterion `Met`, `Partially met`, or `Not testable`;
- keep Step 1.2 partial because guided tests and recovery/share/deletion work remain;
- recommend guided diagnostic sequence and automatic markers as the next Step 1.2 batch.

---

## Plan Self-Review Checklist

Before execution begins, verify:

- Every approved design requirement maps to Tasks 1–8.
- Native overflow exposes exact gaps through per-slot logical indices and contiguous-run drains.
- Native producer state, native stop reason, and Kotlin final result remain distinct.
- The WAV path never stores ten minutes in RAM and never loads the final WAV into a `ByteArray` for ZIP insertion.
- The 96 kHz ten-minute PCM16 payload is approximately 230 MB and below classic RIFF limits.
- The first captured frame offset uses the shared Android monotonic timebase and remains nullable for zero-frame captures.
- The final ZIP augmenter runs last and recomputes checksums for all retained and new entries.
- No task introduces a second roadmap step or implements deferred Step 1.2 slices.
