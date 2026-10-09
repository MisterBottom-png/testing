//! EPS as other apps write it: for each kind of generator, a short program with the constructs its
//! files use (the kind of procedures a prolog defines, how it sets colour, fills with gradients and
//! patterns, places images and sets type), each read as vectors without a fallback to the preview.
//! The programs are A-Studio's own, written for P2-15 from the operators' descriptions in the
//! PostScript Language Reference: they use the operators those files use, in programs of our own
//! design, never another app's prolog text, resource or procedure names, or layout.

use astudio_color::vector::{Color, Paint};
use astudio_geom::{FillRule, Point, Rect};
use astudio_vdoc::{ColorMode, Document, Node, NodeKind};

use super::tests::{all, bounds, fill, near, objects, read, stroke};
use crate::import::{Imported, import};
use crate::ps::{ascii85, deflate};

/// An EPS file of a 200 × 150 pt page made by `creator`.
fn file(creator: &str, program: &str) -> Vec<u8> {
    format!("%!PS-Adobe-3.0 EPSF-3.0\n%%Creator: {creator}\n%%BoundingBox: 0 0 200 150\n%%LanguageLevel: 3\n%%EndComments\n{program}\n%%EOF\n").into_bytes()
}

/// `r` came in as vectors, without a warning of an error or of art left out.
fn clean(r: &Imported) {
    assert!(!r.preview, "{:?}", r.warnings);
    let bad = ["error", "couldn't", "left out", "mid-grey", "middle colour", "unknown"];
    assert!(r.warnings.iter().all(|w| !bad.iter().any(|b| w.contains(b))), "{:?}", r.warnings);
}

fn open(creator: &str, program: &str) -> Imported {
    let r = import(&file(creator, program)).unwrap();
    clean(&r);
    r
}

/// The objects of `kind` (`Node::kind_label`), down through groups.
fn of_kind(d: &Document, kind: &str) -> Vec<std::sync::Arc<Node>> {
    all(d).into_iter().filter(|n| n.kind_label() == kind).collect()
}

/// ASCII85 of Flate-compressed `data`, as inline data after an operator.
fn a85_flate(data: &[u8]) -> String {
    ascii85(&deflate(data))
}

/// Pixel `(x, y)` (straight RGBA) of the first image in `d`.
fn pixel(d: &Document, x: u32, y: u32) -> [u8; 4] {
    let im = all(d)
        .into_iter()
        .find_map(|n| match &n.kind {
            NodeKind::Image(im) => Some(im.key.clone()),
            _ => None,
        })
        .unwrap();
    let img = image::load_from_memory(&d.images[&im].bytes).unwrap().to_rgba8();
    img.get_pixel(x, y).0
}

/// A Coons or tensor patch (type 7: sixteen points) in the packed form of a mesh shading with
/// 8-bit flags, 32-bit coordinates over `[0 200 0 150]` and 16-bit colour components.
fn patch(points: &[(f64, f64)], colors: &[[f64; 3]]) -> Vec<u8> {
    let mut v = vec![0u8];
    for (x, y) in points {
        v.extend(((x / 200.0 * f64::from(u32::MAX)).round() as u32).to_be_bytes());
        v.extend(((y / 150.0 * f64::from(u32::MAX)).round() as u32).to_be_bytes());
    }
    for c in colors {
        for k in c {
            v.extend(((k * 65535.0).round() as u16).to_be_bytes());
        }
    }
    v
}

/// The twelve boundary points of the square patch `(x0, y0)`–`(x1, y1)` in shading order (up its
/// left side, along its top, down its right side, back along its bottom).
fn square(x0: f64, y0: f64, x1: f64, y1: f64) -> Vec<(f64, f64)> {
    let (dx, dy) = ((x1 - x0) / 3.0, (y1 - y0) / 3.0);
    vec![
        (x0, y0),
        (x0, y0 + dy),
        (x0, y0 + 2.0 * dy),
        (x0, y1),
        (x0 + dx, y1),
        (x0 + 2.0 * dx, y1),
        (x1, y1),
        (x1, y0 + 2.0 * dy),
        (x1, y0 + dy),
        (x1, y0),
        (x0 + 2.0 * dx, y0),
        (x0 + dx, y0),
    ]
}

