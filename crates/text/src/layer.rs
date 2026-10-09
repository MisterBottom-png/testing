//! PhotoCraft text layers ([`TextLayer`], `astudio-doc`) laid out by A-Studio's text engine
//! (VectorCraft's, decision D3), for drawing into tiles ([`crate::render`], T4, P2-08).
//!
//! [`text_object`] maps a layer onto a [`TextObject`] in points (text space: PhotoCraft's, in
//! pixels at the layer's dpi, divided by `dpi / 72`); [`layout_layer`] lays it out and returns what
//! PhotoCraft's renderer drew from: each glyph's outline in text-space pixels with its PhotoCraft
//! style (faux italic applied), underline and strikethrough rectangles from the font's own
//! metrics, and the line boxes Warp Text bends over.
//!
//! First mapping; known gaps are tasks: optical kerning and manual kerning on top of the font's
//! (P2-17), font matching by weight / PostScript name, small caps, vertical decorations and the
//! other differences listed in P2-18.

use astudio_doc::TextLayer;
use astudio_doc::text::{Caps, CharStyle as PcStyle, Kerning, Orientation, ParagraphStyle, TextAlign, TextDirection, TextShape};
use astudio_geom::PathData;
use astudio_vdoc::{CharStyle, Justify, ParaDirection, ParaStyle, TextKind, TextObject, TextRun};
use kurbo::{Affine, BezPath, Point, Rect, Shape};

use crate::psd::fonts::DEFAULT_FAMILY;
use crate::{FontDb, LayoutOptions, layout_with};

/// PhotoCraft's auto leading factor (`ParagraphStyle::auto_leading`) that VectorCraft's engine
/// also uses when a style has no leading.
const ENGINE_AUTO_LEADING: f32 = 1.2;

/// A font style name for PhotoCraft's numeric weight and italic flag ("Bold Italic").
pub fn font_style(weight: u16, italic: bool) -> String {
    let w = match weight {
        0..=149 => "Thin",
        150..=249 => "ExtraLight",
        250..=349 => "Light",
        350..=449 => "Regular",
        450..=549 => "Medium",
        550..=649 => "SemiBold",
        650..=749 => "Bold",
        750..=849 => "ExtraBold",
        _ => "Black",
    };
    match (w, italic) {
        ("Regular", true) => "Italic".into(),
        (w, true) => format!("{w} Italic"),
        (w, false) => w.into(),
    }
}

/// The engine's character style for a PhotoCraft one (points; colours stay PhotoCraft's, the
/// renderer fills with them).
pub fn char_style(st: &PcStyle, auto_leading: f32) -> CharStyle {
    let family = if st.font_family.is_empty() { DEFAULT_FAMILY } else { &st.font_family };
    let size = f64::from(st.size_pt);
    let mut features: Vec<String> = Vec::new();
    if !st.ligatures {
        features.push("-liga".into());
    }
    if st.discretionary_ligatures {
        features.push("dlig".into());
    }
    if st.caps == Caps::SmallCaps {
        features.push("smcp".into());
    }
    for f in &st.features {
        features.push(if f.value == 0 { format!("-{}", f.tag) } else { f.tag.clone() });
    }
    let leading = st.leading_pt.map(f64::from).or_else(|| (auto_leading != ENGINE_AUTO_LEADING && auto_leading > 0.0).then(|| size * f64::from(auto_leading)));
    CharStyle {
        font_family: family.into(),
        font_style: font_style(st.weight, st.italic),
        size,
        leading,
        tracking: f64::from(st.tracking),
        // Metrics: the font's kerning; Off: none, plus the manual value. (Manual kerning on top of
        // the font's, and optical kerning, are P2-17.)
        kerning: match st.kerning {
            Kerning::Off => Some(f64::from(st.kern)),
            Kerning::Metrics | Kerning::Optical => None,
        },
        baseline_shift: f64::from(st.baseline_shift_pt),
        h_scale: f64::from(if st.horizontal_scale > 0.0 { st.horizontal_scale } else { 1.0 }) * 100.0,
        v_scale: f64::from(if st.vertical_scale > 0.0 { st.vertical_scale } else { 1.0 }) * 100.0,
        underline: st.underline,
        strikethrough: st.strikethrough,
        all_caps: st.caps == Caps::AllCaps,
        features,
        ..CharStyle::default()
    }
}

