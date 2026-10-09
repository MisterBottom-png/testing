//! Type-layer geometry as Photoshop writes it (PhotoCraft's `io/tests/psd_type_bounds.rs`, #148):
//! `TySh` blocks with the text-space → document transform, `EngineData` sizes in text-space
//! units, `BoxBounds` for paragraph text and the logical `bounds`. Each must read into the right
//! model (size in points at the document resolution, transform, shape), and drawing the model
//! after a round trip through A-Studio's own `TySh` writer must land on the same pixels: edges
//! within 1 px and ink overlap (IoU) above 0.97, with no scale applied twice or not at all and no
//! 72-vs-document-dpi mix-up (P2-18). PhotoCraft's file-level half (PSD export, import and the
//! merged composite) joins with PSD import and export (P5-03).
//!
//! Fonts: the bundled Inter (deterministic).
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::PixelFormat;
use astudio_doc::TextLayer;
use astudio_doc::text::TextShape;
use astudio_geom::pixel::{Affine, Rect};
use astudio_psd::descriptor::{Descriptor, Id, UnicodeString, Value as D};
use astudio_raster::Surface;
use astudio_text::FontDb;
use astudio_text::psd::engine_data::Value as E;
use astudio_text::psd::{TySh, write_tysh};

fn db() -> &'static FontDb {
    static DB: std::sync::OnceLock<FontDb> = std::sync::OnceLock::new();
    DB.get_or_init(|| FontDb::with_font_dirs(vec![]))
}

/// One character run: (UTF-16 length, font size in text-space units, explicit leading).
struct Run {
    len: usize,
    size: f64,
    leading: Option<f64>,
}

fn real(v: f64) -> E {
    E::Real(v)
}

fn style(size: f64, leading: Option<f64>) -> E {
    E::Dict(vec![
        ("Font".into(), E::Int(0)),
        ("FontSize".into(), real(size)),
        ("AutoLeading".into(), E::Bool(leading.is_none())),
        ("Leading".into(), real(leading.unwrap_or(0.0))),
        ("FillColor".into(), E::Dict(vec![("Type".into(), E::Int(1)), ("Values".into(), E::Array(vec![real(1.0), real(0.0), real(0.0), real(0.0)]))])),
    ])
}

/// Photoshop-shaped EngineData for `text` (paragraphs separated by `\r`).
fn engine_data(text: &str, runs: &[Run], box_bounds: Option<[f64; 4]>) -> E {
    let ed_text = format!("{text}\r");
    let n16 = ed_text.encode_utf16().count() as i64;
    let mut sruns = Vec::new();
    let mut slens = Vec::new();
    for (i, r) in runs.iter().enumerate() {
        sruns.push(E::Dict(vec![("StyleSheet".into(), E::Dict(vec![("StyleSheetData".into(), style(r.size, r.leading))]))]));
        slens.push(E::Int(r.len as i64 + i64::from(i + 1 == runs.len())));
    }
    let para = E::Dict(vec![("Justification".into(), E::Int(0)), ("AutoLeading".into(), real(1.2))]);
    let mut photoshop = vec![("ShapeType".into(), E::Int(i64::from(box_bounds.is_some())))];
    match box_bounds {
        Some(b) => photoshop.push(("BoxBounds".into(), E::Array(b.iter().map(|v| real(*v)).collect()))),
        None => photoshop.push(("PointBase".into(), E::Array(vec![real(0.0), real(0.0)]))),
    }
    let shape = E::Dict(vec![
        ("ShapeType".into(), E::Int(i64::from(box_bounds.is_some()))),
        ("Cookie".into(), E::Dict(vec![("Photoshop".into(), E::Dict(photoshop))])),
    ]);
    let resources = E::Dict(vec![
        ("FontSet".into(), E::Array(vec![E::Dict(vec![("Name".into(), E::String("Inter-Regular".into())), ("Script".into(), E::Int(0))])])),
        ("StyleSheetSet".into(), E::Array(vec![E::Dict(vec![("Name".into(), E::String("Normal RGB".into())), ("StyleSheetData".into(), style(12.0, None))])])),
        ("ParagraphSheetSet".into(), E::Array(vec![E::Dict(vec![("Name".into(), E::String("Normal RGB".into())), ("Properties".into(), para.clone())])])),
    ]);
    E::Dict(vec![
        (
            "EngineDict".into(),
            E::Dict(vec![
                ("Editor".into(), E::Dict(vec![("Text".into(), E::String(ed_text))])),
                (
                    "ParagraphRun".into(),
                    E::Dict(vec![
                        ("RunArray".into(), E::Array(vec![E::Dict(vec![("ParagraphSheet".into(), E::Dict(vec![("Properties".into(), para)]))])])),
                        ("RunLengthArray".into(), E::Array(vec![E::Int(n16)])),
                    ]),
                ),
                ("StyleRun".into(), E::Dict(vec![("RunArray".into(), E::Array(sruns)), ("RunLengthArray".into(), E::Array(slens))])),
                ("Rendered".into(), E::Dict(vec![("Shapes".into(), E::Dict(vec![("Children".into(), E::Array(vec![shape]))]))])),
            ]),
        ),
        ("ResourceDict".into(), resources),
    ])
}

