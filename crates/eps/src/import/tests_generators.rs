//! The PostScript features EPS files from other apps rely on, one small test each, each read as
//! vectors without a fallback to the preview. The programs are A-Studio's own (P2-15), written
//! from the operators' descriptions in the PostScript Language Reference; none follows another
//! app's prolog.

use astudio_color::vector::{Color, Paint};
use astudio_geom::{Point, Rect};
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

/// Operators given other names, through `load` and through procedures, draw as the operators do.
#[test]
fn renamed_operators_draw() {
    let r = open(
        "test",
        "/F /fill load def /R { rectfill } bind def /N { newpath } def 0 0 1 setrgbcolor N 10 10 moveto 50 10 lineto 30 40 lineto closepath F 60 60 20 20 R",
    );
    let o = objects(&r.document);
    assert_eq!(o.len(), 2);
    assert!(near(bounds(&o[1]), Rect::new(60.0, 70.0, 80.0, 90.0)), "{:?}", bounds(&o[1]));
}

/// A matrix that turns y down (as files written from PDF content start) puts art where its own
/// coordinates say, measured from the top.
#[test]
fn a_y_down_matrix_measures_from_the_top() {
    let r = open("test", "[ 1 0 0 -1 0 150 ] concat 0.5 setgray 30 15 40 25 rectfill");
    assert!(near(bounds(&objects(&r.document)[0]), Rect::new(30.0, 15.0, 70.0, 40.0)));
}

/// A stitching function whose `Encode` array a loop fills is one gradient with the stitched stops.
#[test]
fn stitched_functions_with_a_built_encode_are_gradients() {
    let r = open(
        "test",
        "<< /ShadingType 2 /ColorSpace /DeviceGray /Coords [ 0 0 200 0 ] /Function << /FunctionType 3 /Domain [ 0 1 ] \
         /Functions [ 3 { << /FunctionType 2 /Domain [ 0 1 ] /C0 [ 0 ] /C1 [ 1 ] /N 1 >> } repeat ] /Bounds [ 0.3 0.6 ] \
         /Encode [ 3 { 1 0 } repeat ] >> >> shfill",
    );
    let Some(Paint::Gradient(g)) = objects(&r.document).first().and_then(|n| fill(n).cloned()) else { panic!("no gradient") };
    assert!(g.gradient.stops.len() >= 4, "{:?}", g.gradient.stops);
}

/// A coloured tiling pattern becomes a pattern swatch of its cell.
#[test]
fn tiling_patterns_become_pattern_swatches() {
    let r = open(
        "test",
        "<< /PatternType 1 /PaintType 1 /TilingType 3 /XStep 12 /YStep 6 /BBox [ 0 0 12 6 ] \
         /PaintProc { pop 1 0.5 0 setrgbcolor 0 0 6 6 rectfill } >> matrix makepattern setpattern 0 0 120 60 rectfill",
    );
    let d = &r.document;
    assert_eq!(d.patterns.len(), 1);
    assert!(near(d.patterns[0].tile, Rect::new(0.0, 0.0, 12.0, 6.0)), "{:?}", d.patterns[0].tile);
    assert!(d.swatch(&d.patterns[0].name).is_some());
}

/// Type in a Type 42 font a program defines, through `makefont`, is type.
#[test]
fn type_42_fonts_set_type() {
    let r = open(
        "test",
        "/Mono42 << /FontType 42 /FontMatrix [ 1 0 0 1 0 0 ] /FontBBox [ 0 0 0 0 ] /PaintType 0 \
         /Encoding StandardEncoding /CharStrings << /.notdef 0 >> /sfnts [ <0001000000000000> ] >> definefont \
         [ 9 0 3 9 0 0 ] makefont setfont 40 40 moveto (slant) show",
    );
    let NodeKind::Text(t) = &of_kind(&r.document, "Type")[0].kind else { panic!() };
    assert_eq!(t.plain_text(), "slant");
}