/// Files whose page content is written with PDF's operator names (as PDF engines that also write
/// PostScript do): the operators as one-line procedures, a y-down `cm`, a gradient over a
/// stitched function whose `Encode` a loop builds, a tiling pattern, a Type 42 font set with
/// `Tm`/`Tf`/`Tj`, an image with a row-interleaved 1-bit mask (`ImageType 3`), a stencil mask,
/// image data closed with `status`/`flushfile`, and a mesh gradient from a reusable stream.
#[test]
fn pdf_operator_names_as_procedures_read_as_vectors() {
    // Each image row after its mask row (1: paint, with `Decode [1 0]`).
    let image = a85_flate(&[0b0100_0000, 0, 0, 255, 255, 255, 0, 0b1000_0000, 0, 255, 0, 255, 0, 0]);
    let mut points = square(20.0, 100.0, 60.0, 140.0);
    points.extend([(30.0, 110.0), (30.0, 130.0), (50.0, 130.0), (50.0, 110.0)]);
    let mesh = a85_flate(&patch(&points, &[[0.0, 0.0, 1.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [1.0, 1.0, 0.0]]));
    let program = format!(
        r##"%%BeginProlog
/Page 30 dict def Page begin
/q /gsave load def /Q /grestore load def /f /fill load def /S /stroke load def /W /clip load def /n /newpath load def
/m /moveto load def /l /lineto load def /c /curveto load def /h /closepath load def
/w /setlinewidth load def /d /setdash load def /g /setgray load def /rg /setrgbcolor load def
/cm {{ 6 array astore concat }} bind def
/re {{ 4 2 roll m exch dup 0 rlineto exch 0 exch rlineto neg 0 rlineto h }} bind def
/BT {{ /tm matrix def }} def /ET {{ }} def
/Tf {{ exch findfont exch scalefont /tf exch def }} bind def
/Tm {{ tm astore pop }} bind def
/Tj {{ tf [ tm 0 4 getinterval aload pop 0 0 ] makefont setfont tm 4 get tm 5 get moveto show }} bind def
/endimage {{ src status {{ src flushfile }} if }} bind def
/drawimage {{ image endimage }} bind def /drawmask {{ imagemask endimage }} bind def
end
%%EndProlog
%%BeginSetup
11 dict begin
/FontName /TestSans def /FontType 42 def /PaintType 0 def /FontMatrix [ 1 0 0 1 0 0 ] def /FontBBox [ 0 0 0 0 ] def
/Encoding 256 array def 0 1 255 {{ Encoding exch /.notdef put }} for Encoding 79 /O put Encoding 75 /K put
/CharStrings 3 dict dup begin /.notdef 0 def /O 1 def /K 2 def end readonly def
/sfnts [ <00010000000100000000000000> ] def
FontName currentdict end definefont pop
%%EndSetup
%%Page: 1 1
Page begin
q 1 0 0 -1 0 150 cm
q currentfile /ASCII85Decode filter /FlateDecode filter /ReusableStreamDecode filter
{mesh}
/patches exch def
<< /ShadingType 7 /ColorSpace /DeviceRGB /DataSource patches /BitsPerCoordinate 32
   /BitsPerComponent 16 /BitsPerFlag 8 /Decode [ 0 200 0 150 0 1 0 1 0 1 ] >> shfill
Q
q 0 0 1 rg 0.5 w [ 3 3 ] 0 d 120 20 m 140 10 160 40 180 20 c S Q
q 10 20 70 30 re W n
<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [ 10 0 80 0 ]
   /Function << /FunctionType 3 /Domain [ 0 1 ] /Bounds [ 0.25 ]
     /Functions [ << /FunctionType 2 /Domain [ 0 1 ] /C0 [ 0 0 0 ] /C1 [ 1 1 1 ] /N 1 >>
                  << /FunctionType 2 /Domain [ 0 1 ] /C0 [ 1 1 1 ] /C1 [ 1 0 0 ] /N 1 >> ]
     /Encode [ 0 1 1 {{ pop 0 1 }} for ] >> >> shfill
Q
<< /PatternType 1 /PaintType 1 /TilingType 2 /XStep 8 /YStep 8 /BBox [ 0 0 8 8 ]
   /PaintProc {{ pop 0 0.5 0 rg 2 2 4 4 re f }} >> matrix makepattern setpattern
100 60 50 30 re f
0.3 g BT /TestSans 1 Tf 10 0 0 -10 100 130 Tm (OK) Tj ET
q [ 30 0 0 -30 160 140 ] concat /DeviceRGB setcolorspace
/src currentfile /ASCII85Decode filter def
<< /ImageType 3 /InterleaveType 2
   /DataDict << /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 8 /Decode [ 0 1 0 1 0 1 ]
     /DataSource src /FlateDecode filter /ImageMatrix [ 2 0 0 -2 0 2 ] >>
   /MaskDict << /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 1 /Decode [ 1 0 ] /ImageMatrix [ 2 0 0 -2 0 2 ] >> >> drawimage
{image}
Q
q 1 0 0 rg [ 16 0 0 -8 10 90 ] concat
/src currentfile /ASCII85Decode filter def
8 1 true [ 8 0 0 -1 0 1 ] src drawmask
{mask}
Q
Q
end
showpage"##,
        mask = ascii85(&[0xAA]),
    );
    let r = open("a PDF engine", &program);
    let d = &r.document;
    // `cm` turned y down, as the document is: the mesh is where its points say.
    let mesh = of_kind(d, "Mesh");
    assert_eq!(mesh.len(), 1);
    assert!(near(bounds(&mesh[0]), Rect::new(20.0, 100.0, 60.0, 140.0)), "{:?}", bounds(&mesh[0]));
    assert!(all(d).iter().any(|n| stroke(n).is_some_and(|s| s.dash.is_some())));
    assert!(all(d).iter().any(|n| matches!(fill(n), Some(Paint::Gradient(_)))));
    // The pattern is a swatch of its cell, and fills the rectangle.
    assert_eq!(d.patterns.len(), 1);
    assert!(near(d.patterns[0].tile, Rect::new(0.0, 0.0, 8.0, 8.0)), "{:?}", d.patterns[0].tile);
    assert!(d.swatch(&d.patterns[0].name).is_some());
    assert!(all(d).iter().any(|n| matches!(fill(n), Some(Paint::Pattern { .. }))));
    assert_eq!(of_kind(d, "Type").len(), 1);
    assert_eq!(of_kind(d, "Image").len(), 2);
    let im = all(d).into_iter().find(|n| matches!(&n.kind, NodeKind::Image(im) if im.width == 2)).unwrap();
    let NodeKind::Image(im) = &im.kind else { panic!() };
    let img = image::load_from_memory(&d.images[&im.key].bytes).unwrap().to_rgba8();
    // Painted where its mask bit is 1, transparent where it is 0.
    assert_eq!([img.get_pixel(0, 0).0, img.get_pixel(1, 0).0], [[0, 0, 255, 0], [255, 255, 0, 255]]);
    assert_eq!([img.get_pixel(0, 1).0, img.get_pixel(1, 1).0], [[0, 255, 0, 255], [255, 0, 0, 0]]);
}

/// cairo's Type 3 fonts (fonts it can't embed otherwise): glyph procedures in an array, picked
/// through `CharStrings` by `BuildGlyph`, widths from `d1`: the glyphs are drawn as their
/// outlines, one group per string.
#[test]
fn type3_fonts_draw_their_glyph_procedures() {
    let program = r##"/d1 { setcachedevice } bind def
8 dict begin
/FontType 3 def
/FontMatrix [ 0.001 0 0 0.001 0 0 ] def
/FontBBox [ 0 0 1000 1000 ] def
/Encoding 256 array def 0 1 255 { Encoding exch /.notdef put } for
Encoding 65 /g1 put
/Glyphs [ { } { 600 0 0 0 500 700 d1 0 0 moveto 500 0 lineto 250 700 lineto closepath fill } ] def
/CharStrings 2 dict dup begin /.notdef 0 def /g1 1 def end readonly def
/BuildGlyph { exch dup /Glyphs get exch /CharStrings get 3 -1 roll 2 copy known not { pop /.notdef } if get get exec } bind def
/BuildChar { 1 index /Encoding get exch get 1 index /BuildGlyph get exec } bind def
currentdict end /f-1-0 exch definefont pop
1 0 0 setrgbcolor
/f-1-0 findfont 20 scalefont setfont 10 10 moveto (AA) show
currentpoint 2 copy translate
% `stringwidth` measures them without drawing.
(A) stringwidth pop 12 eq { 0 0 1 setrgbcolor } if 0 0 moveto 3 0 65 2 0 (AA) awidthshow
showpage"##;
    let r = open("a PDF-engine exporter", program);
    let d = &r.document;
    let groups = of_kind(d, "Group");
    assert_eq!(groups.len(), 2, "{:?}", all(d).iter().map(|n| n.kind_label()).collect::<Vec<_>>());
    assert_eq!(groups[0].name.as_deref(), Some("AA"));
    let glyphs: Vec<Rect> = groups[0].children().unwrap().iter().map(|n| bounds(n)).collect();
    // 500 × 700 units at 20 pt (0.02 pt a unit) on the baseline 10 pt up the page; the second glyph
    // after the first one's width (600 units).
    assert!(near(glyphs[0], Rect::new(10.0, 126.0, 20.0, 140.0)), "{glyphs:?}");
    assert!(near(glyphs[1], Rect::new(22.0, 126.0, 32.0, 140.0)), "{glyphs:?}");
    assert_eq!(fill(&groups[0].children().unwrap()[0]).and_then(Paint::color), Some(Color::rgb(1.0, 0.0, 0.0)));
    // `awidthshow` spaces them (2 more, 3 more after an "A"), in blue: the width measured right.
    let second: Vec<Rect> = groups[1].children().unwrap().iter().map(|n| bounds(n)).collect();
    assert!((second[1].x0 - second[0].x0 - 17.0).abs() < 1e-6, "{second:?}");
    assert_eq!(fill(&groups[1].children().unwrap()[0]).and_then(Paint::color), Some(Color::rgb(0.0, 0.0, 1.0)));
}

/// Plotting libraries' PostScript (matplotlib's, for one): a dictionary of short procedures
/// defined through one binding procedure, Type 3 fonts converted from TrueType (`CharStrings` of glyph procedures with `sc`, `BuildGlyph` and
/// `BuildChar`) shown glyph by glyph with `glyphshow`, `clipbox`, marker procedures, and images as
/// `colorimage` reading hexadecimal data with `readhexstring`.
#[test]
fn plotting_library_files_read_as_vectors() {
    let program = r##"%%BeginProlog
/PlotOps 11 dict def
PlotOps begin
/bdef { bind def } bind def
/m { moveto } bdef
/l { lineto } bdef
/r { rlineto } bdef
/c { curveto } bdef
/cl { closepath } bdef
/ce { closepath eofill } bdef
/box { m 1 index 0 r 0 exch r neg 0 r cl } bdef
/cliprect { box clip newpath } bdef
/sc { setcachedevice } bdef
%!PS-Adobe-3.0 Resource-Font
10 dict begin
/FontName /TestSans def
/PaintType 0 def
/FontMatrix [ 0.00048828125 0 0 0.00048828125 0 0 ] def
/FontBBox [ -2090 -948 3673 2524 ] def
/FontType 3 def
/Encoding [ /A /V ] def
/CharStrings 3 dict dup begin
/.notdef 0 def
/A { 1401 0 16 0 1384 1493 sc 16 0 m 700 1493 l 1384 0 l ce } bdef
/V { 1401 0 16 0 1384 1493 sc 16 1493 m 700 0 l 1384 1493 l ce } bdef
end readonly def
/BuildGlyph { exch begin CharStrings exch 2 copy known not { pop /.notdef } if get exec end } bdef
/BuildChar { 1 index /Encoding get exch get 1 index /BuildGlyph get exec } bdef
FontName currentdict end definefont pop
end
%%EndProlog
PlotOps begin
0 0 translate
0 0 200 150 rectclip
gsave
0 0 m 200 0 l 200 150 l 0 150 l cl
1 setgray fill
grestore
gsave
10 10 180 130 cliprect
0.122 0.467 0.706 setrgbcolor 1.5 setlinewidth 1 setlinejoin 2 setlinecap [] 0 setdash
newpath 10 10 m 50 60 l 90 30 l stroke
/o { gsave newpath translate 3 0 m 0 0 3 0 360 arc cl gsave 1 0 0 setrgbcolor fill grestore stroke grestore } bind def
10 10 o 50 60 o
grestore
0 setgray
gsave 20 100 translate 0 rotate
/TestSans 20.0 selectfont 0 0 m /A glyphshow 13.68 0 m /V glyphshow
grestore
gsave 120 20 translate 40 40 scale
/DataString 6 string def
2 2 8 [ 2 0 0 -2 0 2 ] { currentfile DataString readhexstring pop } bind false 3 colorimage
ff000000ff00
0000ffffffff
grestore
end
showpage"##;
    let r = open("a plotting library", program);
    let d = &r.document;
    // The two glyphs are their outlines (even-odd, as `ce` fills them), at 20 pt.
    let glyphs: Vec<_> = all(d).into_iter().filter(|n| matches!(n.kind, NodeKind::Path { rule: FillRule::EvenOdd, .. })).collect();
    assert_eq!(glyphs.len(), 2);
    let a = bounds(&glyphs[0]);
    assert!(near(a, Rect::new(20.16, 150.0 - 100.0 - 14.58, 33.52, 50.0)), "{a:?}");
    // Each marker is one object, filled and stroked; the image is its four pixels.
    let markers = all(d).into_iter().filter(|n| fill(n).is_some() && stroke(n).is_some()).count();
    assert_eq!(markers, 2);
    assert_eq!([pixel(d, 0, 0), pixel(d, 1, 0), pixel(d, 0, 1)], [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255]]);
}

