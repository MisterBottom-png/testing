# Production snare sample model

## Why the placeholder was replaced

The browser reference and initial native engine generated the snare from an oscillator, broadband noise, an envelope, and synthetic room delay. That is useful for validating touch-to-sound dispatch, but it does not preserve the recorded transient, membrane response, snare-wire response, hoop impulse, microphone phase relationships, or natural variation that identify an acoustic snare.

The production snare therefore uses a sample-first model. Real recordings provide the attack and body. Procedural processing is deliberately restricted to small repetition variation and position-dependent expression.

## Source material

### Head and rimshot recordings

The centre, off-cententre, and rimshot sources come from **The Aasimonster 2.1** DrumGizmo kit by Jes Eiler. The published kit is licensed under CC BY 4.0 and recorded at 48 kHz with dedicated snare-top, snare-bottom, overhead, and ambience channels.

The bank builder uses:

- `snare_on_center` for centre strikes
- `snare_off_center` for off-centre strikes
- `snare_off_center` with restrained high-frequency emphasis for the edge expression layer
- `snare_rim_shot` for rimshots

The edge articulation is not relabelled as a separate recording technique. It is documented as a position-expression derivative of the off-centre acoustic recordings.

### Cross-stick recordings

Cross-stick round robins use four acoustic stick/rim recordings from Free Wave Samples. Those masters are 44.1 kHz, 16-bit PCM and are resampled once to 48 kHz during bank generation. This is the only articulation in the initial bank that does not originate from a 48 kHz master.

## Bank structure

The generated bank contains:

- 5 articulations: centre, off-centre, edge, rimshot, and cross-stick
- 6 velocity layers per articulation
- 4 round robins per layer
- 120 stereo samples in total
- 48 kHz signed 16-bit interleaved PCM for runtime playback

The original source depth is preserved during preprocessing. Runtime storage uses signed 16-bit PCM to keep the first production bank practical for APK distribution and memory residency. The native engine never decodes compressed audio in the callback.

## Preprocessing policy

The deterministic bank builder performs the following steps:

1. Reads the DrumGizmo power metadata and sorts each articulation by measured hit power.
2. Divides the available recordings into six velocity regions.
3. Selects four distributed recordings from each region as round robins.
4. Builds a controlled stereo mix from snare-top, snare-bottom, and a small amount of overhead signal.
5. Removes DC offset.
6. Finds the first crossing above -60 dBFS and aligns it to frame 128.
7. Applies the same maximum duration and tail fade policy to every sample.
8. Applies one global normalization gain across the complete bank, targeting -1 dBFS peak.
9. Quantizes once to interleaved PCM with deterministic triangular dither.
10. Writes a manifest containing source members, source power, frame counts, peaks, and the bank SHA-256 digest.

Samples are not normalized independently. Relative hit dynamics remain intact.

## Runtime model

The native engine loads the complete PCM bank before opening the Oboe stream. The real-time callback performs no file access, decoding, allocation, locking, JNI calls, or logging.

For each snare strike it:

- resolves the touch to one of the five articulations before entering the callback
- rotates through four round robins independently for each articulation and velocity layer
- plays the two adjacent velocity layers with equal-power interpolation
- applies approximately ±0.45% pitch variation
- applies approximately ±0.45 dB gain variation
- applies a small articulation-aware filter variation
- preserves the full dry signal
- adds room processing as a low-level parallel wet signal

The other seven instruments intentionally retain their placeholder synthesis. Their sample libraries should not expand until the snare has passed repeated fast-stroke listening tests on physical devices.

## Musical validation

Automated checks validate bank structure, source counts, articulation mapping, build integrity, and native compilation. Human listening on a physical Android device remains required for:

- repeated single strokes at one velocity
- slow-to-fast crescendos
- double strokes and buzz-like repetitions
- flams
- rapid centre-to-edge movement
- rimshot and cross-stick distinction
- dry-versus-room balance
- clipping, voice stealing, underruns, and route changes
