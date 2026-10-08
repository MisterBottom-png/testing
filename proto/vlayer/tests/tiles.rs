//! A-Studio P1-02: a Vector layer rendered into 256-px tiles matches VectorCraft's own render
//! within 1/255 per channel, and an edit redraws only the tiles it touches.

use std::sync::Arc;

use photocraft_doc::VectorLayer;
use photocraft_geom::{Rect, TILE_SIZE};
use vectorcraft_color::{Color, Paint};
use vectorcraft_doc::{Appearance, Document, Node};
use vectorcraft_geom::kurbo::Affine;
use vectorcraft_geom::{Point, shapes};
use vectorcraft_render::{RenderOptions, Renderer, painted_bounds};
use vlayer::{VectorTiles, dirty_px, layer_affine};

/// Mixed paths: filled+stroked ellipses, filled rectangles at 80 % opacity, stroked stars.
/// Same recipe as `synthetic()` in vectorcraft@8b036df apps/vectorcraft-cli/src/perf.rs
/// (MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team and the VectorCraft contributors).
fn synthetic(n: usize, w: f64, h: f64) -> Document {
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> f64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
    }
    let mut d = Document::new(w, h);
    let l = d.layers.first().map(|l| l.id);
    let mut r = Rng(42);
    for i in 0..n {
        let (x, y, s) = (r.next() * w, r.next() * h, 3.0 + r.next() * 22.0);
        let c = Color::rgb(r.next() as f32, r.next() as f32, r.next() as f32);
        let id = d.alloc_id();
        let mut node = match i % 3 {
            0 => Node::path(
                id,
                shapes::ellipse(vectorcraft_geom::Rect::from_center_size(Point::new(x, y), (2.0 * s, 2.0 * s))),
                Appearance::basic(Paint::solid(c), Paint::solid(Color::BLACK), 0.5),
            ),
            1 => Node::path(id, shapes::rectangle(vectorcraft_geom::Rect::new(x, y, x + 2.0 * s, y + s)), Appearance::basic(Paint::solid(c), Paint::None, 0.0)),
            _ => Node::path(id, shapes::star(Point::new(x, y), s, s / 2.0, 5, 0.0), Appearance::basic(Paint::None, Paint::solid(c), 2.0)),
        };
        if i % 3 == 1 {
            node.opacity = 0.8;
        }
        d.insert(l, usize::MAX, node).expect("insert");
    }
    d
}

fn export_opts() -> RenderOptions {
    RenderOptions { artboards: false, background: None, skip_templates: true, ..RenderOptions::default() }
}

/// Largest per-channel difference between the cache (straight alpha, re-premultiplied) and a
/// premultiplied reference of the whole canvas; also the number of painted reference pixels.
fn max_diff(layer: &VectorLayer, canvas: Rect, reference: &[u8]) -> (u8, usize) {
    let cache = layer.fresh_cache().expect("fresh cache");
    let ours = cache.to_interleaved(canvas);
    assert_eq!(ours.len(), reference.len());
    let mut worst = 0u8;
    let mut painted = 0;
    for (o, r) in ours.chunks_exact(4).zip(reference.chunks_exact(4)) {
        let a = u32::from(o[3]);
        let pm = |c: u8| ((u32::from(c) * a + 127) / 255) as u8;
        let ours_pm = [pm(o[0]), pm(o[1]), pm(o[2]), o[3]];
        for c in 0..4 {
            worst = worst.max(ours_pm[c].abs_diff(r[c]));
        }
        painted += usize::from(r[3] != 0);
    }
    (worst, painted)
}

fn reference(layer: &VectorLayer, canvas: Rect) -> Vec<u8> {
    let r = Renderer::new().render(&layer.doc, canvas.width(), canvas.height(), layer_affine(layer), &export_opts());
    r.pixels
}

fn test_layer() -> (VectorLayer, Rect) {
    // 1600 × 1200 pt at 1.25 px/pt with a non-tile-aligned offset: canvas 2013 × 1507 px.
    let mut layer = VectorLayer::new(synthetic(600, 1600.0, 1200.0), 90.0);
    layer.transform[4] = 13.0;
    layer.transform[5] = 7.0;
    (layer, Rect::new(0, 0, 2013, 1507))
}

#[test]
fn tiles_match_vectorcraft_render() {
    let (mut layer, canvas) = test_layer();
    let stats = VectorTiles::new().redraw(&mut layer, canvas, None);
    let tiles_x = (canvas.width() as i32 + TILE_SIZE - 1) / TILE_SIZE;
    let tiles_y = (canvas.height() as i32 + TILE_SIZE - 1) / TILE_SIZE;
    assert_eq!(stats.tiles_rendered, (tiles_x * tiles_y) as usize);
    assert!(stats.tiles_cached > 0 && stats.tiles_cached <= stats.tiles_rendered);
    let (worst, painted) = max_diff(&layer, canvas, &reference(&layer, canvas));
    eprintln!("full render: {} tiles, {} cached, {painted} painted px, max diff {worst}/255", stats.tiles_rendered, stats.tiles_cached);
    assert!(painted > 100_000, "the test document paints something");
    assert!(worst <= 1, "tile render differs from VectorCraft's render by {worst}/255");
}