/// Prologs that make operators shorter names with `load`, keep the current colour in variables
/// and set it in CMYK (grey on Level 1), replace `showpage` and `setscreen` with their own
/// procedures, put every object in a `save`/`restore` block, reencode a font by copying all of its
/// dictionary but `FID`, and set type with `ashow` in a font from `makefont` (as CorelDRAW's
/// and other drawing apps' files do).
#[test]
fn operator_aliases_and_colour_variables_read_as_vectors() {
    let program = r##"%%BeginProlog
/Short 50 dict def Short begin
/ops [ /moveto /lineto /curveto /closepath /fill /stroke /gsave /grestore ] def
/short [ /_m /_l /_c /_h /_f /_s /_q /_Q ] def
0 1 7 { dup short exch get exch ops exch get load def } for
/screen0 /setscreen load def
/setscreen { pop pop pop 60 0 { dup mul exch dup mul add 2 div 1 exch sub } screen0 } bind def
/printpage /showpage load def /showpage { } def
/cmyk? /languagelevel where { pop languagelevel 1 gt } { false } ifelse def
/ink [ 0 0 0 1 ] def
/paint { cmyk? { ink aload pop setcmykcolor } { 1 ink 3 get sub setgray } ifelse } bind def
/inkfill { _q paint _f _Q newpath } bind def
/inkstroke { paint _s } bind def
/copyfont { findfont dup length dict exch { 1 index /FID eq { pop pop } { 3 copy put pop pop } ifelse } forall
  dup /Encoding 2 copy get 256 array copy dup 196 /Adieresis put put definefont pop } bind def
end
%%EndProlog
%%BeginSetup
Short begin
30 45 { } setscreen
/BodyFont /Helvetica copyfont
%%EndSetup
%%Page: 1 1
save /ink [ 0.6 0 1 0 ] def 20 30 _m 20 70 _l 110 70 _l 110 30 _l _h inkfill restore
save /ink [ 0 0.5 0 0.25 ] def 2 setlinewidth 120 20 _m 140 60 160 0 180 40 _c inkstroke restore
save /ink [ 0 0 0 1 ] def paint /BodyFont findfont [ 14 0 0 10 0 0 ] makefont setfont 20 110 _m 2 0 (Wide) ashow restore
end
showpage
printpage"##;
    let r = open("a drawing app", program);
    let d = &r.document;
    assert_eq!(d.color_mode, ColorMode::Cmyk);
    let rect = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::cmyk(0.6, 0.0, 1.0, 0.0))).unwrap();
    assert!(near(bounds(&rect), Rect::new(20.0, 80.0, 110.0, 120.0)), "{:?}", bounds(&rect));
    assert!(all(d).iter().any(|n| stroke(n).is_some_and(|s| s.width == 2.0 && s.paint.color() == Some(Color::cmyk(0.0, 0.5, 0.0, 0.25)))));
    let NodeKind::Text(t) = &of_kind(d, "Type")[0].kind else { panic!() };
    assert!(t.plain_text().starts_with("Wide"));
}

