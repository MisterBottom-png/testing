# Generated Output Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a checksum-covered `generated-output.wav` to normal Step 1.2 diagnostic bundles by capturing the native post-room, post-master, post-limiter stereo output without compromising the real-time audio callback.

**Architecture:** A platform-neutral, fixed-capacity native SPSC ring stores complete stereo float frames together with logical frame indices. Kotlin drains contiguous runs through bounded JNI calls and writes PCM16 into a seekable cache file on `Dispatchers.IO`; a final streaming ZIP augmenter adds the WAV, updates manifest and summary metadata, and recomputes checksums. Capture failure remains subordinate to playing and to the rest of diagnostic export.

**Tech Stack:** C++20, Oboe, JNI, Kotlin/JVM, Android API 26+, Java `RandomAccessFile`, Kotlin coroutines already used by the app, JUnit 4, Gradle 9.5.0, Android Gradle Plugin 9.3.x, GitHub Actions.

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

## File Map

### Native and engine-audio

- Create `drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h` for the header-only platform-neutral ring and state machine.
- Create `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp` for dependency-free host tests.
- Create `drum-kit-android/tools/test_diagnostic_output_capture.sh` for the reproducible host compile/run command.
- Modify `.github/workflows/drum-kit-android-validation.yml` to run the host test before Gradle validation.
- Modify `drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp` to own the runtime ring, copy post-limiter frames, preserve buffered data across stream errors, and expose JNI operations.
- Create `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt` for Kotlin wire models and decoding.
- Create `drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt` for strict decoder tests.
- Modify `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt` for reusable metadata buffers and synchronised capture operations.

### App persistence and export

- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt` for PCM conversion, silence writing, RIFF finalisation, and abort cleanup.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt` for byte-exact WAV tests.
- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt` for preparation, native start/drain/stop, gap substitution, terminal results, and file cleanup.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt` for deterministic fake-source/fake-sink tests.
- Modify `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt` to preserve the monotonic session start in `DiagnosticSessionCapture`.
- Modify `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt` to verify monotonic alignment data.
- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt` for a streaming final ZIP rewrite.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt` for entry, metadata, streaming, and checksum tests.
- Modify `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt` to order preparation/start/live drain/stop/finalisation around the existing recorders.
- Modify `drum-kit-android/README.md`, `drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md`, and PR #10 status after validation.

---

### Task 1: Build and Prove the Native Capture Ring

**Files:**
- Create: `drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h`
- Create: `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp`
- Create: `drum-kit-android/tools/test_diagnostic_output_capture.sh`
- Modify: `.github/workflows/drum-kit-android-validation.yml:37-70`

**Interfaces:**

```cpp
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

template <size_t CapacityFrames>
class DiagnosticOutputCapture {
public:
    bool start(int32_t sampleRate, int32_t channelCount, int64_t activationNanos);
    bool startForMaximumFramesForTest(
        int32_t sampleRate,
        int32_t channelCount,
        int64_t activationNanos,
        uint64_t maximumLogicalFrames
    );
    void writeFrame(
        float left,
        float right,
        int32_t sampleRate,
        int32_t channelCount,
        int64_t frameNanos
    );
    DiagnosticOutputDrainResult drain(float* destination, size_t destinationFrameCapacity);
    void stop(DiagnosticOutputStopReason reason);
    void markAudioStopped();
    DiagnosticOutputStatus status() const;
};

using RuntimeDiagnosticOutputCapture = DiagnosticOutputCapture<32768>;
```

- [ ] **Step 1: Write the complete failing host test file**

Create `diagnostic-output-capture-test.cpp` with these exact helpers and cases:

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

void requireNear(float actual, float expected, const char* message) {
    require(std::abs(actual - expected) < 0.0001f, message);
}

void testInitialState() {
    DiagnosticOutputCapture<4> capture;
    const auto status = capture.status();
    require(status.state == DiagnosticOutputProducerState::Idle, "initial state");
    require(status.stopReason == DiagnosticOutputStopReason::None, "initial reason");
    require(!status.bufferedFramesRemain, "initial buffer empty");
}

void testInvalidStart() {
    DiagnosticOutputCapture<4> capture;
    require(!capture.start(0, 2, 10), "zero rate rejected");
    require(capture.status().stopReason == DiagnosticOutputStopReason::StartFailed, "start failure reason");

    DiagnosticOutputCapture<4> wrongChannels;
    require(!wrongChannels.start(48000, 1, 10), "mono rejected");
    require(wrongChannels.status().stopReason == DiagnosticOutputStopReason::StartFailed, "mono failure reason");
}

void testStartAndContiguousDrain() {
    DiagnosticOutputCapture<4> capture;
    require(capture.start(48000, 2, 1'000'000), "start succeeds");
    capture.writeFrame(0.25f, -0.25f, 48000, 2, 1'000'100);
    capture.writeFrame(0.50f, -0.50f, 48000, 2, 1'000'200);

    float samples[8]{};
    const auto result = capture.drain(samples, 4);
    require(result.frameCount == 2, "two frames drain");
    require(result.firstLogicalFrame == 0, "first logical frame zero");
    requireNear(samples[0], 0.25f, "first left");
    requireNear(samples[1], -0.25f, "first right");
    requireNear(samples[2], 0.50f, "second left");
    requireNear(samples[3], -0.50f, "second right");
    require(result.firstCapturedFrameNanos == 1'000'100, "first frame timestamp");
}

void testRepeatedStartPreservesActiveCapture() {
    DiagnosticOutputCapture<4> capture;
    require(capture.start(48000, 2, 100), "first start");
    require(!capture.start(96000, 2, 200), "second start rejected");
    const auto status = capture.status();
    require(status.state == DiagnosticOutputProducerState::Capturing, "capture remains active");
    require(status.sampleRate == 48000, "format unchanged");
}

void testOverflowAndContiguousRuns() {
    DiagnosticOutputCapture<2> capture;
    require(capture.start(48000, 2, 10), "start succeeds");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 11);
    capture.writeFrame(0.3f, 0.4f, 48000, 2, 12);
    capture.writeFrame(0.5f, 0.6f, 48000, 2, 13);

    float first[4]{};
    const auto firstRun = capture.drain(first, 2);
    require(firstRun.frameCount == 2, "ring retains capacity");
    require(firstRun.firstLogicalFrame == 0, "first run starts zero");
    require(firstRun.droppedFrames == 1, "one dropped frame");

    capture.writeFrame(0.7f, 0.8f, 48000, 2, 14);
    float second[4]{};
    const auto secondRun = capture.drain(second, 2);
    require(secondRun.frameCount == 1, "post-gap run has one frame");
    require(secondRun.firstLogicalFrame == 3, "post-gap index exposed");
    require(secondRun.logicalFrames == 4, "logical timeline includes drop");
    require(secondRun.capturedFrames == 3, "captured count excludes drop");
}

