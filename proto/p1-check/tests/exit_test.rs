//! The P1 exit test (docs/01-roadmap.md), end to end:
//! a PSD opens in PhotoCraft with one VectorCraft path added as a Vector layer, rendered into
//! tiles, saved and reopened.
//!
//! Unmodified PhotoCraft (upstream crates) writes and opens the PSD and hands the document over
//! as a .pcraft bundle; the prototype's PhotoCraft copy (with Vector layers) takes it from there.

use photocraft_color::{ColorMode, PixelFormat, SampleType};
use photocraft_doc::{Layer, LayerContent, VectorLayer};
use photocraft_geom::{Rect, Size};
use vectorcraft_color::{Color, Paint};
use vectorcraft_doc::{Appearance, Node};
use vectorcraft_geom::{Point, shapes};
use vlayer::VectorTiles;

const W: i32 = 640;
const H: i32 = 480;

/// A small "photo": four colour bands, saved as a PSD by PhotoCraft.
fn make_psd() -> Vec<u8> {
    let mut doc = upstream_doc::Document::new("photo", Size::new(W as u32, H as u32), ColorMode::Rgb, SampleType::U8);
    let mut layer = upstream_doc::Layer::raster("Background", PixelFormat::RGBA8);
    if let upstream_doc::LayerContent::Raster(s) = &mut layer.content {
        for (i, c) in [[0.8, 0.2, 0.2], [0.2, 0.7, 0.3], [0.2, 0.3, 0.8], [0.9, 0.8, 0.2]].iter().enumerate() {
            let y0 = i as i32 * H / 4;
            s.fill_rect(Rect::new(0, y0, W, y0 + H / 4), &[c[0], c[1], c[2], 1.0]);
        }
    }
    doc.layers.push(layer);
    upstream_io::document_to_psd(&doc).to_bytes().expect("write PSD")
}

fn px(buf: &photocraft_compose::Buffer, x: i32, y: i32) -> [f32; 4] {
    let i = ((y - buf.rect.y0) * buf.rect.width() as i32 + (x - buf.rect.x0)) as usize;
    buf.px[i]
}

fn close(a: [f32; 4], b: [f32; 4]) -> bool {
    a.iter().zip(b).all(|(x, y)| (x - y).abs() < 1.5 / 255.0)
}

#[test]
fn psd_plus_vector_path_renders_saves_and_reopens() {
    // 1. Open the PSD in (unmodified) PhotoCraft.
    let psd = upstream_psd::PsdFile::from_bytes(&make_psd()).expect("parse PSD");
    let (opened, warnings) = upstream_io::psd_to_document(&psd);
    assert!(warnings.is_empty(), "PSD warnings: {warnings:?}");
    let handover = upstream_format::save_to_bytes(&opened, &Default::default()).expect("pcraft from PhotoCraft");
    let mut doc = photocraft_format::load_from_bytes(&handover).expect("prototype opens PhotoCraft's .pcraft");
    assert_eq!((doc.size.width, doc.size.height), (W as u32, H as u32));
    let canvas = Rect::new(0, 0, W, H);
    let before = photocraft_compose::render(&doc, canvas);

    // 2. Add one VectorCraft path (a filled, stroked star) as a Vector layer.
    let mut vdoc = vectorcraft_doc::Document::new(f64::from(W), f64::from(H));
    let target = vdoc.layers.first().map(|l| l.id);
    let id = vdoc.alloc_id();
    let star = shapes::star(Point::new(320.0, 240.0), 150.0, 70.0, 5, 0.0);
    let red = Color::rgb(1.0, 0.0, 0.0);
    vdoc.insert(target, usize::MAX, Node::path(id, star, Appearance::basic(Paint::solid(red), Paint::solid(Color::BLACK), 4.0))).expect("insert");
    let mut v = VectorLayer::new(vdoc, 72.0);

    // 3. Render it into tiles and composite.
    let stats = VectorTiles::new().redraw(&mut v, canvas, None).expect("render");
    assert!(stats.tiles_cached >= 1);
    doc.layers.push(Layer::new("Star", LayerContent::Vector(v)));
    let after = photocraft_compose::render(&doc, canvas);
    assert!(close(px(&after, 320, 240), [1.0, 0.0, 0.0, 1.0]), "the star's centre is red: {:?}", px(&after, 320, 240));
    assert!(close(px(&after, 10, 10), px(&before, 10, 10)), "outside the star the photo shows through");
    assert!(close(px(&after, 630, 470), px(&before, 630, 470)));

    // 4. Save and reopen: same layers, same pixels.
    let bytes = photocraft_format::save_to_bytes(&doc, &Default::default()).expect("save");
    let back = photocraft_format::load_from_bytes(&bytes).expect("reopen");
    assert_eq!(back.layers.iter().map(|l| l.content.kind_name()).collect::<Vec<_>>(), ["Pixel", "Vector"]);
    assert_eq!(photocraft_compose::render(&back, canvas).px, after.px, "reopened document composites identically");
}
