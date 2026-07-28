# Generated Output Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a checksum-covered `generated-output.wav` to normal Step 1.2 diagnostic bundles by capturing the native post-room, post-master, post-limiter stereo output without compromising the real-time audio callback.

**Architecture:** A platform-neutral, fixed-capacity native SPSC ring stores complete stereo float frames with logical frame indices. Kotlin drains contiguous runs through bounded JNI calls and writes PCM16 to a seekable cache file on `Dispatchers.IO`. A final streaming ZIP rewrite adds the WAV, capture metadata, summary text, and fresh checksums. Capture failure never stops playing or the remaining diagnostic export.

**Tech Stack:** C++20, Oboe, JNI, Kotlin/JVM, Android API 26+, `RandomAccessFile`, existing Kotlin coroutines, JUnit 4, Gradle 9.5.0, Android Gradle Plugin 9.3.x, GitHub Actions.

## Global Constraints

- Work only within roadmap Step 1.2 generated-output capture.
- Do not begin guided diagnostics, lifecycle recovery, sharing/deletion, malformed-session recovery, or Step 2.1 velocity estimation.
- Capture the exact stereo samples after room processing, master gain, and `applyPeakLimiter()`.
- Keep `onAudioReady()` free of file I/O, heap allocation, locks, logging, JNI calls, blocking waits, and float-to-integer conversion.
- Use one fixed 32,768-frame native ring. Each slot stores one `uint64_t` logical frame index and two `float` samples.
- Limit the logical capture timeline to `sampleRate * 600` frames.
- Export stereo signed 16-bit little-endian PCM in a classic 44-byte RIFF/WAVE file.
- Represent capture overflow as silence, preserving logical duration and timestamp alignment.
- Stop capture at the first format change and finalise one valid partial WAV.
- Do not resample, stitch segments, create multiple WAVs, add RF64, add a production recorder, or add a primary control.
- Preserve PR #10 as draft. Do not merge or release.

---

## File Map

### Native and engine-audio

- Create `drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h`.
- Create `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp`.
- Create `drum-kit-android/tools/test_diagnostic_output_capture.sh`.
- Modify `.github/workflows/drum-kit-android-validation.yml`.
- Modify `drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp`.
- Create `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt`.
- Create `drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt`.
- Modify `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt`.

### App capture, WAV, and bundle

- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt`.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt`.
- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt`.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`.
- Modify `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt`.
- Modify `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt`.
- Create `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt`.
- Create `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt`.
- Modify `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt`.
- Modify `drum-kit-android/README.md` and `drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md` after validation.

---

### Task 1: Implement and Host-Test the Native Ring

**Files:**
- Create: `drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h`
- Create: `drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp`
- Create: `drum-kit-android/tools/test_diagnostic_output_capture.sh`
- Modify: `.github/workflows/drum-kit-android-validation.yml:37-70`

**Produces:**

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

struct DiagnosticOutputStatus {
    DiagnosticOutputProducerState state;
    DiagnosticOutputStopReason stopReason;
    int32_t sampleRate;
    int32_t channelCount;
    uint64_t maximumLogicalFrames;
    uint64_t logicalFrames;
    uint64_t capturedFrames;
    uint64_t droppedFrames;
    int64_t activationNanos;
    int64_t firstCapturedFrameNanos;
    bool bufferedFramesRemain;
};

struct DiagnosticOutputDrainResult : DiagnosticOutputStatus {
    uint64_t firstLogicalFrame;
    size_t frameCount;
};
```

- [ ] **Step 1: Write the failing host test**

Create a dependency-free executable with these exact assertions:

```cpp
void testInitialState() {
    DiagnosticOutputCapture<4> capture;
    const auto status = capture.status();
    require(status.state == DiagnosticOutputProducerState::Idle, "initial state");
    require(status.stopReason == DiagnosticOutputStopReason::None, "initial reason");
    require(!status.bufferedFramesRemain, "initial buffer");
}

void testInvalidStart() {
    DiagnosticOutputCapture<4> zeroRate;
    require(!zeroRate.start(0, 2, 10), "zero rate rejected");
    require(zeroRate.status().stopReason == DiagnosticOutputStopReason::StartFailed, "failure reason");

    DiagnosticOutputCapture<4> mono;
    require(!mono.start(48000, 1, 10), "mono rejected");
}

void testContiguousDrain() {
    DiagnosticOutputCapture<4> capture;
    require(capture.start(48000, 2, 1000), "start");
    capture.writeFrame(0.25f, -0.25f, 48000, 2, 1100);
    capture.writeFrame(0.50f, -0.50f, 48000, 2, 1200);
    float output[8]{};
    const auto result = capture.drain(output, 4);
    require(result.frameCount == 2, "count");
    require(result.firstLogicalFrame == 0, "first index");
    requireNear(output[0], 0.25f, "left one");
    requireNear(output[3], -0.50f, "right two");
    require(result.firstCapturedFrameNanos == 1100, "first timestamp");
}