/// Level 3 files from PDF engines (Affinity Designer's, for one): a level check that would stop
/// an older interpreter, a gradient as a shading pattern over a sampled function, a spot colour
/// (`Separation`) and a `DeviceN` colour with tint transforms, and an image compressed with Flate
/// and a PNG predictor.
#[test]
fn shading_patterns_inks_and_predictors_read_as_vectors() {
    // Two rows of two RGB pixels, PNG-filtered: Up (from zero), then Sub.
    let rows = [[2u8, 0, 255, 0, 255, 0, 0], [1, 0, 0, 255, 255, 255, 0]];
    let image = a85_flate(&rows.concat());
    let program = format!(
        r##"%%BeginProlog
languagelevel 3 lt {{ (needs PostScript 3) print flush stop }} if
%%EndProlog
%%Page: 1 1
/rect {{ rectfill }} bind def
[ /DeviceN [ /Magenta /Yellow ] /DeviceCMYK {{ 0 3 1 roll 0 }} ] setcolorspace
0.4 0.9 setcolor 120 20 30 30 rect
[ /Separation (Spot Green) /DeviceCMYK {{ dup 0.8 mul 0 exch 0 }} ] setcolorspace
1 setcolor 160 20 30 30 rect
<< /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [ 10 0 90 0 ] /Extend [ false false ]
   /Function << /FunctionType 0 /Domain [ 0 1 ] /Range [ 0 1 0 1 0 1 ] /Size [ 3 ] /BitsPerSample 8
     /DataSource <0000ffffffff00ff00> >> >> >> matrix makepattern setpattern
10 20 80 60 rect
gsave 120 70 translate 50 50 scale /DeviceRGB setcolorspace
<< /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 8 /Decode [ 0 1 0 1 0 1 ] /ImageMatrix [ 2 0 0 -2 0 2 ]
   /DataSource currentfile /ASCII85Decode filter << /Predictor 12 /Colors 3 /Columns 2 >> /FlateDecode filter >> image
{image}
grestore
showpage"##
    );
    let r = open("a PDF engine", &program);
    let d = &r.document;
    let Some(g) = all(d).into_iter().find_map(|n| match fill(&n) {
        Some(Paint::Gradient(g)) => Some(g.clone()),
        _ => None,
    }) else {
        panic!("no gradient")
    };
    // The function's three samples: blue, white, green.
    let at = |t: f32| g.gradient.stops.iter().find(|s| (s.offset - t).abs() < 1e-3).map(|s| s.color.to_rgb_uncalibrated());
    assert_eq!([at(0.0), at(0.5), at(1.0)], [Some([0.0, 0.0, 1.0]), Some([1.0, 1.0, 1.0]), Some([0.0, 1.0, 0.0])]);
    assert!(d.swatch("Spot Green").is_some_and(|s| s.spot));
    assert!(all(d).iter().any(|n| matches!(fill(n), Some(Paint::Solid { swatch: Some(s), .. }) if s == "Spot Green")));
    assert!(all(d).iter().any(|n| fill(n).and_then(Paint::color) == Some(Color::cmyk(0.0, 0.4, 0.9, 0.0))));
    // Up from zero leaves the first row as it is; Sub adds the pixel to the left.
    assert_eq!([pixel(d, 0, 0), pixel(d, 1, 0), pixel(d, 0, 1), pixel(d, 1, 1)], [[0, 255, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255], [255, 255, 255, 255]]);
}

