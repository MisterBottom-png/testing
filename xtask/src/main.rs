//! A-Studio developer tasks.
//!
//! `cargo run -p xtask -- layers` checks that every workspace crate depends only on crates in
//! lower layers (docs/02-architecture.md). `cargo run -p xtask -- assets` checks that every asset
//! file has a row in ASSETS.md. More tasks (corpus, bundle, ico, version) are ported from the
//! upstream xtasks in later phases.

#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

mod assets;
mod table;

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use table::{Class, INTRA_LAYER, TABLE};

fn main() -> ExitCode {
    let task = std::env::args().nth(1).unwrap_or_default();
    match task.as_str() {
        "layers" => match check_layers(&workspace_root()) {
            Ok(n) => {
                println!("layers: {n} crates checked, no violations");
                ExitCode::SUCCESS
            }
            Err(errors) => {
                for e in &errors {
                    eprintln!("layers: {e}");
                }
                eprintln!("layers: {} violation(s)", errors.len());
                ExitCode::FAILURE
            }
        },
        "assets" => match assets::run(&workspace_root()) {
            Ok(n) => {
                println!("assets: all {n} asset files attributed in ASSETS.md");
                ExitCode::SUCCESS
            }
            Err(e) => {
                eprintln!("assets: {e}");
                ExitCode::FAILURE
            }
        },
        _ => {
            eprintln!("usage: cargo run -p xtask -- <task>\n\ntasks:\n  layers   check crate layering\n  assets   check every asset file has an ASSETS.md row");
            ExitCode::from(2)
        }
    }
}

fn workspace_root() -> PathBuf {
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    here.parent().map(Path::to_path_buf).unwrap_or(here)
}

/// A crate's name and its `astudio-*` dependencies, by section.
struct Manifest {
    name: String,
    deps: Vec<(String, String)>, // (section, dependency)
}

/// Reads the few fields the layer check needs, without a TOML parser (xtask has no dependencies).
fn read_manifest(path: &Path) -> Option<Manifest> {
    let text = fs::read_to_string(path).ok()?;
    let mut section = String::new();
    let mut name = None;
    let mut deps = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.starts_with('[') {
            section = line.trim_matches(|c| c == '[' || c == ']').to_string();
            continue;
        }
        let Some((key, value)) = line.split_once('=') else { continue };
        let key = key.trim();
        if section == "package" && key == "name" {
            name = Some(value.trim().trim_matches('"').to_string());
        } else if section.ends_with("dependencies") && key.starts_with("astudio-") {
            deps.push((section.clone(), key.to_string()));
        }
    }
    Some(Manifest { name: name?, deps })
}

fn class_of(name: &str) -> Option<Class> {
    TABLE.iter().find(|(n, _)| *n == name).map(|(_, c)| *c)
}

fn rank(c: Class) -> u8 {
    match c {
        Class::Layer(l) => l,
        Class::Standalone => 0,
        Class::Testkit => 6,
    }
}

/// Checks one dependency edge `name` (class `from`) -> `dep` (class `to`) listed in `section`.
fn edge_error(name: &str, from: Class, section: &str, dep: &str, to: Class) -> Option<String> {
    let dev = section.contains("dev-dependencies");
    // A crate naming itself (a dev-dependency that switches on its own test features) is no edge.
    if dep == name {
        return None;
    }
    if from == Class::Standalone {
        return Some(format!("{name} -> {dep}: standalone crates have no workspace dependencies"));
    }
    if to == Class::Testkit {
        // The testkit as a dev-dependency is how tests use it, from any layer.
        return (!dev).then(|| format!("{name} -> {dep}: testkit may only be a dev-dependency"));
    }
    let same_layer_ok = INTRA_LAYER.iter().any(|(a, b)| *a == name && *b == dep);
    if rank(to) > rank(from) || (rank(to) == rank(from) && !same_layer_ok) {
        return Some(format!("{name} (L{}) -> {dep} (L{}): may only depend on lower layers", rank(from), rank(to)));
    }
    None
}

fn check_layers(root: &Path) -> Result<usize, Vec<String>> {
    let mut manifests = BTreeMap::new();
    let crates_dir = root.join("crates");
    let entries = fs::read_dir(&crates_dir).map_err(|e| vec![format!("cannot read {}: {e}", crates_dir.display())])?;
    for entry in entries.flatten() {
        let path = entry.path().join("Cargo.toml");
        if let Some(m) = read_manifest(&path) {
            manifests.insert(m.name.clone(), m);
        }
    }
    let mut errors = Vec::new();
    for m in manifests.values() {
        let Some(from) = class_of(&m.name) else {
            errors.push(format!("{}: not in xtask/src/table.rs", m.name));
            continue;
        };
        for (section, dep) in &m.deps {
            let Some(to) = class_of(dep) else {
                errors.push(format!("{} -> {dep}: dependency not in the layering table", m.name));
                continue;
            };
            if let Some(e) = edge_error(&m.name, from, section, dep, to) {
                errors.push(e);
            }
        }
    }
    if errors.is_empty() { Ok(manifests.len()) } else { Err(errors) }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_has_no_duplicates() {
        let mut names: Vec<_> = TABLE.iter().map(|(n, _)| *n).collect();
        names.sort_unstable();
        names.dedup();
        assert_eq!(names.len(), TABLE.len());
    }

    #[test]
    fn workspace_passes() {
        assert!(check_layers(&workspace_root()).is_ok());
    }

    #[test]
    fn testkit_is_a_dev_dependency_from_any_layer() {
        let (geom, kit) = (Class::Layer(0), Class::Testkit);
        assert_eq!(edge_error("astudio-geom", geom, "dev-dependencies", "astudio-testkit", kit), None);
        assert!(edge_error("astudio-geom", geom, "dependencies", "astudio-testkit", kit).is_some());
        // Standalone crates have no workspace dependencies at all, the testkit included.
        assert!(edge_error("astudio-psd", Class::Standalone, "dev-dependencies", "astudio-testkit", kit).is_some());
        // ...but may name themselves to switch on their own test features (`testgen`).
        assert_eq!(edge_error("astudio-psd", Class::Standalone, "dev-dependencies", "astudio-psd", Class::Standalone), None);
        // Upward dev-dependencies on real crates stay forbidden.
        assert!(edge_error("astudio-geom", geom, "dev-dependencies", "astudio-doc", Class::Layer(1)).is_some());
        assert!(edge_error("astudio-effects", Class::Layer(2), "dependencies", "astudio-plugins", Class::Layer(2)).is_none());
        assert!(edge_error("astudio-plugins", Class::Layer(2), "dependencies", "astudio-effects", Class::Layer(2)).is_some());
    }

    #[test]
    fn intra_layer_edges_name_known_crates_in_one_layer() {
        let class = |n: &str| TABLE.iter().find(|(name, _)| *name == n).map(|(_, c)| *c);
        for (from, to) in INTRA_LAYER {
            let (f, t) = (class(from), class(to));
            assert!(f.is_some() && t.is_some(), "unknown crate in INTRA_LAYER: {from} -> {to}");
            assert_eq!(f, t, "INTRA_LAYER edge crosses layers: {from} -> {to}");
            assert!(!INTRA_LAYER.contains(&(*to, *from)), "INTRA_LAYER cycle: {from} <-> {to}");
        }
        // P2-00: live effects run effect plug-ins; plug-ins sit below effects inside L2.
        assert_eq!(class("astudio-plugins"), Some(Class::Layer(2)));
        assert!(INTRA_LAYER.contains(&("astudio-effects", "astudio-plugins")));
    }
}
