//! PhotoCraft text layers through VectorCraft's engine: the mapping gaps P2-18 closes, each
//! against what PhotoCraft does (photocraft@e5e3e39 crates/text/src/layout.rs, fonts.rs).

use astudio_doc::TextLayer;
use astudio_doc::text::{CharStyle, TextRun};

use crate::FontDb;
use crate::layer::{layout_layer, resolve_faces};

fn db() -> &'static FontDb {
    static DB: std::sync::OnceLock<FontDb> = std::sync::OnceLock::new();
    DB.get_or_init(|| FontDb::with_font_dirs(vec![]))
}

fn styled(text: &str, style: CharStyle) -> TextLayer {
    TextLayer { text: text.into(), runs: vec![TextRun { len: text.len(), style }], ..Default::default() }
}

/// The face a PSD names by PostScript name is the one used, whatever family the name was guessed
/// as (PhotoCraft's `resolve_postscript`); an unknown name leaves the family and weight to choose.
#[test]
fn postscript_names_pick_the_exact_face() {
    let bold = styled("Hi", CharStyle { font_family: "Not Installed".into(), postscript_name: Some("SourceSerif4-Regular".into()), ..Default::default() });
    let faces = resolve_faces(db(), &bold);
    assert_eq!(faces, [Some(("Source Serif 4".to_string(), "Regular".to_string()))]);
    let l = layout_layer(db(), &bold, 72.0);
    let (t, _) = crate::layer::text_object_with(&bold, 72.0, &faces);
    let face = db().face(&t.runs[0].style.font_family, &t.runs[0].style.font_style).unwrap();
    assert_eq!(face.family, "Source Serif 4");
    assert!(!l.glyphs.is_empty());
    let unknown = styled("Hi", CharStyle { postscript_name: Some("NoSuchFont-Bold".into()), weight: 700, ..Default::default() });
    assert_eq!(resolve_faces(db(), &unknown), [None]);
}

/// PhotoCraft's engine keeps standard ligatures in tracked text; VectorCraft documents still drop
/// them (P2-18).
#[test]
fn tracked_layers_keep_ligatures() {
    let glyphs = |tracking: f32| {
        layout_layer(db(), &styled("fi", CharStyle { font_family: "Source Serif 4".into(), tracking, ..Default::default() }), 72.0).glyphs.len()
    };
    assert_eq!(glyphs(0.0), 1, "f+i is one ligature glyph");
    assert_eq!(glyphs(100.0), 1, "and stays one with tracking");
    let vc = |tracking: f64| {
        let st = astudio_vdoc::CharStyle { font_family: "Source Serif 4".into(), tracking, ..Default::default() };
        crate::layout(db(), &astudio_vdoc::TextObject::point(astudio_geom::Point::ZERO, "fi", st)).glyphs.len()
    };
    assert_eq!((vc(0.0), vc(100.0)), (1, 2), "VectorCraft's rule for its own documents");
}

/// OpenType features beyond VectorCraft's nine reach the shaper with their values (PhotoCraft
/// passes any four-letter tag): Inter's character variant `cv11` (single-storey a) changes the
/// glyph, off leaves it.
#[test]
fn any_opentype_feature_reaches_the_shaper() {
    use astudio_doc::text::FontFeature;
    let gid = |features: Vec<FontFeature>| {
        layout_layer(db(), &styled("a", CharStyle { features, ..Default::default() }), 72.0).glyphs.first().map(|g| g.outline.clone())
    };
    let plain = gid(vec![]);
    let alt = gid(vec![FontFeature { tag: "cv11".into(), value: 1 }]);
    let off = gid(vec![FontFeature { tag: "cv11".into(), value: 0 }]);
    assert_ne!(plain, alt, "cv11 picks the single-storey a");
    assert_eq!(plain, off);
}

