//! P3-06's exit test for `.vectorcraft`: files A-Studio writes name A-Studio, and a file that
//! names VectorCraft's built-in CMYK space opens with the same colours.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::vector::cms::{self, Cms, ColorSettings, GENERIC_CMYK};
use astudio_format::vectorcraft::{self, FormatError};
use astudio_vdoc::Document;

#[test]
fn a_saved_file_names_a_studio_and_keeps_its_format_name() {
    let text = String::from_utf8(vectorcraft::save(&Document::new(100.0, 80.0), false)).unwrap();
    assert!(text.contains(&format!("\"generator\":\"A-Studio {}\"", env!("CARGO_PKG_VERSION"))), "{text}");
    assert!(text.contains("\"format\":\"vectorcraft\""), "the file format keeps its name (D4)");
    // Its errors name the file type, not an app.
    let err = vectorcraft::load(b"{\"format\":\"other\"}").unwrap_err();
    assert!(matches!(err, FormatError::NotVectorcraft(_)) && !err.to_string().contains("VectorCraft"), "{err}");
}

#[test]
fn a_file_naming_vectorcraft_generic_cmyk_opens_with_the_same_colours() {
    let mut d = Document::new(100.0, 80.0);
    d.color_profiles.cmyk = Some("VectorCraft Generic CMYK (SWOP-like)".into());
    let text = String::from_utf8(vectorcraft::save(&d, false)).unwrap().replace("\"generator\":\"A-Studio", "\"generator\":\"VectorCraft");
    let back = vectorcraft::load(text.as_bytes()).unwrap();
    let named = back.color_profiles.cmyk.clone().unwrap();
    assert_eq!(cms::canonical_name(&named), GENERIC_CMYK);
    let old = Cms::new(&ColorSettings { cmyk: named, ..ColorSettings::default() }).unwrap();
    let new = Cms::new(&ColorSettings { cmyk: GENERIC_CMYK.into(), ..ColorSettings::default() }).unwrap();
    for ink in [[1.0, 0.0, 0.0, 0.0], [0.1, 0.8, 0.3, 0.05], [0.0, 0.0, 0.0, 1.0]] {
        assert_eq!(old.cmyk_to_srgb(ink, false), new.cmyk_to_srgb(ink, false));
    }
}
