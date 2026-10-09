//! Rasterizes a laid-out text layer ([`LayerLayout`]) into a document-space [`Surface`] of any
//! pixel format.
//!
//! PhotoCraft's `text/src/render.rs` (T4, P2-08), drawing from the glyph outlines of A-Studio's
//! layout ([`crate::layer`]) instead of PhotoCraft's font glyph ids: same coverage rasterizer,
//! per-colour passes, faux bold, decorations, warp subdivision and size limits.

use astudio_color::{Color, PixelFormat};
use astudio_doc::TextLayer;
use astudio_doc::text::AntiAlias;
use astudio_geom::pixel::{Affine, Rect};
use astudio_raster::Surface;

use crate::FontDb;
use crate::layer::{LayerLayout, layout_layer};
use crate::raster::{Bounds, Coverage, LineSink, Xform, path_to, rect_to};
use crate::warp::Warp;

pub use crate::layer::FAUX_ITALIC_DEG;
/// Faux-bold dilation radius as a fraction of the font size.
pub const FAUX_BOLD_RADIUS: f32 = 0.018;
/// Largest raster we produce (pixels), as a guard against absurd sizes.
const MAX_PIXELS: u64 = 256 * 1024 * 1024;

/// Rendered text: pixels in document space plus the covered rectangle.
pub struct Rendered {
    pub surface: Surface,
    pub rect: Rect,
}

/// Bends text-space lines with a [`Warp`], then maps them through `post` into `inner`.
struct WarpSink<'a, S: LineSink> {
    inner: &'a mut S,
    warp: &'a Warp,
    post: Xform,
}

impl<S: LineSink> LineSink for WarpSink<'_, S> {
    fn line(&mut self, p0: (f64, f64), p1: (f64, f64)) {
        let len = ((p1.0 - p0.0).powi(2) + (p1.1 - p0.1).powi(2)).sqrt();
        let n = ((len / self.warp.max_segment()).ceil() as usize).clamp(1, 256);
        let map = |t: f64| {
            let (x, y) = self.warp.apply(p0.0 + (p1.0 - p0.0) * t, p0.1 + (p1.1 - p0.1) * t);
            self.post.apply(x, y)
        };
        let mut a = map(0.0);
        for i in 1..=n {
            let b = map(i as f64 / n as f64);
            self.inner.line(a, b);
            a = b;
        }
    }
}

/// Draws every glyph and decoration of `layout` whose style colour is `color` (or all of them
/// when `color` is `None`) into `sink`, through `transform` (text space → sink space), bending
/// the outlines with `warp` first (in text space).
fn draw(layout: &LayerLayout, transform: &Xform, sink: &mut impl LineSink, only_color: Option<&Color>, warp: Option<&Warp>) {
    for g in &layout.glyphs {
        let Some(st) = layout.styles.get(g.style) else { continue };
        if only_color.is_some_and(|c| c != &st.color) {
            continue;
        }
        let r = g.size_px * f64::from(FAUX_BOLD_RADIUS);
        let offsets: &[(f64, f64)] =
            if st.faux_bold { &[(-1.0, 0.0), (1.0, 0.0), (0.0, -1.0), (0.0, 1.0), (0.7, 0.7), (-0.7, -0.7), (0.7, -0.7), (-0.7, 0.7)] } else { &[(0.0, 0.0)] };
        for &(ox, oy) in offsets {
            let local = Xform([1.0, 0.0, 0.0, 1.0, ox * r, oy * r]);
            match warp {
                Some(w) => {
                    let mut ws = WarpSink { inner: &mut *sink, warp: w, post: *transform };
                    path_to(&mut ws, local, &g.outline);
                }
                None => path_to(&mut *sink, transform.mul(&local), &g.outline),
            }
        }
    }
    for d in &layout.decorations {
        let Some(st) = layout.styles.get(d.style) else { continue };
        if only_color.is_some_and(|c| c != &st.color) {
            continue;
        }
        match warp {
            Some(w) => {
                let mut ws = WarpSink { inner: &mut *sink, warp: w, post: *transform };
                rect_to(&mut ws, &Xform::IDENTITY, d.x0, d.y0, d.x1, d.y1);
            }
            None => rect_to(sink, transform, d.x0, d.y0, d.x1, d.y1),
        }
    }
}