void testWrapAroundOrdering() {
    DiagnosticOutputCapture<3> capture;
    require(capture.start(48000, 2, 10), "start succeeds");
    for (int index = 0; index < 3; ++index) {
        capture.writeFrame(index + 0.1f, index + 0.2f, 48000, 2, 20 + index);
    }
    float first[4]{};
    require(capture.drain(first, 2).frameCount == 2, "first partial drain");
    capture.writeFrame(3.1f, 3.2f, 48000, 2, 30);
    capture.writeFrame(4.1f, 4.2f, 48000, 2, 31);

    float second[8]{};
    const auto result = capture.drain(second, 4);
    require(result.frameCount == 3, "wrapped frames drain");
    require(result.firstLogicalFrame == 2, "wrapped run starts at two");
    requireNear(second[0], 2.1f, "oldest wrapped left");
    requireNear(second[4], 4.1f, "newest wrapped left");
}

void testDurationLimit() {
    DiagnosticOutputCapture<8> capture;
    require(capture.startForMaximumFramesForTest(48000, 2, 100, 3), "test start");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    capture.writeFrame(0.3f, 0.4f, 48000, 2, 102);
    capture.writeFrame(0.5f, 0.6f, 48000, 2, 103);
    capture.writeFrame(0.7f, 0.8f, 48000, 2, 104);
    const auto status = capture.status();
    require(status.state == DiagnosticOutputProducerState::Stopped, "duration stops producer");
    require(status.stopReason == DiagnosticOutputStopReason::DurationLimit, "duration reason");
    require(status.logicalFrames == 3, "exact duration frames");
}

void testFormatChangeStopsBeforeNewFrame() {
    DiagnosticOutputCapture<8> capture;
    require(capture.start(48000, 2, 100), "start succeeds");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    capture.writeFrame(0.3f, 0.4f, 96000, 2, 102);
    float samples[16]{};
    const auto result = capture.drain(samples, 8);
    require(result.frameCount == 1, "new format not stored");
    require(result.stopReason == DiagnosticOutputStopReason::FormatChanged, "format reason");
}

void testAudioStopAndIdempotentStop() {
    DiagnosticOutputCapture<8> capture;
    require(capture.start(48000, 2, 100), "start succeeds");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    capture.markAudioStopped();
    capture.stop(DiagnosticOutputStopReason::StoppedByUser);
    const auto status = capture.status();
    require(status.stopReason == DiagnosticOutputStopReason::AudioStopped, "first reason wins");
    require(status.bufferedFramesRemain, "buffer preserved");
}

void testStoppedWritesDoNothing() {
    DiagnosticOutputCapture<4> capture;
    require(capture.start(48000, 2, 100), "start succeeds");
    capture.stop(DiagnosticOutputStopReason::StoppedByUser);
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    const auto status = capture.status();
    require(status.logicalFrames == 0, "stopped logical count unchanged");
    require(status.capturedFrames == 0, "stopped captured count unchanged");
}

}  // namespace

int main() {
    testInitialState();
    testInvalidStart();
    testStartAndContiguousDrain();
    testRepeatedStartPreservesActiveCapture();
    testOverflowAndContiguousRuns();
    testWrapAroundOrdering();
    testDurationLimit();
    testFormatChangeStopsBeforeNewFrame();
    testAudioStopAndIdempotentStop();
    testStoppedWritesDoNothing();
    std::cout << "diagnostic-output-capture tests passed\n";
    return 0;
}
```

- [ ] **Step 2: Run the test to prove the red state**

```bash
cd drum-kit-android
mkdir -p build/native-tests
c++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -Iengine-audio/src/main/cpp \
  engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp \
  -o build/native-tests/diagnostic-output-capture-test
```

Expected: compilation fails because `diagnostic-output-capture.h` does not exist.

- [ ] **Step 3: Implement the header-only ring**

Create these exact data types:

```cpp
#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <limits>

constexpr uint64_t kNoDiagnosticOutputFrame = std::numeric_limits<uint64_t>::max();
constexpr int64_t kNoDiagnosticOutputTimestamp = -1;

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
```

Implement `DiagnosticOutputCapture<CapacityFrames>` with:

```cpp
struct Slot {
    uint64_t logicalFrame = 0;
    float left = 0.0f;
    float right = 0.0f;
};

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
```

Use these algorithms:

```cpp
bool startInternal(int32_t rate, int32_t channels, int64_t activation, uint64_t maximum) {
    if (state_.load(std::memory_order_acquire) == DiagnosticOutputProducerState::Capturing) {
        return false;
    }
    if (readSequence_.load(std::memory_order_acquire) != writeSequence_.load(std::memory_order_acquire)) {
        return false;
    }
    if (rate <= 0 || channels != 2 || maximum == 0) {
        stopReason_.store(DiagnosticOutputStopReason::StartFailed, std::memory_order_relaxed);
        state_.store(DiagnosticOutputProducerState::Stopped, std::memory_order_release);
        return false;
    }
    readSequence_.store(0, std::memory_order_relaxed);
    writeSequence_.store(0, std::memory_order_relaxed);
    logicalFrames_.store(0, std::memory_order_relaxed);
    capturedFrames_.store(0, std::memory_order_relaxed);
    droppedFrames_.store(0, std::memory_order_relaxed);
    firstCapturedFrameNanos_.store(kNoDiagnosticOutputTimestamp, std::memory_order_relaxed);
    sampleRate_ = rate;
    channelCount_ = channels;
    maximumLogicalFrames_ = maximum;
    activationNanos_ = activation;
    stopReason_.store(DiagnosticOutputStopReason::None, std::memory_order_relaxed);
    state_.store(DiagnosticOutputProducerState::Capturing, std::memory_order_release);
    return true;
}
```

`writeFrame` must:

1. return unless state is `Capturing`;
2. stop with `FormatChanged` before advancing the timeline when rate/channels differ;
3. stop with `DurationLimit` when `logicalFrames == maximumLogicalFrames`;
4. reserve the current logical index and increment `logicalFrames` once;
5. compare `writeSequence - readSequence` with `CapacityFrames`;
6. increment `droppedFrames` and store no slot when full;
7. otherwise write slot index `writeSequence % CapacityFrames`, then publish `writeSequence + 1` with release semantics;
8. set first-captured timestamp by compare-exchange after the first successful slot write;
9. stop with `DurationLimit` after representing the final allowed logical frame.

`drain` must copy only one contiguous logical run. Load `writeSequence` with acquire semantics, inspect each slot from `readSequence`, stop before any slot whose logical index is not `firstLogicalFrame + copied`, then publish the new `readSequence` with release semantics.

`stop` must compare-exchange `stopReason` from `None` to the requested reason, then publish `Stopped`. `markAudioStopped` calls `stop(AudioStopped)`. `status` snapshots counters and sets `bufferedFramesRemain = writeSequence > readSequence`.

- [ ] **Step 4: Add the reusable script and CI step**

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

Add before Gradle setup in `.github/workflows/drum-kit-android-validation.yml`:

```yaml
      - name: Run diagnostic output native tests
        shell: bash
        run: bash tools/test_diagnostic_output_capture.sh
