//! # astudio-testkit (testkit)
//!
//! Test helpers and fixtures.
//!
//! Built from: pc + vc testkit (see `docs/02-architecture.md`).
//! Status: vc `geom` and the geometry part of vc `strategies` (P2-01); the rest is ported with the
//! crates that need it.
//!
//! - [`geom`]: geometry assertions (approximate equality, curve sampling, Hausdorff distance).
//! - [`strategies`]: proptest strategies for geometry.
//! - [`fixtures`]: vector documents built directly (vc `fixtures`, P2-14; engine sessions: P3-02).
//! - [`raster`]: rendering a vector document and comparing images (vc `raster`, P2-14).
//! - [`invariants`]: structural checks for vector documents (vc `invariants`, P2-15).
//! - [`pdf`]: hand-written PDF files for import tests (vc `pdf`, P2-15).
//! - [`format`]: what the importer tests use of VectorCraft's `format` crate (until it is ported).
//!
//! This crate may only be used as a dev-dependency (enforced by `cargo xtask layers`).
// Test support only: a failed setup or assertion must panic, like `assert!`, so the shipped-code
// ban on panicking (AGENTS.md › Never crash) does not apply here.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]
#![deny(clippy::todo, clippy::unimplemented)]
#![forbid(unsafe_code)]

pub mod fixtures;
pub mod geom;
pub mod invariants;
pub mod pdf;
pub mod raster;
pub mod strategies;

/// Re-export so tests can export and re-import SVG without their own dependency (as VectorCraft's
/// testkit does).
pub use astudio_svg as svg;

/// VectorCraft's `format` crate (astudio-format's `vectorcraft` module, P3-12), so tests can save
/// and load `.vectorcraft` without their own dependency (as VectorCraft's testkit does).
pub use astudio_format::vectorcraft as format;

/// Layer of this crate in the A-Studio layering table (`xtask/src/table.rs`).
pub const LAYER: &str = "testkit";

/// A fresh temporary folder for one test run (VectorCraft's `temp_dir`).
pub fn temp_dir(tag: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(format!("astudio-testkit-{tag}-{}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("create temp dir");
    dir
}

#[cfg(test)]
mod tests {
    #[test]
    fn layer_is_set() {
        assert!(!super::LAYER.is_empty());
    }
}
