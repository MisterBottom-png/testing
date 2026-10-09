//! Golden paragraphs (P2-10): Latin (bundled Source Serif 4: justified, hyphenated, ligatures,
//! kerning, two sizes), Arabic (Noto Sans Arabic: right to left with Latin and digits inside) and
//! Japanese vertical (BIZ UDMincho: punctuation, tate-chu-yoko, sideways Latin) laid out exactly as
//! VectorCraft's own engine lays them out (`data/golden_paragraphs.txt`, from vectorcraft@8b036df
//! by `scripts/goldens/paragraphs-vectorcraft`): pen positions to 1/1000 pt and each glyph's
//! drawing transform (tate-chu-yoko, upright and sideways turns, mark offsets). The Arabic and Japanese cases need
//! craft-fonts (`CRAFT_FONTS_DIR`, a checkout; scripts/bootstrap.sh --fonts) and are
//! skipped without it; system font fallback is off, so the result is the same on every machine.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_geom as geom;
use astudio_text::TextLayout as Layout;
use astudio_vdoc as doc;

#[path = "golden/cases.rs"]
mod cases;

/// The golden's lines for case `name`.
fn golden(name: &str) -> Vec<String> {
    let all = include_str!("data/golden_paragraphs.txt");
    let head = format!("case {name} ");
    let mut out = Vec::new();
    let mut inside = false;
    for line in all.lines().filter(|l| !l.starts_with('#')) {
        if line.starts_with("case ") {
            inside = line.starts_with(&head);
        }
        if inside {
            out.push(line.to_string());
        }
    }
    out
}

/// The values of a golden line, keyed (`x=1.234` → ("x", "1.234"); `xf=a,b,…` → ("xf", "a")…).
fn fields(line: &str) -> Vec<(String, String)> {
    line.split_whitespace().filter_map(|w| w.split_once('=')).flat_map(|(k, v)| v.split(',').map(move |v| (k.to_string(), v.to_string()))).collect()
}

/// `CRAFT_FONTS_DIR`, a relative one taken from the workspace root as `build.rs` takes it.
fn craft_fonts_dir() -> Option<std::path::PathBuf> {
    let dir = std::path::PathBuf::from(std::env::var_os("CRAFT_FONTS_DIR")?);
    Some(if dir.is_absolute() { dir } else { std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..").join(dir) })
}

#[test]
fn paragraphs_lay_out_as_in_vectorcraft() {
    let dir = craft_fonts_dir();
    let mut checked = 0;
    for c in cases::cases() {
        let db = astudio_text::FontDb::with_font_dirs(vec![]);
        db.set_system_fallback(false);
        if !c.craft_fonts.is_empty() {
            let Some(dir) = &dir else {
                println!("{}: skipped (needs craft-fonts: CRAFT_FONTS_DIR)", c.name);
                continue;
            };
            for f in c.craft_fonts {
                let path = dir.join("fonts").join(f);
                db.add_font(std::fs::read(&path).unwrap_or_else(|e| panic!("{}: {e}", path.display())));
            }
        }
        let ours: Vec<String> = cases::dump(c.name, &astudio_text::layout(&db, &c.object)).lines().map(String::from).collect();
        let want = golden(c.name);
        assert!(!want.is_empty(), "{}: no golden", c.name);
        assert_eq!(ours.len(), want.len(), "{}: {} lines and glyphs, VectorCraft {}", c.name, ours.len(), want.len());
        for (o, w) in ours.iter().zip(&want) {
            let (fo, fw) = (fields(o), fields(w));
            let same = fo.len() == fw.len()
                && fo.iter().zip(&fw).all(|((ko, vo), (kw, vw))| {
                    // Within one and a half units of the golden's last printed digit.
                    let tol = 1.5 * 10f64.powi(-(vw.split_once('.').map_or(0, |(_, d)| d.len()) as i32));
                    ko == kw && (vo == vw || vo.parse::<f64>().ok().zip(vw.parse::<f64>().ok()).is_some_and(|(a, b)| (a - b).abs() <= tol))
                });
            assert!(same, "{}:\n  ours        {o}\n  VectorCraft {w}\n(the golden was laid out with craft-fonts@8dcdacd: check the checkout)", c.name);
        }
        checked += 1;
    }
    assert!(checked >= 1);
}
