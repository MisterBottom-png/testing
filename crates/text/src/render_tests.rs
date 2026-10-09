//! PhotoCraft's text pixel tests (`text/src/tests.rs`, `vertical_tests.rs`), run against A-Studio's
//! renderer over its layout (P2-08). `E::render` stands in for PhotoCraft's
//! `TextEngine::new().render` (bundled fonts only).
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::{Color, PixelFormat, SampleType};
use astudio_doc::TextLayer;
use astudio_doc::text::{CharStyle, Orientation, TextRun};
use astudio_geom::pixel::Affine;

use crate::FontDb;
use crate::layer::LayerLayout;
use crate::render::{PathEl, Rendered, layout_warp, outlines, render_layer};

fn db() -> &'static FontDb {
    static DB: std::sync::OnceLock<FontDb> = std::sync::OnceLock::new();
    DB.get_or_init(|| FontDb::with_font_dirs(vec![]))
}

struct E;
impl E {
    fn render(&mut self, t: &TextLayer, dpi: f32, fmt: PixelFormat) -> (LayerLayout, Rendered) {
        render_layer(db(), t, dpi, fmt)
    }
}

fn point(text: &str, size_pt: f32) -> TextLayer {
    TextLayer { text: text.into(), font_family: "Inter".into(), size_pt, ..Default::default() }
}

fn styled(text: &str, style: CharStyle) -> TextLayer {
    TextLayer { text: text.into(), runs: vec![TextRun { len: text.len(), style }], ..Default::default() }
}

fn vertical(text: &str, family: &str, size_pt: f32) -> TextLayer {
    TextLayer {
        text: text.into(),
        runs: vec![TextRun { len: text.len(), style: CharStyle { font_family: family.into(), size_pt, ..Default::default() } }],
        orientation: Orientation::Vertical,
        ..Default::default()
    }
}

fn alpha_sum(s: &astudio_raster::Surface, r: astudio_geom::pixel::Rect) -> f64 {
    let n = s.channels();
    s.read_region(r).chunks_exact(n).map(|p| f64::from(p[n - 1])).sum()
}

#[test]
fn raster_coverage_scales_and_depths_agree() {
    let mut e = E;
    let t = |size: f32| TextLayer { transform: Affine::translate(10.0, 50.0), ..point("Ink", size) };
    let (_, r12) = e.render(&t(12.0), 72.0, PixelFormat::RGBA8);
    let (_, r24) = e.render(&t(24.0), 72.0, PixelFormat::RGBA8);
    let s12 = alpha_sum(&r12.surface, r12.rect);
    let s24 = alpha_sum(&r24.surface, r24.rect);
    assert!(s12 > 20.0, "{s12}");
    let ratio = s24 / s12;
    assert!((3.6..4.4).contains(&ratio), "ink ∝ size²: {ratio}");
    // Placement: anchored at (10, 50) baseline.
    assert!(r12.rect.x0 >= 8 && r12.rect.x0 <= 11 && r12.rect.y1 <= 53 && r12.rect.y1 >= 50, "{:?}", r12.rect);
    for fmt in [PixelFormat::RGBA16, PixelFormat::RGBA32F, PixelFormat::GRAYA8, PixelFormat::CMYKA8] {
        let (_, r) = e.render(&t(12.0), 72.0, fmt);
        assert_eq!(r.rect, r12.rect);
        let s = alpha_sum(&r.surface, r.rect);
        assert!((s - s12).abs() / s12 < 0.01, "{fmt:?}: {s} vs {s12}");
    }
    // Deterministic.
    let (_, again) = e.render(&t(12.0), 72.0, PixelFormat::RGBA8);
    assert_eq!(again.surface, r12.surface);
    // Golden-ish total ink for "Ink" in Inter 12 px (±3%).
    assert!((s12 - GOLDEN_INK_12).abs() / GOLDEN_INK_12 < 0.03, "ink sum {s12}");
}

/// Sum of alpha for "Ink", Inter Regular 12 px (PhotoCraft's measurement; guards rasterizer
/// regressions).
const GOLDEN_INK_12: f64 = 44.4;

