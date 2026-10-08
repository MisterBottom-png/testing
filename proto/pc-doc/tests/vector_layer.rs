//! A-Studio P1-01: a PhotoCraft document holds a VectorCraft document as a Vector layer.

use photocraft_color::{ColorMode, PixelFormat, SampleType};
use photocraft_doc::{Document, Layer, LayerContent, VectorLayer};
use photocraft_geom::Size;
use vectorcraft_color::{Color, Paint};
use vectorcraft_doc::{Appearance, Node};
use vectorcraft_geom::{Rect, shapes};

#[test]
fn document_with_one_vector_layer() {
    let mut doc = Document::new("p1", Size::new(800, 600), ColorMode::Rgb, SampleType::U8);
    doc.layers.push(Layer::raster("Background", PixelFormat::RGBA8));

    let mut vdoc = vectorcraft_doc::Document::new(400.0, 300.0);
    let target = vdoc.layers.first().map(|l| l.id);
    let id = vdoc.alloc_id();
    let path = Node::path(id, shapes::rectangle(Rect::new(10.0, 10.0, 110.0, 60.0)), Appearance::basic(Paint::solid(Color::rgb(1.0, 0.0, 0.0)), Paint::None, 0.0));
    vdoc.insert(target, usize::MAX, path).expect("insert path");

    doc.layers.push(Layer::new("Vector 1", LayerContent::Vector(VectorLayer::new(vdoc, 144.0))));

    let top = doc.layers.last().expect("two layers");
    assert_eq!(top.content.kind_name(), "Vector");
    let LayerContent::Vector(v) = &top.content else { panic!("not a vector layer") };
    assert_eq!(v.transform, [2.0, 0.0, 0.0, 2.0, 0.0, 0.0], "144 dpi = 2 px per point");
    assert!(v.fresh_cache().is_none(), "nothing rendered yet");
    assert_eq!(v.doc.children(target).map(Vec::len), Some(1), "one path in the vector layer");
    // Cloning the PhotoCraft document shares the vector tree (cheap undo snapshots).
    let copy = doc.clone();
    let (LayerContent::Vector(a), LayerContent::Vector(b)) = (&doc.layers[1].content, &copy.layers[1].content) else { panic!() };
    assert!(std::sync::Arc::ptr_eq(&a.doc, &b.doc));
}