/// Bold asked of a family without a bold face is emboldened, italic asked of one without an
/// italic slanted (PhotoCraft's `synthetic_bold` and its font matching's 14° skew); a family
/// with the face uses it as it is.
#[test]
fn missing_bold_and_italic_faces_are_synthesised() {
    let glyph = |family: &str, weight: u16, italic: bool| {
        let l = layout_layer(db(), &styled("l", CharStyle { font_family: family.into(), weight, italic, size_pt: 100.0, ..Default::default() }), 72.0);
        let g = l.glyphs.into_iter().next().unwrap();
        (g.synthetic_bold, kurbo::Shape::bounding_box(&g.outline))
    };
    // Source Serif 4 is bundled in Regular only.
    let (plain_bold, plain) = glyph("Source Serif 4", 400, false);
    let (bold, _) = glyph("Source Serif 4", 700, false);
    assert!(!plain_bold && bold, "bold synthesised");
    let (_, slanted) = glyph("Source Serif 4", 400, true);
    // The slant leans the stem's top to the right: wider ink, the same height.
    assert!(slanted.width() > plain.width() + 10.0, "{slanted:?} vs {plain:?}");
    assert!((slanted.height() - plain.height()).abs() < 1e-6);
    // Source Sans 3 has its Bold and Italic: nothing is faked.
    let (sans_bold, _) = glyph("Source Sans 3", 700, false);
    assert!(!sans_bold);
    let italic_face = db().face("Source Sans 3", "Italic").unwrap();
    assert!(italic_face.italic);
    let asks_italic = CharStyle { italic: true, ..Default::default() };
    assert_eq!(crate::layer::synthesis(&asks_italic, &italic_face), (false, 0.0), "a real italic is not slanted again");
}

/// A forced line break (U+0003, Shift+Return) starts a new line in the same paragraph: no
/// first-line indent or space before it, the paragraph's alignment kept (PhotoCraft maps it to a
/// newline for its line breaker the same way).
#[test]
fn forced_line_breaks_continue_the_paragraph() {
    use astudio_doc::text::{ParagraphRun, ParagraphStyle, TextAlign};
    let mut l = styled("one\u{3}two\nthree", CharStyle { size_pt: 20.0, ..Default::default() });
    let p = ParagraphStyle { align: TextAlign::Left, first_line_indent_pt: 30.0, space_before_pt: 12.0, ..Default::default() };
    l.paragraphs = vec![ParagraphRun { len: 8, style: p.clone() }, ParagraphRun { len: 5, style: p }];
    let (t, opts) = crate::layer::text_object(&l, 72.0);
    assert_eq!(t.plain_text(), "one\ntwo\nthree", "the break has the same length, so offsets don't move");
    let firsts: Vec<f64> = opts.paragraphs.iter().map(|p| p.first_line_indent).collect();
    assert_eq!(firsts, [30.0, 0.0, 30.0]);
    let before: Vec<f64> = opts.paragraphs.iter().map(|p| p.space_before).collect();
    assert_eq!(before, [12.0, 0.0, 12.0]);
    let lay = crate::layout_with(db(), &t, &opts);
    assert_eq!(lay.lines.len(), 3);
    // "two" starts at the margin, "one" and "three" after the indent.
    assert!(lay.lines[1].x0 < lay.lines[0].x0 - 20.0 && lay.lines[2].x0 > lay.lines[1].x0 + 20.0, "{:?}", lay.lines);
}

/// Vertical type gets its underline right of the column and its strikethrough through the
/// column's centre, along the run (PhotoCraft's `layout.rs` decorations; they were dropped).
#[test]
fn vertical_type_is_underlined_and_struck_through() {
    use astudio_doc::text::Orientation;
    let mut l = styled("abc", CharStyle { size_pt: 40.0, underline: true, strikethrough: true, ..Default::default() });
    l.orientation = Orientation::Vertical;
    let lay = layout_layer(db(), &l, 72.0);
    assert_eq!(lay.decorations.len(), 2, "{:?}", lay.decorations);
    let ink = lay.glyphs.iter().map(|g| kurbo::Shape::bounding_box(&g.outline)).reduce(|a, b| a.union(b)).unwrap();
    let (under, strike) = (lay.decorations[0], lay.decorations[1]);
    for d in [under, strike] {
        assert!(d.y1 - d.y0 > 3.0 * (d.x1 - d.x0), "runs down the column: {d:?}");
        assert!(d.y0 < ink.y0 + 5.0 && d.y1 > ink.y1 - 5.0, "{d:?} along {ink:?}");
    }
    assert!(under.x0 >= ink.x1 - 1.0, "underline right of the glyphs: {under:?} {ink:?}");
    let mid = (strike.x0 + strike.x1) / 2.0;
    assert!(mid > ink.x0 && mid < ink.x1, "strikethrough across the glyphs: {strike:?} {ink:?}");
}

