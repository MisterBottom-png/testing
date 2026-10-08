//! `cargo run -p xtask -- assets`: every non-code asset must be attributed in `ASSETS.md`.
//!
//! Scans all git-tracked (and untracked, not ignored) files with an asset extension, plus
//! everything under `assets/`, `docs/images/` and `examples/`, and fails if a path is not listed
//! as `` `path` `` in ASSETS.md. See the asset rules in AGENTS.md.
//!
//! Ported from vectorcraft@8b036df xtask/src/assets.rs (MIT OR Apache-2.0, Copyright (c) 2026
//! ArtCraft Team and the VectorCraft contributors).

use std::path::Path;
use std::process::Command;

const ASSET_EXT: &[&str] = &[
    "png",
    "jpg",
    "jpeg",
    "gif",
    "webp",
    "bmp",
    "tif",
    "tiff",
    "ico",
    "icns",
    "svg",
    "pdf",
    "ai",
    "eps",
    "psd",
    "icc",
    "icm",
    "ttf",
    "otf",
    "woff",
    "woff2",
    "ase",
    "aco",
    "abr",
    "astudio",
    "pcraft",
    "vectorcraft",
    "mp4",
    "wav",
    "mp3",
];
const ASSET_DIRS: &[&str] = &["assets/", "docs/images/", "examples/"];

pub fn is_asset(path: &str) -> bool {
    let ext = Path::new(path).extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).unwrap_or_default();
    ASSET_DIRS.iter().any(|d| path.starts_with(d)) || ASSET_EXT.contains(&ext.as_str())
}

/// Paths that need an ASSETS.md entry but lack one.
pub fn missing(files: &[String], assets_md: &str) -> Vec<String> {
    files.iter().filter(|f| is_asset(f) && !assets_md.contains(&format!("`{f}`"))).cloned().collect()
}

/// Splits `git ls-files -z` output. `-z` gives raw paths; without it git quotes non-ASCII names
/// (`"assets/caf\303\251.png"`) and such files would slip past the check.
fn split_z(out: &[u8]) -> Vec<String> {
    out.split(|b| *b == 0).filter(|p| !p.is_empty()).map(|p| String::from_utf8_lossy(p).into_owned()).collect()
}

/// Files git knows about (tracked, or untracked and not ignored) that still exist on disk.
fn repo_files(root: &Path) -> Result<Vec<String>, String> {
    let out = Command::new("git")
        .current_dir(root)
        .args(["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
        .output()
        .map_err(|e| format!("git ls-files: {e}"))?;
    if !out.status.success() {
        return Err(format!("git ls-files failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(split_z(&out.stdout).into_iter().filter(|l| root.join(l).exists()).collect())
}

pub fn run(root: &Path) -> Result<usize, String> {
    let files = repo_files(root)?;
    let md = std::fs::read_to_string(root.join("ASSETS.md")).map_err(|e| format!("ASSETS.md: {e}"))?;
    let miss = missing(&files, &md);
    if miss.is_empty() {
        Ok(files.iter().filter(|f| is_asset(f)).count())
    } else {
        Err(format!("{} asset file(s) lack an ASSETS.md entry (author, source, licence):\n  {}", miss.len(), miss.join("\n  ")))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_unattributed_assets() {
        let files = vec!["assets/icons/a.svg".to_string(), "crates/x/src/lib.rs".into(), "docs/images/b.png".into(), "tests/fixture.png".into()];
        let md = "| `assets/icons/a.svg` | me | here | MIT |";
        assert_eq!(missing(&files, md), vec!["docs/images/b.png".to_string(), "tests/fixture.png".into()]);
        assert!(!is_asset("crates/x/src/lib.rs"));
        assert!(is_asset("assets/fonts/OFL.txt"));
    }

    #[test]
    fn non_ascii_paths_are_kept_verbatim() {
        let out = "assets/caf\u{e9}.png\0docs/a b.svg\0".as_bytes();
        assert_eq!(split_z(out), vec!["assets/caf\u{e9}.png".to_string(), "docs/a b.svg".into()]);
    }
}
