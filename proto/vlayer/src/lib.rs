//! A-Studio P1 prototype: draws a [`VectorLayer`] into PhotoCraft's 256-px tiles with
//! VectorCraft's renderer (vello_cpu), and redraws only the tiles a change touches.
//!
//! The cache is a straight-alpha RGBA8 [`Surface`] in document pixels, sparse: fully transparent
//! tiles are not stored. It is valid while `cache_revision == revision`.
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

use std::sync::Arc;

use photocraft_color::PixelFormat;
use photocraft_doc::VectorLayer;
use photocraft_geom::{Rect, TILE_SIZE, TileCoord};
use photocraft_raster::Surface;
use vectorcraft_geom::kurbo::{self, Affine};
use vectorcraft_render::{RenderOptions, Renderer};

/// Every tile is drawn through a viewport whose origin depends only on where the tile is: its
/// top edge, and the left edge of the `CHUNK`-wide column it sits in (absolute document pixels).
/// VectorCraft's renderer moves some anti-aliased edge pixels when the viewport origin moves
/// (measured up to 45/255 on single pixels), so a fixed origin per tile is what keeps a redrawn
/// tile identical to a first render, and seamless with the tiles around it. One call renders
/// one row of tiles of up to one chunk.
const CHUNK: i32 = 16 * TILE_SIZE;

/// Largest canvas coordinate the renderer accepts; keeps all tile arithmetic far from `i32`
/// overflow. (VectorCraft's own raster limit is 32768 px a side per render call; chunks stay
/// well below it.)
pub const MAX_SIDE: i32 = 1 << 20;

/// Points → document pixels for a layer.
pub fn layer_affine(layer: &VectorLayer) -> Affine {
    Affine::new(layer.transform.m)
}

/// Pixel rectangle (rounded out, plus a 2-px margin for anti-aliasing and hairline strokes)
/// covering `bounds_pt`, a rectangle in the vector document's points. Pass the union of an
/// object's painted bounds before and after an edit.
pub fn dirty_px(layer: &VectorLayer, bounds_pt: kurbo::Rect) -> Rect {
    let r = layer_affine(layer).transform_rect_bbox(bounds_pt);
    if !(r.x0.is_finite() && r.y0.is_finite() && r.x1.is_finite() && r.y1.is_finite()) {
        return Rect::EMPTY;
    }
    let clamp = |v: f64| v.clamp(-f64::from(MAX_SIDE), f64::from(MAX_SIDE)) as i32;
    Rect::new(clamp(r.x0.floor() - 2.0), clamp(r.y0.floor() - 2.0), clamp(r.x1.ceil() + 2.0), clamp(r.y1.ceil() + 2.0))
}

/// `v` rounded down to a multiple of `step` (step > 0).
fn floor_to(v: i32, step: i32) -> i32 {
    v.div_euclid(step) * step
}

/// `r` grown to whole tiles. Callers keep coordinates within ±[`MAX_SIDE`].
fn tile_aligned(r: Rect) -> Rect {
    let up = |v: i32| floor_to(v.saturating_add(TILE_SIZE - 1), TILE_SIZE);
    Rect::new(floor_to(r.x0, TILE_SIZE), floor_to(r.y0, TILE_SIZE), up(r.x1), up(r.y1))
}

/// The viewport origin [`VectorTiles`] uses for the tile holding document pixel `(x, y)` (for
/// tests that compare with VectorCraft's render through the same viewport).
pub fn tile_viewport_origin(x: i32, y: i32) -> (i32, i32) {
    (floor_to(x, CHUNK), floor_to(y, TILE_SIZE))
}

/// What a redraw did (for tests and the benchmark).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RedrawStats {
    /// Tiles rendered (empty ones included).
    pub tiles_rendered: usize,
    /// Tiles stored in the cache afterwards (non-empty ones).
    pub tiles_cached: usize,
    /// Whether the whole canvas was redrawn.
    pub full: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RedrawError {
    /// The canvas lies (partly) outside ±[`MAX_SIDE`].
    TooLarge,
    /// The renderer returned an image of the wrong size; the cache stays stale.
    Renderer,
}

