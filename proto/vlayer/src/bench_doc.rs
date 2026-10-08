//! The P1-04 benchmark document, shared by `benches/p1.rs` and `examples/p1_measure.rs`.

use photocraft_color::{ColorMode, PixelFormat, SampleType};
use photocraft_doc::{Document, Layer, LayerContent, VectorLayer};
use photocraft_geom::{Rect, Size};

/// 24 MP: 6000 × 4000 px.
pub const W: i32 = 6000;
pub const H: i32 = 4000;

/// How the 1,000 paths are laid out on the canvas.
#[derive(Clone, Copy, Debug)]
pub enum Spread {
    /// VectorCraft's own perf recipe on a 1600 × 1200 pt page scaled to fill the canvas
    /// (3.75 px/pt): shapes 11 to 94 px across, overlapping.
    Scaled,
    /// The same recipe on a 6000 × 4000 pt page at 1 px/pt: shapes 3 to 25 px, sparse.
    Sparse,
}

/// A PhotoCraft document with one opaque raster layer and one Vector layer of `n` paths.
pub fn document(n: usize, spread: Spread) -> Document {
    let mut doc = Document::new("p1-04", Size::new(W as u32, H as u32), ColorMode::Rgb, SampleType::U8);
    let mut bg = Layer::raster("Photo", PixelFormat::RGBA8);
    if let LayerContent::Raster(s) = &mut bg.content {
        for (i, c) in [[0.8, 0.3, 0.2], [0.3, 0.6, 0.3], [0.2, 0.4, 0.8], [0.9, 0.8, 0.3]].iter().enumerate() {
            let y0 = i as i32 * H / 4;
            s.fill_rect(Rect::new(0, y0, W, y0 + H / 4), &[c[0], c[1], c[2], 1.0]);
        }
    }
    doc.layers.push(bg);
    let v = match spread {
        Spread::Scaled => VectorLayer::new(crate::synthetic(n, 1600.0, 1200.0), 270.0),
        Spread::Sparse => VectorLayer::new(crate::synthetic(n, f64::from(W), f64::from(H)), 72.0),
    };
    doc.layers.push(Layer::new("Vector", LayerContent::Vector(v)));
    doc
}

/// The Vector layer of a [`document`].
pub fn vector_mut(doc: &mut Document) -> Option<&mut VectorLayer> {
    doc.layers.iter_mut().find_map(|l| match &mut l.content {
        LayerContent::Vector(v) => Some(v),
        _ => None,
    })
}

/// Moves path `i` of the Vector layer by (dx, dy) points and returns the dirty pixel rectangle
/// (old ∪ new painted bounds).
pub fn move_path(doc: &mut Document, i: usize, dx: f64, dy: f64) -> Option<Rect> {
    let v = vector_mut(doc)?;
    let target = v.doc.layers.first().map(|l| l.id);
    let node = v.doc.children(target)?.get(i)?.clone();
    let before = vectorcraft_render::painted_bounds(&node)?;
    v.edit().node_mut(node.id)?.transform(vectorcraft_geom::kurbo::Affine::translate((dx, dy)), false);
    let after = v.doc.node(node.id).and_then(vectorcraft_render::painted_bounds)?;
    Some(crate::dirty_px(v, before.union(after)))
}
