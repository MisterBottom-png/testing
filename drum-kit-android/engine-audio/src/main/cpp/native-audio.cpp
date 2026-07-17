#include <jni.h>
#include <oboe/Oboe.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <memory>

namespace {

constexpr int kChannelCount = 2;
constexpr int kEventCapacity = 64;
constexpr int kMaxVoices = 32;
constexpr int kDelayBufferSize = 32768;
constexpr float kPi = 3.14159265358979323846f;

struct StrikeEvent {
    int instrument = 0;
    float velocity = 0.8f;
    float x = 0.5f;
    float y = 0.5f;
};

struct Voice {
    bool active = false;
    int instrument = 0;
    float phase = 0.0f;
    float phaseTwo = 0.0f;
    float amplitude = 0.0f;
    float decayPerSample = 0.999f;
    float baseFrequency = 120.0f;
    float pan = 0.0f;
    float brightness = 0.5f;
    float ageSeconds = 0.0f;
};

class NativeAudioEngine final : public oboe::AudioStreamDataCallback,
                                public oboe::AudioStreamErrorCallback {
public:
    bool start() {
        if (running_.load(std::memory_order_acquire)) {
            return true;
        }

        oboe::AudioStreamBuilder builder;
        builder.setDirection(oboe::Direction::Output)
            ->setPerformanceMode(oboe::PerformanceMode::LowLatency)
            ->setSharingMode(oboe::SharingMode::Exclusive)
            ->setFormat(oboe::AudioFormat::Float)
            ->setChannelCount(kChannelCount)
            ->setUsage(oboe::Usage::Game)
            ->setContentType(oboe::ContentType::Music)
            ->setDataCallback(this)
            ->setErrorCallback(this);

        auto result = builder.openStream(stream_);
        if (result != oboe::Result::OK || !stream_) {
            stream_.reset();
            return false;
        }

        sampleRate_.store(stream_->getSampleRate(), std::memory_order_release);
        framesPerBurst_.store(stream_->getFramesPerBurst(), std::memory_order_release);
        clearRealtimeState();

        result = stream_->requestStart();
        if (result != oboe::Result::OK) {
            stream_->close();
            stream_.reset();
            return false;
        }

        running_.store(true, std::memory_order_release);
        return true;
    }

    void stop() {
        running_.store(false, std::memory_order_release);
        if (stream_) {
            stream_->requestStop();
            stream_->close();
            stream_.reset();
        }
        sampleRate_.store(0, std::memory_order_release);
        framesPerBurst_.store(0, std::memory_order_release);
    }

    void trigger(int instrument, float velocity, float x, float y) {
        const auto write = writeIndex_.load(std::memory_order_relaxed);
        const auto next = (write + 1U) % kEventCapacity;
        if (next == readIndex_.load(std::memory_order_acquire)) {
            return;
        }

        events_[write] = StrikeEvent{
            .instrument = std::clamp(instrument, 0, 7),
            .velocity = std::clamp(velocity, 0.05f, 1.0f),
            .x = std::clamp(x, 0.0f, 1.0f),
            .y = std::clamp(y, 0.0f, 1.0f),
        };
        writeIndex_.store(next, std::memory_order_release);
    }

    void setMasterVolume(float value) {
        masterVolume_.store(std::clamp(value, 0.0f, 1.0f), std::memory_order_release);
    }

    void setRoomMix(float value) {
        roomMix_.store(std::clamp(value, 0.0f, 1.0f), std::memory_order_release);
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
        if (!stream_) {
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
        const int rate = std::max(sampleRate_.load(std::memory_order_relaxed), 1);
        const int delayOne = std::max(1, static_cast<int>(rate * 0.017f));
        const int delayTwo = std::max(1, static_cast<int>(rate * 0.031f));

        for (int frame = 0; frame < numFrames; ++frame) {
            float left = 0.0f;
            float right = 0.0f;

            for (auto& voice : voices_) {
                if (!voice.active) {
                    continue;
                }
                const float sample = renderVoice(voice, rate);
                const float leftGain = std::sqrt(0.5f * (1.0f - voice.pan));
                const float rightGain = std::sqrt(0.5f * (1.0f + voice.pan));
                left += sample * leftGain;
                right += sample * rightGain;
            }

            const int readOne = (delayIndex_ - delayOne + kDelayBufferSize) & (kDelayBufferSize - 1);
            const int readTwo = (delayIndex_ - delayTwo + kDelayBufferSize) & (kDelayBufferSize - 1);
            const float wetLeft = delayLeft_[readOne] * 0.55f + delayRight_[readTwo] * 0.35f;
            const float wetRight = delayRight_[readOne] * 0.55f + delayLeft_[readTwo] * 0.35f;
            delayLeft_[delayIndex_] = left + wetLeft * 0.28f;
            delayRight_[delayIndex_] = right + wetRight * 0.28f;
            delayIndex_ = (delayIndex_ + 1) & (kDelayBufferSize - 1);

            left = (left * (1.0f - room * 0.35f) + wetLeft * room) * master;
            right = (right * (1.0f - room * 0.35f) + wetRight * room) * master;

            output[frame * kChannelCount] = softClip(left);
            output[frame * kChannelCount + 1] = softClip(right);
        }

        return oboe::DataCallbackResult::Continue;
    }

    void onErrorAfterClose(oboe::AudioStream* audioStream, oboe::Result error) override {
        (void)audioStream;
        (void)error;
        running_.store(false, std::memory_order_release);
    }

private:
    void clearRealtimeState() {
        readIndex_.store(0, std::memory_order_relaxed);
        writeIndex_.store(0, std::memory_order_relaxed);
        delayLeft_.fill(0.0f);
        delayRight_.fill(0.0f);
        delayIndex_ = 0;
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

    void startVoice(const StrikeEvent& event) {
        Voice* voice = nullptr;
        for (auto& candidate : voices_) {
            if (!candidate.active) {
                voice = &candidate;
                break;
            }
        }
        if (voice == nullptr) {
            voice = &voices_[voiceStealIndex_++ % voices_.size()];
        }

        const int rate = std::max(sampleRate_.load(std::memory_order_relaxed), 1);
        const float edge = std::clamp(
            std::hypot(event.x - 0.5f, event.y - 0.5f) * 2.0f,
            0.0f,
            1.0f
        );

        *voice = Voice{};
        voice->active = true;
        voice->instrument = event.instrument;
        voice->amplitude = event.velocity;
        voice->pan = instrumentPan(event.instrument);
        voice->brightness = edge;
        voice->baseFrequency = instrumentFrequency(event.instrument);
        voice->decayPerSample = std::exp(-1.0f / (instrumentDecay(event.instrument) * rate));
    }

    float renderVoice(Voice& voice, int sampleRate) {
        const float noise = nextNoise();
        float frequency = voice.baseFrequency;
        float sample = 0.0f;

        switch (voice.instrument) {
            case 0: {
                frequency *= 1.0f + 2.9f * std::exp(-voice.ageSeconds * 38.0f);
                sample = std::sin(voice.phase) * 0.92f + noise * std::exp(-voice.ageSeconds * 90.0f) * 0.08f;
                break;
            }
            case 1: {
                sample = std::sin(voice.phase) * 0.30f + noise * (0.58f + voice.brightness * 0.22f);
                break;
            }
            case 2:
            case 3:
            case 4: {
                sample = std::sin(voice.phase) * 0.76f + std::sin(voice.phaseTwo) * 0.20f + noise * 0.06f;
                break;
            }
            case 5: {
                sample = noise * 0.66f + squareLike(voice.phase) * 0.20f + squareLike(voice.phaseTwo) * 0.14f;
                break;
            }
            case 6:
            case 7: {
                sample = noise * 0.46f + squareLike(voice.phase) * 0.18f +
                    std::sin(voice.phaseTwo) * 0.20f + std::sin(voice.phase * 1.63f) * 0.16f;
                break;
            }
            default:
                break;
        }

        voice.phase += 2.0f * kPi * frequency / static_cast<float>(sampleRate);
        voice.phaseTwo += 2.0f * kPi * frequency * 1.47f / static_cast<float>(sampleRate);
        if (voice.phase > 2.0f * kPi) voice.phase -= 2.0f * kPi;
        if (voice.phaseTwo > 2.0f * kPi) voice.phaseTwo -= 2.0f * kPi;

        voice.ageSeconds += 1.0f / static_cast<float>(sampleRate);
        voice.amplitude *= voice.decayPerSample;
        if (voice.amplitude < 0.0004f) {
            voice.active = false;
        }
        return sample * voice.amplitude;
    }

    float nextNoise() {
        randomState_ ^= randomState_ << 13U;
        randomState_ ^= randomState_ >> 17U;
        randomState_ ^= randomState_ << 5U;
        return static_cast<float>(static_cast<int32_t>(randomState_)) / 2147483648.0f;
    }

    static float squareLike(float phase) {
        return std::sin(phase) >= 0.0f ? 1.0f : -1.0f;
    }

    static float softClip(float value) {
        return value / (1.0f + std::abs(value));
    }

    static float instrumentPan(int instrument) {
        constexpr std::array<float, 8> pans = {0.0f, -0.18f, -0.22f, 0.14f, 0.46f, -0.62f, -0.52f, 0.52f};
        return pans[static_cast<size_t>(std::clamp(instrument, 0, 7))];
    }

    static float instrumentFrequency(int instrument) {
        constexpr std::array<float, 8> frequencies = {52.0f, 184.0f, 154.0f, 118.0f, 78.0f, 6200.0f, 680.0f, 890.0f};
        return frequencies[static_cast<size_t>(std::clamp(instrument, 0, 7))];
    }

    static float instrumentDecay(int instrument) {
        constexpr std::array<float, 8> decays = {0.55f, 0.28f, 0.62f, 0.78f, 1.0f, 0.12f, 2.7f, 2.2f};
        return decays[static_cast<size_t>(std::clamp(instrument, 0, 7))];
    }

    std::shared_ptr<oboe::AudioStream> stream_;
    std::atomic<bool> running_{false};
    std::atomic<int> sampleRate_{0};
    std::atomic<int> framesPerBurst_{0};
    std::atomic<float> masterVolume_{0.76f};
    std::atomic<float> roomMix_{0.32f};

    std::array<StrikeEvent, kEventCapacity> events_{};
    std::atomic<uint32_t> readIndex_{0};
    std::atomic<uint32_t> writeIndex_{0};

    std::array<Voice, kMaxVoices> voices_{};
    size_t voiceStealIndex_ = 0;
    uint32_t randomState_ = 0x12345678U;

    std::array<float, kDelayBufferSize> delayLeft_{};
    std::array<float, kDelayBufferSize> delayRight_{};
    int delayIndex_ = 0;
};

NativeAudioEngine engine;

}  // namespace

extern "C" JNIEXPORT jboolean JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeStart(JNIEnv* env, jobject instance) {
    (void)env;
    (void)instance;
    return engine.start() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT void JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeStop(JNIEnv* env, jobject instance) {
    (void)env;
    (void)instance;
    engine.stop();
}

extern "C" JNIEXPORT void JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeTrigger(
    JNIEnv* env,
    jobject instance,
    jint instrument,
    jfloat velocity,
    jfloat normalizedX,
    jfloat normalizedY
) {
    (void)env;
    (void)instance;
    engine.trigger(instrument, velocity, normalizedX, normalizedY);
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
Java_com_vitautas_drumkit_audio_AudioEngine_nativeIsRunning(JNIEnv* env, jobject instance) {
    (void)env;
    (void)instance;
    return engine.isRunning() ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeGetSampleRate(JNIEnv* env, jobject instance) {
    (void)env;
    (void)instance;
    return engine.sampleRate();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeGetFramesPerBurst(JNIEnv* env, jobject instance) {
    (void)env;
    (void)instance;
    return engine.framesPerBurst();
}

extern "C" JNIEXPORT jint JNICALL
Java_com_vitautas_drumkit_audio_AudioEngine_nativeGetUnderrunCount(JNIEnv* env, jobject instance) {
    (void)env;
    (void)instance;
    return engine.underrunCount();
}