/// Vertical anchors as in PhotoCraft's `vertical_tests.rs`: point type centres its first column
/// on the anchor and starts at it, the next column one leading to the left; box type starts its
/// columns at the box's right edge and keeps them within its height.
#[test]
fn vertical_type_anchors_like_photocraft() {
    use astudio_doc::text::{Orientation, TextShape};
    let vertical = |text: &str| {
        let mut l = styled(text, CharStyle { size_pt: 20.0, ..Default::default() });
        l.orientation = Orientation::Vertical;
        l
    };
    let ink = |l: &TextLayer| {
        let lay = layout_layer(db(), l, 72.0);
        // Spaces have no outline (and no bounds to count).
        lay.glyphs.iter().filter(|g| !g.outline.elements().is_empty()).map(|g| kurbo::Shape::bounding_box(&g.outline)).collect::<Vec<_>>()
    };
    // One column: centred on x = 0 (the ink within the 20 px column), from y = 0 down.
    let one = ink(&vertical("abc"));
    let all = one.iter().copied().reduce(|a, b| a.union(b)).unwrap();
    assert!(all.x0 > -10.5 && all.x1 < 10.5 && (all.x0 + all.x1).abs() < 6.0, "{all:?}");
    assert!(all.y0 >= -0.5 && all.y0 < 6.0, "{all:?}");
    // The second paragraph is the next column, to the left by the leading (1.2 × 20 px).
    let two = ink(&vertical("abc\nabc"));
    let (first, second) = (two[0], two[3]);
    assert_eq!(two.len(), 6);
    assert!(((first.x0 + first.x1) / 2.0 - (second.x0 + second.x1) / 2.0 - 24.0).abs() < 0.5, "{first:?} {second:?}");
    assert!((first.y0 - second.y0).abs() < 1e-6);
    // A box: columns start at its right edge (x = 210) and wrap within its height (20 to 80).
    let mut boxed = vertical("ab cd ef gh ij kl mn op");
    boxed.shape = TextShape::Box { x: 10.0, y: 20.0, width: 200.0, height: 60.0 };
    let (t, opts) = crate::layer::text_object(&boxed, 72.0);
    assert!(crate::layout_with(db(), &t, &opts).lines.len() >= 3);
    let glyphs = ink(&boxed);
    let b = glyphs.iter().copied().reduce(|a, b| a.union(b)).unwrap();
    assert!(b.x1 <= 210.5 && b.x1 > 195.0 && b.x0 >= 9.5, "{b:?}");
    assert!(b.y0 >= 19.5 && b.y1 <= 80.5, "{b:?}");
}

/// Auto leading as in PhotoCraft (`layout.rs` line heights): each line sits the paragraph's
/// auto-leading factor times its largest size below the one before; explicit leading wins.
#[test]
fn auto_leading_follows_the_paragraph_factor() {
    use astudio_doc::text::{ParagraphRun, ParagraphStyle};
    let baselines = |l: &TextLayer| {
        let (t, o) = crate::layer::text_object(l, 72.0);
        crate::layout_with(db(), &t, &o).lines.iter().map(|l| l.baseline).collect::<Vec<_>>()
    };
    let s = CharStyle { size_pt: 20.0, ..Default::default() };
    let mut l = styled("ab\ncd\nef", s.clone());
    l.paragraphs = vec![ParagraphRun { len: 8, style: ParagraphStyle { auto_leading: 1.75, ..Default::default() } }];
    let b = baselines(&l);
    assert!((b[1] - b[0] - 35.0).abs() < 1e-6 && (b[2] - b[1] - 35.0).abs() < 1e-6, "{b:?}");
    // A larger size on the second line makes that line's leading.
    let mut mixed = TextLayer {
        text: "ab\ncD".into(),
        runs: vec![TextRun { len: 4, style: s.clone() }, TextRun { len: 1, style: CharStyle { size_pt: 40.0, ..s.clone() } }],
        ..Default::default()
    };
    mixed.paragraphs = vec![ParagraphRun { len: 5, style: ParagraphStyle { auto_leading: 1.5, ..Default::default() } }];
    let b = baselines(&mixed);
    assert!((b[1] - b[0] - 60.0).abs() < 1e-6, "{b:?}");
    // Explicit leading in points replaces auto leading.
    let fixed = styled("ab\ncd", CharStyle { leading_pt: Some(50.0), ..s });
    let b = baselines(&fixed);
    assert!((b[1] - b[0] - 50.0).abs() < 1e-6, "{b:?}");
}