/// An image whose 1-bit mask comes row by row before its colour rows (`InterleaveType 2`) is
/// transparent where the mask says.
#[test]
fn row_interleaved_masks_cut_the_image() {
    // Three pixels a row: the mask row (1 = painted, `Decode [1 0]`), then the colour row.
    let data = a85_flate(&[0b1010_0000, 9, 9, 9, 8, 8, 8, 7, 7, 7, 0b0100_0000, 1, 1, 1, 2, 2, 2, 3, 3, 3]);
    let r = open(
        "test",
        &format!(
            "/DeviceRGB setcolorspace 50 50 translate 60 40 scale \
             << /ImageType 3 /InterleaveType 2 \
             /DataDict << /ImageType 1 /Width 3 /Height 2 /BitsPerComponent 8 /Decode [ 0 1 0 1 0 1 ] /ImageMatrix [ 3 0 0 -2 0 2 ] \
               /DataSource currentfile /ASCII85Decode filter /FlateDecode filter >> \
             /MaskDict << /ImageType 1 /Width 3 /Height 2 /BitsPerComponent 1 /Decode [ 1 0 ] /ImageMatrix [ 3 0 0 -2 0 2 ] >> >> image\n{data}\n"
        ),
    );
    let alpha: Vec<u8> = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1), (2, 1)].iter().map(|&(x, y)| pixel(&r.document, x, y)[3]).collect();
    assert_eq!(alpha, [255, 0, 255, 0, 255, 0]);
}

/// Image data read through a filter of `currentfile`, then closed with `status` and `flushfile`
/// (a stencil mask here): the program goes on after it.
#[test]
fn image_data_closed_with_flushfile() {
    let r = open(
        "test",
        &format!(
            "/stencil {{ imagemask src status {{ src flushfile }} if }} def \
             /src currentfile /ASCII85Decode filter def gsave 1 0 0 setrgbcolor 20 20 translate 40 10 scale \
             8 2 true [ 8 0 0 -2 0 2 ] src stencil\n{}\ngrestore 0 0 1 setrgbcolor 100 100 10 10 rectfill",
            ascii85(&[0x0F, 0xF0])
        ),
    );
    assert_eq!(of_kind(&r.document, "Image").len(), 1);
    assert!(objects(&r.document).iter().any(|n| fill(n).and_then(Paint::color) == Some(Color::rgb(0.0, 0.0, 1.0))));
}

/// Mesh data read once into a `ReusableStreamDecode` stream and used as a shading's source.
#[test]
fn reusable_streams_feed_meshes() {
    let mut points = square(110.0, 60.0, 170.0, 100.0);
    points.extend([(125.0, 70.0), (125.0, 90.0), (155.0, 90.0), (155.0, 70.0)]);
    let data = a85_flate(&patch(&points, &[[0.2, 0.2, 0.2], [0.4, 0.4, 0.4], [0.6, 0.6, 0.6], [0.8, 0.8, 0.8]]));
    let r = open(
        "test",
        &format!(
            "currentfile /ASCII85Decode filter /FlateDecode filter /ReusableStreamDecode filter\n{data}\n/s exch def \
             << /ShadingType 7 /ColorSpace /DeviceRGB /DataSource s /BitsPerCoordinate 32 /BitsPerComponent 16 /BitsPerFlag 8 \
             /Decode [ 0 200 0 150 0 1 0 1 0 1 ] >> shfill"
        ),
    );
    let mesh = of_kind(&r.document, "Mesh");
    assert_eq!(mesh.len(), 1);
    assert!(near(bounds(&mesh[0]), Rect::new(110.0, 50.0, 170.0, 90.0)), "{:?}", bounds(&mesh[0]));
}

/// A Type 3 font whose `BuildGlyph` finds each glyph's procedure by name draws its glyphs as
/// outlines; `stringwidth` measures without drawing, `widthshow` adds to one character's width.
#[test]
fn type_3_glyph_procedures_draw() {
    let program = "/Boxes << /FontType 3 /FontMatrix [ 0.01 0 0 0.01 0 0 ] /FontBBox [ 0 0 100 100 ] \
        /Encoding 256 array dup 0 1 255 { /.notdef put dup } for pop dup 66 /box put \
        /Procs << /.notdef { 0 0 0 0 0 0 setcachedevice } /box { 80 0 0 0 60 60 setcachedevice 0 0 60 60 rectfill } >> \
        /BuildGlyph { exch /Procs get exch 2 copy known not { pop /.notdef } if get exec } \
        /BuildChar { 1 index /Encoding get exch get 1 index /BuildGlyph get exec } >> definefont pop \
        /Boxes 10 selectfont 20 20 moveto (BB) show (B) stringwidth pop 8 eq { 20 60 moveto 5 0 66 (BB) widthshow } if";
    let r = open("test", program);
    let groups = of_kind(&r.document, "Group");
    assert_eq!(groups.len(), 2, "{:?}", all(&r.document).iter().map(|n| n.kind_label()).collect::<Vec<_>>());
    let first: Vec<Rect> = groups[0].children().unwrap().iter().map(|n| bounds(n)).collect();
    // 60 units at 10 pt (0.1 pt a unit), 8 pt apart; `widthshow` puts 5 pt more after each B.
    assert!(near(first[0], Rect::new(20.0, 124.0, 26.0, 130.0)), "{first:?}");
    assert!((first[1].x0 - first[0].x0 - 8.0).abs() < 1e-6, "{first:?}");
    let second: Vec<Rect> = groups[1].children().unwrap().iter().map(|n| bounds(n)).collect();
    assert!((second[1].x0 - second[0].x0 - 13.0).abs() < 1e-6, "{second:?}");
}

