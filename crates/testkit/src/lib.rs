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

/// What the importer tests use of VectorCraft's `format` crate (its `base64_decode`, copied from
/// vectorcraft@8b036df crates/format/src/lib.rs); becomes a re-export once that crate is ported.
pub mod format {
    const B64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    /// Decode standard base64 (whitespace ignored); `None` on bad input.
    pub fn base64_decode(s: &str) -> Option<Vec<u8>> {
        let val = |c: u8| B64.iter().position(|&b| b == c).map(|p| p as u32);
        let clean: Vec<u8> = s.bytes().filter(|b| !b.is_ascii_whitespace()).collect();
        if !clean.len().is_multiple_of(4) {
            return None;
        }
        let mut out = Vec::with_capacity(clean.len() / 4 * 3);
        for c in clean.chunks(4) {
            let mut n = 0u32;
            let mut pad = 0;
            for &b in c {
                n <<= 6;
                if b == b'=' {
                    pad += 1;
                } else {
                    n |= val(b)?;
                }
            }
            out.push((n >> 16) as u8);
            if pad < 2 {
                out.push((n >> 8) as u8);
            }
            if pad < 1 {
                out.push(n as u8);
            }
        }
        Some(out)
    }
}

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