void testOverflowExposesGap() {
    DiagnosticOutputCapture<2> capture;
    require(capture.start(48000, 2, 10), "start");
    capture.writeFrame(0.1f, 0.2f, 48000, 2, 11);
    capture.writeFrame(0.3f, 0.4f, 48000, 2, 12);
    capture.writeFrame(0.5f, 0.6f, 48000, 2, 13);
    float first[4]{};
    const auto firstRun = capture.drain(first, 2);
    require(firstRun.droppedFrames == 1, "drop count");
    capture.writeFrame(0.7f, 0.8f, 48000, 2, 14);
    float second[4]{};
    const auto secondRun = capture.drain(second, 2);
    require(secondRun.frameCount == 1, "post-gap count");
    require(secondRun.firstLogicalFrame == 3, "gap index");
    require(secondRun.logicalFrames == 4, "logical count");
    require(secondRun.capturedFrames == 3, "captured count");
}

void testWrapAround() {
    DiagnosticOutputCapture<3> capture;
    require(capture.start(48000, 2, 10), "start");
    for (int index = 0; index < 3; ++index) {
        capture.writeFrame(index + 0.1f, index + 0.2f, 48000, 2, 20 + index);
    }
    float first[4]{};
    require(capture.drain(first, 2).frameCount == 2, "partial drain");
    capture.writeFrame(3.1f, 3.2f, 48000, 2, 30);
    capture.writeFrame(4.1f, 4.2f, 48000, 2, 31);
    float second[8]{};
    const auto result = capture.drain(second, 4);
    require(result.frameCount == 3, "wrapped count");
    require(result.firstLogicalFrame == 2, "wrapped first");
    requireNear(second[0], 2.1f, "oldest");
    requireNear(second[4], 4.1f, "newest");
}

void testDurationFormatAndAudioStops() {
    DiagnosticOutputCapture<8> duration;
    require(duration.startForMaximumFramesForTest(48000, 2, 100, 3), "duration start");
    duration.writeFrame(0, 0, 48000, 2, 101);
    duration.writeFrame(0, 0, 48000, 2, 102);
    duration.writeFrame(0, 0, 48000, 2, 103);
    duration.writeFrame(0, 0, 48000, 2, 104);
    require(duration.status().stopReason == DiagnosticOutputStopReason::DurationLimit, "duration reason");
    require(duration.status().logicalFrames == 3, "duration frames");

    DiagnosticOutputCapture<8> format;
    require(format.start(48000, 2, 100), "format start");
    format.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    format.writeFrame(0.3f, 0.4f, 96000, 2, 102);
    float output[16]{};
    const auto formatResult = format.drain(output, 8);
    require(formatResult.frameCount == 1, "new format omitted");
    require(formatResult.stopReason == DiagnosticOutputStopReason::FormatChanged, "format reason");

    DiagnosticOutputCapture<8> stopped;
    require(stopped.start(48000, 2, 100), "audio start");
    stopped.writeFrame(0.1f, 0.2f, 48000, 2, 101);
    stopped.markAudioStopped();
    stopped.stop(DiagnosticOutputStopReason::StoppedByUser);
    require(stopped.status().stopReason == DiagnosticOutputStopReason::AudioStopped, "first reason wins");
    require(stopped.status().bufferedFramesRemain, "buffer retained");
}
```

The file must define `require`, `requireNear`, call all six tests from `main`, print `diagnostic-output-capture tests passed`, and return `0`.

- [ ] **Step 2: Prove the red state**

```bash
cd drum-kit-android
mkdir -p build/native-tests
c++ -std=c++20 -Wall -Wextra -Werror -pthread \
  -Iengine-audio/src/main/cpp \
  engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp \
  -o build/native-tests/diagnostic-output-capture-test
```

Expected: compilation fails because the header does not exist.

- [ ] **Step 3: Implement the ring**

Use a header-only `template <size_t CapacityFrames>` with:

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
std::atomic<int64_t> firstCapturedFrameNanos_{-1};
std::atomic<DiagnosticOutputProducerState> state_{DiagnosticOutputProducerState::Idle};
std::atomic<DiagnosticOutputStopReason> stopReason_{DiagnosticOutputStopReason::None};
int32_t sampleRate_ = 0;
int32_t channelCount_ = 0;
uint64_t maximumLogicalFrames_ = 0;
int64_t activationNanos_ = -1;
```

Required algorithms:

- `start` rejects invalid format, active capture, or unread previous slots; resets counters; stores format and maximum; then publishes `Capturing` with release semantics.
- `writeFrame` returns unless capturing; stops before storing a mismatched format; advances one logical frame per attempted callback frame; drops without overwriting when `writeSequence - readSequence >= CapacityFrames`; writes slot fields before publishing `writeSequence + 1`; sets first timestamp after the first successful slot; stops after the final allowed logical frame.
- `drain` loads published sequence with acquire semantics; copies only one contiguous logical run; publishes the new read sequence after destination writes.
- `stop` compare-exchanges stop reason from `None`, then publishes `Stopped`; the first terminal reason wins.
- `status` returns all counters, maximum, timestamps, format, and whether unread slots remain.
- Add `bool isCapturing() const` that performs only one atomic state load for the callback fast path.
- Define `using RuntimeDiagnosticOutputCapture = DiagnosticOutputCapture<32768>`.

