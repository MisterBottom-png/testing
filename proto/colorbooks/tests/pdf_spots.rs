//! The prototype's exit test: a swing tag with `PANTONE 186 C` at 100 % and 40 % and
//! `PANTONE 186 U` at 100 %, picked from the bundled books, exported as PDF/X-1a and PDF/X-4 with
//! unmodified VectorCraft, comes back with both inks as named separations at their tints.

use std::time::Instant;

use colorbooks::{add_swatch, bundled_books};
use vectorcraft_color::{Color, Paint};
use vectorcraft_doc::{Appearance, AppearanceItem, ColorMode, Document, Node, NodeKind};
use vectorcraft_geom::{Rect, shapes};
use vectorcraft_pdf::{ImportOptions, PdfOptions, Standard, export_with_report, import_with_report};

fn add_rect(d: &mut Document, p: Paint) {
    let x = d.node_count() as f64 * 30.0;
    let n = Node::path(d.alloc_id(), shapes::rectangle(Rect::new(x, 0.0, x + 20.0, 40.0)), Appearance::basic(p, Paint::None, 0.0));
    let l = d.layers[0].id;
    d.insert(Some(l), usize::MAX, n).unwrap();
}

fn fills(d: &Document) -> Vec<Paint> {
    let NodeKind::Layer { children, .. } = &d.layers[0].kind else { panic!() };
    children.iter().filter_map(|n| n.appearance.items.iter().find_map(|i| if let AppearanceItem::Fill(f) = i { Some(f.paint.clone()) } else { None })).collect()
}

fn solid(p: &Paint) -> (Color, Option<&str>, f32) {
    match p {
        Paint::Solid { color, swatch, tint } => (*color, swatch.as_deref(), *tint),
        other => panic!("{other:?}"),
    }
}

fn opts(standard: Standard) -> PdfOptions {
    let mut o = PdfOptions::uncompressed();
    (o.settings.standard, o.settings.compatibility) = (standard, standard.version());
    o.created = Some(1_700_000_000);
    o
}

/// A swing tag: 50 x 90 mm in points, CMYK document, two book inks.
fn swing_tag() -> Document {
    let books = bundled_books();
    let coated = books.iter().find(|b| b.name == "Solid Coated").unwrap();
    let uncoated = books.iter().find(|b| b.name == "Solid Uncoated").unwrap();
    let mut d = Document::new_with_mode(141.7, 255.1, ColorMode::Cmyk);
    d.title = "Swing tag".into();
    let c = add_swatch(&mut d, coated.swatch("PANTONE 186 C").unwrap());
    let c_again = add_swatch(&mut d, coated.swatch("PANTONE 186 C").unwrap());
    assert_eq!(c, c_again, "the second pick reuses the ink");
    let u = add_swatch(&mut d, uncoated.swatch("PANTONE 186 U").unwrap());
    for (name, tint) in [(c.as_str(), 1.0), (c.as_str(), 0.4), (u.as_str(), 1.0)] {
        let p = d.tint_paint(name, tint).unwrap();
        add_rect(&mut d, p);
    }
    assert_eq!(d.swatches.iter().filter(|s| s.spot).count(), 2, "two plates, not three");
    d
}

#[test]
fn two_book_inks_survive_pdf_x1a_and_x4_as_named_separations() {
    let d = swing_tag();
    for standard in [Standard::PdfX1a, Standard::PdfX4] {
        let r = export_with_report(&d, &opts(standard)).unwrap_or_else(|e| panic!("{standard:?}: {e}"));
        let text = String::from_utf8_lossy(&r.bytes).into_owned();
        // The ink names are in the file as separation colour spaces.
        for name in ["/Separation/PANTONE#20186#20C", "/Separation/PANTONE#20186#20U"] {
            assert!(text.contains(name), "{standard:?}: {name} missing");
        }
        assert!(text.contains("/S/GTS_PDFX"), "{standard:?}: output intent");
        // PDF/X-1a keeps CMYK alternates; PDF/X-4 carries the Lab definition.
        let lab_alt = text.contains("[/Lab");
        assert_eq!(lab_alt, standard == Standard::PdfX4, "{standard:?}: Lab alternate {lab_alt}");
        // Read back: both inks are spot swatches, the art links to them at its tint.
        let back = import_with_report(&r.bytes, &ImportOptions::default()).unwrap().document;
        let f = fills(&back);
        assert_eq!(f.len(), 3, "{standard:?}");
        for (p, name, tint) in [(&f[0], "PANTONE 186 C", 1.0), (&f[1], "PANTONE 186 C", 0.4), (&f[2], "PANTONE 186 U", 1.0)] {
            let (_, link, t) = solid(p);
            assert_eq!(link, Some(name), "{standard:?}");
            assert!((t - tint).abs() < 0.01, "{standard:?}: {name} tint {t}");
            let sw = back.swatch(name).unwrap();
            assert!(sw.spot && sw.global, "{standard:?}: {name} is a spot swatch");
        }
        assert_eq!(back.swatches.iter().filter(|s| s.spot).count(), 2, "{standard:?}: two plates");
        if standard == Standard::PdfX4 {
            assert!(matches!(back.swatch("PANTONE 186 C").unwrap().paint.color(), Some(Color::Lab { .. })), "X-4 keeps Lab");
        }
    }
}

#[test]
fn all_books_load_fast() {
    let t = Instant::now();
    let books = bundled_books();
    let elapsed = t.elapsed();
    let n: usize = books.iter().map(|b| b.len()).sum();
    eprintln!("loaded {n} swatches in {} books in {elapsed:?}", books.len());
    assert_eq!(n, 3193);
    assert!(elapsed.as_millis() < 1000, "{elapsed:?}");
}