/// `glyphshow` draws a glyph by name from a Type 3 font's `CharStrings` procedures.
#[test]
fn glyphshow_draws_named_glyphs() {
    let program = "/Tri << /FontType 3 /FontMatrix [ 0.001 0 0 0.001 0 0 ] /FontBBox [ 0 0 1000 1000 ] /Encoding [ /up ] \
        /CharStrings << /.notdef { } /up { 900 0 0 0 800 800 setcachedevice 0 0 moveto 800 0 lineto 400 800 lineto closepath fill } >> \
        /BuildGlyph { exch /CharStrings get exch 2 copy known not { pop /.notdef } if get exec } >> definefont pop \
        /Tri 50 selectfont 100 20 moveto /up glyphshow";
    let r = open("test", program);
    let glyph = all(&r.document).into_iter().find(|n| n.path_data().is_some()).unwrap();
    assert!(near(bounds(&glyph), Rect::new(100.0, 90.0, 140.0, 130.0)), "{:?}", bounds(&glyph));
}

/// `colorimage` from one procedure reading hexadecimal rows with `readhexstring`.
#[test]
fn colorimage_reads_hexadecimal_rows() {
    let r = open(
        "test",
        "/row 9 string def gsave 10 10 translate 30 10 scale 3 1 8 [ 3 0 0 -1 0 1 ] \
         { currentfile row readhexstring pop } false 3 colorimage\n102030405060708090\ngrestore",
    );
    assert_eq!([pixel(&r.document, 0, 0), pixel(&r.document, 2, 0)], [[16, 32, 48, 255], [112, 128, 144, 255]]);
}

/// Colour kept in variables and set by a procedure that uses CMYK on Level 2 and grey below it.
#[test]
fn colour_procedures_choose_cmyk_or_grey() {
    let program = "/c 0.1 def /m 0.2 def /y 0.3 def /k 0.4 def \
        /level2 /languagelevel where { pop languagelevel 2 ge } { false } ifelse def \
        /ink { level2 { c m y k setcmykcolor } { 1 k sub setgray } ifelse } bind def ink 0 0 50 50 rectfill";
    let r = open("test", program);
    assert_eq!(r.document.color_mode, ColorMode::Cmyk);
    assert_eq!(fill(&objects(&r.document)[0]).and_then(Paint::color), Some(Color::cmyk(0.1, 0.2, 0.3, 0.4)));
}

/// `showpage` and `setscreen` replaced by the program's own procedures, and every object drawn in
/// a `save` … `restore` block of its own.
#[test]
fn replaced_operators_and_saved_objects() {
    let program = "/realshowpage /showpage load def /showpage { } def \
        /setscreen { pop pop pop } def 120 30 { dup mul exch dup mul add 1 exch sub } setscreen \
        save 0.25 setgray 10 10 30 30 rectfill restore save 0.75 setgray 60 10 30 30 rectfill restore \
        showpage realshowpage";
    let o = objects(&open("test", program).document);
    let mut greys: Vec<_> = o.iter().filter_map(|n| fill(n).and_then(Paint::color)).map(|c| c.to_rgb_uncalibrated()[0]).collect();
    greys.sort_by(f32::total_cmp);
    assert_eq!(greys, [0.25, 0.75]);
}

/// A font copied without its `FID`, given another encoding and defined under a new name, sets
/// type; so does `ashow` in a font made with `makefont`.
#[test]
fn reencoded_fonts_set_type() {
    let program = "/Times-Roman findfont dup length dict begin { 1 index /FID eq { pop pop } { def } ifelse } forall \
        /Encoding ISOLatin1Encoding def currentdict end /Latin exch definefont \
        [ 20 0 0 12 0 0 ] makefont setfont 10 100 moveto 1.5 0 (wide) ashow";
    let NodeKind::Text(t) = &of_kind(&open("test", program).document, "Type")[0].kind else { panic!() };
    assert_eq!(t.plain_text(), "wide");
}