```

- [ ] **Step 5: Run the green test**

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
```

Expected output: `diagnostic-output-capture tests passed`.

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

### Task 2: Define the Kotlin Protocol and Wire It to Oboe/JNI

**Files:**
- Create: `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt`
- Create: `drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt`
- Modify: `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt:11-158`
- Modify: `drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp:1-1100`

**Wire contract:** one `LongArray` with 12 fields in this exact order:

```text
0 firstLogicalFrame (-1 when absent)
1 returnedFrames
2 logicalFrames
3 capturedFrames
4 droppedFrames
5 sampleRate
6 channelCount
7 producerState
8 stopReason
9 activationMonotonicNanos (-1 when absent)
10 firstCapturedFrameMonotonicNanos (-1 when absent)
11 bufferedFramesRemain (0 or 1)
```

- [ ] **Step 1: Write decoder tests**

Create exact tests:

```kotlin
@Test
fun decodesDrainMetadata() {
    val metadata = longArrayOf(12, 4, 20, 19, 1, 48_000, 2, 1, 0, 1_000, 1_100, 1)
    val result = DiagnosticOutputCaptureDecoder.decodeDrain(metadata, samplesSize = 16)
    assertEquals(4, result.returnedFrames)
    assertEquals(12L, result.firstLogicalFrame)
    assertEquals(20L, result.logicalFrames)
    assertEquals(19L, result.capturedFrames)
    assertEquals(1L, result.droppedFrames)
    assertEquals(DiagnosticOutputProducerState.CAPTURING, result.producerState)
    assertEquals(DiagnosticOutputStopReason.NONE, result.stopReason)
    assertEquals(1_000L, result.activationMonotonicNanos)
    assertEquals(1_100L, result.firstCapturedFrameMonotonicNanos)
    assertTrue(result.bufferedFramesRemain)
}

@Test
fun decodesAbsentSentinels() {
    val metadata = longArrayOf(-1, 0, 0, 0, 0, 48_000, 2, 2, 1, -1, -1, 0)
    val result = DiagnosticOutputCaptureDecoder.decodeDrain(metadata, samplesSize = 0)
    assertNull(result.firstLogicalFrame)
    assertNull(result.activationMonotonicNanos)
    assertNull(result.firstCapturedFrameMonotonicNanos)
    assertFalse(result.bufferedFramesRemain)
}

@Test
fun rejectsUnknownStateAndReason() {
    assertThrows(IllegalStateException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(-1, 0, 0, 0, 0, 48_000, 2, 99, 0, -1, -1, 0),
            0,
        )
    }
    assertThrows(IllegalStateException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(-1, 0, 0, 0, 0, 48_000, 2, 2, 99, -1, -1, 0),
            0,
        )
    }
}

@Test
fun rejectsInvalidCounts() {
    assertThrows(IllegalArgumentException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(0, 5, 5, 5, 0, 48_000, 2, 1, 0, 0, 0, 1),
            samplesSize = 8,
        )
    }
    assertThrows(IllegalArgumentException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(0, 1, -1, 0, 0, 48_000, 2, 1, 0, 0, 0, 1),
            samplesSize = 2,
        )
    }
}

@Test
fun mapsEveryWireEnumValue() {
    assertEquals(
        listOf(IDLE, CAPTURING, STOPPED),
        listOf(0, 1, 2).map(DiagnosticOutputProducerState::fromWire),
    )
    assertEquals(
        listOf(NONE, STOPPED_BY_USER, DURATION_LIMIT, FORMAT_CHANGED, AUDIO_STOPPED, START_FAILED),
        listOf(0, 1, 2, 3, 4, 5).map(DiagnosticOutputStopReason::fromWire),
    )
}
```

- [ ] **Step 2: Run the decoder tests and confirm failure**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  --tests com.vitautas.drumkit.audio.DiagnosticOutputCaptureDecoderTest
```

Expected: Kotlin compilation fails because protocol types do not exist.

- [ ] **Step 3: Implement Kotlin models and strict decoding**

Create:

```kotlin
internal const val DIAGNOSTIC_OUTPUT_METADATA_FIELD_COUNT = 12

enum class DiagnosticOutputProducerState(val wireValue: Int) {
    IDLE(0), CAPTURING(1), STOPPED(2);

    companion object {
        internal fun fromWire(value: Int): DiagnosticOutputProducerState =
            entries.firstOrNull { it.wireValue == value }
                ?: error("unknown diagnostic output producer state: $value")
    }
}

enum class DiagnosticOutputStopReason(val wireValue: Int) {
    NONE(0), STOPPED_BY_USER(1), DURATION_LIMIT(2), FORMAT_CHANGED(3),
    AUDIO_STOPPED(4), START_FAILED(5);

    companion object {
        internal fun fromWire(value: Int): DiagnosticOutputStopReason =
            entries.firstOrNull { it.wireValue == value }
                ?: error("unknown diagnostic output stop reason: $value")
    }
}
```

Define immutable `DiagnosticOutputStartResult` and `DiagnosticOutputDrainInfo` with all fields named in the design. `decodeDrain` validates metadata length, non-negative counters, `returnedFrames <= samplesSize / 2`, stereo when frames are returned, and nullable `-1` sentinels. `decodeStart` uses the same metadata array and returns `started`, format, maximum logical frames, activation timestamp, and stop reason.

- [ ] **Step 4: Add synchronised `AudioEngine` operations**

Add one reusable metadata array and these methods:

```kotlin
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
    diagnosticOutputMetadataBuffer[1] = count.toLong()
    return DiagnosticOutputCaptureDecoder.decodeDrain(diagnosticOutputMetadataBuffer, samples.size)
}

