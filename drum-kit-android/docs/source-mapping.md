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

The native model now separates normalized draw bounds from independent typed hit regions. Supported hit-region shapes are ellipse, circle, polygon, and rectangle. Render z-index and hit-test priority are also modeled and sorted independently.

Normalized strike coordinates use a stable `[0, 1]` playable-surface-local contract. The same viewport-aware rotation transform now drives hit selection, strike coordinates, impact animation placement, and debug hit-region rendering. Transient animation geometry does not change the canonical playable region.

## Fixed camera contract

Phase 2 Step 2.1 defines one shared elevated drummer-view camera in `StudioKitCamera`:

- Elevation: 24 degrees
- Normalized horizon: 0.68 from the top of the playable surface
- Reference landscape viewport: 1536 by 707 pixels
- Drum-head ellipse compression: 0.27 minor axis to major axis
- Cymbal ellipse compression: 0.18 minor axis to major axis

The elevation and horizon retain the prototype's slightly elevated viewpoint and floor transition. The compression ratios normalize representative drum and cymbal profiles from the prototype into explicit screen-space targets.

## Camera-aligned kit placement

Phase 2 Step 2.2 applies the fixed camera contract to the normalized instrument layout:

- Rack tom centers flank the kick center symmetrically.
- The snare sits lower and to the player's left.
- The floor tom sits to the player's right, behind the snare line, and is larger than either rack tom.
- The hi-hat sits left of the snare in a player-side position.
- The crash and ride are rebalanced around the rack toms, with the ride remaining larger.
- Cymbal and drum draw-bound heights are derived from the shared camera compression targets.
- The top 12 percent of the playable surface remains reserved as a control-safe area.
- Hit-test priority remains unchanged; Step 2.3 subsequently revises visual depth independently.

## Depth relationships and shared floor plane

Phase 2 Step 2.3 separates the renderer into background-shadow, support-hardware, and playable-surface passes:

- Crash and ride remain the farthest visual surfaces.
- The kick renders behind the rack toms, floor tom, hi-hat, and snare.
- Rack toms render behind the player-side snare while remaining in front of the kick.
- Cymbal and hi-hat stands render before every drum surface, so hardware stays visually behind shells.
- Rack-tom mount stems render behind both the kick and rack-tom surfaces.
- Kick legs, floor-tom legs, the snare stand, and cymbal stands terminate at the shared normalized floor plane `StudioKitCamera.FLOOR_PLANE_Y = 0.94`.
- Instrument rotation applies to playable surfaces and shadows, not to floor anchors, so stand feet remain grounded.

## Hardware occlusion and shadow masks

Phase 2 Step 2.4 merges support and surface layers by explicit depth instead of drawing every stand behind every drum. Rack-tom mounts remain behind the kick, while foreground snare, floor-tom, and hi-hat supports remain in front of background drums and behind their own surfaces. Canonical rotated surface masks are cached during `onSizeChanged()` and reused to clip grounded shadows out of shells, heads, kicks, and cymbals without steady-state allocation. Animated deformation does not alter the canonical occlusion mask or playable hit region.

## Cached layered instrument artwork

Phase 2 Step 2.5 replaces the transitional per-frame shell, head, kick, and cymbal primitives with renderer-key artwork profiles and cached Canvas layers built during `onSizeChanged()`. Drum caches separate shell, bottom hoop, lugs, reflections, and wear from the animated batter head and top hoop. The snare uses a brushed-steel material profile. The kick separates its wine shell and rear hoop from the animated dark front head, port, badge, and front hoop. Cymbal caches include bronze edge shading, six lathe rings, deterministic hammering marks, raised bells, highlights, felt/bolt hardware, and a darker lower hi-hat disc. Body and playable layers remain separate so existing position- and velocity-driven deformation continues without rebuilding static detail. Cached bitmaps are released and rebuilt on resize and retained across temporary View detach/reattach cycles.

## Pre-2.6 corrective audit

The corrective audit separates complete artwork bounds, rendered playable-surface bounds, and touch hit regions into three explicit contracts. Artwork no longer changes size when hit boxes are tuned. All kit-level hit APIs now delegate to the same viewport-aware geometry used by `DrumSurfaceView`. Head and cymbal hit ellipses are inset from visible rims and hardware, and the former kick/snare overlap is removed at the reference landscape viewport.

