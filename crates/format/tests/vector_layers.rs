//! Vector layers in `.pcraft` (P3-12 review): saved as their drawn pixels, refused when not drawn
//! or stale; a reopened file's vector space matches its resolution.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::Arc;

use astudio_color::{BlendMode, ColorMode, SampleType};
use astudio_doc::{Affine, Document, Layer, LayerContent, Size, VectorLayer};
use astudio_format::*;
use astudio_geom::pixel::Rect;
use astudio_vdoc::Symbol;
use astudio_vdoc::node::{LayerColor, Node, NodeId};

fn doc_with_vector_layer(drawn: bool) -> Document {
    let mut d = Document::new("Art", Size::new(16, 12), ColorMode::Rgb, SampleType::U8);
    let fmt = d.pixel_format();
    let mut v = VectorLayer::new(Arc::new(Node::layer(NodeId(1), "Shapes", LayerColor::Preset(1))));
    if drawn {
        let mut s = astudio_raster::Surface::new(fmt);
        s.fill_rect(Rect::from_xywh(2, 3, 5, 4), &astudio_raster::from_rgba(&fmt, [1.0, 0.0, 0.0, 1.0]));
        v.cache = Some(s);
        v.cache_revision = (v.revision, d.vector_revision.0);
    }
    let mut l = Layer::new("Shapes", LayerContent::Vector(v));
    l.opacity = 0.6;
    l.blend = BlendMode::Screen;
    d.layers.push(l);
    d
}

#[test]
fn a_drawn_vector_layer_is_saved_as_its_pixels() {
    let d = doc_with_vector_layer(true);
    let back = load_from_bytes(&save_to_bytes(&d, &SaveOptions::default()).unwrap()).unwrap();
    let l = back.layers.last().unwrap();
    assert_eq!((l.name.as_str(), l.opacity, l.blend), ("Shapes", 0.6, BlendMode::Screen));
    let LayerContent::Raster(s) = &l.content else { panic!("saved as {}", l.content.kind_name()) };
    let mut px = [[0.0f32; 4]; 2];
    s.read_rgba_into(Rect::from_xywh(3, 4, 1, 1), &mut px[..1]);
    s.read_rgba_into(Rect::from_xywh(0, 0, 1, 1), &mut px[1..]);
    assert!(px[0][0] > 0.99 && px[0][3] > 0.99, "drawn pixel kept: {:?}", px[0]);
    assert!(px[1][3] < 0.01, "outside the art stays clear: {:?}", px[1]);
}

#[test]
fn an_undrawn_vector_layer_is_refused() {
    let d = doc_with_vector_layer(false);
    let err = save_to_bytes(&d, &SaveOptions::default()).unwrap_err();
    assert!(matches!(&err, FormatError::Unsupported(m) if m.contains("Shapes")), "{err}");
}

#[test]
fn a_stale_vector_layer_is_refused() {
    // Moved after it was drawn.
    let mut d = doc_with_vector_layer(true);
    if let Some(LayerContent::Vector(v)) = d.layers.last_mut().map(|l| &mut l.content) {
        v.set_transform(Affine::translate(4.0, 0.0));
    }
    assert!(matches!(save_to_bytes(&d, &SaveOptions::default()), Err(FormatError::Unsupported(_))));
    // The vector space changed after it was drawn (a symbol, style or swatch).
    let mut d = doc_with_vector_layer(true);
    d.edit_vector(|v| v.symbols.push(Symbol { name: "Badge".into(), art: Arc::new(Node::layer(NodeId(99), "Badge", LayerColor::Preset(2))) }));
    assert!(matches!(save_to_bytes(&d, &SaveOptions::default()), Err(FormatError::Unsupported(_))));
}

#[test]
fn a_reopened_file_maps_vector_art_at_its_resolution() {
    let mut d = Document::new("Print", Size::new(300, 200), ColorMode::Rgb, SampleType::U8);
    d.set_resolution(300.0);
    let back = load_from_bytes(&save_to_bytes(&d, &SaveOptions::default()).unwrap()).unwrap();
    assert_eq!(back.vector_mapping, Affine::scale(300.0 / 72.0));
    assert_eq!(back.vector.artboards, d.vector.artboards);
    assert_eq!(back, d);
}