#[test]
fn edit_redraws_only_dirty_tiles() {
    let (mut layer, canvas) = test_layer();
    let mut tiles = VectorTiles::new();
    let full = tiles.redraw(&mut layer, canvas, None);

    // Edit one path: change its opacity, then redraw only where it paints.
    let target = layer.doc.layers.first().map(|l| l.id);
    let node = layer.doc.children(target).and_then(|c| c.get(100)).cloned().expect("node 100");
    let bounds = painted_bounds(&node).expect("painted bounds");
    let doc = Arc::make_mut(&mut layer.doc);
    doc.node_mut(node.id).expect("node").opacity = 0.25;
    layer.revision += 1;
    assert!(layer.fresh_cache().is_none(), "an edit makes the cache stale");

    let dirty = dirty_px(&layer, bounds);
    let partial = tiles.redraw(&mut layer, canvas, Some(dirty));
    eprintln!("edit: {} of {} tiles redrawn (dirty {dirty:?})", partial.tiles_rendered, full.tiles_rendered);
    assert!(partial.tiles_rendered >= 1 && partial.tiles_rendered <= 4, "one small path touches at most 2 × 2 tiles");

    let (worst, _) = max_diff(&layer, canvas, &reference(&layer, canvas));
    assert!(worst <= 1, "after a partial redraw the cache differs from a full render by {worst}/255");
}

#[test]
#[ignore]
fn debug_diff_source() {
    let (layer, canvas) = test_layer();
    let full = reference(&layer, canvas);
    // Same renderer, one band rendered on its own (premultiplied, no conversion).
    let band = Rect::new(0, 256, canvas.width() as i32, 512);
    let view = Affine::translate((0.0, -256.0)) * layer_affine(&layer);
    let part = Renderer::new().render(&layer.doc, band.width(), band.height(), view, &export_opts()).pixels;
    let w = canvas.width() as usize * 4;
    let mut worst = 0u8;
    let mut n = 0;
    for row in 0..256usize {
        let a = &full[(256 + row) * w..(257 + row) * w];
        let b = &part[row * w..(row + 1) * w];
        for (x, y) in a.iter().zip(b) {
            let d = x.abs_diff(*y);
            worst = worst.max(d);
            n += usize::from(d > 1);
        }
    }
    eprintln!("band vs full (premultiplied, same renderer): max {worst}, {n} channels > 1");
    // Round trip premultiplied → straight → premultiplied on the full reference.
    let mut rt = 0u8;
    for p in full.chunks_exact(4) {
        let a = u32::from(p[3]);
        if a == 0 { continue; }
        for c in 0..3 {
            let s = if a == 255 { u32::from(p[c]) } else { ((u32::from(p[c]) * 255 + a / 2) / a).min(255) };
            let back = ((s * a + 127) / 255) as u8;
            rt = rt.max(back.abs_diff(p[c]));
        }
    }
    eprintln!("straight round trip: max {rt}");
}

#[test]
#[ignore]
fn debug_diff_two() {
    let (mut layer, canvas) = test_layer();
    VectorTiles::new().redraw(&mut layer, canvas, None);
    let full = reference(&layer, canvas);
    let ours = layer.fresh_cache().expect("cache").to_interleaved(canvas);
    let (mut twos, mut over, mut ones, mut total) = (0, 0, 0, 0);
    let mut over_ref = 0;
    for (o, r) in ours.chunks_exact(4).zip(full.chunks_exact(4)) {
        if r[3] == 0 && o[3] == 0 { continue; }
        total += 1;
        over_ref += usize::from(r[0] > r[3] || r[1] > r[3] || r[2] > r[3]);
        let a = u32::from(o[3]);
        for c in 0..3 {
            let pm = ((u32::from(o[c]) * a + 127) / 255) as u8;
            let d = pm.abs_diff(r[c]);
            ones += usize::from(d == 1);
            if d >= 2 { twos += 1; over += usize::from(r[c] > r[3]); eprintln!("ref {:?} ours(straight) {:?}", r, o); }
        }
    }
    eprintln!("painted px {total}, ref px with colour > alpha {over_ref}, channels off by 1: {ones}, by 2+: {twos} (of which ref colour > alpha: {over})");
}

#[test]
#[ignore]
fn debug_alpha() {
    let (mut layer, canvas) = test_layer();
    VectorTiles::new().redraw(&mut layer, canvas, None);
    let full = reference(&layer, canvas);
    let ours = layer.fresh_cache().expect("cache").to_interleaved(canvas);
    let w = canvas.width() as usize;
    let mut hist = [0usize; 8];
    for (i, (o, r)) in ours.chunks_exact(4).zip(full.chunks_exact(4)).enumerate() {
        let d = o[3].abs_diff(r[3]) as usize;
        hist[d.min(7)] += 1;
        if d >= 2 { let (x, y) = (i % w, i / w); eprintln!("alpha diff {d} at ({x},{y}) x%256={} y%256={} ours {:?} ref {:?}", x % 256, y % 256, o, r); }
    }
    eprintln!("alpha diff histogram {hist:?}");
}
