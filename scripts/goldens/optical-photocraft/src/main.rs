// Run: cd scripts/goldens/optical-photocraft && CARGO_TARGET_DIR=../../../target/goldens cargo run -q > ../../../crates/text/tests/data/optical_photocraft.txt.new
// (then put the comment lines of the old file back on top). Needs upstream/ (scripts/bootstrap.sh).
//
// Prints PhotoCraft's optical kerning (its own optical.rs, compiled here unchanged with its own
// skrifa version) for every pair of its 94-pair sample string in A-Studio's bundled fonts: the
// golden for A-Studio's P2-07 test.
#![allow(dead_code)]
#[path = "../../../../upstream/photocraft/crates/text/src/optical.rs"]
mod optical;

use skrifa::MetadataProvider;

const SAMPLE: &str = "HHOOHnnoonvAVTAToTyLTWaYoPAFAVaxyrnilHIOHnHoxoxcdbpkkwwAAVVff1471LYTeKOnHeHaHsHtHgHzHkHxHvHwrst";
const FONTS: [&str; 6] = ["Inter-Regular", "Inter-SemiBold", "JetBrainsMono-Regular", "SourceSans3-Regular", "SourceSans3-It", "SourceSerif4-Regular"];

fn main() {
    let chars: Vec<char> = SAMPLE.chars().collect();
    for name in FONTS {
        let data = std::fs::read(format!("../../../assets/fonts/{name}.ttf")).expect("bundled font");
        let font = skrifa::FontRef::from_index(&data, 0).expect("font");
        let mut cache = optical::Cache::default();
        for w in chars.windows(2) {
            let g = |c: char| font.charmap().map(c).map(|g| g.to_u32());
            let k = match (g(w[0]), g(w[1])) {
                (Some(l), Some(r)) => cache.pair(1, &data, 0, &[], l, r).map_or("none".to_string(), |k| format!("{k:?}")),
                _ => "nochar".to_string(),
            };
            println!("{name} {}{} {k}", w[0], w[1]);
        }
    }
}