/// Files whose procedures negate y (their apps draw y down), that remember the operand and
/// dictionary stack depths and clean both up at the end, reencode a font to ISO Latin-1 under a
/// name of their own, and fit type to a width measured with `stringwidth` (as office suites
/// write).
#[test]
fn flipped_coordinates_and_fitted_type_read_as_vectors() {
    let program = r##"%%BeginProlog
userdict begin
count /depth0 exch def countdictstack /dicts0 exch def
/vm save def
/M { neg moveto } bind def /L { neg lineto } bind def
/C { 3 { 6 -1 roll 6 -1 roll neg } repeat curveto } bind def
/latin1 { findfont dup length dict copy dup /FID undef dup /Encoding ISOLatin1Encoding put definefont } bind def
/fit { dup stringwidth pop 3 -1 roll exch div gsave 1 scale show grestore } bind def
%%EndProlog
%%Page: 1 1
0 150 translate
0.9 0.5 0.1 setrgbcolor 20 20 M 70 20 L 70 50 L 20 50 L closepath fill
0.75 setlinewidth 0 setgray 100 30 M 120 10 150 50 180 30 C stroke
/Office /Helvetica latin1 12 scalefont setfont 20 120 M 90 (Fitted) fit
1 2 3 4 dict begin 5 dict begin
count depth0 sub { pop } repeat countdictstack dicts0 sub { end } repeat
vm restore
end
showpage"##;
    let r = open("an office suite", program);
    let d = &r.document;
    let rect = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(0.9, 0.5, 0.1))).unwrap();
    assert!(near(bounds(&rect), Rect::new(20.0, 20.0, 70.0, 50.0)), "{:?}", bounds(&rect));
    let curve = all(d).into_iter().find(|n| stroke(n).is_some_and(|s| (s.width - 0.75).abs() < 1e-9)).unwrap();
    // y down: the curve's ends 30 from the top, its control points 10 and 50 from it.
    let b = bounds(&curve);
    assert!(b.x0 == 100.0 && b.x1 == 180.0 && (10.0..30.0).contains(&b.y0) && b.y1 > 30.0 && b.y1 <= 50.0, "{b:?}");
    let NodeKind::Text(t) = &of_kind(d, "Type")[0].kind else { panic!() };
    assert_eq!(t.plain_text(), "Fitted");
}

/// Page content kept as data between two markers and run through `SubFileDecode` (as Ghostscript's
/// `eps2write` writes it), around the probes such files make (`gcheck`, `currentglobal`,
/// `/currentdistillerparams where`, an unguarded `pdfmark`), a procedure set defined as a
/// resource, `selectfont`, `xshow`, `rectfill`, a form drawn with `execform`, a half-tone
/// dictionary and a free-form triangle mesh.
#[test]
fn content_run_from_a_subfile_reads_as_vectors() {
    let program = r##"%%BeginProlog
/Run << /Exec { cvx exec } bind >> /ProcSet defineresource pop
/Distilling /currentdistillerparams where { pop true } { false } ifelse def
currentglobal true setglobal /Fonts 2 dict def setglobal
Fonts gcheck { [ /Subject (probe) /DOCINFO pdfmark } if
%%EndProlog
%%Page: 1 1
<< /HalftoneType 1 /Frequency 85 /Angle 0 /SpotFunction { exch pop } >> sethalftone
/Badge << /FormType 1 /BBox [ 0 0 30 10 ] /Matrix [ 1 0 0 1 0 0 ] /PaintProc { pop 0.5 setgray 0 0 30 10 rectfill } >> def
currentfile 0 (%%EndPageContent) /SubFileDecode filter /Run /ProcSet findresource /Exec get exec
0 0.6 0 setrgbcolor 30 30 60 20 rectfill
/Times-Roman 24 selectfont 30 70 moveto (xy) [ 14 0 ] xshow
%%EndPageContent
gsave 140 110 translate Badge execform grestore
<< /ShadingType 4 /ColorSpace /DeviceGray /DataSource [ 0 120 20 0  0 180 20 1  0 150 60 0.5  1 120 60 1 ] >> shfill
showpage"##;
    let r = open("a PostScript converter", program);
    let d = &r.document;
    let green = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(0.0, 0.6, 0.0))).unwrap();
    assert!(near(bounds(&green), Rect::new(30.0, 100.0, 90.0, 120.0)), "{:?}", bounds(&green));
    let badge = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::gray(0.5))).unwrap();
    assert!(near(bounds(&badge), Rect::new(140.0, 30.0, 170.0, 40.0)), "{:?}", bounds(&badge));
    assert_eq!(of_kind(d, "Type").len(), 1);
    // Two triangles: the second (flag 1) on the first one's last two vertices.
    let meshes = of_kind(d, "Mesh");
    assert_eq!(meshes.len(), 2);
    assert!(near(bounds(&meshes[1]), Rect::new(120.0, 90.0, 180.0, 130.0)), "{:?}", bounds(&meshes[1]));
}

/// What procsets that keep and restore the graphics state ask of the interpreter (as
/// Illustrator's EPS files do): each `current…` operator's answer is taken by its `set…` operator
/// and asked again (device settings are accepted and kept as they are)
/// (colour rendering, half-tone, transfers, black generation and undercolour removal as
/// procedures, `rootfont`), VM switches with `setglobal` and `currentglobal`, a font's VM with
/// `gcheck`, and level and `version` probes in `stopped`; then art drawn through such procedures.
#[test]
fn graphics_state_queries_set_the_same_state_again() {
    use super::tests::check;
    check("currentflat dup setflat currentflat eq");
    check("currentstrokeadjust dup setstrokeadjust currentstrokeadjust eq");
    check("currentoverprint dup setoverprint currentoverprint eq");
    check("currentcolorrendering setcolorrendering currentcolorrendering type /dicttype eq");
    check("currenthalftone dup sethalftone currenthalftone /HalftoneType get exch /HalftoneType get eq");
    check("currentcolortransfer setcolortransfer [ currentcolortransfer ] length 4 eq");
    check("currentblackgeneration cvlit cvx setblackgeneration currentundercolorremoval setundercolorremoval true");
    check("/Helvetica 10 selectfont rootfont /FontName get /Helvetica eq");
    // One VM: switches are accepted, and `gcheck` answers for any object.
    check("true setglobal currentglobal type /booleantype eq false setglobal");
    check("true setglobal 1 dict false setglobal gcheck type /booleantype eq");
    check("/Helvetica findfont dup length dict copy gcheck type /booleantype eq");
    check("{ version cvr pop } stopped not /languagelevel where { pop languagelevel 2 ge } { false } ifelse and");
    let program = r##"%%BeginProlog
/Keep 12 dict def
/keep { Keep begin /w currentlinewidth def /f currentflat def /k [ currentcmykcolor ] def end } bind def
/back { Keep begin w setlinewidth f setflat k aload pop setcmykcolor end } bind def
%%EndProlog
3 setlinewidth 0.1 0.2 0.3 0.4 setcmykcolor keep
9 setlinewidth 1 0 0 setrgbcolor 40 setflat
back 20 20 moveto 180 130 lineto stroke
showpage"##;
    let r = open("an illustration app", program);
    let line = all(&r.document).into_iter().find(|n| stroke(n).is_some()).unwrap();
    let s = stroke(&line).unwrap();
    assert_eq!((s.width, s.paint.color()), (3.0, Some(Color::cmyk(0.1, 0.2, 0.3, 0.4))));
}

