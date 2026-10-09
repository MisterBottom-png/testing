//! EPS as other apps write it: for each kind of generator, a short program with the constructs its
//! files use (the kind of procedures a prolog defines, how it sets colour, fills with gradients and
//! patterns, places images and sets type), each read as vectors without a fallback to the preview.
//! The programs are A-Studio's own (P2-15 rewrote VectorCraft's, which followed other apps'
//! prologs too closely): they use the PostScript operators those files use, never their
//! prologs' text, resource or procedure names.

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

/// PDF-style operator prologs (as PDF-engine exporters such as cairo write): short procedures
/// named after PDF operators, `rectclip` and `cm`, a gradient as `shfill` over a stitched function
/// whose `Encode` a loop builds, a tiling pattern, a Type 42 font set through `Tm`/`Tf`/`Tj`,
/// an image with a 1-bit mask interleaved by row (`ImageType 3`), a stencil mask, image data
/// flushed with `status`/`flushfile`, and a mesh gradient from a reusable stream.
#[test]
fn pdf_operator_prologs_read_as_vectors() {
    // Mask rows (1: paint, `Decode [1 0]`) before each image row.
    let image = a85_flate(&[0b1000_0000, 255, 0, 0, 0, 255, 0, 0b0100_0000, 0, 0, 255, 255, 255, 255]);
    let mut points = square(150.0, 10.0, 190.0, 50.0);
    points.extend([(160.0, 20.0), (160.0, 40.0), (180.0, 40.0), (180.0, 20.0)]);
    let mesh = a85_flate(&patch(&points, &[[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0], [1.0, 1.0, 0.0]]));
    let program = format!(
        r##"%%BeginProlog
/PdfOps 40 dict def PdfOps begin
/q {{ gsave }} bind def /Q {{ grestore }} bind def /cm {{ [ 7 1 roll ] concat }} bind def
/w {{ setlinewidth }} bind def /J {{ setlinecap }} bind def /j {{ setlinejoin }} bind def /d {{ setdash }} bind def
/m {{ moveto }} bind def /l {{ lineto }} bind def /c {{ curveto }} bind def /h {{ closepath }} bind def
/re {{ /rh exch def /rw exch def moveto rw 0 rlineto 0 rh rlineto rw neg 0 rlineto closepath }} bind def
/S {{ stroke }} bind def /f {{ fill }} bind def /n {{ newpath }} bind def /W {{ clip }} bind def
/g {{ setgray }} bind def /rg {{ setrgbcolor }} bind def
/BT {{ }} def /ET {{ }} def
% Tm keeps the text matrix and its origin, Tf the font and size; Tj sets both and shows.
/Tm {{ 6 array astore dup /tm exch def dup 4 get /tx exch def 5 get /ty exch def }} bind def
/Tf {{ /tsize exch def /tfont exch def }} bind def
/Tj {{ tfont findfont [ tm 0 get tm 1 get tm 2 get tm 3 get 0 0 ] makefont tsize scalefont setfont
  tx ty moveto show }} bind def
/flushdata {{ data status {{ data flushfile }} if }} bind def
% The data follows the procedure's name: an operator after `image` on the line would be read as data.
/img {{ image flushdata }} bind def /stencil {{ imagemask flushdata }} bind def
/mc {{ mark 3 1 roll /BDC pdfmark }} bind def
end
%%EndProlog
%%BeginSetup
11 dict begin
/FontType 42 def /FontName /TestSans def /PaintType 0 def
/FontMatrix [ 1 0 0 1 0 0 ] def /FontBBox [ 0 0 0 0 ] def
/Encoding 256 array def 0 1 255 {{ Encoding exch /.notdef put }} for
Encoding 72 /H put Encoding 105 /i put
/CharStrings 3 dict dup begin /.notdef 0 def /H 1 def /i 2 def end readonly def
/sfnts [ <00010000000100000000000000> ] def
/TestSans currentdict end definefont pop
%%EndSetup
%%Page: 1 1
PdfOps begin
q 0 0 200 150 rectclip
1 0 0 -1 0 150 cm q
0.8 0.2 0.2 rg 10 10 40 30 re f
0 g 1.5 w 1 J 0 j [ 4 2 ] 0 d 10 60 m 40 45 60 90 90 60 c S [ ] 0 d
/Artifact << >> mc mark /EMC pdfmark
q 100 10 60 30 re W n
/ramp << /FunctionType 3 /Domain [ 0 1 ] /Bounds [ 0.5 ] /Encode [ 2 {{ 0 1 }} repeat ]
  /Functions [ << /FunctionType 2 /Domain [ 0 1 ] /C0 [ 1 0 0 ] /C1 [ 0 1 0 ] /N 1 >>
               << /FunctionType 2 /Domain [ 0 1 ] /C0 [ 0 1 0 ] /C1 [ 0 0 1 ] /N 1 >> ] >> def
<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [ 100 0 160 0 ] /Extend [ true true ] /Function ramp >> shfill
Q
<< /PatternType 1 /PaintType 1 /TilingType 1 /XStep 10 /YStep 10 /BBox [ 0 0 10 10 ]
   /PaintProc {{ pop 0.8 0 0.8 rg 0 0 5 5 re f }} >> matrix makepattern setpattern
10 90 40 40 re f
0 0.2 0.4 rg BT 12 0 0 -12 60 140 Tm /TestSans 1 Tf (Hi) Tj ET
q [ 20 0 0 -20 110 110 ] concat
/data currentfile /ASCII85Decode filter def
/DeviceRGB setcolorspace
<< /ImageType 3 /InterleaveType 2
  /DataDict << /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 8 /Decode [ 0 1 0 1 0 1 ]
    /DataSource data /FlateDecode filter /ImageMatrix [ 2 0 0 -2 0 2 ] >>
  /MaskDict << /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 1 /Decode [ 1 0 ] /ImageMatrix [ 2 0 0 -2 0 2 ] >>
>> img
{image}
Q
q 0 0 1 rg [ 20 0 0 -10 150 140 ] concat
/data currentfile /ASCII85Decode filter def
8 1 true [ 8 0 0 -1 0 1 ] data stencil
{mask}
Q
q currentfile /ASCII85Decode filter /FlateDecode filter /ReusableStreamDecode filter
{mesh}
/meshdata exch def
<< /ShadingType 7 /ColorSpace /DeviceRGB /DataSource meshdata /BitsPerCoordinate 32
   /BitsPerComponent 16 /BitsPerFlag 8 /Decode [ 0 200 0 150 0 1 0 1 0 1 ] >> shfill
currentdict /meshdata undef
Q
Q Q
end
showpage"##,
        mask = ascii85(&[0xF0]),
    );
    let r = open("a PDF-engine exporter", &program);
    let d = &r.document;
    // The tiling pattern is a pattern swatch of its cell.
    assert_eq!(d.patterns.len(), 1);
    let pat = &d.patterns[0];
    assert!(near(pat.tile, Rect::new(0.0, 0.0, 10.0, 10.0)), "{:?}", pat.tile);
    assert!(d.swatch(&pat.name).is_some_and(|s| matches!(s.paint, Paint::Pattern { .. })));
    assert!(all(d).iter().any(|n| matches!(fill(n), Some(Paint::Pattern { .. }))));
    // The stitched gradient, the dashed curve, the type, the masked image, the stencil and the mesh.
    assert!(all(d).iter().any(|n| matches!(fill(n), Some(Paint::Gradient(_)))));
    assert!(all(d).iter().any(|n| stroke(n).is_some_and(|s| s.dash.is_some())));
    assert_eq!(of_kind(d, "Type").len(), 1);
    assert_eq!(of_kind(d, "Image").len(), 2);
    let im = all(d).into_iter().find(|n| matches!(&n.kind, NodeKind::Image(im) if im.width == 2)).unwrap();
    let NodeKind::Image(im) = &im.kind else { panic!() };
    let img = image::load_from_memory(&d.images[&im.key].bytes).unwrap().to_rgba8();
    // Painted where the mask is 1, transparent where it is 0.
    assert_eq!([img.get_pixel(0, 0).0, img.get_pixel(1, 0).0], [[255, 0, 0, 255], [0, 255, 0, 0]]);
    assert_eq!([img.get_pixel(0, 1).0, img.get_pixel(1, 1).0], [[0, 0, 255, 0], [255, 255, 255, 255]]);
    let mesh = of_kind(d, "Mesh");
    assert_eq!(mesh.len(), 1);
    // `cm` turned user space y down, as the document is.
    assert!(near(bounds(&mesh[0]), Rect::new(150.0, 10.0, 190.0, 50.0)), "{:?}", bounds(&mesh[0]));
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

/// Prologs that alias operators with `load`, keep CMYK colour in variables, keep `currentscreen`
/// and replace `setscreen`, draw each object between `save` and `restore`, redefine `showpage`,
/// reencode a font by copying its dictionary without its `FID`, and set type with `ashow` through
/// `makefont` (as CorelDRAW's files do).
#[test]
fn aliased_operators_and_cmyk_variables_read_as_vectors() {
    let program = r##"%%BeginProlog
%%BeginResource: procset DrawingHelpers 1.0 0
/DrawingHelpers 60 dict def DrawingHelpers begin
/bdef { bind def } bind def
/alias { load def } bdef
/mv /moveto alias /ln /lineto alias /cv /curveto alias /cp /closepath alias
/gs /gsave alias /gr /grestore alias
/realshowpage /showpage alias /showpage { } bdef
currentscreen /spot exch def /angle exch def /frequency exch def
/oldscreen /setscreen alias
/screen { oldscreen } bdef
/level2 /languagelevel where { pop languagelevel 2 ge } { false } ifelse def
/C 0 def /M 0 def /Y 0 def /K 0 def
/ink { /K exch def /Y exch def /M exch def /C exch def } bdef
/useink { level2 { C M Y K setcmykcolor } { 1 K sub setgray } ifelse } bdef
/paint { gs useink fill gr newpath } bdef
/line { useink stroke } bdef
/latin { findfont dup length dict begin { 1 index /FID ne { def } { pop pop } ifelse } forall
  /Encoding Encoding 256 array copy def Encoding 233 /eacute put
  currentdict end definefont pop } bdef
/usefont { exch findfont exch makefont setfont } bdef
end
%%EndResource
%%EndProlog
%%BeginSetup
DrawingHelpers begin
2.6 setmiterlimit 1 setflat
60 45 { dup mul exch dup mul add 1 exch sub } screen
/LatinHelvetica /Helvetica latin
%%EndSetup
%%Page: 1 1
save
save 0 1 1 0 ink 10 10 mv 90 10 ln 90 60 ln 10 60 ln cp paint restore
save 1 setlinewidth 1 0 0 0 ink 10 70 mv 50 90 70 90 90 70 cv line restore
save 0 0 0 1 ink useink /LatinHelvetica [ 12 0 0 12 0 0 ] usefont 10 120 mv 1 0 (Spaced) ashow restore
restore
end
showpage
realshowpage"##;
    let r = open("a drawing app", program);
    let d = &r.document;
    assert_eq!(d.color_mode, ColorMode::Cmyk);
    let rect = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::cmyk(0.0, 1.0, 1.0, 0.0))).unwrap();
    assert!(near(bounds(&rect), Rect::new(10.0, 90.0, 90.0, 140.0)), "{:?}", bounds(&rect));
    assert!(all(d).iter().any(|n| stroke(n).is_some_and(|s| s.paint.color() == Some(Color::cmyk(1.0, 0.0, 0.0, 0.0)))));
    let NodeKind::Text(t) = &of_kind(d, "Type")[0].kind else { panic!() };
    assert!(t.plain_text().starts_with("Spaced"));
}

