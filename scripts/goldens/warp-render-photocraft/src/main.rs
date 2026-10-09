// Run: cd scripts/goldens/warp-render-photocraft && CARGO_TARGET_DIR=../../../target/goldens cargo run -q > ../../../crates/text/tests/data/warp_render_photocraft.txt.new
// (then put the comment lines of the old file back on top). Needs upstream/ (scripts/bootstrap.sh).
//
// PhotoCraft's Warp Text rendering of fixed glyph outlines: a hand-built layout (Inter Regular,
// glyphs at fixed pen positions; no text layout involved) through photocraft-text's own
// render::rasterize_warped, for all 15 styles. Prints the layout, then per style the ink
// rectangle and the RGBA8 alpha bytes (hex): the golden for A-Studio's P2-08 test.
use std::sync::Arc;

use photocraft_color::PixelFormat;
use photocraft_doc::text::{AntiAlias, CharStyle, TextWarp};
use photocraft_geom::Affine;
use photocraft_text::layout::{GlyphFace, GlyphOrient, LineInfo, PlacedGlyph, TextLayout};
use skrifa::MetadataProvider;

const TEXT: &str = "Warp Ab";
const SIZE_PX: f32 = 24.0;

fn main() {
    let data = std::fs::read("../../../assets/fonts/Inter-Regular.ttf").expect("Inter");
    let font = skrifa::FontRef::from_index(&data, 0).expect("font");
    let metrics = font.glyph_metrics(skrifa::instance::Size::new(SIZE_PX), skrifa::instance::LocationRef::default());
    let m = font.metrics(skrifa::instance::Size::new(SIZE_PX), skrifa::instance::LocationRef::default());
    let mut glyphs = Vec::new();
    let mut x = 0.0f32;
    for c in TEXT.chars() {
        let gid = font.charmap().map(c).expect("char");
        glyphs.push(PlacedGlyph { face: 0, id: gid.to_u32(), x, y: 0.0, style: 0, orient: GlyphOrient::Horizontal });
        x += metrics.advance_width(gid).unwrap_or(0.0);
    }
    let blob = parley::fontique::Blob::new(Arc::new(data.clone()));
    let layout = TextLayout {
        faces: vec![GlyphFace { font: parley::FontData::new(blob, 0), coords: vec![], size_px: SIZE_PX, embolden: false, skew_deg: 0.0 }],
        glyphs: glyphs.clone(),
        lines: vec![LineInfo { range: 0..TEXT.len(), baseline: 0.0, x0: 0.0, x1: x, ascent: m.ascent, descent: -m.descent, paragraph: 0 }],
        styles: vec![CharStyle::default()],
        px_per_pt: 1.0,
        ..Default::default()
    };
    let transform = Affine::translate(10.0, 60.0);
    println!("size_px {SIZE_PX}");
    println!("line 0 {} {} {}", x, m.ascent, -m.descent);
    for g in &glyphs {
        println!("glyph {} {:?} {:?}", g.id, g.x, g.y);
    }
    for (style, _) in photocraft_text::warp::STYLES {
        let w = TextWarp { style: style.into(), value: 50.0, horizontal_distortion: 0.0, vertical_distortion: 0.0, horizontal: true };
        let warp = photocraft_text::render::layout_warp(&layout, Some(&w)).expect("warp");
        let r = photocraft_text::render::rasterize_warped(&layout, &transform, PixelFormat::RGBA8, AntiAlias::Smooth, Some(&warp));
        let px = r.surface.to_interleaved(r.rect);
        let alpha: String = px.chunks_exact(4).map(|p| format!("{:02x}", p[3])).collect();
        println!("style {style} {} {} {} {} {alpha}", r.rect.x0, r.rect.y0, r.rect.x1, r.rect.y1);
    }
}
