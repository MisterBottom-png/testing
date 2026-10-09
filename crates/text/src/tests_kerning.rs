//! PhotoCraft's kerning tests (photocraft@e5e3e39 crates/text/src/tests.rs: manual kerning,
//! optical kerning, kerning modes splitting pairs), run on its text layers through
//! [`crate::layer::text_object`] and VectorCraft's engine (P2-17). Positions are in points at
//! 72 dpi, PhotoCraft's pixels there.

use astudio_doc::TextLayer;
use astudio_doc::text::{CharStyle, Kerning, ParagraphRun, ParagraphStyle, TextAlign, TextRun};

use crate::layer::text_object;
use crate::{FontDb, TextLayout, layout_with};

fn db() -> &'static FontDb {
    static DB: std::sync::OnceLock<FontDb> = std::sync::OnceLock::new();
    DB.get_or_init(|| FontDb::with_font_dirs(vec![]))
}

fn layout(layer: &TextLayer) -> TextLayout {
    let (t, opts) = text_object(layer, 72.0);
    layout_with(db(), &t, &opts)
}

fn styled(text: &str, style: CharStyle) -> TextLayer {
    TextLayer { text: text.into(), runs: vec![TextRun { len: text.len(), style }], ..Default::default() }
}

fn runs_of(text: &str, styles: &[(usize, CharStyle)]) -> TextLayer {
    TextLayer { text: text.into(), runs: styles.iter().map(|(len, style)| TextRun { len: *len, style: style.clone() }).collect(), ..Default::default() }
}

fn width(l: &TextLayout) -> f64 {
    l.lines.iter().map(|l| l.x1 - l.x0).fold(0.0, f64::max)
}

fn x(l: &TextLayout, i: usize) -> f64 {
    l.glyphs[i].origin.x
}

/// Manual kerning (1/1000 em) after a character moves everything after it by kern × size.
#[test]
fn manual_kerning_moves_the_next_glyph() {
    let s = CharStyle { size_pt: 100.0, ..Default::default() };
    let plain = layout(&styled("HOH", s.clone()));
    let kerned = layout(&runs_of("HOH", &[(1, CharStyle { kern: 100.0, ..s.clone() }), (2, s.clone())]));
    assert_eq!(x(&kerned, 0), x(&plain, 0));
    // 100/1000 em at 100 px = 10 px, for the next glyph and everything after it.
    assert!((x(&kerned, 1) - x(&plain, 1) - 10.0).abs() < 1e-3, "{} vs {}", x(&kerned, 1), x(&plain, 1));
    assert!((x(&kerned, 2) - x(&plain, 2) - 10.0).abs() < 1e-3);
    assert!((width(&kerned) - width(&plain) - 10.0).abs() < 1e-3);
    // Negative kerning tightens; kerning on the last character doesn't move anything.
    let tight = layout(&runs_of("HOH", &[(1, CharStyle { kern: -50.0, ..s.clone() }), (2, s.clone())]));
    assert!((x(&tight, 1) - x(&plain, 1) + 5.0).abs() < 1e-3);
    let last = layout(&runs_of("HOH", &[(2, s.clone()), (1, CharStyle { kern: 500.0, ..s.clone() })]));
    assert!((width(&last) - width(&plain)).abs() < 1e-3, "{} vs {}", width(&last), width(&plain));
    // Off replaces the font's pair kerning: "AV" with Off is wider than with Metrics.
    let av = |st: CharStyle| x(&layout(&styled("AV", st)), 1);
    let metric = av(s.clone());
    let off = av(CharStyle { kerning: Kerning::Off, ..s.clone() });
    assert!(off > metric + 1.0, "Inter kerns AV: {off} vs {metric}");
    // Centred point text stays centred around the anchor with kerning.
    let mut centred = runs_of("HOH", &[(1, CharStyle { kern: 300.0, ..s.clone() }), (2, s.clone())]);
    centred.paragraphs = vec![ParagraphRun { len: 3, style: ParagraphStyle { align: TextAlign::Center, ..Default::default() } }];
    let l = layout(&centred);
    assert!((l.lines[0].x0 + l.lines[0].x1).abs() < 0.5, "{:?}", l.lines[0]);
}