- [ ] **Step 4: Add the host script and CI step**

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

Add this validation step before Gradle setup:

```yaml
      - name: Run diagnostic output native tests
        shell: bash
        run: bash tools/test_diagnostic_output_capture.sh
```

- [ ] **Step 5: Prove the green state**

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
```

Expected: `diagnostic-output-capture tests passed`.

- [ ] **Step 6: Commit Task 1**

```bash
git add .github/workflows/drum-kit-android-validation.yml \
  drum-kit-android/engine-audio/src/main/cpp/diagnostic-output-capture.h \
  drum-kit-android/engine-audio/src/test/cpp/diagnostic-output-capture-test.cpp \
  drum-kit-android/tools/test_diagnostic_output_capture.sh
git commit -m "test(audio): add bounded diagnostic output ring"
```

---

### Task 2: Define the 13-Field Kotlin/JNI Protocol and Capture Point

**Files:**
- Create: `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt`
- Create: `drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt`
- Modify: `drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt`
- Modify: `drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp`

**Wire order:**

```text
0 firstLogicalFrame (-1 absent)
1 returnedFrames
2 maximumLogicalFrames
3 logicalFrames
4 capturedFrames
5 droppedFrames
6 sampleRate
7 channelCount
8 producerState
9 stopReason
10 activationMonotonicNanos (-1 absent)
11 firstCapturedFrameMonotonicNanos (-1 absent)
12 bufferedFramesRemain (0/1)
```

**Produces:**

```kotlin
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
    val maximumLogicalFrames: Long,
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

- [ ] **Step 1: Write decoder tests**

```kotlin
@Test
fun decodesAllFields() {
    val metadata = longArrayOf(12, 4, 28_800_000, 20, 19, 1, 48_000, 2, 1, 0, 1_000, 1_100, 1)
    val result = DiagnosticOutputCaptureDecoder.decodeDrain(metadata, 16)
    assertEquals(4, result.returnedFrames)
    assertEquals(12L, result.firstLogicalFrame)
    assertEquals(28_800_000L, result.maximumLogicalFrames)
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
fun decodesSentinelsAndStart() {
    val metadata = longArrayOf(-1, 0, 28_800_000, 0, 0, 0, 48_000, 2, 1, 0, 1_000, -1, 0)
    val drain = DiagnosticOutputCaptureDecoder.decodeDrain(metadata, 0)
    assertNull(drain.firstLogicalFrame)
    assertNull(drain.firstCapturedFrameMonotonicNanos)
    val start = DiagnosticOutputCaptureDecoder.decodeStart(true, metadata)
    assertTrue(start.started)
    assertEquals(28_800_000L, start.maximumLogicalFrames)
}

@Test
fun rejectsUnknownEnumsAndInvalidCounts() {
    assertThrows(IllegalStateException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(-1, 0, 0, 0, 0, 0, 48_000, 2, 99, 0, -1, -1, 0),
            0,
        )
    }
    assertThrows(IllegalArgumentException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(0, 5, 10, 5, 5, 0, 48_000, 2, 1, 0, 0, 0, 1),
            8,
        )
    }
    assertThrows(IllegalArgumentException::class.java) {
        DiagnosticOutputCaptureDecoder.decodeDrain(
            longArrayOf(0, 1, 10, -1, 0, 0, 48_000, 2, 1, 0, 0, 0, 1),
            2,
        )
    }
}
```

Also assert exact enum mapping for state values `0..2` and reason values `0..5`.

- [ ] **Step 2: Prove decoder tests fail**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  --tests com.vitautas.drumkit.audio.DiagnosticOutputCaptureDecoderTest
```

Expected: Kotlin compilation fails because protocol types do not exist.

- [ ] **Step 3: Implement models, enums, and strict decoding**

Use `DIAGNOSTIC_OUTPUT_METADATA_FIELD_COUNT = 13`. Enum `fromWire` must throw for unknown values. Decoder validation must reject short metadata, negative maximum/counters, returned frames exceeding `samplesSize / 2`, and non-stereo returned data. Convert only `-1` timestamp/frame sentinels to `null`.

- [ ] **Step 4: Add synchronised `AudioEngine` operations**

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
    require(samples.isNotEmpty() && samples.size % 2 == 0)
    diagnosticOutputMetadataBuffer.fill(0L)
    val count = nativeDrainDiagnosticOutput(samples, diagnosticOutputMetadataBuffer)
    check(count >= 0)
    diagnosticOutputMetadataBuffer[1] = count.toLong()
    return DiagnosticOutputCaptureDecoder.decodeDrain(diagnosticOutputMetadataBuffer, samples.size)
}

@Synchronized
fun stopDiagnosticOutputCapture() = nativeStopDiagnosticOutputCapture()

@Synchronized
fun diagnosticOutputStatus(): DiagnosticOutputDrainInfo {
    diagnosticOutputMetadataBuffer.fill(0L)
    nativeGetDiagnosticOutputStatus(diagnosticOutputMetadataBuffer)
    return DiagnosticOutputCaptureDecoder.decodeDrain(diagnosticOutputMetadataBuffer, 0)
}
```

Declare four native methods matching these arrays.

