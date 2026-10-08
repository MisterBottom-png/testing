//! A-Studio P1-02: Vector layers rendered into 256-px tiles.
//!
//! - Each tile equals VectorCraft's own render through the same viewport (alpha exact, colour
//!   within 1/255 after the straight-alpha conversion PhotoCraft tiles need).
//! - A redraw after an edit is bit-identical to a full redraw, so redrawn tiles never seam.
//! - Against a single whole-canvas VectorCraft render the tiles are measured, not asserted:
//!   VectorCraft's renderer moves some anti-aliased edge pixels when its viewport origin moves.

use photocraft_doc::VectorLayer;
use photocraft_geom::{Rect, TILE_SIZE};
use vectorcraft_geom::kurbo::Affine;
use vectorcraft_render::{RenderOptions, Renderer, painted_bounds};
use vlayer::{MAX_SIDE, RedrawError, VectorTiles, dirty_px, layer_affine, synthetic, tile_viewport_origin};

fn export_opts() -> RenderOptions {
    RenderOptions { artboards: false, background: None, skip_templates: true, ..RenderOptions::default() }
}

/// Two test documents: (paths, dpi, offset px, canvas). The second is a case where VectorCraft's
/// renderer moves an edge pixel by 45/255 between viewport origins.
fn cases() -> Vec<(VectorLayer, Rect)> {
    let mut out = Vec::new();
    for (n, dpi, off, canvas) in [(600, 90.0, (13.0, 7.0), Rect::new(0, 0, 2013, 1507)), (1000, 111.0, (-40.0, -90.0), Rect::new(0, 0, 2400, 1800))] {
        let mut layer = VectorLayer::new(synthetic(n, 1600.0, 1200.0), dpi);
        layer.transform.m[4] = off.0;
        layer.transform.m[5] = off.1;
        out.push((layer, canvas));
    }
    out
}

/// Re-premultiplies a straight RGBA8 pixel (how a PhotoCraft tile is compared with VectorCraft).
fn premul(o: [u8; 4]) -> [u8; 4] {
    let a = u32::from(o[3]);
    let pm = |c: u8| ((u32::from(c) * a + 127) / 255) as u8;
    [pm(o[0]), pm(o[1]), pm(o[2]), o[3]]
}

#[test]
fn tiles_match_vectorcraft_through_the_same_viewport() {
    for (mut layer, canvas) in cases() {
        let stats = VectorTiles::new().redraw(&mut layer, canvas, None).expect("render");
        let tiles_x = (canvas.width() as i32 + TILE_SIZE - 1) / TILE_SIZE;
        let tiles_y = (canvas.height() as i32 + TILE_SIZE - 1) / TILE_SIZE;
        assert_eq!(stats.tiles_rendered, (tiles_x * tiles_y) as usize);
        let cache = layer.fresh_cache().expect("fresh cache");
        let mut renderer = Renderer::new();
        let (mut worst_colour, mut alpha_off, mut painted) = (0u8, 0usize, 0usize);
        for ty in 0..tiles_y {
            for tx in 0..tiles_x {
                let (x, y) = (tx * TILE_SIZE, ty * TILE_SIZE);
                let (ox, oy) = tile_viewport_origin(x, y);
                let w = (x + TILE_SIZE - ox) as u32;
                let view = Affine::translate((-f64::from(ox), -f64::from(oy))) * layer_affine(&layer);
                let reference = renderer.render(&layer.doc, w, TILE_SIZE as u32, view, &export_opts());
                let ours = cache.to_interleaved(Rect::new(x, y, x + TILE_SIZE, y + TILE_SIZE));
                for row in 0..TILE_SIZE as usize {
                    let start = (row * w as usize + (x - ox) as usize) * 4;
                    let r = &reference.pixels[start..start + TILE_SIZE as usize * 4];
                    let o = &ours[row * TILE_SIZE as usize * 4..(row + 1) * TILE_SIZE as usize * 4];
                    for (o, r) in o.as_chunks::<4>().0.iter().zip(r.as_chunks::<4>().0) {
                        let p = premul(*o);
                        alpha_off += usize::from(p[3] != r[3]);
                        for c in 0..3 {
                            worst_colour = worst_colour.max(p[c].abs_diff(r[c]));
                        }
                        painted += usize::from(r[3] != 0);
                    }
                }
            }
        }
        eprintln!("same viewport: {painted} painted px, alpha values off: {alpha_off}, worst colour diff {worst_colour}/255");
        assert!(painted > 100_000, "the test document paints something");
        assert_eq!(alpha_off, 0, "alpha is copied unchanged from VectorCraft's render");
        assert!(worst_colour <= 1, "colour differs from VectorCraft's render by {worst_colour}/255");
    }
}