/// A `TySh` block as Photoshop writes it.
fn tysh(text: &str, runs: &[Run], box_bounds: Option<[f64; 4]>, transform: Affine, ink: [f64; 4]) -> Vec<u8> {
    let rect = |cls: &str| {
        D::Descriptor(
            Descriptor::new(cls)
                .with("Left", D::UnitFloat { unit: *b"#Pnt", value: ink[0] })
                .with("Top ", D::UnitFloat { unit: *b"#Pnt", value: ink[1] })
                .with("Rght", D::UnitFloat { unit: *b"#Pnt", value: ink[2] })
                .with("Btom", D::UnitFloat { unit: *b"#Pnt", value: ink[3] }),
        )
    };
    let desc = Descriptor::new("TxLr")
        .with("Txt ", D::Text(UnicodeString::new_nul(text)))
        .with("textGridding", D::Enumerated { type_id: Id::new("textGridding"), value: Id::new("None") })
        .with("Ornt", D::Enumerated { type_id: Id::new("Ornt"), value: Id::new("Hrzn") })
        .with("AntA", D::Enumerated { type_id: Id::new("Annt"), value: Id::new("AnSm") })
        .with("bounds", rect("bounds"))
        .with("boundingBox", rect("boundingBox"))
        .with("TextIndex", D::Integer(0))
        .with("EngineData", D::RawData(astudio_text::psd::engine_data::write(&engine_data(text, runs, box_bounds))));
    let bounds = [ink[0].floor() as i32, ink[1].floor() as i32, ink[2].ceil() as i32, ink[3].ceil() as i32];
    write_tysh(&TySh { transform, text: desc, warp: None, bounds })
}

struct Case {
    name: &'static str,
    dpi: f32,
    text: &'static str,
    runs: Vec<Run>,
    box_bounds: Option<[f64; 4]>,
    transform: Affine,
    /// Expected Character-panel size of the first run, in points.
    size_pt: f32,
}

fn cases() -> Vec<Case> {
    let r = |len: usize, size: f64| Run { len, size, leading: None };
    let t = |x: f64, y: f64| Affine::translate(x, y);
    // Photoshop keeps the font size in text space and the scale in the transform.
    let scaled = |s: f64, x: f64, y: f64| Affine { m: [s, 0.0, 0.0, s, x, y] };
    let rotated = |deg: f64, s: f64, x: f64, y: f64| {
        let (sin, cos) = deg.to_radians().sin_cos();
        Affine { m: [s * cos, s * sin, -s * sin, s * cos, x, y] }
    };
    vec![
        Case {
            name: "point 36pt @72",
            dpi: 72.0,
            text: "Headline 105: Autumn collection",
            runs: vec![r(31, 36.0)],
            box_bounds: None,
            transform: t(40.0, 80.0),
            size_pt: 36.0,
        },
        Case {
            name: "point 36pt @300",
            dpi: 300.0,
            text: "Headline 105: Autumn collection",
            runs: vec![r(31, 150.0)],
            box_bounds: None,
            transform: t(40.0, 200.0),
            size_pt: 36.0,
        },
        Case {
            name: "point 12×3 scaled",
            dpi: 72.0,
            text: "Headline 105: Autumn collection",
            runs: vec![r(31, 12.0)],
            box_bounds: None,
            transform: scaled(3.0, 40.0, 80.0),
            size_pt: 12.0,
        },
        Case {
            name: "point rotated",
            dpi: 72.0,
            text: "Autumn collection",
            runs: vec![r(17, 18.0)],
            box_bounds: None,
            transform: rotated(-20.0, 2.0, 60.0, 300.0),
            size_pt: 18.0,
        },
        Case {
            name: "point multi-line",
            dpi: 72.0,
            text: "Headline\rAutumn collection\rgy",
            runs: vec![Run { len: 29, size: 36.0, leading: Some(50.0) }],
            box_bounds: None,
            transform: t(40.0, 60.0),
            size_pt: 36.0,
        },
        Case {
            name: "point mixed sizes",
            dpi: 72.0,
            text: "Big small Big",
            runs: vec![r(4, 60.0), r(6, 14.0), r(3, 60.0)],
            box_bounds: None,
            transform: t(30.0, 120.0),
            size_pt: 60.0,
        },
        Case {
            name: "paragraph box",
            dpi: 72.0,
            text: "Paragraph text that wraps over several lines in its box",
            runs: vec![r(55, 24.0)],
            box_bounds: Some([0.0, 0.0, 260.0, 200.0]),
            transform: t(20.0, 20.0),
            size_pt: 24.0,
        },
        Case {
            name: "paragraph box scaled",
            dpi: 144.0,
            text: "Paragraph text that wraps over several lines in its box",
            runs: vec![r(55, 20.0)],
            box_bounds: Some([0.0, 0.0, 200.0, 150.0]),
            transform: scaled(1.5, 20.0, 20.0),
            size_pt: 10.0,
        },
    ]
}