- [ ] **Step 5: Integrate the native capture point**

Add `RuntimeDiagnosticOutputCapture diagnosticOutputCapture_{}` and a `clock_gettime(CLOCK_MONOTONIC)` helper. Do not clear capture in `clearRealtimeState()`.

In `onAudioReady`, call only `diagnosticOutputCapture_.isCapturing()` for the fast-path check, resolve sample rate/channel count once, and obtain one monotonic callback timestamp when active. After limiter application:

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

Call `markAudioStopped()` before stream closure in `stop()` and `onErrorAfterClose()`.

- [ ] **Step 6: Implement JNI metadata writing**

Write all 13 fields in the documented order. JNI start calls `start(currentSampleRate, 2, monotonicNanos())`; drain caps frames to `floatArrayLength / 2`, drains outside the callback, releases the array with mode `0`, and writes metadata; stop uses `StoppedByUser`; status converts `status()` to a zero-frame drain result. Invalid arrays return failure without modifying audio.

- [ ] **Step 7: Run focused checks**

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  :app:compileDebugKotlin
```

Expected: pass.

- [ ] **Step 8: Commit Task 2**

```bash
git add drum-kit-android/engine-audio/src/main/cpp/sampled-audio-engine.cpp \
  drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/AudioEngine.kt \
  drum-kit-android/engine-audio/src/main/java/com/vitautas/drumkit/audio/DiagnosticOutputCapture.kt \
  drum-kit-android/engine-audio/src/test/java/com/vitautas/drumkit/audio/DiagnosticOutputCaptureDecoderTest.kt
git commit -m "feat(audio): expose generated output capture"
```

---

### Task 3: Implement Byte-Exact PCM16 WAV Persistence

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt`

**Produces:**

```kotlin
internal interface DiagnosticGeneratedOutputSink {
    val framesWritten: Long
    fun writeInterleavedFrames(samples: FloatArray, frameCount: Int, scratch: ByteArray)
    fun writeSilenceFrames(frameCount: Long, scratch: ByteArray)
    fun finish(): File
    fun abort()
}
```

- [ ] **Step 1: Write failing tests**

```kotlin
@Test
fun convertsAndSaturatesSamples() {
    val file = File(tempDir, "samples.wav")
    val writer = DiagnosticPcm16WavWriter(file, 48_000)
    writer.writeInterleavedFrames(
        floatArrayOf(-1f, 1f, 0f, Float.NaN, -0.5f, 0.5f, -2f, 2f),
        4,
        ByteArray(32),
    )
    writer.finish()
    assertArrayEquals(
        byteArrayOf(
            0x00, 0x80.toByte(), 0xff.toByte(), 0x7f,
            0, 0, 0, 0,
            0x00, 0xc0.toByte(), 0x00, 0x40,
            0x00, 0x80.toByte(), 0xff.toByte(), 0x7f,
        ),
        file.readBytes().copyOfRange(44, 60),
    )
}

@Test
fun writesHeaderAndChunkedSilence() {
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
    assertTrue(bytes.copyOfRange(44, 56).all { it == 0.toByte() })
}

@Test
fun permitsValidZeroFrameWavAndDeletesOnAbort() {
    val empty = File(tempDir, "empty.wav")
    DiagnosticPcm16WavWriter(empty, 48_000).finish()
    assertEquals(44L, empty.length())

    val aborted = File(tempDir, "aborted.wav")
    DiagnosticPcm16WavWriter(aborted, 48_000).abort()
    assertFalse(aborted.exists())
}
```

Add a test that rejects a frame count requiring more samples than supplied.

- [ ] **Step 2: Prove failure**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticPcm16WavWriterTest
```

Expected: compilation fails because the writer does not exist.

- [ ] **Step 3: Implement writer**

Use `RandomAccessFile`, reserve 44 bytes, and convert with:

```kotlin
private fun pcm16(value: Float): Short = when {
    !value.isFinite() -> 0
    value <= -1f -> Short.MIN_VALUE
    value >= 1f -> Short.MAX_VALUE
    else -> (value * Short.MAX_VALUE.toFloat()).roundToInt().toShort()
}
```

Write only complete stereo frames and whole-frame silence chunks. `finish()` writes PCM format code `1`, two channels, byte rate `sampleRate * 4`, block align `4`, 16 bits, and validated 32-bit RIFF/data sizes. It must produce a valid 44-byte zero-frame WAV, sync/close once, and return the same file on repeated calls. `abort()` closes and deletes.

- [ ] **Step 4: Run tests and commit**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticPcm16WavWriterTest
git add drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticPcm16WavWriter.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticPcm16WavWriterTest.kt
git commit -m "feat(diagnostics): add PCM16 WAV writer"
```

---

### Task 4: Implement Session Draining, Gap Substitution, and Results

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`
- Modify: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt`
- Modify: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt`

**Produces:**

```kotlin
internal sealed interface DiagnosticGeneratedOutputPreparation {
    data class Ready(val temporaryFile: File) : DiagnosticGeneratedOutputPreparation
    data class Unavailable(val reason: String) : DiagnosticGeneratedOutputPreparation
}

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
    val maximumLogicalFrames: Long,
    val logicalFrames: Long,
    val capturedFrames: Long,
    val droppedFrames: Long,
    val silenceSubstitutionFrames: Long,
    val activationMonotonicNanos: Long?,
    val firstCapturedFrameMonotonicNanos: Long?,
    val sessionStartOffsetNanos: Long?,
    val failureReason: String?,
)

