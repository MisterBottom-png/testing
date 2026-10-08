//! # astudio-geom (L0)
//!
//! Geometry: kurbo-based paths, transforms, integer pixel rects, tiles, warp.
//!
//! Built from: vc geom + pc geom (see `docs/02-architecture.md`).
//! Status: empty stub. Port the upstream crate here in the roadmap phase that owns it.
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

/// Layer of this crate in the A-Studio layering table (`xtask/src/table.rs`).
pub const LAYER: &str = "L0";

#[cfg(test)]
mod tests {
    #[test]
    fn layer_is_set() {
        assert!(!super::LAYER.is_empty());
    }
}