#[test]
fn styles_change_pixels() {
    let mut e = E;
    let base = CharStyle { size_pt: 30.0, ..Default::default() };
    let ink = |e: &mut E, s: CharStyle| {
        let (_, r) = e.render(&TextLayer { transform: Affine::translate(5.0, 40.0), ..styled("Hi", s) }, 72.0, PixelFormat::RGBA8);
        (alpha_sum(&r.surface, r.rect), r.rect)
    };
    let (plain, prect) = ink(&mut e, base.clone());
    let (bold, _) = ink(&mut e, CharStyle { faux_bold: true, ..base.clone() });
    assert!(bold > plain * 1.1, "{plain} → {bold}");
    let (under, urect) = ink(&mut e, CharStyle { underline: true, ..base.clone() });
    assert!(under > plain && urect.y1 > prect.y1);
    let (_, irect) = ink(&mut e, CharStyle { faux_italic: true, ..base.clone() });
    assert!(irect.x1 > prect.x1, "slanted top extends right");
    let (_, srect) = ink(&mut e, CharStyle { baseline_shift_pt: 10.0, ..base.clone() });
    assert_eq!(srect.y0, prect.y0 - 10);
    let (_, hrect) = ink(&mut e, CharStyle { horizontal_scale: 2.0, ..base.clone() });
    assert!(hrect.width() as f32 > prect.width() as f32 * 1.7);
}

#[test]
fn multicolor_runs() {
    let mut e = E;
    let red = CharStyle { size_pt: 40.0, color: Color::rgb(1.0, 0.0, 0.0), ..Default::default() };
    let blue = CharStyle { color: Color::rgb(0.0, 0.0, 1.0), ..red.clone() };
    let t = TextLayer {
        text: "HH".into(),
        runs: vec![TextRun { len: 1, style: red }, TextRun { len: 1, style: blue }],
        transform: Affine::translate(0.0, 40.0),
        ..Default::default()
    };
    let (l, r) = e.render(&t, 72.0, PixelFormat::RGBA8);
    assert_eq!(l.glyphs.len(), 2);
    let px = r.surface.read_region(r.rect);
    let opaque: Vec<&[f32; 4]> = px.as_chunks::<4>().0.iter().filter(|p| p[3] > 0.99).collect();
    assert!(opaque.iter().any(|p| p[0] > 0.99 && p[2] < 0.01));
    assert!(opaque.iter().any(|p| p[2] > 0.99 && p[0] < 0.01));
    // CMYK target keeps colour in the document model.
    let (_, rc) = e.render(&t, 72.0, PixelFormat::CMYKA8);
    assert!(rc.surface.read_region(rc.rect).as_chunks::<5>().0.iter().any(|p| p[4] > 0.99 && p[1] > 0.9 && p[2] > 0.9));
}

#[test]
fn depth_is_respected() {
    let mut e = E;
    let (_, r) = e.render(&TextLayer { transform: Affine::translate(2.0, 20.0), ..point("a", 20.0) }, 72.0, PixelFormat::RGBA16);
    assert_eq!(r.surface.format().sample, SampleType::U16);
    assert!(r.surface.format().alpha);
}

#[test]
fn warp_bends_rendered_text_and_outlines() {
    use astudio_doc::text::TextWarp;
    let mut e = E;
    let mut t = point("WARPED TEXT", 24.0);
    t.transform = Affine::translate(20.0, 60.0);
    let fmt = PixelFormat::RGBA8;
    let (_, flat) = e.render(&t, 72.0, fmt);
    t.warp = Some(TextWarp { style: "warpArc".into(), value: 60.0, horizontal: true, ..Default::default() });
    let (layout, arced) = e.render(&t, 72.0, fmt);
    // An arc pushes the ends down: the warped ink is taller and pixels differ.
    assert!(arced.rect.height() > flat.rect.height() + 10, "{:?} vs {:?}", arced.rect, flat.rect);
    assert!(alpha_sum(&arced.surface, arced.rect) > 0.0);
    // Outlines follow the same warp: the first glyph's outline sits lower than the middle one's.
    let warp = layout_warp(&layout, t.warp.as_ref());
    let outs = outlines(&layout, &t.transform, warp.as_ref());
    // (PhotoCraft counted glyph ids; here glyphs with an outline. The space has none.)
    assert_eq!(outs.len(), layout.glyphs.iter().filter(|g| !g.outline.elements().is_empty()).count());
    assert_eq!(outs.len(), "WARPEDTEXT".len());
    let low_y = |els: &Vec<PathEl>| {
        els.iter()
            .filter_map(|e| match e {
                PathEl::MoveTo(p) | PathEl::LineTo(p) => Some(p[1]),
                _ => None,
            })
            .fold(f64::MIN, f64::max)
    };
    assert!(low_y(&outs[0]) > low_y(&outs[outs.len() / 2]) + 5.0);
    // Unwarped outlines stay within the flat raster's bounds.
    let flat_outs = outlines(&layout, &t.transform, None);
    let r = flat.rect;
    for els in &flat_outs {
        for el in els {
            if let PathEl::MoveTo(p) | PathEl::LineTo(p) = el {
                assert!(p[0] >= f64::from(r.x0) && p[0] <= f64::from(r.x1) && p[1] >= f64::from(r.y0) && p[1] <= f64::from(r.y1));
            }
        }
    }
}