@Synchronized
fun stopDiagnosticOutputCapture() {
    nativeStopDiagnosticOutputCapture()
}

@Synchronized
fun diagnosticOutputStatus(): DiagnosticOutputDrainInfo {
    diagnosticOutputMetadataBuffer.fill(0L)
    nativeGetDiagnosticOutputStatus(diagnosticOutputMetadataBuffer)
    return DiagnosticOutputCaptureDecoder.decodeDrain(diagnosticOutputMetadataBuffer, 0)
}
```

Declare the four native methods with `LongArray` metadata and `FloatArray` samples.

- [ ] **Step 5: Add the native capture instance and callback write**

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

Add `RuntimeDiagnosticOutputCapture diagnosticOutputCapture_{};` to `NativeAudioEngine`. Do not reset it in `clearRealtimeState()`.

In `onAudioReady`, resolve callback format and timestamp once:

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

After limiter application and alongside existing Oboe writes:

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

Before closing a running stream in `stop()` and inside `onErrorAfterClose()`, call `diagnosticOutputCapture_.markAudioStopped()`.

- [ ] **Step 6: Implement JNI metadata operations**

Use this helper outside the callback:

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
    env->SetLongArrayRegion(
        target,
        0,
        static_cast<jsize>(fields.size()),
        fields.data()
    );
}
```

Implement JNI start by calling `diagnosticOutputCapture_.start(currentSampleRate, 2, monotonicNanos())`; drain by capping to `samplesLength / 2`, obtaining float elements, draining, releasing with mode `0`, and writing metadata; stop with `StoppedByUser`; status with a zero-frame `DiagnosticOutputDrainResult` populated from `status()`.

- [ ] **Step 7: Run focused native/Kotlin checks**

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  :app:compileDebugKotlin
```

Expected: host tests, decoder tests, and Kotlin compilation pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add \
  drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp \
  drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt \
  drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt \
  drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt
git commit -m "feat(audio): expose generated output capture"
```

---

### Task 3: Write PCM16 and Finalise a Valid WAV

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt`

**Interfaces:**

```kotlin
internal interface DiagnosticGeneratedOutputSink {
    val framesWritten: Long
    fun writeInterleavedFrames(samples: FloatArray, frameCount: Int, scratch: ByteArray)
    fun writeSilenceFrames(frameCount: Long, scratch: ByteArray)
    fun finish(): File
    fun abort()
}

internal class DiagnosticPcm16WavWriter(
    private val file: File,
    val sampleRate: Int,
    val channelCount: Int = 2,
) : DiagnosticGeneratedOutputSink
```

- [ ] **Step 1: Write byte-exact failing tests**

```kotlin
@Test
fun convertsSamplesToPcm16LittleEndian() {
    val file = File(tempDir, "samples.wav")
    val writer = DiagnosticPcm16WavWriter(file, 48_000)
    writer.writeInterleavedFrames(
        floatArrayOf(-1f, 1f, 0f, Float.NaN, -0.5f, 0.5f),
        frameCount = 3,
        scratch = ByteArray(32),
    )
    writer.finish()

    assertArrayEquals(
        byteArrayOf(
            0x00, 0x80.toByte(), 0xff.toByte(), 0x7f,
            0x00, 0x00, 0x00, 0x00,
            0x00, 0xc0.toByte(), 0x00, 0x40,
        ),
        file.readBytes().copyOfRange(44, 56),
    )
}

@Test
fun saturatesAndZeroesNonFiniteValues() {
    val file = File(tempDir, "saturation.wav")
    val writer = DiagnosticPcm16WavWriter(file, 48_000)
    writer.writeInterleavedFrames(
        floatArrayOf(-2f, 2f, Float.NEGATIVE_INFINITY, Float.POSITIVE_INFINITY),
        frameCount = 2,
        scratch = ByteArray(16),
    )
    writer.finish()
    assertArrayEquals(
        byteArrayOf(0x00, 0x80.toByte(), 0xff.toByte(), 0x7f, 0, 0, 0, 0),
        file.readBytes().copyOfRange(44, 52),
    )
}

@Test
fun writesCorrectStereoHeaderAndSilence() {
    val file = File(tempDir, "header.wav")
    val writer = DiagnosticPcm16WavWriter(file, 48_000)
    writer.writeSilenceFrames(3, ByteArray(8))
    writer.finish()
    val bytes = file.readBytes()
    assertEquals("RIFF", bytes.copyOfRange(0, 4).decodeToString())
    assertEquals("WAVE", bytes.copyOfRange(8, 12).decodeToString())
    assertEquals(48_000, bytes.littleEndianInt(24))
    assertEquals(192_000, bytes.littleEndianInt(28))
    assertEquals(4, bytes.littleEndianShort(32))
    assertEquals(16, bytes.littleEndianShort(34))
    assertEquals(12, bytes.littleEndianInt(40))
    assertEquals(56, bytes.size)
    assertTrue(bytes.copyOfRange(44, 56).all { it == 0.toByte() })
}

@Test
fun rejectsIncompleteFramesAndDeletesOnAbort() {
    val file = File(tempDir, "abort.wav")
    val writer = DiagnosticPcm16WavWriter(file, 48_000)
    assertThrows(IllegalArgumentException::class.java) {
        writer.writeInterleavedFrames(floatArrayOf(0f, 0f), 2, ByteArray(16))
    }
    writer.abort()
    assertFalse(file.exists())
}
```

Add test-local `littleEndianInt` and `littleEndianShort` helpers using unsigned byte masks.

- [ ] **Step 2: Run the tests and confirm failure**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticPcm16WavWriterTest
```

Expected: Kotlin compilation fails because the writer does not exist.

- [ ] **Step 3: Implement the seekable writer**

Use `RandomAccessFile`, reserve 44 bytes, and convert with:

```kotlin
private fun pcm16(value: Float): Short = when {
    !value.isFinite() -> 0
    value <= -1f -> Short.MIN_VALUE
    value >= 1f -> Short.MAX_VALUE
    else -> (value * Short.MAX_VALUE.toFloat()).roundToInt().toShort()
}
```

Write only complete stereo frames. Flush scratch chunks whenever fewer than four bytes remain. `writeSilenceFrames` repeatedly writes a zero-filled scratch buffer in whole-frame multiples. Track `dataBytesWritten` only after successful writes.

`finish()` must:

1. reject `dataBytesWritten > 0xffffffffL`;
2. seek to zero;
3. write `RIFF`, `36 + dataBytesWritten`, `WAVE`, `fmt `, PCM format `1`, channels `2`, sample rate, byte rate `sampleRate * 4`, block align `4`, bits `16`, `data`, and data length in little-endian order;
4. sync and close;
5. return the file;
6. return the same file without rewriting on a repeated call.

`abort()` closes and deletes the file. `close()` delegates to abort unless finalised.

- [ ] **Step 4: Run the writer tests**

Run the focused command from Step 2. Expected: all writer tests pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt
git commit -m "feat(diagnostics): add PCM16 WAV writer"
```

---

### Task 4: Drain, Align, and Classify a Generated-Output Session

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`
- Modify: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt:84-96,216-239`
- Modify: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt`

**Interfaces:**

```kotlin
internal enum class DiagnosticGeneratedOutputResultState(val wireName: String) {
    COMPLETED("completed"),
    PARTIAL("partial"),
    UNAVAILABLE("unavailable"),
    FAILED("failed"),
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
```

- [ ] **Step 1: Preserve monotonic session start with a red-green test**

Add:

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

Run `DiagnosticSessionRecorderTest`; expect failure because the field is absent. Add `startedAtMonotonicNanos: Long` to `DiagnosticSessionCapture` and populate it from `startedAtNanos`. Do not export the absolute monotonic value to JSON. Re-run and expect pass.

- [ ] **Step 2: Create exact fake source and sink fixtures**

In `DiagnosticGeneratedOutputRecorderTest.kt` define:

```kotlin
private data class FakeRun(
    val samples: FloatArray,
    val info: DiagnosticOutputDrainInfo,
)

private class FakeSource(
    private val startResult: DiagnosticOutputStartResult,
    runs: List<FakeRun>,
) : DiagnosticOutputCaptureSource {
    private val queue = ArrayDeque(runs)
    val calls = mutableListOf<String>()

    override fun start(): DiagnosticOutputStartResult {
        calls += "start"
        return startResult
    }

    override fun drain(samples: FloatArray): DiagnosticOutputDrainInfo {
        calls += "drain"
        val run = queue.removeFirstOrNull() ?: return stoppedEmptyInfo(startResult)
        run.samples.copyInto(samples)
        return run.info
    }

    override fun stop() {
        calls += "stop"
    }

    override fun status(): DiagnosticOutputDrainInfo = stoppedEmptyInfo(startResult)
}

private class FakeSink(private val file: File) : DiagnosticGeneratedOutputSink {
    val operations = mutableListOf<String>()
    var representedFrames = 0L
    override val framesWritten: Long get() = representedFrames

    override fun writeInterleavedFrames(samples: FloatArray, frameCount: Int, scratch: ByteArray) {
        operations += "audio:$frameCount"
        representedFrames += frameCount
    }

    override fun writeSilenceFrames(frameCount: Long, scratch: ByteArray) {
        operations += "silence:$frameCount"
        representedFrames += frameCount
    }

    override fun finish(): File {
        operations += "finish"
        file.writeBytes(byteArrayOf(1))
        return file
    }

    override fun abort() {
        operations += "abort"
        file.delete()
    }
}
```

Define `started(rate = 48_000)` and `drainInfo(...)` test helpers that fill every constructor field explicitly. `stoppedEmptyInfo` returns `STOPPED`, `STOPPED_BY_USER`, zero returned frames, and `bufferedFramesRemain = false`.

- [ ] **Step 3: Write recorder behaviour tests**

```kotlin
@Test
fun writesAudioAndSilenceInLogicalOrder() {
    val source = FakeSource(
        started(),
        listOf(
            FakeRun(floatArrayOf(0.1f, 0.2f), drainInfo(first = 0, returned = 1, logical = 1)),
            FakeRun(
                floatArrayOf(0.3f, 0.4f),
                drainInfo(first = 3, returned = 1, logical = 4, captured = 2, dropped = 2),
            ),
        ),
    )
    val sink = FakeSink(File(tempDir, "capture.wav"))
    val recorder = recorder(source, sink)
    recorder.prepare(tempDir)
    recorder.start()
    recorder.drainAvailable()
    recorder.drainAvailable()
    recorder.requestStop()
    val result = recorder.finish(1_000L)

    assertEquals(listOf("audio:1", "silence:2", "audio:1", "finish"), sink.operations)
    assertEquals(4L, result.logicalFrames)
    assertEquals(2L, result.silenceSubstitutionFrames)
    assertEquals(PARTIAL, result.resultState)
}

@Test
fun disablesProducerBeforeFinalDrain() {
    val source = FakeSource(started(), emptyList())
    val sink = FakeSink(File(tempDir, "order.wav"))
    val recorder = recorder(source, sink)
    recorder.prepare(tempDir)
    recorder.start()
    recorder.requestStop()
    recorder.finish(1_000L)
    assertEquals(listOf("start", "stop", "drain"), source.calls.take(3))
}

@Test
fun classifiesNormalAndPartialStops() {
    val cases = listOf(
        STOPPED_BY_USER to COMPLETED,
        DURATION_LIMIT to PARTIAL,
        FORMAT_CHANGED to PARTIAL,
        AUDIO_STOPPED to PARTIAL,
    )
    cases.forEach { (reason, expected) ->
        val source = sourceWithOneFrame(reason)
        val sink = FakeSink(File(tempDir, "$reason.wav"))
        val recorder = recorder(source, sink)
        recorder.prepare(tempDir)
        recorder.start()
        recorder.drainAvailable()
        recorder.requestStop()
        assertEquals(expected, recorder.finish(1_000L).resultState)
    }
}

@Test
fun returnsUnavailableWhenStartFails() {
    val source = FakeSource(
        DiagnosticOutputStartResult(false, 0, 0, 0, null, START_FAILED),
        emptyList(),
    )
    val sink = FakeSink(File(tempDir, "unavailable.wav"))
    val recorder = recorder(source, sink)
    recorder.prepare(tempDir)
    recorder.start()
    val result = recorder.finish(1_000L)
    assertEquals(UNAVAILABLE, result.resultState)
    assertNull(result.wavFile)
    assertTrue("abort" in sink.operations)
}

@Test
fun computesSessionOffset() {
    val source = sourceWithFirstFrameTimestamp(1_500L)
    val sink = FakeSink(File(tempDir, "offset.wav"))
    val recorder = recorder(source, sink)
    recorder.prepare(tempDir)
    recorder.start()
    recorder.drainAvailable()
    recorder.requestStop()
    assertEquals(500L, recorder.finish(1_000L).sessionStartOffsetNanos)
}
```

