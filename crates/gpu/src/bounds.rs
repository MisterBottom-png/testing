//! Layer bounds exactly as `astudio-compose` computes them (`layer_bounds`), with the per-tile
//! content scan cached by copy-on-write tile identity, so an effect layer's region costs a hash
//! lookup per tile instead of a pixel scan per frame.

use astudio_doc::Layer;
use astudio_geom::pixel::Rect;
#[cfg(test)]
use astudio_raster::Surface;

pub use astudio_compose::bounds::content_bounds;

/// Bounds of a layer's own pixels: `astudio_compose::layer_bounds`.
pub fn layer_bounds(layer: &Layer, canvas: Rect) -> Rect {
    astudio_compose::layer_bounds(layer, canvas)
}

/// The region a layer's effect maps cover: its bounds grown by the effect reach, within the
/// canvas grown likewise (`astudio_compose::effect_maps`).
pub fn effect_region(layer: &Layer, canvas: Rect) -> Rect {
    let m = astudio_compose::effects::margin(layer);
    layer_bounds(layer, canvas).inflate(m).intersect(&canvas.inflate(m))
}

/// `astudio_compose::transparent_outside`.
pub fn transparent_outside(layer: &Layer) -> bool {
    astudio_compose::transparent_outside(layer)
}

/// `astudio_compose::composite_bounds`: where compositing the layer can change anything.
pub fn composite_bounds(layer: &Layer, canvas: Rect) -> Option<Rect> {
    astudio_compose::composite_bounds(layer, canvas)
}

#[cfg(test)]
mod tests {
    use super::*;
    use astudio_color::PixelFormat;

    #[test]
    fn matches_surface_content_bounds() {
        let mut s = Surface::new(PixelFormat::RGBA8);
        assert_eq!(content_bounds(&s), s.content_bounds());
        s.fill_rect(Rect::new(10, 300, 40, 700), &[1.0, 0.0, 0.0, 1.0]);
        s.fill_rect(Rect::new(-50, 5, -3, 9), &[0.0, 0.0, 1.0, 0.5]);
        assert_eq!(content_bounds(&s), s.content_bounds());
        // Cached a second time, and after a change.
        assert_eq!(content_bounds(&s), s.content_bounds());
        s.fill_rect(Rect::new(600, 600, 601, 601), &[0.0, 1.0, 0.0, 1.0]);
        assert_eq!(content_bounds(&s), s.content_bounds());
        let mut g = Surface::with_default(PixelFormat::GRAY8, &[1.0]);
        g.fill_rect(Rect::new(3, 3, 9, 9), &[0.5]);
        assert_eq!(content_bounds(&g), g.content_bounds());
    }
}