#[test]
fn rotated_render_ink_is_taller_than_wide() {
    let mut e = E;
    let horizontal = TextLayer { orientation: Orientation::Horizontal, ..vertical("Vertical", "Inter", 30.0) };
    let (_, h) = e.render(&TextLayer { transform: Affine::translate(100.0, 50.0), ..horizontal.clone() }, 72.0, PixelFormat::RGBA8);
    let (_, v) = e.render(&TextLayer { transform: Affine::translate(100.0, 50.0), orientation: Orientation::Vertical, ..horizontal }, 72.0, PixelFormat::RGBA8);
    assert!(h.rect.width() > h.rect.height());
    assert!(v.rect.height() > 2 * v.rect.width(), "{:?}", v.rect);
    // The rotated word is the horizontal word turned: same ink length.
    assert!(v.rect.height().abs_diff(h.rect.width()) <= 3, "{:?} {:?}", v.rect, h.rect);
    // It runs down from the anchor, centred on x = 100.
    assert!(v.rect.y0 >= 49 && v.rect.x0 < 100 && v.rect.x1 > 100, "{:?}", v.rect);
}

/// P2-08 review: faux italic re-fetched each glyph's outline from the font, so tabs, soft hyphens
/// and control characters (which the engine draws as nothing) came back as boxes and hyphens.
#[test]
fn faux_italic_draws_nothing_for_invisible_characters() {
    let text = "a\tb\u{00AD}c\u{0003}d";
    let inked = |italic: bool| {
        let l = crate::layer::layout_layer(db(), &styled(text, CharStyle { size_pt: 20.0, faux_italic: italic, ..Default::default() }), 72.0);
        l.glyphs.iter().filter(|g| !g.outline.elements().is_empty()).count()
    };
    assert_eq!(inked(true), inked(false));
    assert_eq!(inked(false), 4, "a, b, c, d");
}

/// P2-08 review: a layer far to the left put the ink rectangle at `i32::MIN`, and `-rect.x0`
/// overflowed (a panic in debug builds; release wrapped and lost the text).
#[test]
fn ink_at_the_far_left_edge_does_not_overflow() {
    let mut e = E;
    let t = TextLayer { transform: Affine::translate(f64::from(i32::MIN), 50.0), ..point("Ink", 12.0) };
    let (_, r) = e.render(&t, 72.0, PixelFormat::RGBA8);
    assert_eq!(r.rect.x0, i32::MIN);
    assert!(alpha_sum(&r.surface, r.rect) > 0.0);
}

/// PhotoCraft's `vertical_tests.rs` hostile_vertical_input_does_not_panic, through the
/// TextObject mapping and the engine (NaN and huge boxes, negative and zero sizes, control and
/// non-characters, CR LF).
#[test]
fn hostile_vertical_input_does_not_panic() {
    use astudio_doc::text::TextShape;
    let mut e = E;
    for text in ["", "\n\n", "\u{200F}א\u{0301}", "「」ー。、\r\n\u{FFFF}", "a\u{0000}b"] {
        for shape in
            [TextShape::Point, TextShape::Box { x: 0.0, y: 0.0, width: 0.0, height: 0.0 }, TextShape::Box { x: f32::NAN, y: 1e30, width: -5.0, height: 1.0 }]
        {
            for orientation in [Orientation::Vertical, Orientation::Horizontal] {
                let t = TextLayer { shape, orientation, ..vertical(text, "Inter", 12.0) };
                let (l, _) = e.render(&t, 72.0, PixelFormat::RGBA8);
                let _ = l.bounds();
            }
        }
    }
}

/// PhotoCraft's empty_text_and_empty_lines, its render half: empty text draws nothing.
#[test]
fn empty_text_renders_nothing() {
    let mut e = E;
    let (l, r) = e.render(&point("", 12.0), 72.0, PixelFormat::RGBA8);
    assert!(l.glyphs.is_empty());
    assert_eq!(r.rect.width(), 0);
    let (l, _) = e.render(&point("a\n\nb", 12.0), 72.0, PixelFormat::RGBA8);
    assert_eq!(l.lines.len(), 3, "an empty line is a line");
}