Add two more exact tests:

```kotlin
@Test
fun returnsFailedWhenSinkWriteThrows() {
    val sink = object : DiagnosticGeneratedOutputSink {
        override val framesWritten = 0L
        override fun writeInterleavedFrames(samples: FloatArray, frameCount: Int, scratch: ByteArray) {
            error("write failed")
        }
        override fun writeSilenceFrames(frameCount: Long, scratch: ByteArray) = Unit
        override fun finish(): File = error("finish must not run")
        override fun abort() = Unit
    }
    val recorder = recorder(sourceWithOneFrame(STOPPED_BY_USER), sink)
    recorder.prepare(tempDir)
    recorder.start()
    recorder.drainAvailable()
    val result = recorder.finish(1_000L)
    assertEquals(FAILED, result.resultState)
    assertEquals("write failed", result.failureReason)
}

@Test
fun cancelStopsAndAborts() {
    val source = FakeSource(started(), emptyList())
    val sink = FakeSink(File(tempDir, "cancel.wav"))
    val recorder = recorder(source, sink)
    recorder.prepare(tempDir)
    recorder.start()
    recorder.cancel()
    assertTrue("stop" in source.calls)
    assertTrue("abort" in sink.operations)
}
```

- [ ] **Step 4: Run the recorder tests and confirm failure**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputRecorderTest
```

Expected: Kotlin compilation fails because recorder types do not exist.

- [ ] **Step 5: Implement recorder state and fixed buffers**

Use:

```kotlin
private const val OutputDrainFrames = 4_096
private const val FinalDrainNoProgressLimit = 1_000
private val floatBuffer = FloatArray(OutputDrainFrames * 2)
private val byteBuffer = ByteArray(OutputDrainFrames * 4)
private var nextExpectedLogicalFrame = 0L
private var silenceSubstitutionFrames = 0L
```

Constructor dependencies:

```kotlin
internal class DiagnosticGeneratedOutputRecorder(
    private val source: DiagnosticOutputCaptureSource = AudioEngineDiagnosticOutputCaptureSource,
    private val sinkFactory: (File, Int) -> DiagnosticGeneratedOutputSink =
        { file, rate -> DiagnosticPcm16WavWriter(file, rate) },
    private val sessionIdFactory: () -> String = { UUID.randomUUID().toString() },
)
```

`prepare(outputDirectory)` creates directories and records a sibling path named `generated-output-<id>.wav.tmp`; it catches file errors and records an unavailable reason. `start()` calls the native source, constructs the sink using the authoritative native sample rate, and stops/deletes on sink creation failure.

`drainAvailable()` must execute:

```kotlin
val info = source.drain(floatBuffer)
if (info.returnedFrames > 0) {
    val first = checkNotNull(info.firstLogicalFrame)
    check(first >= nextExpectedLogicalFrame) {
        "diagnostic output logical frame order regressed"
    }
    val gap = first - nextExpectedLogicalFrame
    if (gap > 0) {
        sink.writeSilenceFrames(gap, byteBuffer)
        silenceSubstitutionFrames += gap
    }
    sink.writeInterleavedFrames(floatBuffer, info.returnedFrames, byteBuffer)
    nextExpectedLogicalFrame = first + info.returnedFrames
}
latestInfo = info
return info
```

`finish(sessionStart)` calls `requestStop()` idempotently, then drains until `producerState == STOPPED`, `returnedFrames == 0`, and `bufferedFramesRemain == false`. Fail after 1,000 consecutive empty results that still claim buffered data. Classify:

- `COMPLETED` only for valid WAV + `STOPPED_BY_USER` + zero dropped frames;
- `PARTIAL` for valid WAV + duration limit, format change, audio stop, or any dropped frames;
- `UNAVAILABLE` for preparation/start failure or zero represented frames;
- `FAILED` for order, write, no-progress, or finalisation failure.

Always calculate `sessionStartOffsetNanos = firstCapturedFrameMonotonicNanos - sessionStart` when a first timestamp exists. Preserve negative values rather than clamping.

- [ ] **Step 6: Run recorder and session tests**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputRecorderTest \
  --tests com.vitautas.drumkit.DiagnosticSessionRecorderTest
```

Expected: both test classes pass.

- [ ] **Step 7: Commit Task 4**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt
git commit -m "feat(diagnostics): record generated output timeline"
```

---

### Task 5: Stream the WAV into the Final Diagnostic ZIP

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt`

**Interface:**

```kotlin
internal object DiagnosticGeneratedOutputBundleAugmenter {
    fun augmentBundle(bundle: File, capture: DiagnosticGeneratedOutputCapture)
}
```

- [ ] **Step 1: Write complete ZIP test fixtures**

Define a source bundle helper that writes these entries in order:

```kotlin
private fun createSourceBundle(directory: File): File {
    val file = File(directory, "source.zip")
    val manifest = """
        {
          "schemaVersion": 2,
          "sessionId": "test",
          "bundleState": "step_1_2_performance_trace_partial",
          "includedFiles": ["session.json", "touch-events.jsonl", "strikes.jsonl", "audio-diagnostics.csv", "performance.csv", "markers.json", "summary.txt", "checksums.sha256"],
          "plannedFilesNotYetImplemented": ["generated-output.wav"],
          "droppedData": {"performanceSamples": 0}
        }
    """.trimIndent()
    val entries = linkedMapOf(
        "manifest.json" to manifest.toByteArray(),
        "session.json" to "{}".toByteArray(),
        "performance.csv" to "schema_version\n1\n".toByteArray(),
        "unknown-future.txt" to "retain-me".toByteArray(),
        "summary.txt" to "Generated-output WAV capture is not yet implemented.\n".toByteArray(),
        "checksums.sha256" to "old".toByteArray(),
    )
    ZipOutputStream(file.outputStream()).use { zip ->
        entries.forEach { (name, bytes) ->
            zip.putNextEntry(ZipEntry(name))
            zip.write(bytes)
            zip.closeEntry()
        }
    }
    return file
}
```

Define `assertChecksumsMatch` by parsing every non-blank checksum line into hash/name, reading that ZIP entry, calculating SHA-256, and asserting equality.

- [ ] **Step 2: Write successful, partial, and unavailable tests**

