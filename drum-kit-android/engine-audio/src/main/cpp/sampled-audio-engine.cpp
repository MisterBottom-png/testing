#include <jni.h>
#include <android/asset_manager.h>
#include <android/asset_manager_jni.h>
#include <oboe/Oboe.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <mutex>
#include <vector>

namespace {

constexpr int kChannelCount = 2;
constexpr int kEventCapacity = 128;
constexpr int kMaxVoices = 48;
constexpr int kDelayBufferSize = 65536;
constexpr int kSnareArticulationCount = 5;
constexpr int kSnareLayerCount = 6;
constexpr int kSnareRoundRobinCount = 4;
constexpr int kSnareSampleCount =
    kSnareArticulationCount * kSnareLayerCount * kSnareRoundRobinCount;
constexpr int kSnareSourceSampleRate = 48000;
constexpr int kSnareInstrument = 1;
constexpr float kPi = 3.14159265358979323846f;
constexpr float kLimiterCeiling = 0.96f;
constexpr float kLimiterRelease = 0.00045f;
constexpr char kSnareAssetPath[] = "snare/snare-bank.pcm";
constexpr std::array<char, 8> kBankMagic = {'S', 'N', 'A', 'R', 'E', 'P', 'C', 'M'};

struct StrikeEvent {
    int instrument = 0;
    int articulation = 0;
    float velocity = 0.8f;
    float x = 0.5f;
    float y = 0.5f;
};

struct StereoSample {
    float left = 0.0f;
    float right = 0.0f;
};

struct SampleDescriptor {
    uint32_t offsetFrames = 0;
    uint32_t frameCount = 0;
};

class SnareBank {
public:
    bool load(AAssetManager* assetManager) {
        if (ready_) {
            return true;
        }
        if (assetManager == nullptr) {
            return false;
        }

        AAsset* asset = AAssetManager_open(assetManager, kSnareAssetPath, AASSET_MODE_BUFFER);
        if (asset == nullptr) {
            return false;
        }

        const int64_t length = AAsset_getLength64(asset);
        if (length <= 0) {
            AAsset_close(asset);
            return false;
        }

        std::vector<uint8_t> bytes(static_cast<size_t>(length));
        const int read = AAsset_read(asset, bytes.data(), static_cast<size_t>(length));
        AAsset_close(asset);
        if (read < 0 || static_cast<int64_t>(read) != length) {
            return false;
        }

        constexpr size_t kHeaderSize = 32;
        constexpr size_t kDescriptorSize = 16;
        constexpr size_t kDescriptorBytes = kDescriptorSize * kSnareSampleCount;
        if (bytes.size() < kHeaderSize + kDescriptorBytes) {
            return false;
        }
        if (!std::equal(kBankMagic.begin(), kBankMagic.end(), bytes.begin())) {
            return false;
        }

        const uint32_t version = readUint32(bytes.data() + 8);
        const uint32_t sampleRate = readUint32(bytes.data() + 12);
        const uint32_t articulationCount = readUint32(bytes.data() + 16);
        const uint32_t layerCount = readUint32(bytes.data() + 20);
        const uint32_t roundRobinCount = readUint32(bytes.data() + 24);
        const uint32_t sampleCount = readUint32(bytes.data() + 28);
        if (version != 1U || sampleRate != kSnareSourceSampleRate ||
            articulationCount != kSnareArticulationCount ||
            layerCount != kSnareLayerCount ||
            roundRobinCount != kSnareRoundRobinCount ||
            sampleCount != kSnareSampleCount) {
            return false;
        }

        size_t cursor = kHeaderSize;
        for (auto& descriptor : descriptors_) {
            descriptor.offsetFrames = readUint32(bytes.data() + cursor);
            descriptor.frameCount = readUint32(bytes.data() + cursor + 4);
            cursor += kDescriptorSize;
        }

        const size_t pcmBytes = bytes.size() - cursor;
        if ((pcmBytes % sizeof(int16_t)) != 0U) {
            return false;
        }
        pcm_.resize(pcmBytes / sizeof(int16_t));
        std::memcpy(pcm_.data(), bytes.data() + cursor, pcmBytes);

        for (const auto& descriptor : descriptors_) {
            const uint64_t endFrame =
                static_cast<uint64_t>(descriptor.offsetFrames) + descriptor.frameCount;
            const uint64_t endSample = endFrame * kChannelCount;
            if (descriptor.frameCount < 2U || endSample > pcm_.size()) {
                pcm_.clear();
                return false;
            }
        }

        ready_ = true;
        return true;
    }