## Prototype behavior represented in the base

- Multi-touch strike input
- Pressure and contact-size capture
- Position-aware brightness input
- Instrument-specific stereo panning
- Master volume and room controls
- Haptic toggle
- Fullscreen landscape presentation
- Kick, snare, three toms, hi-hat, crash, and ride

## Redesign behavior implemented

- Compact kit selector in the upper-left corner
- Compact recording and mixer controls in the upper-right corner
- Expandable Room, Volume, and Haptics controls
- Fixed-capacity strike-performance recording with relative timing and expressive input values
- Recording finalization when the activity stops or audio becomes unavailable
- Debug-only audio diagnostics and diagnostics polling
- Android audio-focus acquisition, loss handling, delayed focus support, and startup retry
- Automatic Oboe stream recovery after unexpected closure, with shared-mode fallback when exclusive opening fails
- Closed-stream-safe diagnostics access and finite-value validation at Kotlin and native audio boundaries
- Independent draw bounds, visual playable-surface bounds, and playable hit regions
- Shared viewport-aware rotation for rendering, hit testing, strike positions, and debug overlays
- Playable-surface-local strike coordinates for audio and animation input
- Independent render z-index and hit-test priority
- Labels outside playable heads with timed fade-out
- Per-instrument strike position, velocity, start time, active-pointer count, deformation, and rotation state
- Faster snare rebound and progressively slower tom rebound
- Kick-head compression, cymbal flex, and hi-hat upper-disc movement
- Cached static rectangles, labels, occlusion paths, and layered instrument artwork created in `onSizeChanged()`
- Animation-only redraw through `postInvalidateOnAnimation()`
- System-respecting haptic feedback with restrained velocity thresholds
- Audio dispatch before recording, haptic, and visual state updates
- Shared fixed camera constants and projected ellipse helpers for the Phase 2 layout
- Camera-aligned instrument positions, scale relationships, and control-safe placement
- Explicit drummer-view surface depth, independently layered support hardware, cached occlusion masks, layered material profiles, and one shared floor plane
- CI unit tests, Android build, lint, and downloadable debug APK artifact

The performance recorder uses preallocated primitive arrays during play. It materializes immutable recorded-strike objects only after STOP or lifecycle finalization, keeping the touch-to-audio path ahead of recording work.

## Redesign behavior remaining

- RenderNode caching for complete static instrument layers
- Device-profiled hit-region tuning and render performance
- Strike-take playback and PCM/WAV export
- Optional AGSL effects after profiling

## Deliberately deferred

The following behaviors require later expressive-engine phases and are not faked in the foundation:

- Sample layers and round robins
- Five-zone snare articulation model
- Continuous pressure damping and pitch bend
- Continuous hi-hat openness and pedal events
- Cymbal edge, bow, bell, choke, and mute behavior
- Snare throw-off, rimshot, cross-stick, and press roll
- PCM/WAV export, MIDI, and calibration
- OpenGL rendering unless profiling proves Canvas/RenderNode insufficient

## Architectural decisions

- No WebView
- Compose for application shell, selectors, settings, sheets, and overlays
- Custom Android `View` for raw `MotionEvent` access, hit testing, animation state, and rendering
- C++/Oboe for the audio callback
- Fixed-capacity event queue, voice pool, and performance-recording buffers
- No allocation or Kotlin calls from the real-time callback
- Source-independent instrument definitions to support future kits
- Render technology remains independent from input and audio contracts

## Foundation completion

The repository now covers the practical core of Phase 0, the audio-stream portion of Phase 1, the raw multi-touch path from Phase 2, a synthesized placeholder version of the Phase 3 instrument map, the first structural slice of the 2.5D UI redesign, fixed-capacity expressive strike-performance capture, the fixed camera contract, the camera-aligned Phase 2 kit placement, explicit Step 2.3 depth relationships, Step 2.4 hardware occlusion, Step 2.5 cached layered artwork, the pre-2.6 geometry and cache-lifecycle corrections, cached surface masks, a shared floor plane, shared viewport-aware input geometry, and lifecycle-hardened audio operation.
