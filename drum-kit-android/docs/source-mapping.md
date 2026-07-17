# Source mapping

This native application was extracted from the supplied `hyper_realistic_android_drum_kit.html` prototype, implementation plan, and drum-acoustics research.

## Prototype mapping retained

| Prototype ID | Native instrument | Native code | Initial pan |
|---|---|---:|---:|
| `kick` / `kickPedal` | Kick | 0 | 0.00 |
| `snare` | Snare | 1 | -0.18 |
| `tomHigh` | High tom | 2 | -0.22 |
| `tomMid` | Mid tom | 3 | 0.14 |
| `floorTom` | Floor tom | 4 | 0.46 |
| `hihat` | Hi-hat | 5 | -0.62 |
| `crash` | Crash | 6 | -0.52 |
| `ride` | Ride | 7 | 0.52 |

The native layout uses normalized rectangles so rendering and hit testing scale across landscape phones and tablets.

## Prototype behavior retained or replaced

- Multi-touch strike input is retained through raw Android `MotionEvent` handling.
- Pressure and contact-size capture are retained as expressive input signals.
- Instrument mapping and initial stereo positions are retained.
- Master volume, room control, haptics, and fullscreen landscape presentation are retained.
- The HTML oscillator, filtered-noise, envelope, and synthetic-reverb snare is replaced by a sample-first acoustic instrument.
- The browser reverb concept is reduced to a low-level parallel room path so the dry acoustic signal remains primary.

## Production snare mapping

Native snare articulation codes are:

| Native code | Articulation | Input mapping | Runtime source |
|---:|---|---|---|
| 0 | Centre | Inner head radius | Acoustic centre recordings |
| 1 | Off-centre | Middle head radius | Acoustic off-centre recordings |
| 2 | Edge | Outer playable head radius | Off-centre acoustic recordings with restrained position-expression filtering |
| 3 | Rimshot | Hard hoop-area strike | Acoustic rimshot recordings |
| 4 | Cross-stick | Lower stick band or soft hoop strike | Acoustic side-stick and rim recordings |

The generated runtime bank contains six velocity layers and four round robins for each articulation. Adjacent velocity layers are interpolated rather than hard-switched.

## Deliberately deferred

- Continuous pressure damping and pitch bend
- Continuous hi-hat openness and pedal events
- Cymbal edge, bow, and bell zones and choking
- Snare throw-off and press roll
- Sample libraries for the other seven instruments
- Recording, export, MIDI, calibration, and production OpenGL rendering

## Architectural decisions

- No `WebView`
- Compose for application shell and controls
- Custom Android `View` for raw multi-touch access
- C++ and Oboe for the audio callback
- Fixed-capacity event queue and preallocated voice pool
- Complete snare PCM bank loaded before the stream starts
- No allocation, file access, decoding, locks, logging, or Kotlin calls from the real-time callback
- Source-independent instrument and articulation definitions for later kit expansion

## Current phase coverage

This branch covers the practical core of Phase 0, the low-latency stream work from Phase 1, the basic multi-touch path from Phase 2, and the first production instrument from Phase 3. The snare is sample-first; the remaining instruments are still clearly identified synthesis placeholders.
