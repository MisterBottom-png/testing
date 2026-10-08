//! Web app (built with trunk). Stub until phase P4 (see docs/01-roadmap.md).
#![forbid(unsafe_code)]

/// Layer of the engine this shell drives.
pub fn engine_layer() -> &'static str {
    astudio_engine::LAYER
}