/// The warp to apply to `layout` (None when `warp` is absent, `warpNone` or flat).
pub fn layout_warp(layout: &LayerLayout, warp: Option<&astudio_doc::text::TextWarp>) -> Option<Warp> {
    Warp::new(warp?, layout.bounds()?)
}

/// Colour components in `format`'s model (without alpha).
fn color_in(format: &PixelFormat, c: &Color) -> Vec<f32> {
    let n = format.mode.color_channels();
    if c.mode == format.mode {
        c.c[..n].to_vec()
    } else {
        let [r, g, b] = c.to_rgb();
        let mut v = astudio_raster::from_rgba(&PixelFormat { alpha: false, ..*format }, [r, g, b, 1.0]);
        v.truncate(n);
        v
    }
}

/// Document-space bounds of the drawn text (integer pixel rectangle).
pub fn ink_rect(layout: &LayerLayout, transform: &Affine) -> Rect {
    ink_rect_warped(layout, transform, None)
}

fn rect_from_bounds([x0, y0, x1, y1]: [f64; 4]) -> Rect {
    if ![x0, y0, x1, y1].into_iter().all(f64::is_finite) {
        return Rect::EMPTY;
    }

    let min = f64::from(i32::MIN);
    let max = f64::from(i32::MAX);
    let (x0, y0, x1, y1) =
        ((x0.floor() - 1.0).clamp(min, max), (y0.floor() - 1.0).clamp(min, max), (x1.ceil() + 1.0).clamp(min, max), (y1.ceil() + 1.0).clamp(min, max));
    if x1 <= x0 || y1 <= y0 || x1 - x0 > MAX_PIXELS as f64 || y1 - y0 > MAX_PIXELS as f64 {
        return Rect::EMPTY;
    }

    Rect::new(x0 as i32, y0 as i32, x1 as i32, y1 as i32)
}

/// [`ink_rect`] of warped text.
pub fn ink_rect_warped(layout: &LayerLayout, transform: &Affine, warp: Option<&Warp>) -> Rect {
    let mut b = Bounds::default();
    draw(layout, &Xform(transform.m), &mut b, None, warp);
    b.rect.map(rect_from_bounds).unwrap_or(Rect::EMPTY)
}

/// Rasterizes `layout` through `transform` (text space → document pixels). The result always
/// has an alpha channel; colour is written in `format`'s colour model and sample depth.
pub fn rasterize(layout: &LayerLayout, transform: &Affine, format: PixelFormat, antialias: AntiAlias) -> Rendered {
    rasterize_warped(layout, transform, format, antialias, None)
}

/// [`rasterize`] with the glyph outlines bent by `warp` (Type › Warp Text).
pub fn rasterize_warped(layout: &LayerLayout, transform: &Affine, format: PixelFormat, antialias: AntiAlias, warp: Option<&Warp>) -> Rendered {
    let format = PixelFormat { alpha: true, ..format };
    let rect = ink_rect_warped(layout, transform, warp);
    let (w, h) = (rect.width() as usize, rect.height() as usize);
    let mut surface = Surface::new(format);
    if w == 0 || h == 0 || (w as u64) * (h as u64) > MAX_PIXELS {
        return Rendered { surface, rect: Rect::new(0, 0, 0, 0) };
    }
    let n = format.mode.color_channels();
    let stride = n + 1;
    // Premultiplied accumulation.
    let mut acc = vec![0.0f32; w * h * stride];
    // Negated as f64: `-rect.x0` overflows for an ink rectangle at `i32::MIN` (P2-08 review).
    let xf = Xform([1.0, 0.0, 0.0, 1.0, -f64::from(rect.x0), -f64::from(rect.y0)]).mul(&Xform(transform.m));
    let mut colors: Vec<Color> = Vec::new();
    for st in &layout.styles {
        if !colors.contains(&st.color) {
            colors.push(st.color);
        }
    }
    for c in &colors {
        let mut cov = Coverage::new(w, h);
        draw(layout, &xf, &mut cov, Some(c), warp);
        let cov = cov.finish();
        let comps = color_in(&format, c);
        let a = c.alpha.clamp(0.0, 1.0);
        for (i, &cv) in cov.iter().enumerate() {
            let cv = if antialias == AntiAlias::None { if cv >= 0.5 { 1.0 } else { 0.0 } } else { cv };
            let s = cv * a;
            if s <= 0.0 {
                continue;
            }
            let px = &mut acc[i * stride..(i + 1) * stride];
            let keep = 1.0 - s;
            for j in 0..n {
                px[j] = comps[j] * s + px[j] * keep;
            }
            px[n] = s + px[n] * keep;
        }
    }
    // Unpremultiply.
    for px in acc.chunks_exact_mut(stride) {
        let a = px[n];
        if a > 0.0 {
            for v in &mut px[..n] {
                *v = (*v / a).clamp(0.0, 1.0);
            }
        }
    }
    surface.write_region(rect, &acc);
    surface.prune();
    Rendered { surface, rect }
}