/// Optical kerning computes pair spacing from the outlines: tighter for open pairs ("AV", "To")
/// than the unkerned advance, about neutral for straight stems, and never absurd.
#[test]
fn optical_kerning_tightens_open_pairs() {
    let s = CharStyle { size_pt: 100.0, ..Default::default() };
    let gap = |text: &str, k: Kerning| {
        let l = layout(&styled(text, CharStyle { kerning: k, ..s.clone() }));
        x(&l, 1) - x(&l, 0)
    };
    for pair in ["AV", "To", "LT", "Ty"] {
        let off = gap(pair, Kerning::Off);
        let optical = gap(pair, Kerning::Optical);
        assert!(optical < off - 3.0, "{pair}: optical {optical} vs unkerned {off}");
    }
    for pair in ["HH", "nn", "oo", "HO"] {
        let off = gap(pair, Kerning::Off);
        let optical = gap(pair, Kerning::Optical);
        assert!((optical - off).abs() < 6.0, "{pair}: optical {optical} vs unkerned {off}");
    }
    // A space breaks the pair; a manual kern replaces the automatic one (as in Photoshop).
    assert_eq!(gap("A V", Kerning::Optical), gap("A V", Kerning::Off));
    for mode in [Kerning::Optical, Kerning::Metrics] {
        let l = layout(&styled("AV", CharStyle { kerning: mode, kern: 100.0, ..s.clone() }));
        let off = gap("AV", Kerning::Off);
        assert!((x(&l, 1) - x(&l, 0) - off - 10.0).abs() < 1e-3, "{mode:?}");
    }
}

/// A mode change splits shaping runs: the pairs on both sides of a manually kerned character
/// lose their automatic kerning (Photoshop renders it the same way).
#[test]
fn kerning_modes_split_pairs() {
    let s = CharStyle { size_pt: 100.0, ..Default::default() };
    let off = CharStyle { kerning: Kerning::Off, ..s.clone() };
    let xs = |t: &TextLayer| layout(t).glyphs.iter().map(|g| g.origin.x).collect::<Vec<_>>();
    let metric = xs(&styled("AVAV", s.clone()));
    let plain = xs(&styled("AVAV", off.clone()));
    let mixed = xs(&runs_of("AVAV", &[(2, s.clone()), (1, off.clone()), (1, s.clone())]));
    let adv = |v: &[f64], i: usize| v[i + 1] - v[i];
    assert!((adv(&mixed, 0) - adv(&metric, 0)).abs() < 1e-3, "AV before stays kerned");
    assert!((adv(&mixed, 1) - adv(&plain, 1)).abs() < 1e-3, "VA into the manual character");
    assert!((adv(&mixed, 2) - adv(&plain, 2)).abs() < 1e-3, "AV out of it");
}

/// Optical kerning opens up at small sizes (`optical::size_adjust`), by the layer's point size:
/// the same text at 12 pt is spaced the same at 72 and 96 dpi (the engine works in points).
#[test]
fn optical_kerning_goes_by_the_point_size() {
    let at = |size_pt: f32, dpi: f32| {
        let layer = styled("AV", CharStyle { size_pt, kerning: Kerning::Optical, ..Default::default() });
        let (t, opts) = text_object(&layer, dpi);
        let l = layout_with(db(), &t, &opts);
        (l.glyphs[1].origin.x - l.glyphs[0].origin.x) / f64::from(size_pt)
    };
    // Relative to the size, the gap at 12 pt is the same whatever the resolution, and wider than
    // at 100 pt.
    assert!((at(12.0, 72.0) - at(12.0, 96.0)).abs() < 1e-6);
    assert!(at(12.0, 72.0) > at(100.0, 72.0) + 0.01);
}
