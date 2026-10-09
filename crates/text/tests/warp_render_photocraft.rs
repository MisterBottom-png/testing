//! Warp Text renders like PhotoCraft (P2-08): the same glyph outlines (Inter Regular at fixed pen
//! positions, no text layout involved) drawn by A-Studio's renderer for all 15 styles give
//! PhotoCraft's ink rectangle and every pixel's alpha within 1/255 (`tests/data/
//! warp_render_photocraft.txt`, from photocraft@e5e3e39 by `scripts/goldens/warp-render-photocraft`).
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::PixelFormat;
use astudio_doc::text::{AntiAlias, CharStyle, TextWarp};
use astudio_geom::pixel::Affine;
use astudio_text::layer::{LayerGlyph, LayerLayout};
use astudio_text::render::{layout_warp, rasterize_warped};
use kurbo::BezPath;
use skrifa::MetadataProvider;
use skrifa::instance::{LocationRef, Size};
use skrifa::outline::{DrawSettings, OutlinePen};

/// skrifa outline at a pixel size, y flipped and placed at the pen position (PhotoCraft's glyph
/// transform for horizontal type).
struct Place(BezPath, f64, f64);
impl OutlinePen for Place {
    fn move_to(&mut self, x: f32, y: f32) {
        self.0.move_to((self.1 + f64::from(x), self.2 - f64::from(y)));
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.0.line_to((self.1 + f64::from(x), self.2 - f64::from(y)));
    }
    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        self.0.quad_to((self.1 + f64::from(cx), self.2 - f64::from(cy)), (self.1 + f64::from(x), self.2 - f64::from(y)));
    }
    fn curve_to(&mut self, c0x: f32, c0y: f32, c1x: f32, c1y: f32, x: f32, y: f32) {
        let (px, py) = (self.1, self.2);
        self.0.curve_to((px + f64::from(c0x), py - f64::from(c0y)), (px + f64::from(c1x), py - f64::from(c1y)), (px + f64::from(x), py - f64::from(y)));
    }
    fn close(&mut self) {
        self.0.close_path();
    }
}

#[test]
fn warp_text_renders_like_photocraft() {
    let data = include_str!("data/warp_render_photocraft.txt");
    let font_bytes = std::fs::read(format!("{}/../../assets/fonts/Inter-Regular.ttf", env!("CARGO_MANIFEST_DIR"))).unwrap();
    let font = skrifa::FontRef::from_index(&font_bytes, 0).unwrap();
    let mut size_px = 0.0f32;
    let mut layout = LayerLayout { styles: vec![CharStyle::default()], px_per_pt: 1.0, ..LayerLayout::default() };
    let mut styles = 0;
    let mut worst = 0u8;
    for line in data.lines().filter(|l| !l.starts_with('#')) {
        let f: Vec<&str> = line.split(' ').collect();
        match f[0] {
            "size_px" => size_px = f[1].parse().unwrap(),
            "line" => {
                let [x1, ascent, descent]: [f64; 3] = [f[2], f[3], f[4]].map(|v| v.parse().unwrap());
                layout.lines.push([0.0, -ascent, x1, descent]);
            }
            "glyph" => {
                let (gid, x, y): (u32, f64, f64) = (f[1].parse().unwrap(), f[2].parse().unwrap(), f[3].parse().unwrap());
                let mut pen = Place(BezPath::new(), x, y);
                if let Some(g) = font.outline_glyphs().get(skrifa::GlyphId::new(gid)) {
                    g.draw(DrawSettings::unhinted(Size::new(size_px), LocationRef::default()), &mut pen).unwrap();
                }
                layout.glyphs.push(LayerGlyph { outline: pen.0, style: 0, size_px: f64::from(size_px), synthetic_bold: false });
            }
            "style" => {
                let w = TextWarp { style: f[1].into(), value: 50.0, horizontal_distortion: 0.0, vertical_distortion: 0.0, horizontal: true };
                let warp = layout_warp(&layout, Some(&w)).unwrap_or_else(|| panic!("{}: no warp", f[1]));
                let r = rasterize_warped(&layout, &Affine::translate(10.0, 60.0), PixelFormat::RGBA8, AntiAlias::Smooth, Some(&warp));
                let want: [i32; 4] = [f[2], f[3], f[4], f[5]].map(|v| v.parse().unwrap());
                assert_eq!([r.rect.x0, r.rect.y0, r.rect.x1, r.rect.y1], want, "{}: ink rect", f[1]);
                let ours: Vec<u8> = r.surface.to_interleaved(r.rect).as_chunks::<4>().0.iter().map(|p| p[3]).collect();
                let theirs: Vec<u8> = (0..f[6].len() / 2).map(|i| u8::from_str_radix(&f[6][2 * i..2 * i + 2], 16).unwrap()).collect();
                assert_eq!(ours.len(), theirs.len(), "{}", f[1]);
                let d = ours.iter().zip(&theirs).map(|(a, b)| a.abs_diff(*b)).max().unwrap_or(0);
                worst = worst.max(d);
                assert!(d <= 1, "{}: a pixel differs by {d}/255", f[1]);
                styles += 1;
            }
            _ => panic!("unknown line {line}"),
        }
    }
    eprintln!("{styles} styles, largest pixel difference {worst}/255");
    assert_eq!(styles, 15);
}
