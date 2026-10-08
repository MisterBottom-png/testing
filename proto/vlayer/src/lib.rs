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

/// Rows rendered per renderer call: one tile row, so each call fills a band of whole tiles.
const BAND: i32 = TILE_SIZE;

/// Points → document pixels for a layer.
pub fn layer_affine(layer: &VectorLayer) -> Affine {
    Affine::new(layer.transform.m)
}

/// Pixel rectangle (rounded out, plus a 2-px margin for anti-aliasing and hairline strokes)
/// covering `bounds_pt`, a rectangle in the vector document's points.
pub fn dirty_px(layer: &VectorLayer, bounds_pt: kurbo::Rect) -> Rect {
    let r = layer_affine(layer).transform_rect_bbox(bounds_pt);
    if !(r.x0.is_finite() && r.y0.is_finite() && r.x1.is_finite() && r.y1.is_finite()) {
        return Rect::EMPTY;
    }
    let clamp = |v: f64| v.clamp(f64::from(i32::MIN / 2), f64::from(i32::MAX / 2)) as i32;
    Rect::new(clamp(r.x0.floor()) - 2, clamp(r.y0.floor()) - 2, clamp(r.x1.ceil()) + 2, clamp(r.y1.ceil()) + 2)
}

/// `r` grown to whole tiles.
fn tile_aligned(r: Rect) -> Rect {
    let down = |v: i32| v.div_euclid(TILE_SIZE) * TILE_SIZE;
    let up = |v: i32| (v + TILE_SIZE - 1).div_euclid(TILE_SIZE) * TILE_SIZE;
    Rect::new(down(r.x0), down(r.y0), up(r.x1), up(r.y1))
}

/// What a redraw did (for tests and the benchmark).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RedrawStats {
    /// Tiles rendered (empty ones included).
    pub tiles_rendered: usize,
    /// Tiles stored in the cache afterwards (non-empty ones).
    pub tiles_cached: usize,
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

    /// Redraws the tiles of `layer` that intersect `dirty ∩ canvas` (all of `canvas` when
    /// `dirty` is `None` or there is no valid cache) and marks the cache fresh.
    pub fn redraw(&mut self, layer: &mut VectorLayer, canvas: Rect, dirty: Option<Rect>) -> RedrawStats {
        let full = dirty.is_none() || layer.cache.is_none();
        let area = if full { canvas } else { dirty.unwrap_or(canvas).intersect(&canvas) };
        let mut cache = if full { Surface::new(PixelFormat::RGBA8) } else { layer.cache.take().unwrap_or_else(|| Surface::new(PixelFormat::RGBA8)) };
        let mut stats = RedrawStats::default();
        if !area.is_empty() {
            let region = tile_aligned(area);
            drop(cache.take_tiles(region));
            let view = layer_affine(layer);
            let doc = Arc::clone(&layer.doc);
            let mut y = region.y0;
            while y < region.y1 {
                let band = Rect::new(region.x0, y, region.x1, (y + BAND).min(region.y1));
                stats.tiles_rendered += self.render_band(&doc, view, band, &mut cache);
                y += BAND;
            }
        }
        stats.tiles_cached = cache.tile_count();
        layer.cache = Some(cache);
        layer.cache_revision = layer.revision;
        stats
    }

    /// Renders one tile-aligned band and stores its non-empty tiles. Returns the tile count.
    fn render_band(&mut self, doc: &vectorcraft_doc::Document, view: Affine, band: Rect, cache: &mut Surface) -> usize {
        let (w, h) = (band.width(), band.height());
        if w == 0 || h == 0 {
            return 0;
        }
        let shift = Affine::translate((-f64::from(band.x0), -f64::from(band.y0)));
        let out = self.renderer.render(doc, w, h, shift * view, &self.opts);
        if out.width != w || out.height != h {
            return 0;
        }
        let ts = TILE_SIZE as usize;
        let row_bytes = w as usize * 4;
        let mut count = 0;
        let mut tx = band.x0;
        while tx < band.x1 {
            count += 1;
            let coord = TileCoord { tx: tx.div_euclid(TILE_SIZE), ty: band.y0.div_euclid(TILE_SIZE) };
            let mut data = vec![0u8; ts * ts * 4];
            let mut any = false;
            let x_off = (tx - band.x0) as usize * 4;
            for row in 0..(h as usize).min(ts) {
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
        count
    }
}
