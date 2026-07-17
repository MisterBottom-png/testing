# Source mapping

This foundation was extracted from the supplied `hyper_realistic_android_drum_kit.html` prototype, the native Android implementation plan, and the 2.5D studio-instrument redesign brief.

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

The current foundation uses normalized rectangles for both drawing and hit testing. The redesign replaces that temporary coupling with normalized draw bounds plus independent typed hit regions. Supported hit-region shapes are ellipse, circle, polygon, and rectangle. Render z-index and hit-test priority are modeled independently.

Normalized strike coordinates remain in the existing `[0, 1]` instrument-local contract and must not depend on transient animation geometry.

## Prototype behavior represented in the base

- Multi-touch strike input
- Pressure and contact-size capture
- Position-aware brightness input
- Instrument-specific stereo panning
- Master volume and room controls
- Haptic toggle
- Fullscreen landscape presentation
- Kick, snare, three toms, hi-hat, crash, and ride

## Redesign behavior to add

- Compact kit selector in the upper-left corner
- Compact settings and recording controls in the upper-right corner
- Expandable Room, Volume, and Haptics controls
- Debug-only audio diagnostics
- One elevated drummer-view camera perspective
- Layered 2.5D drum and cymbal artwork
- Independent draw bounds and playable hit regions
- Independent render z-index and hit-test priority
- Labels outside playable heads with optional fade-out
- Position- and velocity-based drumhead deformation
- Cymbal flex, tilt, and hi-hat upper-disc movement
- Cached static artwork and animation-only invalidation
- System-respecting restrained haptics

## Deliberately deferred

The following behaviors require later expressive-engine phases and are not faked in the foundation:

- Sample layers and round robins
- Five-zone snare articulation model
- Continuous pressure damping and pitch bend
- Continuous hi-hat openness and pedal events
- Cymbal edge/bow/bell zones and choking
- Snare throw-off, rimshot, cross-stick, and press roll
- Recording export, MIDI, and calibration
- OpenGL rendering unless profiling proves Canvas/RenderNode insufficient

## Architectural decisions

- No WebView
- Compose for application shell, selectors, settings, sheets, and overlays
- Custom Android `View` for raw `MotionEvent` access, hit testing, animation state, and rendering
- C++/Oboe for the audio callback
- Fixed-capacity event queue and voice pool
- No allocation or Kotlin calls from the real-time callback
- Source-independent instrument definitions to support future kits
- Audio dispatch precedes haptic and visual work
- Render technology remains independent from input and audio contracts

## Foundation completion

This branch covers the practical core of Phase 0, the audio-stream portion of Phase 1, the basic multi-touch path from Phase 2, and a synthesized placeholder version of the Phase 3 instrument map. The next implementation stage is the 2.5D renderer and interaction-model redesign described above.