/// Level 3 files from PDF-engine exporters (Affinity Designer's, for one): a language-level check
/// that would `quit`, operator procedures, a gradient as a shading pattern (`makepattern
/// setpattern`) over a sampled function, a spot colour (`Separation`) and `DeviceN` inks with
/// tint transforms, and an image compressed with Flate and a PNG predictor.
#[test]
fn shading_patterns_spot_inks_and_predictors_read_as_vectors() {
    // Two rows of two RGB pixels, PNG-filtered: Sub, then Up.
    let rows = [[1u8, 255, 0, 0, 1, 255, 0], [2, 0, 0, 255, 0, 0, 255]];
    let image = a85_flate(&rows.concat());
    let program = format!(
        r##"%%BeginProlog
/languagelevel where {{ pop languagelevel 3 ge }} {{ false }} ifelse not {{ (Level 3 needed) = quit }} if
/Ops 20 dict def Ops begin
/box {{ 4 -2 roll moveto dup 0 exch rlineto exch 0 rlineto neg 0 exch rlineto closepath }} bind def
/fillbox {{ box fill }} bind def
end
%%EndProlog
%%BeginSetup
/setpagedevice where {{ pop << /PageSize [ 200 150 ] >> setpagedevice }} if
%%EndSetup
%%Page: 1 1
Ops begin
gsave
<< /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB /Coords [ 0 0 100 0 ] /Extend [ true true ]
  /Function << /FunctionType 0 /Domain [ 0 1 ] /Range [ 0 1 0 1 0 1 ] /Size [ 3 ] /BitsPerSample 8
    /DataSource <ff000000ff000000ff> >> >> >> matrix makepattern setpattern
10 10 100 40 fillbox
[ /Separation (Spot Red) /DeviceCMYK {{ dup 0.9 mul exch 0.8 mul 0 0 }} ] setcolorspace
0.5 setcolor 10 60 40 40 fillbox
[ /DeviceN [ /Cyan /Magenta ] /DeviceCMYK {{ 0 0 }} ] setcolorspace
0.3 0.7 setcolor 60 60 40 40 fillbox
gsave 120 60 translate 40 40 scale /DeviceRGB setcolorspace
<< /ImageType 1 /Width 2 /Height 2 /BitsPerComponent 8 /Decode [ 0 1 0 1 0 1 ] /ImageMatrix [ 2 0 0 -2 0 2 ]
   /DataSource currentfile /ASCII85Decode filter << /Predictor 15 /Colors 3 /Columns 2 /BitsPerComponent 8 >> /FlateDecode filter >> image
{image}
grestore
grestore
end
showpage"##
    );
    let r = open("a PDF-engine exporter", &program);
    let d = &r.document;
    let Some(Paint::Gradient(g)) = all(d).into_iter().find_map(|n| fill(&n).cloned()) else { panic!("no gradient") };
    // The sampled function's colours, not its middle one: red, green, blue.
    let at = |t: f32| g.gradient.stops.iter().find(|s| (s.offset - t).abs() < 1e-3).map(|s| s.color.to_rgb_uncalibrated());
    assert_eq!([at(0.0), at(0.5), at(1.0)], [Some([1.0, 0.0, 0.0]), Some([0.0, 1.0, 0.0]), Some([0.0, 0.0, 1.0])]);
    assert!(d.swatch("Spot Red").is_some_and(|s| s.spot));
    assert!(all(d).iter().any(|n| matches!(fill(n), Some(Paint::Solid { swatch: Some(s), .. }) if s == "Spot Red")));
    assert!(all(d).iter().any(|n| fill(n).and_then(Paint::color) == Some(Color::cmyk(0.3, 0.7, 0.0, 0.0))));
    assert_eq!([pixel(d, 0, 0), pixel(d, 1, 0), pixel(d, 0, 1), pixel(d, 1, 1)], [[255, 0, 0, 255], [0, 255, 0, 255], [255, 0, 255, 255], [0, 255, 255, 255]]);
}