/// One element of a glyph outline in document space (see [`outlines`]).
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PathEl {
    MoveTo([f64; 2]),
    LineTo([f64; 2]),
    QuadTo([f64; 2], [f64; 2]),
    CurveTo([f64; 2], [f64; 2], [f64; 2]),
    Close,
}

/// Glyph outlines of `layout` in document space (through `transform`, bent by `warp`), one
/// element list per glyph, for Type › Create Work Path and Convert to Shape. Faux bold is not
/// applied (Photoshop also converts the regular outline); faux italic and scaling are. Under a
/// warp, control points are mapped directly, which is exact for straight segments and a close
/// approximation for curves.
pub fn outlines(layout: &LayerLayout, transform: &Affine, warp: Option<&Warp>) -> Vec<Vec<PathEl>> {
    let post = Xform(transform.m);
    let map = |p: kurbo::Point| {
        let (x, y) = match warp {
            Some(w) => w.apply(p.x, p.y),
            None => (p.x, p.y),
        };
        let (dx, dy) = post.apply(x, y);
        [dx, dy]
    };
    let mut glyphs = Vec::new();
    for g in &layout.glyphs {
        let out: Vec<PathEl> = g
            .outline
            .elements()
            .iter()
            .map(|el| match *el {
                kurbo::PathEl::MoveTo(p) => PathEl::MoveTo(map(p)),
                kurbo::PathEl::LineTo(p) => PathEl::LineTo(map(p)),
                kurbo::PathEl::QuadTo(c, p) => PathEl::QuadTo(map(c), map(p)),
                kurbo::PathEl::CurveTo(a, b, p) => PathEl::CurveTo(map(a), map(b), map(p)),
                kurbo::PathEl::ClosePath => PathEl::Close,
            })
            .collect();
        if !out.is_empty() {
            glyphs.push(out);
        }
    }
    glyphs
}

/// Lays `layer` out with `db` at `dpi` and rasterizes it through its transform, warped by its
/// Warp Text (PhotoCraft's `TextEngine::render`).
pub fn render_layer(db: &FontDb, layer: &TextLayer, dpi: f32, format: PixelFormat) -> (LayerLayout, Rendered) {
    let layout = layout_layer(db, layer, dpi);
    let warp = layout_warp(&layout, layer.warp.as_ref());
    let rendered = rasterize_warped(&layout, &layer.transform, format, layer.antialias, warp.as_ref());
    (layout, rendered)
}

#[cfg(test)]
mod tests {
    use super::{MAX_PIXELS, rect_from_bounds};
    use astudio_geom::pixel::Rect;

    #[test]
    fn bounds_are_clipped_without_overflow_and_oversized_rectangles_rejected() {
        let min = f64::from(i32::MIN);
        let max = f64::from(i32::MAX);
        let cases = [
            ([min, 0.0, min + 8.0, 8.0], Rect::new(i32::MIN, -1, i32::MIN + 9, 9)),
            ([max - 8.0, 0.0, max, 8.0], Rect::new(i32::MAX - 9, -1, i32::MAX, 9)),
            ([-f64::MAX, 0.0, f64::MAX, 8.0], Rect::EMPTY),
            ([0.0, 0.0, MAX_PIXELS as f64, 8.0], Rect::EMPTY),
            ([0.25, -3.25, 10.1, 8.8], Rect::new(-1, -5, 12, 10)),
        ];

        for (bounds, expected) in cases {
            let first = rect_from_bounds(bounds);
            assert_eq!(first, expected, "bounds: {bounds:?}");
            assert_eq!(rect_from_bounds(bounds), first, "bounds: {bounds:?}");
        }
    }
}
