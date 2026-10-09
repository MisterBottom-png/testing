//! PSD text round trips, ported from PhotoCraft's `text/src/tests.rs` and `vertical_tests.rs`
//! (the tests that need no text layout).
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_doc::TextLayer;
use astudio_doc::text::{CharStyle, FontFeature, Orientation, TextRun};

fn styled(text: &str, style: CharStyle) -> TextLayer {
    TextLayer { text: text.into(), runs: vec![TextRun { len: text.len(), style }], ..Default::default() }
}

fn runs_of(text: &str, styles: &[(usize, CharStyle)]) -> TextLayer {
    TextLayer { text: text.into(), runs: styles.iter().map(|(len, style)| TextRun { len: *len, style: style.clone() }).collect(), ..Default::default() }
}

fn vertical(text: &str, family: &str, size_pt: f32) -> TextLayer {
    TextLayer {
        text: text.into(),
        runs: vec![TextRun { len: text.len(), style: CharStyle { font_family: family.into(), size_pt, ..Default::default() } }],
        orientation: Orientation::Vertical,
        ..Default::default()
    }
}

/// `Txt2` as Photoshop writes it (a bare `/key value` sequence; text objects at `/1 /1`, style
/// runs at `/0 /6 /0`, auto-kern mode at `/11`), for the layer text `text`.
fn txt2_with_modes(text: &str, modes: &[(usize, i64)]) -> Vec<u8> {
    let mut v = b"\n\n/98 << /0 14 >> /0 << >> /1 << /1 [ << /0 << /0 (\xfe\xff".to_vec();
    for u in format!("{text}\r").encode_utf16() {
        let b = u.to_be_bytes();
        for x in b {
            if matches!(x, b'(' | b')' | b'\\') {
                v.push(b'\\');
            }
            v.push(x);
        }
    }
    v.extend_from_slice(b") /6 << /0 [ ");
    for (len, m) in modes {
        v.extend_from_slice(format!("<< /0 << /0 << /0 (\u{fe}\u{ff}) /6 << /0 0 /11 {m} >> >> >> /1 {len} >> ").as_bytes());
    }
    v.extend_from_slice(b"] >> >> >> ] >>");
    v
}

fn with_text_index(tysh: &[u8], index: i32) -> Vec<u8> {
    let mut t = crate::psd::parse_tysh(tysh).unwrap();
    t.text.items.retain(|(k, _)| !k.is("TextIndex"));
    t.text.items.push((astudio_psd::descriptor::Id::new("TextIndex"), astudio_psd::descriptor::Value::Integer(index)));
    crate::psd::write_tysh(&t)
}

/// Optical (and "0") kerning only lives in `Txt2`: import applies it when the layer's
/// `TextIndex` object still holds the same text.
#[test]
fn txt2_carries_optical_kerning() {
    use astudio_doc::text::Kerning;
    let t = styled("AVA", CharStyle::default());
    let tysh = with_text_index(&crate::psd::build_tysh(&t, 72.0, None), 0);
    let mut back = crate::psd::text_layer_from_tysh(&tysh, 72.0).unwrap();
    assert!(back.char_runs().iter().all(|r| r.style.kerning == Kerning::Metrics));
    // "AVA\r": two optical characters, then manual ("0") for the last and the break.
    let txt2 = crate::psd::parse_txt2(&txt2_with_modes("AVA", &[(2, 2), (2, 0)])).unwrap();
    crate::psd::apply_txt2(&mut back, &tysh, &txt2);
    let modes: Vec<(usize, Kerning)> = back.char_runs().iter().map(|r| (r.len, r.style.kerning)).collect();
    assert_eq!(modes, vec![(2, Kerning::Optical), (1, Kerning::Off)]);
    // Stale Txt2 (other text), another index or garbage: nothing changes, nothing panics.
    for (data, index) in [(txt2_with_modes("AVX", &[(4, 2)]), 0), (txt2_with_modes("AVA", &[(4, 2)]), 3), (b"<< /1 [ (x".to_vec(), 0), (Vec::new(), 0)] {
        let tysh = with_text_index(&crate::psd::build_tysh(&t, 72.0, None), index);
        let mut l = crate::psd::text_layer_from_tysh(&tysh, 72.0).unwrap();
        if let Some(txt2) = crate::psd::parse_txt2(&data) {
            crate::psd::apply_txt2(&mut l, &tysh, &txt2);
        }
        assert!(
            l.char_runs().iter().all(|r| r.style.kerning == Kerning::Metrics),
            "case {index}: {:?}",
            l.char_runs().iter().map(|r| r.style.kerning).collect::<Vec<_>>()
        );
    }
    // Run lengths longer than the text, zero lengths and odd modes are tolerated.
    let txt2 = crate::psd::parse_txt2(&txt2_with_modes("AVA", &[(0, 2), (100, 2), (5, 9)])).unwrap();
    let mut l = crate::psd::text_layer_from_tysh(&tysh, 72.0).unwrap();
    crate::psd::apply_txt2(&mut l, &tysh, &txt2);
    assert!(l.char_runs().iter().all(|r| r.style.kerning == Kerning::Optical));
}