/// Measurement for the go/no-go report: the tiles against one whole-canvas VectorCraft render.
#[test]
fn measure_against_one_whole_canvas_render() {
    for (mut layer, canvas) in cases() {
        VectorTiles::new().redraw(&mut layer, canvas, None).expect("render");
        let ours = layer.fresh_cache().expect("cache").to_interleaved(canvas);
        let whole = Renderer::new().render(&layer.doc, canvas.width(), canvas.height(), layer_affine(&layer), &export_opts());
        let (mut worst, mut over_one, mut painted) = (0u8, 0usize, 0usize);
        for (o, r) in ours.as_chunks::<4>().0.iter().zip(whole.pixels.as_chunks::<4>().0) {
            let p = premul(*o);
            let d = (0..4).map(|c| p[c].abs_diff(r[c])).max().unwrap_or(0);
            worst = worst.max(d);
            over_one += usize::from(d > 1);
            painted += usize::from(r[3] != 0);
        }
        eprintln!("whole-canvas render: {painted} painted px, {over_one} px more than 1/255 off, worst {worst}/255");
        // Not a pass/fail bar (see the module docs); only a guard against gross errors.
        assert!(over_one * 10_000 <= painted, "more than 0.01 % of painted pixels differ");
    }
}

#[test]
fn redraw_after_an_edit_equals_a_full_redraw() {
    for (mut layer, canvas) in cases() {
        let mut tiles = VectorTiles::new();
        let full = tiles.redraw(&mut layer, canvas, None).expect("render");
        let target = layer.doc.layers.first().map(|l| l.id);
        for (i, edit) in ["opacity", "move"].iter().enumerate() {
            let node = layer.doc.children(target).and_then(|c| c.get(100 + 7 * i)).cloned().expect("node");
            let before = painted_bounds(&node).expect("bounds before");
            let n = layer.edit().node_mut(node.id).expect("node");
            match *edit {
                "opacity" => n.opacity = 0.25,
                _ => n.transform(Affine::translate((37.5, -12.25)), false),
            }
            let after = layer.doc.node(node.id).and_then(painted_bounds).expect("bounds after");
            let dirty = dirty_px(&layer, before.union(after));
            let partial = tiles.redraw(&mut layer, canvas, Some(dirty)).expect("partial redraw");
            assert!(!partial.full && partial.tiles_rendered <= 4, "{edit}: {} of {} tiles redrawn", partial.tiles_rendered, full.tiles_rendered);
            let mut fresh = layer.clone();
            fresh.cache = None;
            VectorTiles::new().redraw(&mut fresh, canvas, None).expect("full redraw");
            assert!(layer.cache == fresh.cache, "{edit}: the partially redrawn cache differs from a full redraw");
        }
    }
}

#[test]
fn several_edits_or_no_cache_mean_a_full_redraw() {
    let (mut layer, canvas) = cases().remove(0);
    let mut tiles = VectorTiles::new();
    assert!(tiles.redraw(&mut layer, canvas, Some(Rect::new(0, 0, 10, 10))).expect("render").full, "no cache yet");
    layer.edit().title = "one".into();
    layer.edit().title = "two".into();
    assert!(tiles.redraw(&mut layer, canvas, Some(Rect::new(0, 0, 10, 10))).expect("render").full, "two edits behind");
}

#[test]
fn dirty_outside_the_canvas_draws_nothing_and_negative_origins_work() {
    let (mut layer, canvas) = cases().remove(0);
    let mut tiles = VectorTiles::new();
    tiles.redraw(&mut layer, canvas, None).expect("render");
    let before = layer.cache.clone();
    layer.edit();
    let s = tiles.redraw(&mut layer, canvas, Some(Rect::new(-5000, -5000, -4000, -4000))).expect("render");
    assert_eq!(s.tiles_rendered, 0);
    assert!(layer.fresh_cache().is_some() && layer.cache == before);
    // A canvas that starts left of and above the origin.
    let (mut shifted, _) = cases().remove(0);
    let s = tiles.redraw(&mut shifted, Rect::new(-300, -300, 500, 400), None).expect("render");
    assert_eq!(s.tiles_rendered, 4 * 4, "x and y both span tiles -512..512");
}

#[test]
fn a_canvas_beyond_the_limit_is_an_error() {
    let (mut layer, _) = cases().remove(0);
    let r = VectorTiles::new().redraw(&mut layer, Rect::new(0, 0, MAX_SIDE + 1, 10), None);
    assert_eq!(r, Err(RedrawError::TooLarge));
    assert!(layer.fresh_cache().is_none());
}
