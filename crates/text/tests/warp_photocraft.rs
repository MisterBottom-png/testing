//! Warp Text matches PhotoCraft (P2-06): for all 15 styles, two bends, with and without
//! distortion, horizontal and vertical, A-Studio maps a 5 x 3 grid of text-space points to exactly
//! the numbers PhotoCraft's code gives (`tests/data/warp_photocraft.txt`, from photocraft@e5e3e39 by
//! `scripts/goldens/warp-photocraft`), within 1e-9 px.
//! Equal geometry is stronger than the task's "within 1/255"; the pixel comparison of warped text
//! needs text rendering into tiles and joins P2-08.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_doc::text::TextWarp;
use astudio_text::warp::{STYLES, Warp};

#[test]
fn warp_text_matches_photocraft_exactly() {
    let data = include_str!("data/warp_photocraft.txt");
    let mut checked = 0;
    let mut styles = std::collections::BTreeSet::new();
    for line in data.lines().filter(|l| !l.starts_with('#')) {
        let f: Vec<&str> = line.split(' ').collect();
        assert_eq!(f.len(), 9, "{line}");
        let num = |i: usize| f[i].parse::<f64>().unwrap();
        let w = TextWarp {
            style: f[0].into(),
            value: num(1) as f32,
            horizontal_distortion: num(2) as f32,
            vertical_distortion: num(3) as f32,
            horizontal: f[4] == "true",
        };
        let warp = Warp::new(&w, [0.0, -40.0, 200.0, 10.0]).unwrap_or_else(|| panic!("{line}"));
        let (x, y) = warp.apply(num(5), num(6));
        // The golden was computed on Linux; Windows' sin/cos may differ in the last bit, so
        // "exactly" is within 1e-9 px (far inside 1/255).
        assert!((x - num(7)).abs() <= 1e-9 && (y - num(8)).abs() <= 1e-9, "{line}: A-Studio gives {x:?} {y:?}");
        styles.insert(f[0].to_string());
        checked += 1;
    }
    assert_eq!(checked, 15 * 2 * 2 * 2 * 15);
    assert_eq!(styles.len(), STYLES.len(), "every style is covered");
}
