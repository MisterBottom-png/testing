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