```kotlin
@Test
fun addsWavMetadataSummaryAndChecksums() {
    val bundle = createSourceBundle(tempDir)
    val wav = File(tempDir, "generated.wav").apply { writeBytes(ByteArray(2 * 1024 * 1024) { 7 }) }
    val capture = capture(
        wavFile = wav,
        resultState = COMPLETED,
        stopReason = STOPPED_BY_USER,
        logicalFrames = 48000,
        capturedFrames = 48000,
    )

    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(bundle, capture)

    ZipFile(bundle).use { zip ->
        assertEquals(wav.length(), zip.getEntry("generated-output.wav").size)
        assertEquals("retain-me", zip.readUtf8("unknown-future.txt"))
        val manifest = zip.readUtf8("manifest.json")
        assertTrue(manifest.contains("step_1_2_generated_output_partial"))
        assertTrue(manifest.contains("\"plannedFilesNotYetImplemented\": []"))
        assertTrue(manifest.contains("\"resultState\": \"completed\""))
        assertTrue(manifest.contains("\"generated-output.wav\""))
        val summary = zip.readUtf8("summary.txt")
        assertTrue(summary.contains("Generated output result: completed"))
        assertTrue(summary.contains("Generated output logical frames: 48000"))
        assertChecksumsMatch(zip)
    }
}

@Test
fun includesPartialWavAndExactStopReason() {
    val bundle = createSourceBundle(tempDir)
    val wav = File(tempDir, "partial.wav").apply { writeBytes(ByteArray(44)) }
    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(
        bundle,
        capture(wav, PARTIAL, FORMAT_CHANGED, logicalFrames = 100, capturedFrames = 100),
    )
    ZipFile(bundle).use { zip ->
        assertNotNull(zip.getEntry("generated-output.wav"))
        assertTrue(zip.readUtf8("manifest.json").contains("\"stopReason\": \"format_changed\""))
        assertChecksumsMatch(zip)
    }
}

@Test
fun recordsUnavailableWithoutWav() {
    val bundle = createSourceBundle(tempDir)
    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(
        bundle,
        capture(null, UNAVAILABLE, START_FAILED, failureReason = "temporary storage unavailable"),
    )
    ZipFile(bundle).use { zip ->
        assertNull(zip.getEntry("generated-output.wav"))
        val manifest = zip.readUtf8("manifest.json")
        assertTrue(manifest.contains("\"plannedFilesNotYetImplemented\": []"))
        assertTrue(manifest.contains("\"resultState\": \"unavailable\""))
        assertTrue(manifest.contains("temporary storage unavailable"))
        assertChecksumsMatch(zip)
    }
}
```

Add a failure test that passes a directory instead of a valid WAV file, expects an exception, then verifies the original source bundle still contains `unknown-future.txt` and no temporary sibling remains.

- [ ] **Step 3: Run the tests and confirm failure**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputBundleAugmenterTest
```

Expected: Kotlin compilation fails because the augmenter does not exist.

- [ ] **Step 4: Implement a streaming final rewrite**

Use this exact digesting copy primitive:

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
    return total to digest.digest().joinToString("") { byte -> "%02x".format(byte) }
}
```

Algorithm:

1. Open the current ZIP and read only `manifest.json` and `summary.txt` as UTF-8 strings.
2. Transform bundle state to `step_1_2_generated_output_partial`.
3. Add `generated-output.wav` to `includedFiles` only when `capture.wavFile?.isFile == true`.
4. Replace the planned list containing only generated output with `[]`.
5. Insert a JSON-escaped `generatedOutput` object before `droppedData`, containing every field from `DiagnosticGeneratedOutputCapture` plus `durationNanos = logicalFrames * 1_000_000_000 / sampleRate` when sample rate is positive.
6. Create `.<bundle-name>.generated-output.tmp`.
7. Write transformed manifest, then copy every existing entry except manifest, summary, old checksums, and old generated WAV through `copyWithSha256`.
8. Stream `capture.wavFile` through `copyWithSha256`; never call `readBytes()` on it.
9. Write transformed summary through the digest helper.
10. Write the new checksum text last.
11. Atomically replace the original, with non-atomic replace fallback matching existing augmenters.
12. On failure delete the temporary ZIP and leave the original unchanged.

Summary lines must include result state, stop reason, duration, format, logical/captured/dropped/silence frames, first-frame session offset, and failure reason when present.

- [ ] **Step 5: Run bundle regression tests**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputBundleAugmenterTest \
  --tests com.vitautas.drumkit.DiagnosticSessionBundleRecorderTest \
  --tests com.vitautas.drumkit.DiagnosticPerformanceRecorderTest
```

Expected: all selected tests pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt
git commit -m "feat(diagnostics): add generated output to bundles"
```

---

### Task 6: Integrate Capture into the Diagnostic Screen

**Files:**
- Modify: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt:56-330`
- Test: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`

- [ ] **Step 1: Add ordering tests before editing Compose**

Use the Task 4 fake source to add:

```kotlin
@Test
fun liveDrainsCanRepeatBeforeStop() {
    val source = FakeSource(
        started(),
        listOf(
            FakeRun(floatArrayOf(0.1f, 0.2f), drainInfo(first = 0, returned = 1, logical = 1)),
            FakeRun(floatArrayOf(), drainInfo(first = null, returned = 0, logical = 1)),
        ),
    )
    val sink = FakeSink(File(tempDir, "live.wav"))
    val recorder = recorder(source, sink)
    recorder.prepare(tempDir)
    recorder.start()
    recorder.drainAvailable()
    recorder.drainAvailable()
    assertEquals(2, source.calls.count { it == "drain" })
}
```

Run `DiagnosticGeneratedOutputRecorderTest`; expect pass. This locks the API used by Compose.

- [ ] **Step 2: Add screen state without adding controls**

Add:

```kotlin
val generatedOutputRecorder = remember { DiagnosticGeneratedOutputRecorder() }
var isStarting by remember { mutableStateOf(false) }
var generatedOutputStatus by remember { mutableStateOf<String?>(null) }
```

Include `!isStarting` in the existing button enabled expression. Use the existing status label; do not add a new button or panel.

- [ ] **Step 3: Prepare before starting diagnostic clocks, then start native capture**

Replace the non-recording branch with a coroutine that performs:

```kotlin
isStarting = true
status = "Preparing generated-output capture"
scope.launch {
    runCatching {
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
        val outputStart = withContext(Dispatchers.IO) {
            generatedOutputRecorder.start(preparation)
        }
        recorder.recordAudioDiagnostics(diagnostics)
        isRecording = true
        generatedOutputStatus = if (outputStart.started) {
            "Output capture active"
        } else {
            "Output capture unavailable"
        }
        status = "Recording ${sessionId.take(8)}"
    }.onFailure { failure ->
        generatedOutputRecorder.cancel()
        if (performanceRecorder.isRecording) performanceRecorder.cancel()
        if (recorder.isRecording) recorder.cancel()
        status = "Diagnostic start failed: ${failure.message ?: failure::class.java.simpleName}"
    }
    isStarting = false
}
```