fn ink_alpha(s: &Surface, r: Rect) -> Vec<f32> {
    let n = s.channels();
    s.read_region(r).chunks_exact(n).map(|p| p[n - 1]).collect()
}

fn iou(a: &Surface, b: &Surface) -> f32 {
    let u = a.content_bounds().union(&b.content_bounds());
    let (x, y) = (ink_alpha(a, u), ink_alpha(b, u));
    let inter: f32 = x.iter().zip(&y).map(|(p, q)| p.min(*q)).sum();
    let union: f32 = x.iter().zip(&y).map(|(p, q)| p.max(*q)).sum();
    if union > 0.0 { inter / union } else { 1.0 }
}

fn close(a: Rect, b: Rect, tol: i32) -> bool {
    (a.x0 - b.x0).abs() <= tol && (a.y0 - b.y0).abs() <= tol && (a.x1 - b.x1).abs() <= tol && (a.y1 - b.y1).abs() <= tol
}

/// The case as Photoshop writes it (its `bounds` measured as Photoshop does, the logical bounds
/// in text space), read into a model, and that model drawn ("Photoshop's" pixels here).
fn read_case(c: &Case) -> (TextLayer, Surface) {
    let probe = astudio_text::psd::text_layer_from_tysh(&tysh(c.text, &c.runs, c.box_bounds, c.transform, [0.0; 4]), c.dpi).unwrap();
    let ink = astudio_text::layer::layout_layer(db(), &probe, c.dpi).bounds().unwrap_or([0.0; 4]).map(f64::from);
    let data = tysh(c.text, &c.runs, c.box_bounds, c.transform, ink);
    let mut t = astudio_text::psd::text_layer_from_tysh(&data, c.dpi).unwrap();
    t.psd_raw = Some(std::sync::Arc::new(data));
    let (_, drawn) = astudio_text::render::render_layer(db(), &t, c.dpi, PixelFormat::RGBA8);
    (t, drawn.surface)
}

#[test]
fn imported_type_layers_keep_their_full_bounds() {
    for c in cases() {
        let (t, drawn) = read_case(&c);
        let drawn_rect = drawn.content_bounds();
        assert!(!drawn_rect.is_empty(), "{}: nothing drawn", c.name);
        // Model: size in points at the document resolution, transform and shape as written.
        assert!((t.runs[0].style.size_pt - c.size_pt).abs() < 0.01, "{}: size {} pt, want {}", c.name, t.runs[0].style.size_pt, c.size_pt);
        assert_eq!(t.transform, c.transform, "{}", c.name);
        match (c.box_bounds, t.shape) {
            (None, TextShape::Point) => {}
            (Some(b), TextShape::Box { x, y, width, height }) => {
                assert_eq!([x, y, x + width, y + height].map(f64::from), b, "{}", c.name)
            }
            (want, got) => panic!("{}: shape {got:?}, want box {want:?}", c.name),
        }
        // Written by A-Studio and read back, the model draws the same text in the same place:
        // nothing clipped, no scale or dpi drift.
        let rebuilt = astudio_text::psd::build_tysh(&t, c.dpi, None);
        let back = astudio_text::psd::text_layer_from_tysh(&rebuilt, c.dpi).unwrap();
        let (_, ours) = astudio_text::render::render_layer(db(), &back, c.dpi, PixelFormat::RGBA8);
        let ours_rect = ours.surface.content_bounds();
        assert!(close(ours_rect, drawn_rect, 1), "{}: re-render {ours_rect:?} vs file {drawn_rect:?}", c.name);
        let o = iou(&ours.surface, &drawn);
        assert!(o > 0.97, "{}: re-render overlap {o}", c.name);
    }
}

#[test]
fn point_text_height_follows_the_type_size() {
    // 36 pt at 72 dpi: caps and ascenders of "Headline" are about 0.73 em tall; a line with a
    // descender spans about 0.95 em. Properties' H is the pixel height of the layer.
    let c = &cases()[0];
    let (_, drawn) = read_case(c);
    let h = drawn.content_bounds().height();
    assert!((24..=30).contains(&h), "no-descender line: H {h}");
    let c = Case { text: "Headline: Autumn typography", runs: vec![Run { len: 27, size: 36.0, leading: None }], ..cases().remove(0) };
    let (_, drawn) = read_case(&c);
    let h72 = drawn.content_bounds().height();
    assert!((32..=38).contains(&h72), "line with descenders: H {h72}");
    // Same text at 300 dpi: 36 pt = 150 px.
    let c = Case { dpi: 300.0, runs: vec![Run { len: 27, size: 150.0, leading: None }], ..c };
    let (_, drawn300) = read_case(&c);
    let ratio = drawn300.content_bounds().height() as f32 / h72 as f32;
    assert!((ratio - 300.0 / 72.0).abs() < 0.2, "300 dpi H {} vs 72 dpi H {h72}", drawn300.content_bounds().height());
}