/// The engine's paragraph style for a PhotoCraft one (points).
pub fn para_style(p: &ParagraphStyle) -> ParaStyle {
    ParaStyle {
        justify: match p.align {
            TextAlign::Left => Justify::Left,
            TextAlign::Center => Justify::Center,
            TextAlign::Right => Justify::Right,
            TextAlign::JustifyLeft => Justify::JustifyLeft,
            TextAlign::JustifyCenter => Justify::JustifyCenter,
            TextAlign::JustifyRight => Justify::JustifyRight,
            TextAlign::JustifyAll => Justify::JustifyAll,
        },
        left_indent: f64::from(p.start_indent_pt),
        right_indent: f64::from(p.end_indent_pt),
        first_line_indent: f64::from(p.first_line_indent_pt),
        space_before: f64::from(p.space_before_pt),
        space_after: f64::from(p.space_after_pt),
        hyphenate: p.hyphenate,
        direction: match p.direction {
            TextDirection::Auto => None,
            TextDirection::Ltr => Some(ParaDirection::LeftToRight),
            TextDirection::Rtl => Some(ParaDirection::RightToLeft),
        },
        ..ParaStyle::default()
    }
}

/// Pixels per point at `dpi` (PhotoCraft's `px_per_pt`; 1 for a non-positive or non-finite dpi).
pub fn px_per_pt(dpi: f32) -> f64 {
    if dpi.is_finite() && dpi > 0.0 { f64::from(dpi) / 72.0 } else { 1.0 }
}

/// `layer` as a text object in points, with the per-paragraph styles for [`layout_with`]. The
/// object's runs are the layer's character runs, in order (glyph `run` indices map to them).
pub fn text_object(layer: &TextLayer, dpi: f32) -> (TextObject, LayoutOptions) {
    let k = px_per_pt(dpi);
    let paras = layer.paragraph_runs();
    // The paragraph style at a byte offset (PhotoCraft runs end on character boundaries).
    let para_at = |byte: usize| {
        let mut at = 0;
        for p in &paras {
            if byte < at + p.len {
                return Some(&p.style);
            }
            at += p.len;
        }
        paras.last().map(|p| &p.style)
    };
    let mut runs = Vec::new();
    let mut at = 0usize;
    for r in layer.char_runs() {
        let end = at.saturating_add(r.len).min(layer.text.len());
        let text = layer.text.get(at..end).unwrap_or("").to_string();
        let auto = para_at(at).map_or(ENGINE_AUTO_LEADING, |p| p.auto_leading);
        runs.push(TextRun { text, style: char_style(&r.style, auto) });
        at = end;
    }
    // One style per paragraph of the engine's split (at '\n').
    let mut paragraphs = Vec::new();
    let mut start = 0usize;
    for line in layer.text.split('\n') {
        paragraphs.push(para_at(start).map(para_style).unwrap_or_default());
        start += line.len() + 1;
    }
    let kind = match layer.shape {
        TextShape::Point => TextKind::Point,
        TextShape::Box { x, y, width, height } => {
            let r = Rect::new(f64::from(x) / k, f64::from(y) / k, f64::from(x + width) / k, f64::from(y + height) / k);
            TextKind::Area { frame: PathData::from_bezpath(&r.to_path(0.1)) }
        }
    };
    let mut t = TextObject::point(Point::ZERO, "", CharStyle::default());
    t.vertical = layer.orientation == Orientation::Vertical;
    t.kind = kind;
    t.runs = runs;
    t.para = paragraphs.first().cloned().unwrap_or_default();
    (t, LayoutOptions { paragraphs, ..LayoutOptions::default() })
}

/// A glyph outline in text-space pixels with its style ([`LayerLayout::styles`]).
#[derive(Clone, Debug)]
pub struct LayerGlyph {
    pub outline: BezPath,
    pub style: usize,
    /// Font size in pixels (faux bold's radius scales with it).
    pub size_px: f64,
}

/// An underline or strikethrough rectangle (text-space pixels) with its style.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Decoration {
    pub x0: f64,
    pub y0: f64,
    pub x1: f64,
    pub y1: f64,
    pub style: usize,
}

/// What [`crate::render`] draws: a text layer laid out, in text-space pixels.
#[derive(Clone, Debug, Default)]
pub struct LayerLayout {
    pub glyphs: Vec<LayerGlyph>,
    pub decorations: Vec<Decoration>,
    /// The layer's character styles, one per run.
    pub styles: Vec<PcStyle>,
    /// Line boxes `[x0, top, x1, bottom]` (horizontal type: along the line, ascent to descent).
    pub lines: Vec<[f64; 4]>,
    /// Bounds of the laid-out text (glyph ink and line boxes), text-space pixels.
    pub ink_and_lines: Option<[f64; 4]>,
    pub px_per_pt: f64,
    pub vertical: bool,
}

impl LayerLayout {
    /// Logical bounds of all lines (PhotoCraft's `TextLayout::bounds`), the box Warp Text bends:
    /// horizontal type from the line boxes, vertical type from the laid-out bounds.
    pub fn bounds(&self) -> Option<[f32; 4]> {
        let b = if self.vertical {
            self.ink_and_lines?
        } else {
            self.lines.iter().copied().reduce(|a, r| [a[0].min(r[0]), a[1].min(r[1]), a[2].max(r[2]), a[3].max(r[3])])?
        };
        b.iter().all(|v| v.is_finite()).then(|| b.map(|v| v as f32))
    }
}