/// Prologs that keep the operand and dictionary stack depths and a `save` to put back at the
/// end, negate y in their path procedures, reencode a font to ISO Latin-1 under a name of their
/// own, and stretch type to a width measured with `stringwidth` (as office suites write).
#[test]
fn negated_coordinates_and_fitted_type_read_as_vectors() {
    let program = r##"%%BeginProlog
%%BeginResource: procset PageState 1.0 0
/startstate save def
/startdicts countdictstack def
/startcount count 1 sub def
userdict begin
0 setgray 1 setlinewidth [ ] 0 setdash newpath
/bd { bind def } bind def
/rgb { setrgbcolor } bd
/mt { neg moveto } bd /lt { neg lineto } bd
/curve { 3 { neg 6 2 roll } repeat curveto } bd
/shift { neg translate } bd
/body { findfont dup length dict begin { 1 index /FID ne { def } { pop pop } ifelse } forall
  /Encoding ISOLatin1Encoding def currentdict end /BodyFont exch definefont pop /BodyFont findfont } bd
/fitshow { /str exch def /fitwidth exch def currentpoint matrix currentmatrix
  fitwidth str stringwidth pop div 1 scale str show setmatrix moveto } bd
%%EndResource
%%EndProlog
%%Page: 1 1
matrix currentmatrix
0.1 0.1 scale
0 -1500 shift
/page matrix currentmatrix def
gsave page setmatrix
0.2 0.4 0.8 rgb 100 100 mt 900 100 lt 900 600 lt 100 600 lt closepath eofill
grestore
gsave page setmatrix
10 setlinewidth 0 0 0 rgb 100 800 mt 400 700 600 900 900 800 curve stroke
grestore
gsave page setmatrix
/Helvetica body 120 scalefont setfont 0 0 0 rgb 100 1300 mt 800 (Fitted) fitshow
grestore
setmatrix
count startcount sub { pop } repeat countdictstack startdicts sub { end } repeat startstate restore
%%Trailer
showpage"##;
    let r = open("an office suite", program);
    let d = &r.document;
    let rect = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(0.2, 0.4, 0.8))).unwrap();
    assert!(near(bounds(&rect), Rect::new(10.0, 10.0, 90.0, 60.0)), "{:?}", bounds(&rect));
    assert!(all(d).iter().any(|n| stroke(n).is_some_and(|s| (s.width - 1.0).abs() < 1e-9)));
    let NodeKind::Text(t) = &of_kind(d, "Type")[0].kind else { panic!() };
    assert_eq!(t.plain_text(), "Fitted");
}