/// Small Caps use the font's small capitals (`smcp`) when it has them; otherwise smaller
/// capitals stand in (70%), as Photoshop draws them, rather than plain lowercase.
#[test]
fn small_caps_without_the_feature_are_synthesised() {
    use astudio_doc::text::Caps;
    let height = |family: &str, text: &str, caps: Caps| {
        let l = layout_layer(db(), &styled(text, CharStyle { font_family: family.into(), size_pt: 100.0, caps, ..Default::default() }), 72.0);
        kurbo::Shape::bounding_box(&l.glyphs[0].outline).height()
    };
    let inter = db().face("Inter", "Regular").unwrap();
    let sans = db().face("Source Sans 3", "Regular").unwrap();
    assert!(!inter.has_feature(b"smcp") && sans.has_feature(b"smcp"));
    // Inter: a synthesised small capital "x" is a capital "X" at 70% (not Inter's lowercase x,
    // which is taller).
    let (lower, small, cap) = (height("Inter", "x", Caps::Normal), height("Inter", "x", Caps::SmallCaps), height("Inter", "X", Caps::Normal));
    assert!((small - 0.7 * cap).abs() < 1.0 && (small - lower).abs() > 2.0, "{lower} {small} {cap}");
    // Source Sans 3 draws its own small capitals.
    let own = height("Source Sans 3", "x", Caps::SmallCaps);
    assert!(own > height("Source Sans 3", "x", Caps::Normal) + 1.0, "{own}");
}

/// Paragraph text starts with the top of its tallest lowercase ascender ('d') at the box top
/// (PhotoCraft's `first_ascent`, Photoshop's look), where VectorCraft's own area type puts the
/// font's ascent there (lower).
#[test]
fn box_text_starts_at_the_lowercase_ascender() {
    use astudio_doc::text::TextShape;
    let mut l = styled("dog", CharStyle { size_pt: 40.0, ..Default::default() });
    l.shape = TextShape::Box { x: 10.0, y: 20.0, width: 300.0, height: 200.0 };
    let lay = layout_layer(db(), &l, 72.0);
    let d = kurbo::Shape::bounding_box(&lay.glyphs[0].outline);
    assert!((d.y0 - 20.0).abs() < 0.5, "{d:?}");
    // VectorCraft area type keeps Illustrator's default, the ascent at the frame top.
    let (t, mut opts) = crate::layer::text_object(&l, 72.0);
    opts.first_baseline = crate::FirstBaseline::Ascent;
    let vc = crate::layout_with(db(), &t, &opts);
    let vc_d = kurbo::Shape::bounding_box(&vc.glyphs[0].outline);
    assert!(vc_d.y0 > d.y0 + 2.0, "{vc_d:?} vs {d:?}");
}

/// A family that isn't installed, with no metric-compatible stand-in, is drawn in PhotoCraft's
/// default family (Inter), not VectorCraft's fallback; an installed family is left as it is.
#[test]
fn missing_families_fall_back_like_photocraft() {
    let missing = styled("x", CharStyle { font_family: "No Such Family".into(), ..Default::default() });
    assert_eq!(resolve_faces(db(), &missing), [Some(("Inter".to_string(), "Regular".to_string()))]);
    let present = styled("x", CharStyle { font_family: "Source Sans 3".into(), ..Default::default() });
    assert_eq!(resolve_faces(db(), &present), [None]);
}

/// Arial, Times New Roman and Courier New, when missing, are drawn with the installed families of
/// the same widths (Liberation, Arimo, …), as font configuration maps them for PhotoCraft (checked
/// where those stand-ins are installed and Arial isn't).
#[test]
fn missing_core_fonts_use_metric_compatible_families() {
    let sys = FontDb::with_font_dirs(crate::system_font_dirs());
    sys.load_system_fonts();
    let has = |f: &str| sys.resolve(f, "Regular").is_some_and(|(_, m)| m != crate::FontMatch::Missing);
    if has("Arial") || !has("Liberation Sans") {
        return;
    }
    let arial = styled("x", CharStyle { font_family: "Arial".into(), weight: 700, ..Default::default() });
    assert_eq!(resolve_faces(&sys, &arial), [Some(("Liberation Sans".to_string(), "Bold".to_string()))]);
}