internal class DiagnosticGeneratedOutputRecorder {
    fun prepare(outputDirectory: File): DiagnosticGeneratedOutputPreparation
    fun start(preparation: DiagnosticGeneratedOutputPreparation): DiagnosticOutputStartResult
    fun drainAvailable(): DiagnosticOutputDrainInfo
    fun requestStop()
    fun finish(sessionStartedAtMonotonicNanos: Long): DiagnosticGeneratedOutputCapture
    fun cancel()
}
```

- [ ] **Step 1: Preserve monotonic session start**

Add and run:

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

Add `startedAtMonotonicNanos` to `DiagnosticSessionCapture`, populate it from `startedAtNanos`, and keep it out of exported JSON.

- [ ] **Step 2: Create exact fake fixtures**

```kotlin
private data class FakeRun(val samples: FloatArray, val info: DiagnosticOutputDrainInfo)

private class FakeSource(
    private val startResult: DiagnosticOutputStartResult,
    runs: List<FakeRun>,
    private val terminalReason: DiagnosticOutputStopReason = STOPPED_BY_USER,
) : DiagnosticOutputCaptureSource {
    private val queue = ArrayDeque(runs)
    val calls = mutableListOf<String>()

    override fun start(): DiagnosticOutputStartResult = startResult.also { calls += "start" }

    override fun drain(samples: FloatArray): DiagnosticOutputDrainInfo {
        calls += "drain"
        val next = queue.removeFirstOrNull()
        if (next != null) {
            next.samples.copyInto(samples)
            return next.info
        }
        return DiagnosticOutputDrainInfo(
            returnedFrames = 0,
            firstLogicalFrame = null,
            maximumLogicalFrames = startResult.maximumLogicalFrames,
            logicalFrames = 0,
            capturedFrames = 0,
            droppedFrames = 0,
            sampleRate = startResult.sampleRate,
            channelCount = startResult.channelCount,
            producerState = STOPPED,
            stopReason = terminalReason,
            activationMonotonicNanos = startResult.activationMonotonicNanos,
            firstCapturedFrameMonotonicNanos = null,
            bufferedFramesRemain = false,
        )
    }

    override fun stop() { calls += "stop" }
    override fun status(): DiagnosticOutputDrainInfo = drain(FloatArray(2))
}

private class FakeSink(private val file: File) : DiagnosticGeneratedOutputSink {
    val operations = mutableListOf<String>()
    override var framesWritten: Long = 0
        private set
    override fun writeInterleavedFrames(samples: FloatArray, frameCount: Int, scratch: ByteArray) {
        operations += "audio:$frameCount"
        framesWritten += frameCount
    }
    override fun writeSilenceFrames(frameCount: Long, scratch: ByteArray) {
        operations += "silence:$frameCount"
        framesWritten += frameCount
    }
    override fun finish(): File = file.apply {
        operations += "finish"
        writeBytes(byteArrayOf(1))
    }
    override fun abort() {
        operations += "abort"
        file.delete()
    }
}
```

Define `started()` with `started=true`, 48 kHz, stereo, maximum `28_800_000`, activation `1_100`, reason `NONE`. Define `run(first, frames, logical, captured, dropped, firstNanos)` to create an interleaved `FloatArray(frames * 2)` and a capturing `DiagnosticOutputDrainInfo` with every field explicit.

- [ ] **Step 3: Write recorder tests**

```kotlin
@Test
fun substitutesSilenceForExactGap() {
    val source = FakeSource(
        started(),
        listOf(
            run(0, 1, 1, 1, 0, 1_200),
            run(3, 1, 4, 2, 2, 1_200),
        ),
    )
    val sink = FakeSink(File(tempDir, "gap.wav"))
    val recorder = recorder(source, sink)
    val preparation = recorder.prepare(tempDir)
    recorder.start(preparation)
    recorder.drainAvailable()
    recorder.drainAvailable()
    recorder.requestStop()
    val result = recorder.finish(1_000)
    assertEquals(listOf("audio:1", "silence:2", "audio:1", "finish"), sink.operations)
    assertEquals(2L, result.silenceSubstitutionFrames)
    assertEquals(4L, result.logicalFrames)
    assertEquals(PARTIAL, result.resultState)
}

@Test
fun stopPrecedesFinalDrain() {
    val source = FakeSource(started(), emptyList())
    val sink = FakeSink(File(tempDir, "order.wav"))
    val recorder = recorder(source, sink)
    val preparation = recorder.prepare(tempDir)
    recorder.start(preparation)
    recorder.requestStop()
    recorder.finish(1_000)
    assertEquals(listOf("start", "stop", "drain"), source.calls.take(3))
}