`DiagnosticGeneratedOutputPreparation` is the exact type returned by `prepare` in Task 4; `start(preparation)` must not infer a different pending file.

- [ ] **Step 4: Drain during the existing 50 ms poll loop**

Before each existing `delay(NativeOutcomePollIntervalMillis)`:

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

The ring contains about 341 ms at 96 kHz, so 50 ms live draining leaves more than six polling intervals of transport capacity.

- [ ] **Step 5: Stop producer first and augment last**

At the start of the recording stop branch:

```kotlin
generatedOutputRecorder.requestStop()
val capture = recorder.stop()
val performanceCapture = performanceRecorder.stop()
```

Inside the export coroutine, before base export:

```kotlin
val generatedOutputCapture = withContext(Dispatchers.IO) {
    generatedOutputRecorder.finish(capture.baseCapture.startedAtMonotonicNanos)
}
```

After dispatch and performance augmentation:

```kotlin
DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(
    bundle = result.file,
    capture = generatedOutputCapture,
)
```

This augmenter runs last so its checksum file covers all earlier entries and the WAV.

- [ ] **Step 6: Keep status compact and reset it**

Render:

```kotlin
val visibleStatus = listOfNotNull(status, generatedOutputStatus).joinToString(" · ")
Text(text = visibleStatus, style = MaterialTheme.typography.labelSmall, /* existing modifier and colour */)
```

Clear `generatedOutputStatus` after successful export, cancellation, or terminal start failure.

- [ ] **Step 7: Run app tests and compilation**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  :app:compileDebugKotlin
```

Expected: all app tests pass and Compose compilation succeeds.

- [ ] **Step 8: Commit Task 6**

```bash
git add \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt
git commit -m "feat(diagnostics): integrate generated output capture"
```

---

### Task 7: Documentation, Full Validation, APK, and Physical Handoff

**Files:**
- Modify: `drum-kit-android/README.md:9-90`
- Modify: `drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md:4-8,63 onward`
- Modify: PR #10 body after automated validation

- [ ] **Step 1: Document implemented behaviour without overstating acceptance**

README must state:

- normal diagnostic sessions include post-room/post-master/post-limiter PCM16 WAV output;
- native capture uses a bounded 32,768-frame ring;
- Kotlin writes through cache storage outside the callback;
- dropped capture frames become silence and are counted;
- ten-minute, format-change, and audio-stop cases produce partial WAVs;
- capture failure does not stop playing or the remaining ZIP export.

Roadmap status must include:

```markdown
- **Generated-output capture — implemented and automated-validated, physical review pending:** the diagnostic ZIP now includes a checksum-covered PCM16 WAV for normal sessions. Native capture is bounded and real-time safe; overflow, duration-limit, format-change, audio-stop, and file-failure states are explicit. Physical playback/timing and underrun validation remain required before this Step 1.2 slice is fully accepted.
```

Do not mark Step 1.2 complete.

- [ ] **Step 2: Run narrow validation first**

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  :app:testDebugUnitTest
```

Expected: host native tests and focused JVM tests pass.

- [ ] **Step 3: Run the complete project checks**

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

- [ ] **Step 4: Perform the real-time source inspection**

Record evidence for each item:

```text
onAudioReady uses only atomic capture operations and preallocated slots
onAudioReady opens no file and creates no container
onAudioReady takes no mutex and performs no JNI call
onAudioReady performs no PCM integer conversion
clearRealtimeState does not erase buffered output capture
all WAV and ZIP methods are invoked from Dispatchers.IO
generated-output augmentation runs after dispatch and performance augmentation
generated-output.wav is streamed and never loaded through readBytes()
```

- [ ] **Step 5: Commit documentation**

```bash
git add \
  drum-kit-android/README.md \
  drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md
git commit -m "docs: record generated output capture status"
```

- [ ] **Step 6: Verify exact-head GitHub Actions**

Inspect Drum Kit Quick Check, Android Validation including the new host C++ step, and Android Lint. For a failure, invoke `superpowers:systematic-debugging`, inspect the failing job log, and change only generated-output files.

- [ ] **Step 7: Request and verify the exact-head APK**

Apply the repository’s APK-request label to PR #10. Verify exact-head checkout, snare-bank structure, arm64 native compilation, debug APK assembly, embedded source SHA, and APK/build-log/manifest artifact uploads. Record run number, artifact ID, digest, source SHA, and expiry date.

- [ ] **Step 8: Update PR #10 and keep it draft**

Add generated-output architecture, file/metadata changes, real-time invariants, partial/failure semantics, validation run numbers, artifact details, and an explicit physical-review-pending statement. Do not mark ready, merge, or release.

- [ ] **Step 9: Perform the physical handoff**

Install the exact-head APK and record a 20–30 second phone-speaker session containing kick, snare, cymbals, rapid pedal retriggers, and one marker. Verify:

```text
generated-output.wav exists and opens
format is stereo PCM16
sample rate matches session.json and audio diagnostics
WAV duration equals logicalFrames / sampleRate within one frame
checksums.sha256 matches generated-output.wav
audible strikes align with logged strike/marker timing under sessionStartOffsetNanos
underrun count does not increase
```

Repeat a short Galaxy Buds session to verify honest route/burst metadata. Change route once during a short session and verify a playable partial WAV with `format_changed` or `audio_stopped`, never corruption.

- [ ] **Step 10: Record acceptance accurately**

After reviewing the uploaded bundle, mark generated-output criteria `Met`, `Partially met`, or `Not testable`. Keep Step 1.2 partial because guided diagnostics and recovery/share/deletion work remain. Recommend guided sequence and automatic markers as the next Step 1.2 batch.

---

## Plan Self-Review Checklist

- Every approved design requirement maps to Tasks 1–7.
- Native overflow exposes exact gaps through per-slot logical indices and contiguous-run drains.
- Native producer state, native stop reason, and Kotlin final result remain distinct.
- The WAV path stores neither ten minutes of audio nor the final WAV in RAM.
- The 96 kHz ten-minute PCM16 payload is approximately 230 MB and below classic RIFF limits.
- The first captured frame offset uses the shared Android monotonic timebase and remains nullable for zero-frame captures.
- The final ZIP augmenter runs last and recomputes checksums for all retained and new entries.
- No task starts a second roadmap step or implements another deferred Step 1.2 slice.