/// Programs that capture a dictionary with `//name` (resolved when read, used after the
/// dictionary is gone), probe the interpreter (`gcheck`, `currentglobal`, `/currentdistillerparams
/// where`, an unguarded `pdfmark`), define a resource, and run page content kept between two
/// markers through `SubFileDecode` (as Ghostscript's `eps2write` does), with `selectfont`,
/// `xshow`, `rectfill`, `execform`, a half-tone dictionary and a triangle mesh.
#[test]
fn resolved_names_and_filtered_content_read_as_vectors() {
    let program = r##"%%BeginProlog
save countdictstack mark
/showpage { } def
/setpagedevice { pop } def
%%EndProlog
%%Page: 1 1
4 dict begin
/buf 40 string def
/label { //buf cvs } bind def
/label load
end
/label exch def
20 dict begin
/default { dup where { pop pop } { false def } ifelse } bind def
/Tracing default
/toglobal { dup gcheck not { dup type /dicttype eq { dup length dict copy } if } if } bind def
/currentdistillerparams where { pop } { /setdistillerparams { pop } def } ifelse
[ /Title (Test) /DOCINFO pdfmark
currentglobal true setglobal /Shared 4 dict def setglobal
Shared toglobal pop
42 label pop
/Runner << /Run { cvx exec } >> /ProcSet defineresource pop
/content { currentfile 0 (%endcontent) /SubFileDecode filter /Runner /ProcSet findresource /Run get exec } bind def
<< /HalftoneType 1 /Frequency 60 /Angle 45 /SpotFunction { dup mul exch dup mul add 1 exch sub } >> sethalftone
/Box << /FormType 1 /BBox [ 0 0 20 20 ] /Matrix [ 1 0 0 1 0 0 ] /PaintProc { pop 0 0 1 setrgbcolor 0 0 20 20 rectfill } >> def
content
gsave 1 0 0 setrgbcolor 10 10 80 40 rectfill grestore
/Helvetica 50 selectfont 20 100 moveto (ab) [ 25 0 ] xshow
%endcontent
gsave 120 100 translate Box execform grestore
<< /ShadingType 4 /ColorSpace /DeviceRGB /DataSource [ 0 120 10 1 0 0  0 180 10 0 1 0  0 150 60 0 0 1  1 190 60 1 1 0 ] >> shfill
end
cleartomark countdictstack exch sub { end } repeat restore
showpage"##;
    let r = open("a PostScript converter", program);
    let d = &r.document;
    let red = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(1.0, 0.0, 0.0))).unwrap();
    assert!(near(bounds(&red), Rect::new(10.0, 100.0, 90.0, 140.0)), "{:?}", bounds(&red));
    let form = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(0.0, 0.0, 1.0))).unwrap();
    assert!(near(bounds(&form), Rect::new(120.0, 30.0, 140.0, 50.0)), "{:?}", bounds(&form));
    assert_eq!(of_kind(d, "Type").len(), 1);
    // Two triangles of a free-form mesh, the second on the first one's edge.
    let meshes = of_kind(d, "Mesh");
    assert_eq!(meshes.len(), 2);
    assert!(near(bounds(&meshes[1]), Rect::new(150.0, 90.0, 190.0, 140.0)), "{:?}", bounds(&meshes[1]));
}

