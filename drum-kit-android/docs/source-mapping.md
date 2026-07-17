# Source mapping

This foundation was extracted from the supplied `hyper_realistic_android_drum_kit.html` prototype and the native Android implementation plan.

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

The native layout uses normalized rectangles so rendering and hit testing scale across phones and tablets in landscape.

## Prototype behavior represented in the base

- Multi-touch strike input
- Pressure and contact-size capture
- Position-aware brightness input
- Instrument-specific stereo panning
- Master volume and room controls
- Haptic toggle
- Fullscreen landscape presentation
- Kick, snare, three toms, hi-hat, crash, and ride

## Deliberately deferred

The following behaviors require the later expressive-engine phases and are not faked in the foundation:

- Sample layers and round robins
- Five-zone snare articulation model
- Continuous pressure damping and pitch bend
- Continuous hi-hat openness and pedal events
- Cymbal edge/bow/bell zones and choking
- Snare throw-off, rimshot, cross-stick, and press roll
- Recording, export, MIDI, calibration, and production OpenGL rendering

## Architectural decisions

- No WebView
- Compose for application shell and controls
- Custom Android `View` for raw `MotionEvent` access
- C++/Oboe for the audio callback
- Fixed-capacity event queue and voice pool
- No allocation or Kotlin calls from the real-time callback
- Source-independent instrument definitions to support future kits

## Foundation completion

This branch covers the practical core of Phase 0, the audio-stream portion of Phase 1, the basic multi-touch path from Phase 2, and a synthesized placeholder version of the Phase 3 instrument map.