/// A gradient as a shading pattern over a sampled (type 0) function keeps the samples as stops.
#[test]
fn shading_patterns_over_sampled_functions() {
    let program = "<< /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceGray /Coords [ 0 0 100 0 ] \
        /Function << /FunctionType 0 /Domain [ 0 1 ] /Range [ 0 1 ] /Size [ 3 ] /BitsPerSample 8 /DataSource <00ff80> >> >> >> \
        matrix makepattern setpattern 0 0 100 100 rectfill";
    let Some(Paint::Gradient(g)) = objects(&open("test", program).document).first().and_then(|n| fill(n).cloned()) else { panic!() };
    let greys: Vec<f32> = g.gradient.stops.iter().map(|s| s.color.to_rgb_uncalibrated()[0]).collect();
    assert!(greys.contains(&1.0) && greys.first() == Some(&0.0), "{greys:?}");
}

/// `Separation` colours become spot swatches; `DeviceN` colours their alternate's colour.
#[test]
fn separation_and_devicen_inks() {
    let program = "[ /Separation (Gold Ink) /DeviceCMYK { 0 exch dup 0.3 mul exch 0 } ] setcolorspace 0.8 setcolor 0 0 20 20 rectfill \
        [ /DeviceN [ /Cyan /Black ] /DeviceCMYK { 0 0 3 -1 roll } ] setcolorspace 0.5 0.25 setcolor 30 0 20 20 rectfill";
    let d = open("test", program).document;
    assert!(d.swatch("Gold Ink").is_some_and(|s| s.spot));
    assert!(objects(&d).iter().any(|n| fill(n).and_then(Paint::color) == Some(Color::cmyk(0.5, 0.0, 0.0, 0.25))));
}

/// Image data through Flate with a PNG predictor (Average and Paeth rows).
#[test]
fn png_predictors_undo() {
    // One RGB pixel a row, so each row's left and upper-left neighbours are zero.
    let data = a85_flate(&[3, 40, 60, 80, 4, 2, 2, 2]);
    let r = open(
        "test",
        &format!(
            "gsave 10 10 translate 10 20 scale /DeviceRGB setcolorspace << /ImageType 1 /Width 1 /Height 2 /BitsPerComponent 8 \
             /Decode [ 0 1 0 1 0 1 ] /ImageMatrix [ 1 0 0 -2 0 2 ] /DataSource currentfile /ASCII85Decode filter \
             << /Predictor 10 /Colors 3 /Columns 1 >> /FlateDecode filter >> image\n{data}\ngrestore"
        ),
    );
    // Average: half the pixel above (none). Paeth with only an upper neighbour: that neighbour.
    assert_eq!([pixel(&r.document, 0, 0), pixel(&r.document, 0, 1)], [[40, 60, 80, 255], [42, 62, 82, 255]]);
}

/// A level check that would stop on an older interpreter lets the rest run.
#[test]
fn level_checks_pass() {
    let o = objects(&open("test", "/languagelevel where { pop languagelevel 3 lt { stop } if } if 0 0 9 9 rectfill").document);
    assert_eq!(o.len(), 1);
}

/// Procedures that negate y draw y down from a translated origin.
#[test]
fn procedures_that_negate_y() {
    let program = "0 150 translate /mv { neg moveto } def /ln { neg lineto } def \
        /cv { 3 { 6 -1 roll 6 -1 roll neg } repeat curveto } def \
        0.1 0.6 0.3 setrgbcolor 40 10 mv 90 10 ln 90 35 ln 40 35 ln closepath fill 40 60 mv 60 50 70 80 90 60 cv stroke";
    let o = objects(&open("test", program).document);
    assert!(near(bounds(&o[0]), Rect::new(40.0, 10.0, 90.0, 35.0)), "{:?}", bounds(&o[0]));
    assert!(bounds(&o[1]).y0 >= 50.0 && bounds(&o[1]).y1 <= 80.0, "{:?}", bounds(&o[1]));
}

/// The operand and dictionary stacks cut back to depths saved at the start, then `restore`.
#[test]
fn stacks_cut_back_to_saved_depths() {
    let program = "/vm save def /ops count def /dicts countdictstack def \
        7 8 9 3 dict begin 0 0 30 30 rectfill \
        count ops sub { pop } repeat countdictstack dicts sub { end } repeat vm restore";
    assert_eq!(objects(&open("test", program).document).len(), 1);
}

/// Type stretched to a width measured with `stringwidth`.
#[test]
fn type_fitted_with_stringwidth() {
    let program = "/Helvetica 10 selectfont 20 20 moveto gsave 150 (fit me) stringwidth pop div 1 scale (fit me) show grestore";
    let NodeKind::Text(t) = &of_kind(&open("test", program).document, "Type")[0].kind else { panic!() };
    assert_eq!(t.plain_text(), "fit me");
}