/// Procsets that probe the language level and `version` (in `stopped`), switch VM with
/// `currentglobal`/`setglobal`, save and set again the whole graphics state (colour space and
/// colour, `rootfont`, line style, stroke adjustment, colour rendering, overprint, black generation,
/// undercolour removal, colour transfers, half-tone, flatness), create a resource category, keep
/// fonts by VM (`gcheck`), and draw the art with procedures of their own (as Illustrator's EPS
/// files do).
#[test]
fn graphics_state_procsets_read_as_vectors() {
    let program = r##"%%BeginProlog
%%BeginResource: procset StateHelpers 1.0 0
systemdict /setpacking known { currentpacking true setpacking } if
userdict /StateHelpers 40 dict dup begin put
/bdef { bind def } bind def
/swapdef { exch def } bdef
/level /languagelevel where { pop languagelevel } { 1 } ifelse def
/versioned { version cvr pop } stopped not def
/withglobal { currentglobal exch setglobal } bdef
/Saved 24 dict def
/savestate {
  Saved begin
  /space currentcolorspace def
  [ currentcolor ] /comps swapdef
  /font rootfont def
  /width currentlinewidth def /cap currentlinecap def /join currentlinejoin def /miter currentmiterlimit def
  currentdash /offset swapdef /pattern swapdef
  /adjust currentstrokeadjust def
  /rendering currentcolorrendering def
  /over currentoverprint def
  /black currentblackgeneration cvlit def
  /under currentundercolorremoval cvlit def
  [ currentcolortransfer ] /transfers swapdef
  /screen currenthalftone def
  /flat currentflat def
  end
} bdef
/setstate {
  Saved begin
  space setcolorspace comps aload pop setcolor
  font setfont width setlinewidth cap setlinecap join setlinejoin miter setmiterlimit pattern offset setdash
  adjust setstrokeadjust rendering setcolorrendering over setoverprint
  black cvx setblackgeneration under cvx setundercolorremoval
  transfers aload pop setcolortransfer
  screen sethalftone flat setflat
  end
} bdef
currentdict readonly pop
end
systemdict /setpacking known { setpacking } if
%%EndResource
%%BeginResource: procset PageHelpers 1.0 0
userdict /PageHelpers 40 dict dup begin put
/resolution 72 0 matrix defaultmatrix dtransform dup mul exch dup mul add sqrt def
/distilling /product where { pop systemdict /setdistillerparams known } { false } ifelse def
/separations currentpagedevice /Separations 2 copy known { get } { pop pop false } ifelse def
/pagesize currentpagedevice /PageSize get def
/Shapes /Generic /Category findresource dup length dict copy /Category defineresource pop
/p.m { moveto } def /p.l { lineto } def /p.c { curveto } def /p.h { closepath } def
/rgb { setrgbcolor } def /cmyk { setcmykcolor } def
/docsetup { StateHelpers begin true withglobal savestate setglobal end } def
/pagesetup { StateHelpers begin setstate end } def
end
%%EndResource
%%BeginResource: procset FontHelpers 1.0 0
userdict /FontHelpers 10 dict dup begin put
/Global 8 dict def /Local 8 dict def
/keep { dup gcheck { Global } { Local } ifelse 3 1 roll put } bind def
/duplicate { currentglobal exch dup gcheck setglobal dup length dict copy exch setglobal } bind def
/kept { dup Global exch known { Global } { Local } ifelse exch get } bind def
end
%%EndResource
%%EndProlog
%%BeginSetup
PageHelpers /docsetup get exec
FontHelpers begin /Body /Helvetica findfont duplicate keep end
%%EndSetup
%%Page: 1 1
%%BeginPageSetup
PageHelpers /pagesetup get exec
%%EndPageSetup
PageHelpers begin
0 0.94 0.94 0.12 cmyk
10 140 p.m 90 140 p.l 90 90 p.l 10 90 p.l p.h fill
0.2 0.4 0.8 rgb
100 20 p.m 150 80 180 0 190 60 p.c 2 setlinewidth stroke
0 setgray FontHelpers begin /Body kept end 12 scalefont setfont 10 30 moveto (Art) show
end
showpage"##;
    let r = open("a page-layout app", program);
    let d = &r.document;
    let rect = all(d).into_iter().find(|n| fill(n).and_then(Paint::color) == Some(Color::cmyk(0.0, 0.94, 0.94, 0.12))).unwrap();
    assert!(near(bounds(&rect), Rect::new(10.0, 10.0, 90.0, 60.0)), "{:?}", bounds(&rect));
    assert!(all(d).iter().any(|n| stroke(n).is_some_and(|s| s.width == 2.0)));
    assert_eq!(of_kind(d, "Type").len(), 1);
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

/// Dictionaries built between a `mark` procedure and an executable string (`(>>) cvx`, or a
/// Level 1 builder that counts to the mark), and procedures `load`ed by integer keys and run in
/// `stopped` (as Illustrator 8's gradient procset does, in the stock art many EPS files are).
#[test]
fn dictionary_builders_and_executable_strings() {
    let program = r##"%%BeginProlog
/Builders 10 dict def Builders begin
/open systemdict /mark get def
/level1close (counttomark 2 idiv dup dict begin { def } repeat pop currentdict end) cvx def
/close /languagelevel where { pop languagelevel 2 ge } { false } ifelse { (>>) cvx } { /level1close load } ifelse def
end
/Actions 4 dict def Actions begin
0 { 0 1 0 setrgbcolor } def
2 { 0 0 1 setrgbcolor } def
end
/shifted false def
/runaction { Actions begin shifted { 2 add } if load stopped pop end } bind def
%%EndProlog
Builders begin
open /ShadingType 3 /ColorSpace /DeviceRGB
  /Function open /FunctionType 2 /Domain [ 0 1 ] /C0 [ 1 1 0 ] /C1 [ 0 0.5 0 ] /N 1 close
  /Extend [ true true ] /Coords [ 50 50 0 50 50 40 ] close
gsave 10 10 80 80 rectclip shfill grestore
open /Width 3 level1close /Width get 3 eq { 0 runaction 10 10 20 20 rectfill } if
end
(x) cvx xcheck (x) cvx cvlit xcheck not and { 50 50 10 10 rectfill } if
showpage"##;
    let r = open("an illustration app", program);
    let d = &r.document;
    let Some(Paint::Gradient(g)) = all(d).into_iter().find_map(|n| fill(&n).cloned()) else { panic!("no gradient") };
    assert_eq!(g.gradient.kind, astudio_color::vector::GradientKind::Radial);
    // `discard` ran the procedure under key 0 (green), not the one under 2.
    assert!(all(d).iter().any(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(0.0, 1.0, 0.0))));
    assert_eq!(objects(d).len(), 3);
}
