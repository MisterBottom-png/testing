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