@Test
fun validZeroFrameUserStopProducesCompletedWav() {
    val source = FakeSource(started(), emptyList())
    val sink = FakeSink(File(tempDir, "empty.wav"))
    val recorder = recorder(source, sink)
    val preparation = recorder.prepare(tempDir)
    recorder.start(preparation)
    recorder.requestStop()
    val result = recorder.finish(1_000)
    assertEquals(COMPLETED, result.resultState)
    assertNotNull(result.wavFile)
    assertEquals(0L, result.logicalFrames)
}

@Test
fun classifiesTerminalReasons() {
    listOf(DURATION_LIMIT, FORMAT_CHANGED, AUDIO_STOPPED).forEach { reason ->
        val source = FakeSource(started(), listOf(run(0, 1, 1, 1, 0, 1_200)), reason)
        val sink = FakeSink(File(tempDir, "$reason.wav"))
        val recorder = recorder(source, sink)
        val preparation = recorder.prepare(tempDir)
        recorder.start(preparation)
        recorder.drainAvailable()
        recorder.requestStop()
        assertEquals(PARTIAL, recorder.finish(1_000).resultState)
    }
}

@Test
fun startFailureIsUnavailableAndAborts() {
    val failed = DiagnosticOutputStartResult(false, 0, 0, 0, null, START_FAILED)
    val source = FakeSource(failed, emptyList(), START_FAILED)
    val sink = FakeSink(File(tempDir, "failed.wav"))
    val recorder = recorder(source, sink)
    val preparation = recorder.prepare(tempDir)
    recorder.start(preparation)
    val result = recorder.finish(1_000)
    assertEquals(UNAVAILABLE, result.resultState)
    assertNull(result.wavFile)
    assertTrue("abort" in sink.operations)
}