/// Renders vector layers into tiles. Keep one per layer: VectorCraft's renderer caches text
/// layouts and effects by node, so reusing it makes redraws cheaper.
pub struct VectorTiles {
    renderer: Renderer,
    opts: RenderOptions,
}

impl Default for VectorTiles {
    fn default() -> Self {
        Self::new()
    }
}

impl VectorTiles {
    pub fn new() -> Self {
        // Export-style options: no artboard fill, transparent background, templates left out.
        let opts = RenderOptions { artboards: false, background: None, skip_templates: true, ..RenderOptions::default() };
        Self { renderer: Renderer::new(), opts }
    }

    /// Brings the cache of `layer` up to date for `canvas`.
    ///
    /// `dirty` is where the one edit since the last redraw changed pixels (old ∪ new painted
    /// bounds, see [`dirty_px`]). The whole canvas is redrawn when `dirty` is `None`, when there
    /// is no cache, or when the cache is not exactly one edit behind (`cache_revision + 1 !=
    /// revision`: one dirty rectangle cannot describe several edits). On error the cache is
    /// dropped, so the next redraw is a full one.
    pub fn redraw(&mut self, layer: &mut VectorLayer, canvas: Rect, dirty: Option<Rect>) -> Result<RedrawStats, RedrawError> {
        let within = |v: i32| (-MAX_SIDE..=MAX_SIDE).contains(&v);
        if !(within(canvas.x0) && within(canvas.y0) && within(canvas.x1) && within(canvas.y1)) {
            return Err(RedrawError::TooLarge);
        }
        let one_edit_behind = layer.cache_revision.wrapping_add(1) == layer.revision;
        let partial = match (dirty, &layer.cache) {
            (Some(d), Some(_)) if one_edit_behind => Some(d),
            _ => None,
        };
        let area = partial.map_or(canvas, |d| d.intersect(&canvas));
        let mut cache = match (partial, layer.cache.take()) {
            (Some(_), Some(c)) => c,
            _ => Surface::new(PixelFormat::RGBA8),
        };
        let mut stats = RedrawStats { full: partial.is_none(), ..RedrawStats::default() };
        let result = self.redraw_area(layer, area, &mut cache, &mut stats);
        stats.tiles_cached = cache.tile_count();
        if result.is_ok() {
            layer.cache = Some(cache);
            layer.cache_revision = layer.revision;
        }
        result.map(|()| stats)
    }

    fn redraw_area(&mut self, layer: &VectorLayer, area: Rect, cache: &mut Surface, stats: &mut RedrawStats) -> Result<(), RedrawError> {
        if area.is_empty() {
            return Ok(());
        }
        let region = tile_aligned(area);
        drop(cache.take_tiles(region));
        let view = layer_affine(layer);
        let doc = Arc::clone(&layer.doc);
        let mut y = region.y0;
        while y < region.y1 {
            let mut cx = floor_to(region.x0, CHUNK);
            while cx < region.x1 {
                // The tiles of this row and chunk that need drawing.
                let (x0, x1) = (region.x0.max(cx), region.x1.min(cx + CHUNK));
                if x0 < x1 {
                    stats.tiles_rendered += self.render_row(&doc, view, (cx, y), x0, x1, cache)?;
                }
                cx += CHUNK;
            }
            y += TILE_SIZE;
        }
        Ok(())
    }