    bool ready() const {
        return ready_;
    }

    const SampleDescriptor& descriptor(int articulation, int layer, int roundRobin) const {
        const int safeArticulation = std::clamp(
            articulation,
            0,
            kSnareArticulationCount - 1
        );
        const int safeLayer = std::clamp(layer, 0, kSnareLayerCount - 1);
        const int safeRoundRobin = std::clamp(
            roundRobin,
            0,
            kSnareRoundRobinCount - 1
        );
        const size_t index = static_cast<size_t>(
            (safeArticulation * kSnareLayerCount + safeLayer) *
                kSnareRoundRobinCount + safeRoundRobin
        );
        return descriptors_[index];
    }

    const int16_t* samples(const SampleDescriptor& descriptor) const {
        return pcm_.data() +
            static_cast<size_t>(descriptor.offsetFrames) * kChannelCount;
    }

private:
    static uint32_t readUint32(const uint8_t* bytes) {
        return static_cast<uint32_t>(bytes[0]) |
            (static_cast<uint32_t>(bytes[1]) << 8U) |
            (static_cast<uint32_t>(bytes[2]) << 16U) |
            (static_cast<uint32_t>(bytes[3]) << 24U);
    }

    bool ready_ = false;
    std::array<SampleDescriptor, kSnareSampleCount> descriptors_{};
    std::vector<int16_t> pcm_{};
};

struct SamplePlayback {
    const int16_t* data = nullptr;
    uint32_t frameCount = 0;
    float position = 0.0f;
    float increment = 1.0f;
    float gain = 0.0f;
    bool active = false;
};

struct Voice {
    bool active = false;
    bool sampled = false;
    int instrument = 0;
    float phase = 0.0f;
    float phaseTwo = 0.0f;
    float amplitude = 0.0f;
    float decayPerSample = 0.999f;
    float baseFrequency = 120.0f;
    float pan = 0.0f;
    float brightness = 0.5f;
    float ageSeconds = 0.0f;
    float filterCoefficient = 0.82f;
    float filterLeft = 0.0f;
    float filterRight = 0.0f;
    std::array<SamplePlayback, 2> sampleLayers{};
};

class NativeAudioEngine final : public oboe::AudioStreamDataCallback,
                                public oboe::AudioStreamErrorCallback {
public:
    NativeAudioEngine()
        : dataCallback_(this, [](oboe::AudioStreamDataCallback*) {}),
          errorCallback_(this, [](oboe::AudioStreamErrorCallback*) {}) {}

    bool start(JNIEnv* env, jobject assetManagerObject) {
        desiredRunning_.store(true, std::memory_order_release);
        std::lock_guard<std::mutex> lock(streamMutex_);
        if (running_.load(std::memory_order_acquire)) {
            return true;
        }

        if (!snareBank_.ready()) {
            AAssetManager* assetManager = AAssetManager_fromJava(env, assetManagerObject);
            if (!snareBank_.load(assetManager)) {
                return false;
            }
        }

        return openStreamLocked();
    }

    void stop() {
        desiredRunning_.store(false, std::memory_order_release);
        std::shared_ptr<oboe::AudioStream> streamToClose;
        {
            std::lock_guard<std::mutex> lock(streamMutex_);
            running_.store(false, std::memory_order_release);
            sampleRate_.store(0, std::memory_order_release);
            framesPerBurst_.store(0, std::memory_order_release);
            streamToClose = std::move(stream_);
        }

        if (streamToClose) {
            streamToClose->requestStop();
            streamToClose->close();
        }
    }

    void trigger(
        int instrument,
        int articulation,
        float velocity,
        float x,
        float y
    ) {
        if (!running_.load(std::memory_order_acquire)) {
            return;
        }
        if (!std::isfinite(velocity) || !std::isfinite(x) ||
            !std::isfinite(y)) {
            return;
        }

        const auto write = writeIndex_.load(std::memory_order_relaxed);
        const auto next = (write + 1U) % kEventCapacity;
        if (next == readIndex_.load(std::memory_order_acquire)) {
            return;
        }

        events_[write] = StrikeEvent{
            .instrument = std::clamp(instrument, 0, 7),
            .articulation = std::clamp(
                articulation,
                0,
                kSnareArticulationCount - 1
            ),
            .velocity = std::clamp(velocity, 0.05f, 1.0f),
            .x = std::clamp(x, 0.0f, 1.0f),
            .y = std::clamp(y, 0.0f, 1.0f),
        };
        writeIndex_.store(next, std::memory_order_release);
    }

    void setMasterVolume(float value) {
        if (!std::isfinite(value)) {
            return;
        }
        masterVolume_.store(
            std::clamp(value, 0.0f, 1.0f),
            std::memory_order_release
        );
    }

    void setRoomMix(float value) {
        if (!std::isfinite(value)) {
            return;
        }
        roomMix_.store(
            std::clamp(value, 0.0f, 1.0f),
            std::memory_order_release
        );
    }

    bool isRunning() const {
        return running_.load(std::memory_order_acquire);
    }

    int sampleRate() const {
        return sampleRate_.load(std::memory_order_acquire);
    }

    int framesPerBurst() const {
        return framesPerBurst_.load(std::memory_order_acquire);
    }

    int underrunCount() const {
        std::lock_guard<std::mutex> lock(streamMutex_);
        if (!running_.load(std::memory_order_acquire) || !stream_) {
            return 0;
        }
        const auto result = stream_->getXRunCount();
        return result ? result.value() : 0;
    }

    oboe::DataCallbackResult onAudioReady(
        oboe::AudioStream* audioStream,
        void* audioData,
        int32_t numFrames
    ) override {
        (void)audioStream;
        auto* output = static_cast<float*>(audioData);
        if (output == nullptr) {
            return oboe::DataCallbackResult::Stop;
        }

        drainEvents();
        const float master = masterVolume_.load(std::memory_order_relaxed);
        const float room = roomMix_.load(std::memory_order_relaxed);
        const int rate = std::max(
            sampleRate_.load(std::memory_order_relaxed),
            1
        );
        const int delayOne = std::max(
            1,
            static_cast<int>(static_cast<float>(rate) * 0.023f)
        );
        const int delayTwo = std::max(
            1,
            static_cast<int>(static_cast<float>(rate) * 0.037f)
        );

        for (int frame = 0; frame < numFrames; ++frame) {
            float dryLeft = 0.0f;
            float dryRight = 0.0f;

            for (auto& voice : voices_) {
                if (!voice.active) {
                    continue;
                }
                const StereoSample sample = renderVoice(voice, rate);
                dryLeft += sample.left;
                dryRight += sample.right;
            }

            const int readOne =
                (delayIndex_ - delayOne + kDelayBufferSize) &
                (kDelayBufferSize - 1);
            const int readTwo =
                (delayIndex_ - delayTwo + kDelayBufferSize) &
                (kDelayBufferSize - 1);
            const float wetLeft =
                delayLeft_[readOne] * 0.62f + delayRight_[readTwo] * 0.28f;
            const float wetRight =
                delayRight_[readOne] * 0.62f + delayLeft_[readTwo] * 0.28f;
            const float send = 0.12f + room * 0.16f;
            delayLeft_[delayIndex_] = dryLeft * send + wetLeft * 0.22f;
            delayRight_[delayIndex_] = dryRight * send + wetRight * 0.22f;
            delayIndex_ = (delayIndex_ + 1) & (kDelayBufferSize - 1);

            float left = (dryLeft + wetLeft * room * 0.30f) * master;
            float right = (dryRight + wetRight * room * 0.30f) * master;
            applyPeakLimiter(left, right);
            output[frame * kChannelCount] = left;
            output[frame * kChannelCount + 1] = right;
        }

        return oboe::DataCallbackResult::Continue;
    }

    void onErrorAfterClose(
        oboe::AudioStream* audioStream,
        oboe::Result error
    ) override {
        (void)error;
        std::lock_guard<std::mutex> lock(streamMutex_);
        if (!stream_ || stream_.get() != audioStream) {
            return;
        }

        running_.store(false, std::memory_order_release);
        sampleRate_.store(0, std::memory_order_release);
        framesPerBurst_.store(0, std::memory_order_release);
        stream_.reset();

        if (desiredRunning_.load(std::memory_order_acquire)) {
            openStreamLocked();
        }
    }

private:
    bool openStreamLocked() {
        if (!desiredRunning_.load(std::memory_order_acquire) ||
            !snareBank_.ready()) {
            return false;
        }

        stream_.reset();
        std::shared_ptr<oboe::AudioStream> candidate;
        auto result = openOutputStream(oboe::SharingMode::Exclusive, candidate);
        if (result != oboe::Result::OK || !candidate) {
            candidate.reset();
            result = openOutputStream(oboe::SharingMode::Shared, candidate);
        }
        if (result != oboe::Result::OK || !candidate) {
            running_.store(false, std::memory_order_release);
            sampleRate_.store(0, std::memory_order_release);
            framesPerBurst_.store(0, std::memory_order_release);
            return false;
        }

        stream_ = candidate;
        sampleRate_.store(stream_->getSampleRate(), std::memory_order_release);
        framesPerBurst_.store(
            stream_->getFramesPerBurst(),
            std::memory_order_release
        );
        clearRealtimeState();

        result = stream_->requestStart();
        if (result != oboe::Result::OK) {
            auto failedStream = std::move(stream_);
            running_.store(false, std::memory_order_release);
            sampleRate_.store(0, std::memory_order_release);
            framesPerBurst_.store(0, std::memory_order_release);
            failedStream->close();
            return false;
        }

        running_.store(true, std::memory_order_release);
        return true;
    }

    oboe::Result openOutputStream(
        oboe::SharingMode sharingMode,
        std::shared_ptr<oboe::AudioStream>& target
    ) {
        oboe::AudioStreamBuilder builder;
        builder.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(sharingMode)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(kChannelCount)
            ->setUsage(oboe::Usage::Game)
            ->setContentType(oboe::ContentType::Music)
            ->setDataCallback(dataCallback_)
            ->setErrorCallback(errorCallback_);
        return builder.openStream(target);
    }

    void clearRealtimeState() {
        readIndex_.store(0, std::memory_order_relaxed);
        writeIndex_.store(0, std::memory_order_relaxed);
        delayLeft_.fill(0.0f);
        delayRight_.fill(0.0f);
        delayIndex_ = 0;
        limiterGain_ = 1.0f;
        voiceStealIndex_ = 0;
        for (auto& row : roundRobinCounters_) {
            row.fill(0U);
        }
        for (auto& voice : voices_) {
            voice = Voice{};
        }
    }

    void drainEvents() {
        auto read = readIndex_.load(std::memory_order_relaxed);
        const auto write = writeIndex_.load(std::memory_order_acquire);
        while (read != write) {
            startVoice(events_[read]);
            read = (read + 1U) % kEventCapacity;
        }
        readIndex_.store(read, std::memory_order_release);
    }

    Voice& acquireVoice() {
        for (auto& voice : voices_) {
            if (!voice.active) {
                return voice;
            }
        }
        return voices_[voiceStealIndex_++ % voices_.size()];
    }

    void startVoice(const StrikeEvent& event) {
        Voice& voice = acquireVoice();
        if (event.instrument == kSnareInstrument) {
            startSnareVoice(voice, event);
        } else {
            startSynthVoice(voice, event);
        }
    }

    void startSnareVoice(Voice& voice, const StrikeEvent& event) {
        voice = Voice{};
        voice.active = true;
        voice.sampled = true;
        voice.instrument = event.instrument;
        voice.pan = -0.12f;

        const float layerPosition =
            event.velocity * static_cast<float>(kSnareLayerCount - 1);
        const int lowerLayer = std::clamp(
            static_cast<int>(std::floor(layerPosition)),
            0,
            kSnareLayerCount - 1
        );
        const int upperLayer = std::min(
            lowerLayer + 1,
            kSnareLayerCount - 1
        );
        const float blend = std::clamp(
            layerPosition - static_cast<float>(lowerLayer),
            0.0f,
            1.0f
        );
        const float lowerWeight = std::cos(blend * kPi * 0.5f);
        const float upperWeight = std::sin(blend * kPi * 0.5f);
        const float pitchVariation = 1.0f + randomSigned() * 0.0045f;
        const float gainVariation = std::pow(
            10.0f,
            randomSigned() * 0.45f / 20.0f
        );
        const float velocityGain = 0.42f + event.velocity * 0.58f;
        const float outputRate = static_cast<float>(std::max(
            sampleRate_.load(std::memory_order_relaxed),
            1
        ));
        const float increment =
            static_cast<float>(kSnareSourceSampleRate) / outputRate *
            pitchVariation;

        configureSampleLayer(
            voice.sampleLayers[0],
            event.articulation,
            lowerLayer,
            lowerWeight * gainVariation * velocityGain,
            increment
        );
        if (upperLayer != lowerLayer && upperWeight > 0.0001f) {
            configureSampleLayer(
                voice.sampleLayers[1],
                event.articulation,
                upperLayer,
                upperWeight * gainVariation * velocityGain,
                increment
            );
        }

        constexpr std::array<float, kSnareArticulationCount> kFilterBase = {
            0.78f,
            0.82f,
            0.87f,
            0.91f,
            0.85f,
        };
        voice.filterCoefficient = std::clamp(
            kFilterBase[static_cast<size_t>(event.articulation)] +
                randomSigned() * 0.018f,
            0.68f,
            0.96f
        );
    }

    void configureSampleLayer(
        SamplePlayback& playback,
        int articulation,
        int layer,
        float gain,
        float increment
    ) {
        auto& counter = roundRobinCounters_[static_cast<size_t>(articulation)]
            [static_cast<size_t>(layer)];
        const int roundRobin = static_cast<int>(
            counter % kSnareRoundRobinCount
        );
        counter = static_cast<uint8_t>(
            (counter + 1U) % kSnareRoundRobinCount
        );
        const auto& descriptor = snareBank_.descriptor(
            articulation,
            layer,
            roundRobin
        );
        playback.data = snareBank_.samples(descriptor);
        playback.frameCount = descriptor.frameCount;
        playback.position = 0.0f;
        playback.increment = increment;
        playback.gain = gain;
        playback.active = true;
    }

    void startSynthVoice(Voice& voice, const StrikeEvent& event) {
        const int rate = std::max(
            sampleRate_.load(std::memory_order_relaxed),
            1
        );
        const float edge = std::clamp(
            std::hypot(event.x - 0.5f, event.y - 0.5f) * 2.0f,
            0.0f,
            1.0f
        );

        voice = Voice{};
        voice.active = true;
        voice.instrument = event.instrument;
        voice.amplitude = event.velocity;
        voice.pan = instrumentPan(event.instrument);
        voice.brightness = edge;
        voice.baseFrequency = instrumentFrequency(event.instrument);
        voice.decayPerSample = std::exp(
            -1.0f /
            (instrumentDecay(event.instrument) * static_cast<float>(rate))
        );
    }

    StereoSample renderVoice(Voice& voice, int sampleRate) {
        return voice.sampled
            ? renderSampleVoice(voice, sampleRate)
            : renderSynthVoice(voice, sampleRate);
    }

    StereoSample renderSampleVoice(Voice& voice, int sampleRate) {
        StereoSample mixed{};
        bool anyActive = false;
        for (auto& layer : voice.sampleLayers) {
            if (!layer.active || layer.data == nullptr ||
                layer.frameCount < 2U) {
                continue;
            }

            const uint32_t frame = static_cast<uint32_t>(layer.position);
            if (frame + 1U >= layer.frameCount) {
                layer.active = false;
                continue;
            }

            const float fraction =
                layer.position - static_cast<float>(frame);
            const size_t index = static_cast<size_t>(frame) * kChannelCount;
            const float leftOne =
                static_cast<float>(layer.data[index]) / 32768.0f;
            const float rightOne =
                static_cast<float>(layer.data[index + 1U]) / 32768.0f;
            const float leftTwo =
                static_cast<float>(layer.data[index + 2U]) / 32768.0f;
            const float rightTwo =
                static_cast<float>(layer.data[index + 3U]) / 32768.0f;
            mixed.left +=
                (leftOne + (leftTwo - leftOne) * fraction) * layer.gain;
            mixed.right +=
                (rightOne + (rightTwo - rightOne) * fraction) * layer.gain;
            layer.position += layer.increment;
            anyActive = true;
        }

        voice.filterLeft +=
            voice.filterCoefficient * (mixed.left - voice.filterLeft);
        voice.filterRight +=
            voice.filterCoefficient * (mixed.right - voice.filterRight);
        const float leftBalance =
            voice.pan > 0.0f ? 1.0f - voice.pan : 1.0f;
        const float rightBalance =
            voice.pan < 0.0f ? 1.0f + voice.pan : 1.0f;
        voice.ageSeconds += 1.0f / static_cast<float>(sampleRate);
        voice.active = anyActive;
        return StereoSample{
            .left = voice.filterLeft * leftBalance,
            .right = voice.filterRight * rightBalance,
        };
    }

    StereoSample renderSynthVoice(Voice& voice, int sampleRate) {
        const float noise = nextNoise();
        float frequency = voice.baseFrequency;
        float sample = 0.0f;

        switch (voice.instrument) {
            case 0: {
                frequency *=
                    1.0f + 2.9f * std::exp(-voice.ageSeconds * 38.0f);
                sample =
                    std::sin(voice.phase) * 0.92f +
                    noise * std::exp(-voice.ageSeconds * 90.0f) * 0.08f;
                break;
            }
            case 2:
            case 3:
            case 4: {
                sample =
                    std::sin(voice.phase) * 0.76f +
                    std::sin(voice.phaseTwo) * 0.20f + noise * 0.06f;
                break;
            }
            case 5: {
                sample =
                    noise * 0.66f + squareLike(voice.phase) * 0.20f +
                    squareLike(voice.phaseTwo) * 0.14f;
                break;
            }
            case 6:
            case 7: {
                sample =
                    noise * 0.46f + squareLike(voice.phase) * 0.18f +
                    std::sin(voice.phaseTwo) * 0.20f +
                    std::sin(voice.phase * 1.63f) * 0.16f;
                break;
            }
            default:
                break;
        }

        voice.phase +=
            2.0f * kPi * frequency / static_cast<float>(sampleRate);
        voice.phaseTwo +=
            2.0f * kPi * frequency * 1.47f /
            static_cast<float>(sampleRate);
        if (voice.phase > 2.0f * kPi) {
            voice.phase -= 2.0f * kPi;
        }
        if (voice.phaseTwo > 2.0f * kPi) {
            voice.phaseTwo -= 2.0f * kPi;
        }

        voice.ageSeconds += 1.0f / static_cast<float>(sampleRate);
        voice.amplitude *= voice.decayPerSample;
        if (voice.amplitude < 0.0004f) {
            voice.active = false;
        }
        const float leftGain = std::sqrt(0.5f * (1.0f - voice.pan));
        const float rightGain = std::sqrt(0.5f * (1.0f + voice.pan));
        return StereoSample{
            .left = sample * voice.amplitude * leftGain,
            .right = sample * voice.amplitude * rightGain,
        };
    }

    void applyPeakLimiter(float& left, float& right) {
        if (!std::isfinite(left) || !std::isfinite(right)) {
            left = 0.0f;
            right = 0.0f;
            limiterGain_ = 1.0f;
            return;
        }

        const float peak = std::max(std::abs(left), std::abs(right));
        const float targetGain = peak > kLimiterCeiling
            ? kLimiterCeiling / peak
            : 1.0f;
        if (targetGain < limiterGain_) {
            limiterGain_ = targetGain;
        } else {
            limiterGain_ += (1.0f - limiterGain_) * kLimiterRelease;
        }
        left = std::clamp(left * limiterGain_, -1.0f, 1.0f);
        right = std::clamp(right * limiterGain_, -1.0f, 1.0f);
    }

    float nextNoise() {
        randomState_ ^= randomState_ << 13U;
        randomState_ ^= randomState_ >> 17U;
        randomState_ ^= randomState_ << 5U;
        return static_cast<float>(static_cast<int32_t>(randomState_)) /
            2147483648.0f;
    }

    float randomSigned() {
        return nextNoise();
    }

    static float squareLike(float phase) {
        return std::sin(phase) >= 0.0f ? 1.0f : -1.0f;
    }

    static float instrumentPan(int instrument) {
        constexpr std::array<float, 8> kPans = {
            0.0f,
            -0.18f,
            -0.22f,
            0.14f,
            0.46f,
            -0.62f,
            -0.52f,
            0.52f,
        };
        return kPans[static_cast<size_t>(std::clamp(instrument, 0, 7))];
    }

    static float instrumentFrequency(int instrument) {
        constexpr std::array<float, 8> kFrequencies = {
            52.0f,
            184.0f,
            154.0f,
            118.0f,
            78.0f,
            6200.0f,
            680.0f,
            890.0f,
        };
        return kFrequencies[
            static_cast<size_t>(std::clamp(instrument, 0, 7))
        ];
    }

    static float instrumentDecay(int instrument) {
        constexpr std::array<float, 8> kDecays = {
            0.55f,
            0.28f,
            0.62f,
            0.78f,
            1.0f,
            0.12f,
            2.7f,
            2.2f,
        };
        return kDecays[static_cast<size_t>(std::clamp(instrument, 0, 7))];
    }

    SnareBank snareBank_{};
    std::shared_ptr<oboe::AudioStreamDataCallback> dataCallback_;
    std::shared_ptr<oboe::AudioStreamErrorCallback> errorCallback_;
    mutable std::mutex streamMutex_;
    std::shared_ptr<oboe::AudioStream> stream_;
    std::atomic<bool> desiredRunning_{false};
    std::atomic<bool> running_{false};
    std::atomic<int> sampleRate_{0};
    std::atomic<int> framesPerBurst_{0};
    std::atomic<float> masterVolume_{0.76f};
    std::atomic<float> roomMix_{0.12f};

    std::array<StrikeEvent, kEventCapacity> events_{};
    std::atomic<uint32_t> readIndex_{0};
    std::atomic<uint32_t> writeIndex_{0};

    std::array<Voice, kMaxVoices> voices_{};
    size_t voiceStealIndex_ = 0;
    uint32_t randomState_ = 0x12345678U;
    std::array<
        std::array<uint8_t, kSnareLayerCount>,
        kSnareArticulationCount
    > roundRobinCounters_{};

    std::array<float, kDelayBufferSize> delayLeft_{};
    std::array<float, kDelayBufferSize> delayRight_{};
    int delayIndex_ = 0;
    float limiterGain_ = 1.0f;
};

NativeAudioEngine engine;

}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeStart(
    JNIEnv* env,
    jobject instance,
    jobject assetManager
) {
    (void)instance;
    return engine.start(env, assetManager) ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeStop(
    JNIEnv* env,
    jobject instance
) {
    (void)env;
    (void)instance;
    engine.stop();
}

extern "C" JNIEXPORT void JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeTrigger(
    JNIEnv* env,
    jobject instance,
    jint instrument,
    jint articulation,
    jfloat velocity,
    jfloat normalizedX,
    jfloat normalizedY
) {
    (void)env;
    (void)instance;
    engine.trigger(
        instrument,
        articulation,
        velocity,
        normalizedX,
        normalizedY
    );
}

extern "C" JNIEXPORT void JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeSetMasterVolume(
    JNIEnv* env,
    jobject instance,
    jfloat value
) {
    (void)env;
    (void)instance;
    engine.setMasterVolume(value);
}

extern "C" JNIEXPORT void JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeSetRoomMix(
    JNIEnv* env,
    jobject instance,
    jfloat value
) {
    (void)env;
    (void)instance;
    engine.setRoomMix(value);
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeIsRunning(
    JNIEnv* env,
    jobject instance
) {
    (void)env;
    (void)instance;
    return engine.isRunning() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeGetSampleRate(
    JNIEnv* env,
    jobject instance
) {
    (void)env;
    (void)instance;
    return engine.sampleRate();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeGetFramesPerBurst(
    JNIEnv* env,
    jobject instance
) {
    (void)env;
    (void)instance;
    return engine.framesPerBurst();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeGetUnderrunCount(
    JNIEnv* env,
    jobject instance
) {
    (void)env;
    (void)instance;
    return engine.underrunCount();
}