/// EngineData pair fields: manual kerning and "no automatic kerning" round-trip exactly, in
/// Photoshop's form (see `psd::pair_runs`).
#[test]
fn psd_round_trips_manual_kerning() {
    use astudio_doc::text::Kerning::{Metrics as M, Off as O};
    let s = CharStyle::default();
    let cases: Vec<Vec<(usize, astudio_doc::text::Kerning, f32)>> = vec![
        vec![(1, O, 100.0), (1, O, -50.0), (2, M, 0.0)],
        vec![(1, M, 0.0), (1, O, 0.0), (2, M, 0.0)],
        vec![(4, O, 0.0)],
        vec![(2, M, 0.0), (1, O, 25.0), (1, M, 0.0)],
        vec![(3, M, 0.0), (1, O, 300.0)],
    ];
    for runs in cases {
        let t = runs_of("AVAT", &runs.iter().map(|&(len, kerning, kern)| (len, CharStyle { kerning, kern, ..s.clone() })).collect::<Vec<_>>());
        let back = crate::psd::text_layer_from_tysh(&crate::psd::build_tysh(&t, 72.0, None), 72.0).unwrap();
        let per = |t: &TextLayer| t.char_runs().iter().flat_map(|r| std::iter::repeat_n((r.style.kerning, r.style.kern), r.len)).collect::<Vec<_>>();
        let mut want = per(&t);
        // The last character's mode has no EngineData slot (it reads back as Metrics unless
        // it has a manual kern).
        if let Some(last) = want.last_mut()
            && last.1 == 0.0
        {
            last.0 = M;
        }
        assert_eq!(per(&back), want, "{runs:?}");
    }
}

#[test]
fn psd_round_trips_antialias_opentype_and_warp() {
    use astudio_doc::text::{AntiAlias, TextWarp};
    let style = CharStyle {
        font_family: "Inter".into(),
        size_pt: 20.0,
        features: vec![FontFeature { tag: "swsh".into(), value: 1 }, FontFeature { tag: "frac".into(), value: 1 }],
        discretionary_ligatures: true,
        ..Default::default()
    };
    for aa in [AntiAlias::Windows, AntiAlias::WindowsLcd, AntiAlias::Crisp, AntiAlias::None] {
        let mut t = styled("1/2 Swash", style.clone());
        t.antialias = aa;
        t.warp = Some(TextWarp { style: "warpFlag".into(), value: -35.0, horizontal_distortion: 10.0, vertical_distortion: 0.0, horizontal: false });
        let bytes = crate::psd::build_tysh(&t, 72.0, None);
        let back = crate::psd::text_layer_from_tysh(&bytes, 72.0).unwrap();
        assert_eq!(back.antialias, aa);
        assert_eq!(back.warp, t.warp);
        let st = &back.char_runs()[0].style;
        assert!(st.discretionary_ligatures);
        let mut tags: Vec<&str> = st.features.iter().map(|f| f.tag.as_str()).collect();
        tags.sort_unstable();
        assert_eq!(tags, ["frac", "swsh"]);
    }
}