/// Shadings other apps paint with: function-based ones (type 1) over a sampled two-input
/// function, free-form triangles packed in bits (type 4), lattices (type 5), Coons patches sharing
/// an edge (type 6), and a mesh as a shading pattern's fill; all as gradient meshes.
#[test]
fn mesh_and_function_shadings_become_gradient_meshes() {
    // Type 1: a 2 × 2 sampled function, red to green across, to blue down.
    let r = read(
        "<< /ShadingType 1 /ColorSpace /DeviceRGB /Domain [0 1 0 1] /Matrix [50 0 0 50 10 10] \
         /Function << /FunctionType 0 /Domain [0 1 0 1] /Range [0 1 0 1 0 1] /Size [2 2] /BitsPerSample 8 \
         /DataSource <ff000000ff000000ff000000> >> >> shfill",
    );
    clean(&r);
    let m = &of_kind(&r.document, "Mesh")[0];
    assert!(near(bounds(m), Rect::new(10.0, 40.0, 60.0, 90.0)), "{:?}", bounds(m));
    let NodeKind::Mesh(g) = &m.kind else { panic!() };
    // Its first corner (the domain's origin) is the first sample.
    assert_eq!(g.points[0].color, Color::rgb(1.0, 0.0, 0.0));

    // Type 4 packed: 8-bit flags, coordinates and components; a triangle and one on its edge.
    let tri = [[0u8, 0, 0, 255, 0, 0], [0, 255, 0, 0, 255, 0], [0, 0, 255, 0, 0, 255], [1, 255, 255, 255, 255, 0]].concat();
    let r = read(&format!(
        "<< /ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 8 /BitsPerComponent 8 /BitsPerFlag 8 \
         /Decode [0 255 0 255 0 1 0 1 0 1] /DataSource <{}> >> [0.2 0 0 0.2 0 0] concat shfill",
        tri.iter().map(|b| format!("{b:02x}")).collect::<String>()
    ));
    clean(&r);
    assert_eq!(of_kind(&r.document, "Mesh").len(), 2);

    // Type 5: a 2 × 2 lattice is two triangles.
    let r = read(
        "<< /ShadingType 5 /ColorSpace /DeviceGray /VerticesPerRow 2 \
         /DataSource [10 10 0  50 10 1  10 50 0.5  50 50 1] >> shfill",
    );
    clean(&r);
    assert_eq!(of_kind(&r.document, "Mesh").len(), 2);

    // Type 6: a patch, then one sharing its right side (flag 2).
    let first: Vec<String> = square(10.0, 10.0, 40.0, 40.0).iter().map(|(x, y)| format!("{x} {y}")).collect();
    let right = "40 40 50 40 60 40 70 40 70 30 70 20 70 10 60 10 50 10";
    let r =
        read(&format!("<< /ShadingType 6 /ColorSpace /DeviceRGB /DataSource [0 {} 1 0 0 0 1 0 0 0 1 1 1 0  2 {right} 1 0 1 0 1 1] >> shfill", first.join(" ")));
    clean(&r);
    let patches = of_kind(&r.document, "Mesh");
    assert_eq!(patches.len(), 2);
    assert!(near(bounds(&patches[1]), Rect::new(40.0, 60.0, 70.0, 90.0)), "{:?}", bounds(&patches[1]));

    // A mesh through a shading pattern fills the path it paints, clipped to it.
    let r = read(
        "<< /PatternType 2 /Shading << /ShadingType 5 /ColorSpace /DeviceGray /VerticesPerRow 2 \
         /DataSource [0 0 0  100 0 1  0 100 0.5  100 100 1] >> >> matrix makepattern setpattern \
         newpath 20 20 30 0 360 arc fill",
    );
    clean(&r);
    let o = objects(&r.document);
    assert!(matches!(o[0].kind, NodeKind::Group { clip: true, .. }), "{:?}", o[0].kind_label());
    assert_eq!(of_kind(&r.document, "Mesh").len(), 2);
}

/// Images with a mask (`ImageType 3`) interleaved by sample, and with the mask in its own source.
#[test]
fn masked_images_in_every_interleaving() {
    // By sample: mask bit, then three colour bits, 1 bit each (two pixels a row, padded).
    let r = read(
        "/DeviceRGB setcolorspace 20 20 scale << /ImageType 3 /InterleaveType 1 \
         /DataDict << /ImageType 1 /Width 2 /Height 1 /BitsPerComponent 1 /Decode [0 1 0 1 0 1] /ImageMatrix [2 0 0 1 0 0] \
         /DataSource <c600> >> /MaskDict << /ImageType 1 /Width 2 /Height 1 /BitsPerComponent 1 /Decode [1 0] /ImageMatrix [2 0 0 1 0 0] >> >> image",
    );
    clean(&r);
    // 1100 0110: painted red, then masked out.
    assert_eq!((pixel(&r.document, 0, 0), pixel(&r.document, 1, 0)[3]), ([255, 0, 0, 255], 0));
    // Separate sources, the mask at twice the resolution.
    let r = read(
        "/DeviceGray setcolorspace 20 20 scale << /ImageType 3 /InterleaveType 3 \
         /DataDict << /ImageType 1 /Width 1 /Height 1 /BitsPerComponent 8 /Decode [0 1] /ImageMatrix [1 0 0 1 0 0] /DataSource <80> >> \
         /MaskDict << /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 1 /Decode [0 1] /ImageMatrix [2 0 0 2 0 0] /DataSource <4000> >> >> image",
    );
    clean(&r);
    assert_eq!(pixel(&r.document, 0, 0), [128, 128, 128, 255]);
}

