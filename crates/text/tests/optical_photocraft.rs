//! Optical kerning matches PhotoCraft (P2-07): for every pair of PhotoCraft's 94-pair sample in
//! A-Studio's six bundled fonts, `astudio_text::optical` gives the adjustment PhotoCraft's own code
//! gives (`tests/data/optical_photocraft.txt`, from photocraft@e5e3e39 with its skrifa 0.44 by
//! `scripts/goldens/optical-photocraft`). A-Studio reads the outlines with skrifa 0.47.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_text::optical::Cache;
use skrifa::MetadataProvider;

/// Largest allowed difference, 1/1000 em (PhotoCraft's own fit to Photoshop is ±8 to 17).
const TOLERANCE: f32 = 0.01;

fn font_bytes(name: &str) -> Vec<u8> {
    std::fs::read(format!("{}/../../assets/fonts/{name}.ttf", env!("CARGO_MANIFEST_DIR"))).unwrap()
}

#[test]
fn optical_kerning_matches_photocraft() {
    let data = include_str!("data/optical_photocraft.txt");
    let mut fonts: Vec<(String, Vec<u8>, Cache)> = Vec::new();
    let (mut checked, mut worst) = (0, 0.0f32);
    for line in data.lines().filter(|l| !l.starts_with('#')) {
        let [name, pair, want]: [&str; 3] = line.split(' ').collect::<Vec<_>>().try_into().unwrap();
        if fonts.last().is_none_or(|f| f.0 != name) {
            fonts.push((name.to_string(), font_bytes(name), Cache::default()));
        }
        let (_, bytes, cache) = fonts.last_mut().unwrap();
        let font = skrifa::FontRef::from_index(bytes, 0).unwrap();
        let g = |c: char| font.charmap().map(c).unwrap().to_u32();
        let mut cs = pair.chars();
        let (l, r) = (g(cs.next().unwrap()), g(cs.next().unwrap()));
        let ours = cache.pair(1, bytes, 0, &[], l, r);
        match want {
            "none" => assert_eq!(ours, None, "{line}"),
            k => {
                let k: f32 = k.parse().unwrap();
                let ours = ours.unwrap_or_else(|| panic!("{line}: A-Studio gives none"));
                worst = worst.max((ours - k).abs());
                assert!((ours - k).abs() <= TOLERANCE, "{line}: A-Studio gives {ours}");
            }
        }
        checked += 1;
    }
    eprintln!("{checked} pairs, largest difference {worst} / 1000 em");
    assert_eq!(checked, 6 * 94);
}