/// Regression: a PSD whose text engine data has no `EngineDict` (or isn't a dictionary)
/// panicked with `expect("EngineDict")` when the layer was written back (PSD export).
#[test]
fn engine_data_template_without_engine_dict() {
    use crate::psd::engine_data::{self as ed, Value as E};
    let t = styled("Hi", CharStyle::default());
    let no_engine_dict = ed::parse(b"<< /ResourceDict << >> >>").unwrap();
    for template in [no_engine_dict, E::Dict(vec![]), E::Int(3)] {
        let e = crate::psd::build_engine_data(&t, Some(template), 72.0);
        let text = e.path(&["EngineDict", "Editor", "Text"]);
        assert!(matches!(text, Some(E::String(s)) if s == "Hi\r"), "{text:?}");
    }
}

#[test]
fn psd_tysh_round_trips_orientation_and_writing_direction() {
    use crate::psd::engine_data::Value as E;
    for o in [Orientation::Vertical, Orientation::Horizontal] {
        let t = TextLayer { orientation: o, ..vertical("縦書きAB", "Inter", 20.0) };
        let bytes = crate::psd::build_tysh(&t, 72.0, None);
        let back = crate::psd::text_layer_from_tysh(&bytes, 72.0).unwrap();
        assert_eq!(back.orientation, o);
        let parsed = crate::psd::parse_tysh(&bytes).unwrap();
        let ed = crate::psd::engine_data(&parsed.text).unwrap();
        let wd = ed.path(&["EngineDict", "Rendered", "Shapes", "WritingDirection"]).and_then(E::as_f64);
        assert_eq!(wd, Some(if o == Orientation::Vertical { 2.0 } else { 0.0 }));
    }
    // A file without `Ornt` but with a vertical writing direction imports as vertical.
    let t = TextLayer { orientation: Orientation::Vertical, ..vertical("ab", "Inter", 20.0) };
    let mut parsed = crate::psd::parse_tysh(&crate::psd::build_tysh(&t, 72.0, None)).unwrap();
    parsed.text.items.retain(|(k, _)| !k.is("Ornt"));
    let back = crate::psd::text_layer_from_tysh(&crate::psd::write_tysh(&parsed), 72.0).unwrap();
    assert_eq!(back.orientation, Orientation::Vertical);
}

/// The model half of PhotoCraft's `io/tests/text_corpus.rs` `created_text_layer_roundtrips_through_psd`
/// (P2-05): a layer made in the app (two runs, two paragraphs, a box, a transform, 144 dpi)
/// survives our TySh writer and reader. The PSD-file half needs PSD export (P5-03).
#[test]
fn created_text_layer_round_trips_through_tysh() {
    use astudio_color::Color;
    use astudio_doc::text::{ParagraphRun, ParagraphStyle, TextAlign, TextShape};
    let dpi = 144.0;
    let a = CharStyle { font_family: "Inter".into(), size_pt: 10.0, color: Color::rgb(0.2, 0.4, 0.6), ..Default::default() };
    let b = CharStyle { faux_bold: true, underline: true, tracking: 50.0, leading_pt: Some(14.0), ..a.clone() };
    let mut t = TextLayer {
        text: "Größe\nzwei".into(),
        runs: vec![TextRun { len: 3, style: a }, TextRun { len: 9, style: b }],
        paragraphs: vec![
            ParagraphRun { len: 7, style: ParagraphStyle { align: TextAlign::Center, space_after_pt: 3.0, ..Default::default() } },
            ParagraphRun { len: 5, style: ParagraphStyle { align: TextAlign::JustifyAll, ..Default::default() } },
        ],
        shape: TextShape::Box { x: 0.0, y: 0.0, width: 100.0, height: 60.0 },
        transform: astudio_geom::pixel::Affine::translate(8.0, 6.0),
        ..Default::default()
    };
    t.sync_summary();
    let bt = crate::psd::text_layer_from_tysh(&crate::psd::build_tysh(&t, dpi, None), dpi).unwrap();
    let strip = |v: Vec<TextRun>| {
        v.into_iter()
            .map(|mut r| {
                r.style.postscript_name = None;
                r.style.color.c = r.style.color.c.map(|c| (c * 1000.0).round() / 1000.0);
                r
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(bt.text, t.text);
    assert_eq!(strip(bt.char_runs()), strip(t.char_runs()));
    assert_eq!(bt.paragraph_runs(), t.paragraph_runs());
    assert_eq!(bt.shape, t.shape);
    assert_eq!(bt.transform, t.transform);
}