@Test
fun computesSessionOffsetAndCancelsCleanly() {
    val source = FakeSource(started(), listOf(run(0, 1, 1, 1, 0, 1_500)))
    val sink = FakeSink(File(tempDir, "offset.wav"))
    val recorder = recorder(source, sink)
    val preparation = recorder.prepare(tempDir)
    recorder.start(preparation)
    recorder.drainAvailable()
    recorder.requestStop()
    assertEquals(500L, recorder.finish(1_000).sessionStartOffsetNanos)

    val cancelSource = FakeSource(started(), emptyList())
    val cancelSink = FakeSink(File(tempDir, "cancel.wav"))
    val cancelRecorder = recorder(cancelSource, cancelSink)
    val cancelPreparation = cancelRecorder.prepare(tempDir)
    cancelRecorder.start(cancelPreparation)
    cancelRecorder.cancel()
    assertTrue("stop" in cancelSource.calls)
    assertTrue("abort" in cancelSink.operations)
}
```

The test-local `recorder(source, sink)` injects `sinkFactory = { _, _ -> sink }` and a stable ID factory.

- [ ] **Step 4: Implement recorder**

Use fixed buffers `FloatArray(8192)` and `ByteArray(16384)`. `prepare` creates a unique empty `.wav.tmp` path or returns `Unavailable(reason)`. `start(preparation)` calls native start, constructs the sink using the authoritative native sample rate, and aborts on failure.

`drainAvailable` must:

```kotlin
val info = source.drain(floatBuffer)
if (info.returnedFrames > 0) {
    val first = checkNotNull(info.firstLogicalFrame)
    check(first >= nextExpectedLogicalFrame)
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

`finish` idempotently stops, drains until stopped and empty, fails after 1,000 empty results that still claim buffered data, finalises even when zero frames were represented, and classifies:

- `COMPLETED`: valid WAV, user stop, zero dropped frames;
- `PARTIAL`: valid WAV plus duration limit, format change, audio stop, or dropped frames;
- `UNAVAILABLE`: preparation or native start failed;
- `FAILED`: order, write, no-progress, or finalisation failure.

Compute `sessionStartOffsetNanos` only when a first captured timestamp exists, without clamping negative values.

- [ ] **Step 5: Run tests and commit**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputRecorderTest \
  --tests com.vitautas.drumkit.DiagnosticSessionRecorderTest
git add drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorder.kt \
  drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticSessionRecorder.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticSessionRecorderTest.kt
git commit -m "feat(diagnostics): record generated output timeline"
```

---

### Task 5: Stream the WAV into the Final ZIP

**Files:**
- Create: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt`
- Create: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt`

- [ ] **Step 1: Write source-bundle and checksum fixtures**

Create a test ZIP with current performance-state manifest, `session.json`, `performance.csv`, `unknown-future.txt`, summary, and stale checksums. Define `assertChecksumsMatch` to parse each checksum line, read the named entry, calculate SHA-256, and compare.

- [ ] **Step 2: Write failing tests**

```kotlin
@Test
fun addsLargeWavWithoutLosingEntries() {
    val bundle = createSourceBundle(tempDir)
    val wav = File(tempDir, "generated.wav").apply {
        outputStream().use { output ->
            val block = ByteArray(8192) { 7 }
            repeat(256) { output.write(block) }
        }
    }
    val capture = capture(wav, COMPLETED, STOPPED_BY_USER, logicalFrames = 48_000)
    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(bundle, capture)
    ZipFile(bundle).use { zip ->
        assertEquals(wav.length(), zip.getEntry("generated-output.wav").size)
        assertEquals("retain-me", zip.readUtf8("unknown-future.txt"))
        val manifest = zip.readUtf8("manifest.json")
        assertTrue(manifest.contains("step_1_2_generated_output_partial"))
        assertTrue(manifest.contains("\"plannedFilesNotYetImplemented\": []"))
        assertTrue(manifest.contains("\"resultState\": \"completed\""))
        assertChecksumsMatch(zip)
    }
}

@Test
fun includesPartialReason() {
    val bundle = createSourceBundle(tempDir)
    val wav = File(tempDir, "partial.wav").apply { writeBytes(ByteArray(44)) }
    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(
        bundle,
        capture(wav, PARTIAL, FORMAT_CHANGED, logicalFrames = 0),
    )
    ZipFile(bundle).use { zip ->
        assertNotNull(zip.getEntry("generated-output.wav"))
        assertTrue(zip.readUtf8("manifest.json").contains("\"stopReason\": \"format_changed\""))
        assertChecksumsMatch(zip)
    }
}

@Test
fun unavailableCaptureOmitsWavButMarksImplemented() {
    val bundle = createSourceBundle(tempDir)
    DiagnosticGeneratedOutputBundleAugmenter.augmentBundle(
        bundle,
        capture(null, UNAVAILABLE, START_FAILED, failureReason = "storage unavailable"),
    )
    ZipFile(bundle).use { zip ->
        assertNull(zip.getEntry("generated-output.wav"))
        val manifest = zip.readUtf8("manifest.json")
        assertTrue(manifest.contains("\"plannedFilesNotYetImplemented\": []"))
        assertTrue(manifest.contains("\"resultState\": \"unavailable\""))
        assertTrue(manifest.contains("storage unavailable"))
        assertChecksumsMatch(zip)
    }
}
```

Add a failure test using a directory as `wavFile`; assert the original ZIP remains readable and the temporary sibling is deleted.

- [ ] **Step 3: Implement streaming rewrite**

Use one 8 KiB buffer and update a SHA-256 digest while copying each entry. Read only manifest and summary as strings. Never call `readBytes()` on `generated-output.wav`.

Rewrite order: transformed manifest, retained existing entries except old manifest/summary/checksums/WAV, new WAV when present, transformed summary, new checksums. Change bundle state, add/remove WAV from included files correctly, set planned files to `[]`, insert every capture field plus duration, and JSON-escape failure text. Atomically replace with existing fallback semantics. On failure, delete temporary ZIP and leave the original unchanged.

- [ ] **Step 4: Run tests and commit**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  --tests com.vitautas.drumkit.DiagnosticGeneratedOutputBundleAugmenterTest \
  --tests com.vitautas.drumkit.DiagnosticPerformanceRecorderTest
git add drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenter.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputBundleAugmenterTest.kt
git commit -m "feat(diagnostics): add generated output to bundles"
```

---

### Task 6: Integrate Screen Lifecycle and Final Augmentation

**Files:**
- Modify: `drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt:56-330`
- Test: `drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt`

- [ ] **Step 1: Lock repeated live-drain behaviour**

Add a recorder test with two queued live results and assert `drainAvailable()` can be called twice before `requestStop()`.

- [ ] **Step 2: Add state without adding controls**

```kotlin
val generatedOutputRecorder = remember { DiagnosticGeneratedOutputRecorder() }
var isStarting by remember { mutableStateOf(false) }
var generatedOutputStatus by remember { mutableStateOf<String?>(null) }
```

Disable the existing start/stop button while `isStarting`.

- [ ] **Step 3: Prepare, start clocks, then start capture**

Use `try/catch`, not `Result.onFailure`, so cleanup can suspend:

```kotlin
scope.launch {
    isStarting = true
    try {
        val preparation = withContext(Dispatchers.IO) {
            generatedOutputRecorder.prepare(File(context.cacheDir, "diagnostics/output"))
        }
        val diagnostics = AudioEngine.diagnostics()
        val resolvedRoute = DiagnosticAudioRouteResolver.resolve(context)
        val metadata = DiagnosticMetadataFactory.create(
            context,
            diagnostics,
            masterVolume,
            roomLevel,
            resolvedRoute,
        )
        val staleOutcomes = AudioEngine.drainDiagnosticDispatchOutcomes()
        val sessionId = recorder.start(metadata)
        dispatchTraceRecorder.start(staleOutcomes.droppedOutcomeCount)
        performanceRecorder.start(
            metadata,
            viewportSize.width.toInt().takeIf { it > 0 } ?: metadata.screenWidthPx,
            viewportSize.height.toInt().takeIf { it > 0 } ?: metadata.screenHeightPx,
            density,
        )
        val outputStart = withContext(Dispatchers.IO) {
            generatedOutputRecorder.start(preparation)
        }
        recorder.recordAudioDiagnostics(diagnostics)
        isRecording = true
        generatedOutputStatus = if (outputStart.started) "Output capture active" else "Output capture unavailable"
        status = "Recording ${sessionId.take(8)}"
    } catch (failure: Throwable) {
        withContext(Dispatchers.IO) { generatedOutputRecorder.cancel() }
        if (performanceRecorder.isRecording) performanceRecorder.cancel()
        if (recorder.isRecording) recorder.cancel()
        status = "Diagnostic start failed: ${failure.message ?: failure::class.java.simpleName}"
    } finally {
        isStarting = false
    }
}
```

Use named arguments if required by the existing factory signatures.

- [ ] **Step 4: Drain every existing 50 ms poll interval**

```kotlin
val outputInfo = withContext(Dispatchers.IO) {
    generatedOutputRecorder.drainAvailable()
}
generatedOutputStatus = when (outputInfo.stopReason) {
    DURATION_LIMIT -> "Output capture reached 10-minute limit"
    FORMAT_CHANGED -> "Output capture stopped after format change"
    AUDIO_STOPPED -> "Output capture stopped with audio engine"
    else -> generatedOutputStatus
}
```

- [ ] **Step 5: Stop producer first, finalise on I/O, augment last**

Before snapshots: `generatedOutputRecorder.requestStop()`. In export, call `finish(capture.baseCapture.startedAtMonotonicNanos)` on `Dispatchers.IO`. Run generated-output augmentation after dispatch and performance augmentation so its checksum list is final.

- [ ] **Step 6: Keep compact status and clean state**

Join existing status with generated-output status using ` · `. Clear generated status after successful export, cancellation, or failed start.

- [ ] **Step 7: Run and commit**

```bash
cd drum-kit-android
gradle --no-daemon --console=plain --warning-mode=fail \
  :app:testDebugUnitTest \
  :app:compileDebugKotlin
git add drum-kit-android/app/src/main/java/com/vitautas/drumkit/DiagnosticDrumKitScreen.kt \
  drum-kit-android/app/src/test/java/com/vitautas/drumkit/DiagnosticGeneratedOutputRecorderTest.kt
git commit -m "feat(diagnostics): integrate generated output capture"
```

---

### Task 7: Documentation, Full Validation, APK, and Physical Handoff

**Files:**
- Modify: `drum-kit-android/README.md`
- Modify: `drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md`
- Modify: PR #10 body after validation

- [ ] **Step 1: Document implemented behaviour**

State that normal sessions include post-limiter PCM16 WAV output; capture uses a bounded ring and I/O coroutine; overflow becomes counted silence; duration/format/audio-stop produce partial WAVs; failures do not stop playing/export. Mark generated output implemented and automated-validated, physical review pending. Do not mark Step 1.2 complete.

- [ ] **Step 2: Run narrow validation**

```bash
cd drum-kit-android
bash tools/test_diagnostic_output_capture.sh
gradle --no-daemon --console=plain --warning-mode=fail \
  :engine-audio:testDebugUnitTest \
  :app:testDebugUnitTest
```

- [ ] **Step 3: Run complete project validation**

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

- [ ] **Step 4: Inspect real-time invariants**

Record evidence that `onAudioReady()` uses only atomic/preallocated capture operations; capture performs no callback file I/O/allocation/locks/logging/JNI/integer conversion; `clearRealtimeState()` preserves buffered capture; WAV/ZIP work runs on I/O; generated-output augmentation runs last; WAV is streamed.

- [ ] **Step 5: Commit documentation**

```bash
git add drum-kit-android/README.md \
  drum-kit-android/docs/Drum_Kit_Recovery_and_Development_Roadmap.md
git commit -m "docs: record generated output capture status"
```

- [ ] **Step 6: Verify GitHub checks and exact-head APK**

Inspect Quick Check, Android Validation including host C++, and Lint. On failure invoke `superpowers:systematic-debugging`. Request the existing APK workflow, then record run number, artifact ID, digest, source SHA, and expiry. Keep PR #10 draft.

- [ ] **Step 7: Physical validation handoff**

Record a 20–30 second phone-speaker session with kick, snare, cymbals, rapid pedal retriggers, and a marker. Verify WAV opens, is stereo PCM16, sample rate matches diagnostics, duration equals `logicalFrames / sampleRate` within one frame, checksum matches, strikes align under `sessionStartOffsetNanos`, and underruns do not increase. Repeat briefly with Galaxy Buds for route metadata. Change route once and verify a playable partial WAV with `format_changed` or `audio_stopped`.

- [ ] **Step 8: Record acceptance accurately**

After bundle review, mark each generated-output criterion `Met`, `Partially met`, or `Not testable`. Keep Step 1.2 partial and recommend guided sequence/automatic markers next.

---

## Self-Review Gate

- All 13 wire fields use one order in C++, Kotlin, tests, and JNI.
- `maximumLogicalFrames` is present in native status, start result, drain info, and bundle metadata.
- `DiagnosticGeneratedOutputPreparation` is defined once and `start(preparation)` is used consistently.
- A successful zero-frame user-stop capture produces a valid 44-byte WAV and `COMPLETED` result.
- Native state, native stop reason, and Kotlin result remain separate.
- Overflow gaps are exact because every slot carries a logical frame index and drains return one contiguous run.
- The final WAV is streamed and never held in a whole-file byte array.
- The final augmenter runs after all other augmenters and regenerates checksums.
- No task starts another roadmap step or another deferred Step 1.2 slice.