    /// Renders the tiles `x0..x1` of the tile row whose top is `origin.1`, through a viewport whose
    /// top left is `origin` (a chunk corner, `origin.0 <= x0`), and stores the non-empty ones.
    fn render_row(
        &mut self,
        doc: &vectorcraft_doc::Document,
        view: Affine,
        origin: (i32, i32),
        x0: i32,
        x1: i32,
        cache: &mut Surface,
    ) -> Result<usize, RedrawError> {
        let (ox, oy) = origin;
        let (Ok(w), Ok(h)) = (u32::try_from(x1 - ox), u32::try_from(TILE_SIZE)) else { return Err(RedrawError::Renderer) };
        let shift = Affine::translate((-f64::from(ox), -f64::from(oy)));
        let out = self.renderer.render(doc, w, h, shift * view, &self.opts);
        if out.width != w || out.height != h {
            return Err(RedrawError::Renderer);
        }
        let ts = TILE_SIZE as usize;
        let row_bytes = w as usize * 4;
        let mut count = 0;
        let mut tx = x0;
        while tx < x1 {
            count += 1;
            let coord = TileCoord { tx: tx.div_euclid(TILE_SIZE), ty: oy.div_euclid(TILE_SIZE) };
            let mut data = vec![0u8; ts * ts * 4];
            let mut any = false;
            let x_off = (tx - ox) as usize * 4;
            for row in 0..ts {
                let src_start = row * row_bytes + x_off;
                let (Some(src), Some(dst)) = (out.pixels.get(src_start..src_start + ts * 4), data.get_mut(row * ts * 4..(row + 1) * ts * 4)) else {
                    continue;
                };
                for (d, s) in dst.as_chunks_mut::<4>().0.iter_mut().zip(src.as_chunks::<4>().0) {
                    let a = u32::from(s[3]);
                    if a == 0 {
                        continue;
                    }
                    any = true;
                    // Premultiplied → straight, rounded like vectorcraft_render::Rendered::to_straight.
                    let straight = |c: u8| if a == 255 { c } else { ((u32::from(c) * 255 + a / 2) / a).min(255) as u8 };
                    *d = [straight(s[0]), straight(s[1]), straight(s[2]), s[3]];
                }
            }
            if any {
                let tile = cache.tile_mut(coord).bytes_mut();
                if tile.len() == data.len() {
                    tile.copy_from_slice(&data);
                }
            }
            tx += TILE_SIZE;
        }
        Ok(count)
    }
}

/// Mixed paths: filled+stroked ellipses, filled rectangles at 80 % opacity, stroked stars.
/// Same recipe as `synthetic()` in vectorcraft@8b036df apps/vectorcraft-cli/src/perf.rs
/// (MIT OR Apache-2.0, Copyright (c) 2026 ArtCraft Team and the VectorCraft contributors).
pub fn synthetic(n: usize, w: f64, h: f64) -> vectorcraft_doc::Document {
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> f64 {
            self.0 = self.0.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            (self.0 >> 11) as f64 / (1u64 << 53) as f64
        }
    }
    let mut d = vectorcraft_doc::Document::new(w, h);
    let l = d.layers.first().map(|l| l.id);
    let mut r = Rng(42);
    for i in 0..n {
        let (x, y, s) = (r.next() * w, r.next() * h, 3.0 + r.next() * 22.0);
        let c = vectorcraft_color::Color::rgb(r.next() as f32, r.next() as f32, r.next() as f32);
        let id = d.alloc_id();
        let mut node = match i % 3 {
            0 => vectorcraft_doc::Node::path(
                id,
                vectorcraft_geom::shapes::ellipse(vectorcraft_geom::Rect::from_center_size(vectorcraft_geom::Point::new(x, y), (2.0 * s, 2.0 * s))),
                vectorcraft_doc::Appearance::basic(vectorcraft_color::Paint::solid(c), vectorcraft_color::Paint::solid(vectorcraft_color::Color::BLACK), 0.5),
            ),
            1 => vectorcraft_doc::Node::path(
                id,
                vectorcraft_geom::shapes::rectangle(vectorcraft_geom::Rect::new(x, y, x + 2.0 * s, y + s)),
                vectorcraft_doc::Appearance::basic(vectorcraft_color::Paint::solid(c), vectorcraft_color::Paint::None, 0.0),
            ),
            _ => vectorcraft_doc::Node::path(
                id,
                vectorcraft_geom::shapes::star(vectorcraft_geom::Point::new(x, y), s, s / 2.0, 5, 0.0),
                vectorcraft_doc::Appearance::basic(vectorcraft_color::Paint::None, vectorcraft_color::Paint::solid(c), 2.0),
            ),
        };
        if i % 3 == 1 {
            node.opacity = 0.8;
        }
        // Inserting into the document's own first layer cannot fail; skip the node if it does.
        let _ = d.insert(l, usize::MAX, node);
    }
    d
}
