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

/// A line break inside a paragraph (Shift+Return), stored as U+0003 in PSD type (PhotoCraft's
/// `FORCED_LINE_BREAK`).
pub const FORCED_LINE_BREAK: char = '\u{3}';

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
    // Every OpenType feature with its value (PhotoCraft passes any four-letter tag, P2-18): `tag`,
    // `-tag`, or `tag=n` for an alternate by number.
    for f in &st.features {
        features.push(match f.value {
            0 => format!("-{}", f.tag),
            1 => f.tag.clone(),
            n => format!("{}={n}", f.tag),
        });
    }
    let leading = st.leading_pt.map(f64::from).or_else(|| (auto_leading != ENGINE_AUTO_LEADING && auto_leading > 0.0).then(|| size * f64::from(auto_leading)));
    CharStyle {
        font_family: family.into(),
        font_style: font_style(st.weight, st.italic),
        size,
        leading,
        tracking: f64::from(st.tracking),
        // A manual kern replaces the automatic one, whatever the mode (as in Photoshop); Metrics is
        // the font's kerning, Optical the outlines' (P2-17), Off none.
        // (A NaN kern from a damaged file counts as manual, as in PhotoCraft, and kerns by 0.)
        kerning: (st.kerning == Kerning::Off || st.kern != 0.0).then(|| if st.kern.is_finite() { f64::from(st.kern) } else { 0.0 }),
        optical_kerning: st.kerning == Kerning::Optical,
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

/// The layer's character runs as the engine sets them (byte range, style): a manually kerned
/// character (with its accents) with nothing after it in its paragraph gets a run of its own
/// without the kern, since PhotoCraft kerns only between two characters (P2-17). Characters at
/// the end of a line a paragraph wraps onto keep theirs (the engine breaks lines later).
pub fn engine_runs(layer: &TextLayer) -> Vec<(std::ops::Range<usize>, PcStyle)> {
    let mut out = Vec::new();
    let mut at = 0usize;
    for r in layer.char_runs() {
        let end = at.saturating_add(r.len).min(layer.text.len());
        let mut start = at;
        if r.style.kern != 0.0 {
            // The last character (grapheme cluster: a letter keeps its accents) before each
            // paragraph end or the end of the text.
            let text = layer.text.get(at..end).unwrap_or("");
            for (i, c) in text.char_indices() {
                let next = at + i + c.len_utf8();
                let end_of_line = |t: &str| t.is_empty() || t.starts_with('\n') || t.starts_with(FORCED_LINE_BREAK);
                let last = c != '\n' && c != FORCED_LINE_BREAK && layer.text.get(next..).is_none_or(end_of_line);
                if last {
                    let first = crate::shape::cluster_start(&layer.text, next).max(start);
                    if first > start {
                        out.push((start..first, r.style.clone()));
                    }
                    out.push((first..next, PcStyle { kern: 0.0, ..r.style.clone() }));
                    start = next;
                }
            }
        }
        if end > start || (start == at && end == at) {
            out.push((start..end, r.style));
        }
        at = end;
    }
    out
}

/// `layer` as a text object in points, with the per-paragraph styles for [`layout_with`]. The
/// object's runs are [`engine_runs`], in order (glyph `run` indices map to them).
pub fn text_object(layer: &TextLayer, dpi: f32) -> (TextObject, LayoutOptions) {
    text_object_with(layer, dpi, &[])
}

/// The installed face each of the layer's [`engine_runs`] names by PostScript name (as PSD files
/// store fonts: `Arial-BoldMT`), as engine family and style; `None` where none is installed, and
/// the run's family, weight and italic choose (PhotoCraft's `resolve_postscript`, P2-18).
pub fn resolve_faces(db: &FontDb, layer: &TextLayer) -> Vec<Option<(String, String)>> {
    engine_runs(layer)
        .iter()
        .map(|(_, st)| st.postscript_name.as_deref().and_then(|ps| db.find_postscript(ps)).map(|f| (f.family.clone(), f.style.clone())))
        .collect()
}

/// [`text_object`] with the faces [`resolve_faces`] found (missing entries: as in
/// [`text_object`]).
pub fn text_object_with(layer: &TextLayer, dpi: f32, faces: &[Option<(String, String)>]) -> (TextObject, LayoutOptions) {
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
    for (i, (range, style)) in engine_runs(layer).into_iter().enumerate() {
        let text = layer.text.get(range.clone()).unwrap_or("").replace(FORCED_LINE_BREAK, "\n");
        let auto = para_at(range.start).map_or(ENGINE_AUTO_LEADING, |p| p.auto_leading);
        let mut st = char_style(&style, auto);
        if let Some(Some((family, face))) = faces.get(i) {
            st.font_family = family.clone();
            st.font_style = face.clone();
        }
        runs.push(TextRun { text, style: st });
    }
    // One style per paragraph of the engine's split (at '\n', and at forced line breaks, which the
    // engine sees as '\n': a line that continues its paragraph has no first-line indent or space
    // between, as in PhotoCraft).
    let mut paragraphs = Vec::new();
    let mut start = 0usize;
    let mut continues = false;
    for piece in layer.text.split(['\n', FORCED_LINE_BREAK]) {
        let end = start + piece.len();
        let forced_after = layer.text.get(end..).is_some_and(|t| t.starts_with(FORCED_LINE_BREAK));
        let mut p = para_at(start).map(para_style).unwrap_or_default();
        if continues {
            p.first_line_indent = 0.0;
            p.space_before = 0.0;
        }
        if forced_after {
            p.space_after = 0.0;
        }
        paragraphs.push(p);
        continues = forced_after;
        start = end + 1;
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
    // Paragraph text starts with the tallest lowercase ascender at the box top, as in PhotoCraft
    // and Photoshop (P2-18).
    let first_baseline = if matches!(layer.shape, TextShape::Box { .. }) { crate::FirstBaseline::LowercaseAscender } else { crate::FirstBaseline::Ascent };
    // PhotoCraft's engine keeps ligatures in tracked text.
    let features = crate::OtFeatures { ligatures_with_tracking: true, ..crate::OtFeatures::default() };
    (t, LayoutOptions { paragraphs, first_baseline, features, ..LayoutOptions::default() })
}

/// A glyph outline in text-space pixels with its style ([`LayerLayout::styles`]).
#[derive(Clone, Debug)]
pub struct LayerGlyph {
    pub outline: BezPath,
    pub style: usize,
    /// Font size in pixels (faux bold's radius scales with it).
    pub size_px: f64,
    /// Drawn emboldened as faux bold is: bold was asked of a face that isn't (P2-18).
    pub synthetic_bold: bool,
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
    /// The layer's character styles, one per engine run ([`engine_runs`]).
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
/// Slant of a synthetic oblique, when italic is asked of an upright face (PhotoCraft's font
/// matching, fontique, uses 14°).
pub const SYNTHETIC_OBLIQUE_DEG: f64 = 14.0;

/// Synthetic bold and oblique for a style on `face` (PhotoCraft's `synthetic_bold` and its font
/// matching's skew): a bold request (≥ 600) on a face that isn't bold (≤ 500) is emboldened, an
/// italic request on an upright face slanted. Faux Bold and Faux Italic stay separate, explicit
/// styles.
pub fn synthesis(st: &PcStyle, face: &crate::FontFace) -> (bool, f64) {
    let bold = st.weight >= 600 && face.weight <= 500.0;
    let skew = if st.italic && !face.italic { SYNTHETIC_OBLIQUE_DEG } else { 0.0 };
    (bold, skew)
}

/// Photoshop's Small Caps in a font without small capitals (`smcp`): capitals drawn smaller
/// (VectorCraft's synthesized small caps, at 70%, Photoshop's and Illustrator's size), where
/// PhotoCraft only asked for the feature and showed lowercase (P2-18).
pub const SYNTHETIC_SMALL_CAPS: f64 = 70.0;

fn small_caps_without_smcp(db: &FontDb, t: &mut TextObject) {
    for run in &mut t.runs {
        let st = &mut run.style;
        if !st.features.iter().any(|f| f == "smcp") {
            continue;
        }
        if db.face(&st.font_family, &st.font_style).is_some_and(|f| !f.has_feature(b"smcp")) {
            st.features.retain(|f| f != "smcp");
            st.small_caps = Some(SYNTHETIC_SMALL_CAPS);
        }
    }
}

/// Lays `layer` out with `db` at `dpi`.
pub fn layout_layer(db: &FontDb, layer: &TextLayer, dpi: f32) -> LayerLayout {
    let k = px_per_pt(dpi);
    let to_px = Affine::scale(k);
    let styles: Vec<PcStyle> = engine_runs(layer).into_iter().map(|(_, s)| s).collect();
    let (mut t, opts) = text_object_with(layer, dpi, &resolve_faces(db, layer));
    small_caps_without_smcp(db, &mut t);
    let l = layout_with(db, &t, &opts);
    let mut out = LayerLayout { styles, px_per_pt: k, vertical: l.vertical, ..LayerLayout::default() };
    for g in &l.glyphs {
        let Some(st) = out.styles.get(g.run) else { continue };
        // Tabs, soft hyphens and control characters have an empty outline: keep it so (re-reading
        // the font would draw a box or a hyphen, P2-08 review).
        let face = db.face_by_id(g.font_id);
        let (synthetic_bold, synthetic_skew) = face.as_deref().map_or((false, 0.0), |f| synthesis(st, f));
        let skew_deg = if st.faux_italic { FAUX_ITALIC_DEG } else { 0.0 } + synthetic_skew;
        let outline = if skew_deg != 0.0 && !g.outline.elements().is_empty() {
            // Slant in the glyph's own frame (font units, y down), before it is placed: what
            // PhotoCraft's glyph transform did, also for rotated and vertical glyphs.
            let Some(face) = face else { continue };
            let hs = f64::from(if st.horizontal_scale > 0.0 { st.horizontal_scale } else { 1.0 });
            let vs = f64::from(if st.vertical_scale > 0.0 { st.vertical_scale } else { 1.0 });
            let s = skew_deg.to_radians().tan() * vs / hs;
            let mut p = (*db.outline(&face, g.gid)).clone();
            p.apply_affine(to_px * g.xf * Affine::new([1.0, 0.0, -s, 1.0, 0.0, 0.0]));
            p
        } else {
            to_px * g.outline.clone()
        };
        out.glyphs.push(LayerGlyph { outline, style: g.run, size_px: f64::from(st.size_pt) * k, synthetic_bold });
    }
    if !l.vertical {
        for line in &l.lines {
            out.lines.push([line.x0 * k, (line.baseline - line.ascent) * k, line.x1 * k, (line.baseline + line.descent) * k]);
        }
    }
    let styles = std::mem::take(&mut out.styles);
    decorations(db, &l, &styles, k, &mut out);
    out.styles = styles;
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
            let size_px = f64::from(st.size_pt) * k;
            let m = font.metrics(Size::new(size_px as f32), face.location());
            if l.vertical {
                // PhotoCraft's: the underline right of the column, the strikethrough through its
                // centre, along the run's stretch of the column (text space is already upright).
                let centre = line.baseline + (line.descent - line.ascent) / 2.0;
                let ends: Vec<Point> = stretch
                    .iter()
                    .flat_map(|g| {
                        let s = l.logical_point(g.origin).x;
                        [l.physical_point(Point::new(s, centre)), l.physical_point(Point::new(s + g.advance, centre))]
                    })
                    .collect();
                let (y0, y1) = ends.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(a, b), p| (a.min(p.y), b.max(p.y)));
                let cx = ends.first().map_or(0.0, |p| p.x) * k;
                let half = size_px * 0.5;
                let mut push = |x0: f64, x1: f64| out.decorations.push(Decoration { x0, y0: y0 * k, x1, y1: y1 * k, style: g.run });
                if st.underline {
                    let t = m.underline.map_or(0.05 * size_px, |d| f64::from(d.thickness)).max(1.0);
                    push(cx + half, cx + half + t);
                }
                if st.strikethrough {
                    let t = m.strikeout.map_or(0.05 * size_px, |d| f64::from(d.thickness)).max(1.0);
                    push(cx - t * 0.5, cx + t * 0.5);
                }
                i = j;
                continue;
            }
            let x0 = stretch.iter().map(|g| g.origin.x.min(g.origin.x + g.advance)).fold(f64::INFINITY, f64::min);
            let x1 = stretch.iter().map(|g| g.origin.x.max(g.origin.x + g.advance)).fold(f64::NEG_INFINITY, f64::max);
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