/// The warning for a file read only up to an error names the error, the operator that raised it
/// and the procedures it ran in, innermost first; an error a program catches with `stopped` is
/// not reported.
#[test]
fn errors_name_the_operator_and_the_procedures() {
    let r = read("{ 1 (a) add } stopped pop 0 0 10 10 rectfill /inner { 1 (a) add } def /outer { inner } def outer");
    assert!(r.warnings[0].contains("(typecheck in `add`), in `inner` in `outer`"), "{:?}", r.warnings);
    let r = read("0 0 10 10 rectfill /p { frobnicate } def p");
    assert!(r.warnings[0].contains("it uses `frobnicate`, which VectorCraft's PostScript reader doesn't know, in `p`"), "{:?}", r.warnings);
    let r = read("0 0 10 10 rectfill 0 0 moveto (x) cvn moveto");
    assert!(r.warnings[0].contains("typecheck in `moveto`: a number"), "{:?}", r.warnings);
}

/// Operators programs use to probe the interpreter or measure things: file `status`, `token`,
/// `bytesavailable`, `pathforall`, `strokepath`, `nulldevice`, `currenthsbcolor`, the cache and
/// device parameter queries.
#[test]
fn probing_operators_answer() {
    super::tests::check("currentfile status (no such file) status not and");
    super::tests::check("(12 /x {a}) token { 12 eq exch (/x {a}) eq and } { false } ifelse");
    super::tests::check("() token not");
    super::tests::check("/n 0 def 0 0 moveto 10 0 lineto { pop pop /n n 1 add def } { pop pop /n n 2 add def } { 6 { pop } repeat } {} pathforall n 3 eq");
    super::tests::check("1 0 0 setrgbcolor currenthsbcolor 1 eq exch 1 eq and exch 0 eq and");
    super::tests::check("currentcacheparams counttomark 2 eq exch pop exch pop exch pop");
    super::tests::check("cachestatus 7 { pop } repeat true");
    super::tests::check("currentcolorrendering /ColorRenderingType known");
    super::tests::check("[ (x) /y ] gcheck not");
    // `strokepath` makes the stroke's outline the path; `nulldevice` paints nothing.
    let r = read("4 setlinewidth 10 50 moveto 90 50 lineto strokepath fill gsave nulldevice 0 0 100 100 rectfill grestore");
    clean(&r);
    let o = objects(&r.document);
    assert_eq!(o.len(), 1);
    assert!(near(bounds(&o[0]), Rect::new(10.0, 48.0, 90.0, 52.0)), "{:?}", bounds(&o[0]));
}

/// A file whose PostScript can't be read opens its Windows metafile preview (vectors) when its
/// binary header has one, else its EPSI bitmap preview.
#[test]
fn metafile_and_epsi_previews_stand_in() {
    let ps = super::tests::eps("0 0 10 10 rectfill frobnicate");
    // A placeable metafile of one red rectangle over its 1000-unit frame.
    let wmf = wmf_rectangle();
    let mut bytes = vec![0xC5, 0xD0, 0xD3, 0xC6];
    let words = [30u32, ps.len() as u32, 30 + ps.len() as u32, wmf.len() as u32, 0, 0];
    for w in words {
        bytes.extend(w.to_le_bytes());
    }
    bytes.extend(0xFFFFu16.to_le_bytes());
    bytes.extend(&ps);
    bytes.extend(&wmf);
    let r = import(&bytes).unwrap();
    assert!(r.preview);
    assert!(r.warnings[0].contains("frobnicate") && r.warnings[0].contains("metafile"), "{:?}", r.warnings);
    let paths: Vec<_> = all(&r.document).into_iter().filter(|n| n.kind_label() == "Path").collect();
    assert!(!paths.is_empty());
    assert!(near(bounds(&paths[0]), Rect::new(10.0, 10.0, 90.0, 90.0)), "{:?}", bounds(&paths[0]));

    // An EPSI preview: 4 × 2 pixels, 1 bit, black on the left.
    let epsi = "%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 100\n%%EndComments\n%%BeginPreview: 4 2 1 2\n% C0\n% C0\n%%EndPreview\nfrobnicate\n";
    let r = import(epsi.as_bytes()).unwrap();
    assert!(r.preview, "{:?}", r.warnings);
    assert_eq!([pixel(&r.document, 0, 0), pixel(&r.document, 3, 1)], [[0, 0, 0, 255], [255, 255, 255, 255]]);
}

/// A placeable Windows metafile (1000 units an inch) of a red rectangle from (100, 100) to
/// (900, 900) on a frame of 1000 × 1000 units.
fn wmf_rectangle() -> Vec<u8> {
    let mut v = vec![];
    let w16 = |v: &mut Vec<u8>, x: u16| v.extend(x.to_le_bytes());
    let w32 = |v: &mut Vec<u8>, x: u32| v.extend(x.to_le_bytes());
    w32(&mut v, 0x9AC6_CDD7);
    for x in [0u16, 0, 0, 1000, 1000, 1000] {
        w16(&mut v, x);
    }
    w32(&mut v, 0);
    let sum = v.chunks(2).fold(0u16, |a, c| a ^ u16::from_le_bytes([c[0], c[1]]));
    w16(&mut v, sum);
    let records: Vec<Vec<u16>> = vec![
        vec![0x020B, 0, 0],               // SetWindowOrg
        vec![0x020C, 1000, 1000],         // SetWindowExt
        vec![0x02FC, 0, 0x00FF, 0, 0],    // CreateBrushIndirect: solid red
        vec![0x012D, 0],                  // SelectObject
        vec![0x041B, 900, 900, 100, 100], // Rectangle (bottom, right, top, left)
        vec![0x0000],                     // EOF
    ];
    let size: usize = 9 + records.iter().map(|r| r.len() + 2).sum::<usize>();
    for x in [1u16, 9, 0x0300] {
        w16(&mut v, x);
    }
    w32(&mut v, size as u32);
    w16(&mut v, 1);
    w32(&mut v, 7);
    w16(&mut v, 0);
    for r in records {
        w32(&mut v, r.len() as u32 + 2);
        for x in r {
            w16(&mut v, x);
        }
    }
    v
}

