//! A-Studio P1-03: a Vector layer saved in a .pcraft bundle (as a .vectorcraft v3 subtree in the
//! manifest) reopens unchanged: same vector document, transform and rendered pixels.

use photocraft_color::{ColorMode, PixelFormat, SampleType};
use photocraft_doc::{Document, Layer, LayerContent, VectorLayer};
use photocraft_geom::{Rect, Size};
use vlayer::{VectorTiles, synthetic};

fn vector_of(doc: &Document) -> &VectorLayer {
    let Some(LayerContent::Vector(v)) = doc.layers.iter().map(|l| &l.content).find(|c| matches!(c, LayerContent::Vector(_))) else { panic!("no vector layer") };
    v
}

fn sample_doc() -> Document {
    let mut doc = Document::new("p1-03", Size::new(1200, 900), ColorMode::Rgb, SampleType::U8);
    doc.resolution_dpi = 96.0;
    let mut bg = Layer::raster("Background", PixelFormat::RGBA8);
    if let LayerContent::Raster(s) = &mut bg.content {
        s.fill_rect(Rect::new(0, 0, 1200, 900), &[0.9, 0.85, 0.7, 1.0]);
    }
    doc.layers.push(bg);
    let mut v = VectorLayer::new(synthetic(300, 800.0, 600.0), doc.resolution_dpi);
    v.transform.m[4] = 20.0;
    VectorTiles::new().redraw(&mut v, Rect::new(0, 0, 1200, 900), None);
    doc.layers.push(Layer::new("Vector 1", LayerContent::Vector(v)));
    doc
}

#[test]
fn vector_layer_round_trips_through_pcraft() {
    let doc = sample_doc();
    let bytes = photocraft_format::save_to_bytes(&doc, &Default::default()).expect("save");
    let back = photocraft_format::load_from_bytes(&bytes).expect("load");

    assert_eq!(back.layers.len(), 2);
    assert_eq!(back.layers[1].content.kind_name(), "Vector");
    let (a, b) = (vector_of(&doc), vector_of(&back));
    assert_eq!(a.transform, b.transform);
    assert_eq!(a.cache, b.cache, "rendered pixels come back tile for tile");
    assert!(b.fresh_cache().is_some(), "a reopened layer does not need a re-render");
    // The vector document is the same as VectorCraft's own save → open gives.
    let via_vectorcraft = vectorcraft_format::load(&vectorcraft_format::save(&a.doc, false)).expect("vectorcraft round trip");
    assert_eq!(*b.doc, via_vectorcraft, "same vector document as a .vectorcraft file round trip");
    assert_eq!(b.doc.layers.iter().map(|l| l.count()).sum::<usize>(), a.doc.layers.iter().map(|l| l.count()).sum::<usize>());
    // And the composite is pixel-identical.
    let canvas = Rect::new(0, 0, 1200, 900);
    assert_eq!(photocraft_compose::render(&doc, canvas).px, photocraft_compose::render(&back, canvas).px);
    // Saving the reopened document gives the same manifest.
    let again = photocraft_format::save_to_bytes(&back, &Default::default()).expect("save again");
    let (m1, m2) = (photocraft_format::read_manifest(&bytes).expect("m1"), photocraft_format::read_manifest(&again).expect("m2"));
    assert_eq!(serde_json::to_value(&m1.document.layers).ok(), serde_json::to_value(&m2.document.layers).ok());
}