/// Faux-italic slant in degrees (PhotoCraft's, Photoshop-like).
pub const FAUX_ITALIC_DEG: f64 = 12.0;

/// Lays `layer` out with `db` at `dpi`.
pub fn layout_layer(db: &FontDb, layer: &TextLayer, dpi: f32) -> LayerLayout {
    let k = px_per_pt(dpi);
    let to_px = Affine::scale(k);
    let styles: Vec<PcStyle> = layer.char_runs().into_iter().map(|r| r.style).collect();
    let (t, opts) = text_object(layer, dpi);
    let l = layout_with(db, &t, &opts);
    let mut out = LayerLayout { styles, px_per_pt: k, vertical: l.vertical, ..LayerLayout::default() };
    for g in &l.glyphs {
        let Some(st) = out.styles.get(g.run) else { continue };
        // Tabs, soft hyphens and control characters have an empty outline: keep it so (re-reading
        // the font would draw a box or a hyphen, P2-08 review).
        let outline = if st.faux_italic && !g.outline.elements().is_empty() {
            // Slant in the glyph's own frame (font units, y down), before it is placed: what
            // PhotoCraft's glyph transform did, also for rotated and vertical glyphs.
            let Some(face) = db.face_by_id(g.font_id) else { continue };
            let hs = f64::from(if st.horizontal_scale > 0.0 { st.horizontal_scale } else { 1.0 });
            let vs = f64::from(if st.vertical_scale > 0.0 { st.vertical_scale } else { 1.0 });
            let s = FAUX_ITALIC_DEG.to_radians().tan() * vs / hs;
            let mut p = (*db.outline(&face, g.gid)).clone();
            p.apply_affine(to_px * g.xf * Affine::new([1.0, 0.0, -s, 1.0, 0.0, 0.0]));
            p
        } else {
            to_px * g.outline.clone()
        };
        out.glyphs.push(LayerGlyph { outline, style: g.run, size_px: f64::from(st.size_pt) * k });
    }
    if !l.vertical {
        for line in &l.lines {
            out.lines.push([line.x0 * k, (line.baseline - line.ascent) * k, line.x1 * k, (line.baseline + line.descent) * k]);
        }
        let styles = std::mem::take(&mut out.styles);
        decorations(db, &l, &styles, k, &mut out);
        out.styles = styles;
    }
    let b = l.bounds;
    out.ink_and_lines = (b.width() > 0.0 || b.height() > 0.0).then_some([b.x0 * k, b.y0 * k, b.x1 * k, b.y1 * k]);
    out
}

/// Underline and strikethrough rectangles of horizontal type, one per stretch of glyphs of one
/// run on one line, from the font's `post` / `OS/2` metrics (as PhotoCraft took them).
fn decorations(db: &FontDb, l: &crate::TextLayout, styles: &[PcStyle], k: f64, out: &mut LayerLayout) {
    use skrifa::MetadataProvider;
    use skrifa::instance::Size;
    let mut i = 0;
    while i < l.glyphs.len() {
        let g = &l.glyphs[i];
        let Some(st) = styles.get(g.run) else {
            i += 1;
            continue;
        };
        let mut j = i + 1;
        while j < l.glyphs.len() && l.glyphs[j].run == g.run && l.glyphs[j].line == g.line {
            j += 1;
        }
        if (st.underline || st.strikethrough)
            && let (Some(line), Some(face)) = (l.lines.get(g.line), db.face_by_id(g.font_id))
            && let Some(font) = face.skrifa()
        {
            let stretch = &l.glyphs[i..j];
            let x0 = stretch.iter().map(|g| g.origin.x.min(g.origin.x + g.advance)).fold(f64::INFINITY, f64::min);
            let x1 = stretch.iter().map(|g| g.origin.x.max(g.origin.x + g.advance)).fold(f64::NEG_INFINITY, f64::max);
            let size_px = f64::from(st.size_pt) * k;
            let m = font.metrics(Size::new(size_px as f32), face.location());
            let shift = f64::from(st.baseline_shift_pt) * k;
            let baseline = line.baseline * k;
            let mut push = |offset: f32, thickness: f32| {
                let y0 = baseline - f64::from(offset) - shift;
                out.decorations.push(Decoration { x0: x0 * k, y0, x1: x1 * k, y1: y0 + f64::from(thickness).max(1.0), style: g.run });
            };
            if st.underline {
                let d = m.underline.unwrap_or(skrifa::metrics::Decoration { offset: -0.1 * size_px as f32, thickness: 0.05 * size_px as f32 });
                push(d.offset, d.thickness);
            }
            if st.strikethrough {
                let d = m.strikeout.unwrap_or(skrifa::metrics::Decoration { offset: 0.3 * size_px as f32, thickness: 0.05 * size_px as f32 });
                push(d.offset, d.thickness);
            }
        }
        i = j;
    }
}