/// Page content kept as data up to a marker and run through `SubFileDecode`; the file goes on
/// after the marker.
#[test]
fn content_run_from_a_subfile() {
    let program = "currentfile 0 (%%ContentEnd) /SubFileDecode filter cvx exec\n\
        0.2 0.2 0.9 setrgbcolor 5 5 40 10 rectfill\n%%ContentEnd\n0.9 0.2 0.2 setrgbcolor 5 30 40 10 rectfill";
    assert_eq!(objects(&open("test", program).document).len(), 2);
}

/// A procedure set defined as a resource and run from it.
#[test]
fn procset_resources_run() {
    let program = "/Tools << /Square { 0 0 25 25 rectfill } >> /ProcSet defineresource pop /Tools /ProcSet findresource /Square get exec";
    assert_eq!(objects(&open("test", program).document).len(), 1);
}

/// Probes for a distiller, for the VM of a dictionary and an unguarded `pdfmark` all go through.
#[test]
fn distiller_probes_and_pdfmark() {
    super::tests::check("/currentdistillerparams where { pop false } { true } ifelse");
    super::tests::check("[ /Author (A-Studio tests) /DOCINFO pdfmark 5 dict gcheck pop true");
}

/// A half-tone dictionary is accepted; a form drawn with `execform` lands where it is placed.
#[test]
fn halftones_and_forms() {
    let program = "<< /HalftoneType 1 /Frequency 100 /Angle 15 /SpotFunction { pop } >> sethalftone \
        /Tile << /FormType 1 /BBox [ 0 0 16 16 ] /Matrix [ 1 0 0 1 0 0 ] /PaintProc { pop 0 0 16 16 rectfill } >> def \
        gsave 60 70 translate Tile execform grestore";
    let o = objects(&open("test", program).document);
    assert!(near(bounds(&o[0]), Rect::new(60.0, 64.0, 76.0, 80.0)), "{:?}", bounds(&o[0]));
}

/// `xshow` places each character by its own width; a free-form mesh given as an array draws its
/// triangles.
#[test]
fn xshow_and_array_meshes() {
    let r = open("test", "/Courier 20 selectfont 10 10 moveto (abc) [ 30 30 30 ] xshow");
    assert_eq!(of_kind(&r.document, "Type").len(), 1);
    let r = open("test", "<< /ShadingType 4 /ColorSpace /DeviceGray /DataSource [ 0 10 10 0  0 50 10 1  0 30 40 0.5  2 10 40 1 ] >> shfill");
    assert_eq!(of_kind(&r.document, "Mesh").len(), 2);
}

/// What procedures that keep and restore the graphics state ask of the interpreter. Each
/// `current…` operator's answer is taken by its `set…` operator and asked again (colour rendering,
/// half-tone, transfers, black generation and undercolour removal as procedures, `rootfont`;
/// device settings are accepted and kept as they are). VM switches with `setglobal` and
/// `currentglobal`, a font's VM with `gcheck`, and level and `version` probes in `stopped` work too.
/// Then art is drawn through procedures that keep and restore line width, flatness and colour.
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
    let r = open("test", program);
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

/// A dictionary closed by an executable string: `(>>) cvx` run where `>>` would be.
#[test]
fn executable_strings_close_dictionaries() {
    super::tests::check("/shut (>>) cvx def << /a 1 /b 2 shut /b get 2 eq");
    let r = open(
        "test",
        "/shut (>>) cvx def << /ShadingType 3 /ColorSpace /DeviceGray /Coords [ 60 60 0 60 60 30 ] \
         /Function << /FunctionType 2 /Domain [ 0 1 ] /C0 [ 1 ] /C1 [ 0 ] /N 2 shut shut shfill",
    );
    let Some(Paint::Gradient(g)) = objects(&r.document).first().and_then(|n| fill(n).cloned()) else { panic!("no gradient") };
    assert_eq!(g.gradient.kind, astudio_color::vector::GradientKind::Radial);
}

/// A Level 1 dictionary builder: a string, made executable, that turns the pairs above a mark
/// into a dictionary.
#[test]
fn level_1_dictionary_builders() {
    super::tests::check(
        "/todict (counttomark 2 idiv dup dict exch { dup 4 2 roll put } repeat exch pop) cvx def \
         mark /x 3 /y 4 todict dup /x get 3 eq exch /y get 4 eq and",
    );
}

/// A procedure fetched with `load` under an integer key and run in `stopped`.
#[test]
fn procedures_under_integer_keys() {
    super::tests::check("/Steps 2 dict def Steps begin 4 { 1 } def end Steps begin 4 load end stopped not exch 1 eq and");
}
