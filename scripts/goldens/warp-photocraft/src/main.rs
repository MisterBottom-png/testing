// Run: cd scripts/goldens/warp-photocraft && CARGO_TARGET_DIR=../../../target/goldens cargo run -q > ../../../crates/text/tests/data/warp_photocraft.txt.new
// (then put the three comment lines of the old file back on top). Needs upstream/ (scripts/bootstrap.sh).
// Prints PhotoCraft's Warp Text mapping (photocraft_geom::warp::StyleWarp, as photocraft-text's
// warp::Warp::new calls it) for every style over a grid: the golden for A-Studio's P2-06 test.
use photocraft_geom::warp::{StyleWarp, WarpStyle};
const STYLES: [&str; 15] = ["warpArc","warpArcLower","warpArcUpper","warpArch","warpBulge","warpShellLower","warpShellUpper","warpFlag","warpWave","warpFish","warpRise","warpFisheye","warpInflate","warpSqueeze","warpTwist"];
fn main() {
    let bounds = [0.0f32, -40.0, 200.0, 10.0];
    for s in STYLES {
        for value in [-50.0f32, 75.0] {
            for (hd, vd) in [(0.0f32, 0.0f32), (25.0, -40.0)] {
                for horizontal in [true, false] {
                    let style = WarpStyle::parse(s).filter(|st| st.is_preset() && st.psd_name() == s).expect("style");
                    let Some(w) = StyleWarp::new(style, f64::from(value), f64::from(hd), f64::from(vd), !horizontal, bounds.map(f64::from)) else { println!("{s} {value} {hd} {vd} {horizontal} none"); continue };
                    for x in [0.0, 50.0, 100.0, 150.0, 200.0] {
                        for y in [-40.0, -15.0, 10.0] {
                            let (wx, wy) = w.apply(x, y);
                            println!("{s} {value} {hd} {vd} {horizontal} {x} {y} {wx:?} {wy:?}");
                        }
                    }
                }
            }
        }
    }
}