/// Immediately evaluated names (`//name`) are their values when read: inside a procedure that
/// runs after the dictionary that defined them is gone, and as an operand at the top.
#[test]
fn immediately_evaluated_names_are_read_as_their_values() {
    super::tests::check("2 dict begin /v 7 def /p { //v } def currentdict end /d exch def d /p get exec 7 eq");
    super::tests::check("/w 3 def //w 3 eq");
    let r = read("/p { 0 0 10 10 } def //p rectfill");
    clean(&r);
    let r = read("0 0 10 10 rectfill /q { //nosuchname } def");
    assert!(r.warnings[0].contains("nosuchname"), "{:?}", r.warnings);
    let _ = Point::ZERO;
}

/// User paths (`ufill`, `ustroke`, `uappend`, `upath`, as procedures and in the encoded form),
/// and reading a file byte by byte (`read`) with its position.
#[test]
fn user_paths_and_file_reads() {
    let r = read(
        "{ 0 0 50 50 setbbox 10 10 moveto 40 10 lineto 40 40 lineto closepath } ufill \
         [ [0 0 50 50 60 60 90 60 90 90] <00010303> ] ustroke \
         newpath 0 0 moveto 5 5 lineto",
    );
    clean(&r);
    let o = objects(&r.document);
    assert_eq!(o.len(), 2);
    assert!(near(bounds(&o[0]), Rect::new(10.0, 60.0, 40.0, 90.0)), "{:?}", bounds(&o[0]));
    assert!(stroke(&o[1]).is_some() && near(bounds(&o[1]), Rect::new(60.0, 10.0, 90.0, 40.0)), "{:?}", bounds(&o[1]));
    super::tests::check("(ab) /ASCIIHexDecode filter pop (4142) /ASCIIHexDecode filter dup read pop 65 eq exch dup 0 setfileposition read pop 65 eq and");
    super::tests::check("{ (x) deletefile } stopped revision 1 eq and");
    // The bounding box, then each point with its operator.
    super::tests::check("newpath 0 0 moveto 5 5 lineto false upath length 11 eq");
}

/// Programs that would run away through what this reader adds end at its limits: a pattern
/// whose cell paints with itself, a Type 3 glyph that shows itself, a sampled function or mesh
/// too large, a dash pattern too fine for `strokepath`.
#[test]
fn hostile_patterns_glyphs_and_shadings_end() {
    let r = read(
        "/P << /PatternType 1 /PaintType 1 /XStep 5 /YStep 5 /BBox [0 0 5 5] \
         /PaintProc { pop P setpattern 0 0 5 5 rectfill } >> matrix makepattern def \
         P setpattern 0 0 50 50 rectfill",
    );
    assert!(!r.preview && r.warnings.iter().any(|w| w.contains("nested too deeply")), "{:?}", r.warnings);
    let r = import(&super::tests::eps(
        "0 0 1 1 rectfill /T << /FontType 3 /FontMatrix [1 0 0 1 0 0] /Encoding [/a] \
         /BuildChar { pop pop 0 0 moveto (a) show } >> definefont setfont 0 0 moveto (a) show",
    ))
    .unwrap();
    assert!(r.warnings[0].contains("error"), "{:?}", r.warnings);
    let r = read(
        "0 0 1 1 rectfill << /ShadingType 2 /ColorSpace /DeviceGray /Coords [0 0 1 0] \
         /Function << /FunctionType 0 /Domain [0 1] /Range [0 1] /Size [99999999] /BitsPerSample 8 /DataSource () >> >> shfill",
    );
    assert!(r.warnings[0].contains("rangecheck in `shfill`: a sampled function"), "{:?}", r.warnings);
    // Procedures nesting through operators that run them end at the nesting limit.
    for body in ["/f { { f } exec } def f", "/f { true { f } if } def f", "/f { 1 { f } repeat } def f", "/f { { f } stopped } def f"] {
        assert!(import(&super::tests::eps(body)).is_err(), "{body}");
    }
    let r = read("[1e-9] 0 setdash 0 0 moveto 1000 1000 lineto strokepath fill");
    clean(&r);
    assert_eq!(objects(&r.document).len(), 1);
}

/// Dictionaries built between `mark` and an executable string (`(>>) cvx`, or a Level 1 string
/// that counts to the mark and defines each pair), and a procedure fetched with `load` by an
/// integer key and run in `stopped` (as Illustrator 8's gradient procset does, which much stock
/// art carries).
#[test]
fn dictionary_builders_and_executable_strings() {
    let program = r##"%%BeginProlog
/dictend (>>) cvx def
/pairs (counttomark 2 idiv dup dict exch { dup 4 2 roll put } repeat exch pop) cvx def
/Steps 3 dict def Steps begin 1 { 1 0 1 setrgbcolor } def 5 { 0 1 1 setrgbcolor } def end
%%EndProlog
mark /ShadingType 2 /ColorSpace /DeviceRGB /Coords [ 20 0 120 0 ]
  /Function mark /FunctionType 2 /Domain [ 0 1 ] /C0 [ 0 0 1 ] /C1 [ 1 0 0 ] /N 1 dictend
dictend gsave 20 20 100 40 rectclip shfill grestore
mark /Size 9 pairs /Size get 9 eq { Steps begin 1 load end stopped pop 140 20 40 40 rectfill } if
(p) cvx xcheck { 20 80 30 30 rectfill } if
showpage"##;
    let r = open("an illustration app", program);
    let d = &r.document;
    let Some(Paint::Gradient(g)) = all(d).into_iter().find_map(|n| fill(&n).cloned()) else { panic!("no gradient") };
    assert_eq!(g.gradient.kind, astudio_color::vector::GradientKind::Linear);
    // The Level 1 builder made the dictionary; the procedure under key 1 ran (magenta).
    assert!(all(d).iter().any(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(1.0, 0.0, 1.0))));
    assert_eq!(objects(d).len(), 3);
}
