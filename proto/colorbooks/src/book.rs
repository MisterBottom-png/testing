//! Colour books as VectorCraft swatch libraries.
//!
//! Every book swatch is a spot ink (`spot: true, global: true`) defined in CIE Lab D50. When a
//! book only gives a screen simulation (`#rrggbb`), the Lab definition is computed from it through
//! the active colour settings; that is an approximation, and clipped out-of-gamut inks come out
//! duller than the real ink, but the ink's *name* is what reaches the printer.

use vectorcraft_color::swatch::REGISTRATION;
use vectorcraft_color::{Color, Paint, Swatch, SwatchGroup, SwatchLibrary};
use vectorcraft_doc::Document;

use crate::ase;
use crate::csv;

/// A book: its name, the prefix every swatch name carries, and its rows as CSV text.
#[derive(Clone, Copy, Debug)]
pub struct Book {
    pub name: &'static str,
    pub prefix: &'static str,
    pub csv: &'static str,
}

/// The books shipped with the prototype: the MIT `pantoner` 1.1.2 lists (see `data/README.md`).
pub const BUNDLED: [Book; 4] = [
    Book { name: "Solid Coated", prefix: "PANTONE", csv: include_str!("../data/pantone-coated.csv") },
    Book { name: "Solid Uncoated", prefix: "PANTONE", csv: include_str!("../data/pantone-uncoated.csv") },
    Book { name: "Metallics", prefix: "PANTONE", csv: include_str!("../data/pantone-metallic.csv") },
    Book { name: "Pastels & Neons", prefix: "PANTONE", csv: include_str!("../data/pantone-pastels-neons.csv") },
];

/// Lab (D50) of a `#rrggbb` screen colour through the active colour settings.
pub fn lab_from_hex(hex: &str) -> Option<Color> {
    let c = Color::from_hex(hex)?;
    let l = c.to_lab();
    Some(Color::lab(l.l, l.a, l.b))
}

/// The swatch name for a book code: `186-c` → `PANTONE 186 C`, `warm-gray-1-u` →
/// `PANTONE Warm Gray 1 U`, `186 C` stays `PANTONE 186 C`. A leading word equal to the prefix is
/// dropped so `pantone-yellow-c` is `PANTONE Yellow C`.
pub fn swatch_name(prefix: &str, code: &str) -> String {
    let words: Vec<&str> = code.split(['-', ' ', '_']).filter(|w| !w.is_empty()).collect();
    let mut out: Vec<String> = Vec::new();
    let last = words.len().saturating_sub(1);
    for (i, w) in words.iter().enumerate() {
        if i == 0 && w.eq_ignore_ascii_case(prefix) {
            continue;
        }
        // The finish letter (C, U, M, CP…) is upper case; other words are title case.
        let word = if i == last && w.len() <= 2 && w.chars().all(|c| c.is_ascii_alphabetic()) {
            w.to_ascii_uppercase()
        } else if w.chars().all(|c| c.is_ascii_digit()) {
            w.to_string()
        } else {
            let mut cs = w.chars();
            match cs.next() {
                Some(f) => f.to_uppercase().chain(cs.flat_map(|c| c.to_lowercase())).collect(),
                None => String::new(),
            }
        };
        out.push(word);
    }
    if prefix.is_empty() { out.join(" ") } else { format!("{prefix} {}", out.join(" ")) }
}

fn spot(name: String, color: Color) -> Swatch {
    Swatch { name, paint: Paint::solid(color), global: true, spot: true }
}

impl Book {
    /// The book as a library of Lab spot swatches. Rows without a usable colour are skipped;
    /// a code that repeats keeps its first row.
    pub fn library(&self) -> Result<SwatchLibrary, String> {
        library_from_csv(self.csv, self.name, self.prefix)
    }
}

/// A library from CSV text (see [`csv`]).
pub fn library_from_csv(text: &str, name: &str, prefix: &str) -> Result<SwatchLibrary, String> {
    let rows = csv::read(text)?;
    let mut lib = SwatchLibrary { name: name.into(), ..Default::default() };
    for r in rows {
        let color = match (r.lab, r.hex.as_deref()) {
            (Some([l, a, b]), _) => Color::lab(l, a, b),
            (None, Some(h)) => match lab_from_hex(h) {
                Some(c) => c,
                None => continue,
            },
            (None, None) => continue,
        };
        let name = match r.name {
            Some(n) if !n.trim().is_empty() => swatch_name(prefix, &n),
            _ => swatch_name(prefix, &r.code),
        };
        if name == REGISTRATION || lib.swatch(&name).is_some() {
            continue;
        }
        lib.swatches.push(spot(name, color));
    }
    Ok(lib)
}

fn ase_color(m: ase::Model) -> Color {
    match m {
        ase::Model::Rgb([r, g, b]) => Color::rgb(r, g, b),
        ase::Model::Cmyk([c, m, y, k]) => Color::cmyk(c, m, y, k),
        ase::Model::Lab([l, a, b]) => Color::lab(l, a, b),
        ase::Model::Gray(k) => Color::gray(1.0 - k),
    }
}

/// A library from an ASE file. `all_spot` makes every colour a spot ink (a book), otherwise the
/// file's own kinds are kept (spot → spot, global → global, normal → process).
pub fn library_from_ase(bytes: &[u8], name: &str, all_spot: bool) -> Result<SwatchLibrary, String> {
    let f = ase::read(bytes)?;
    let conv = |e: &ase::Entry| {
        let (global, spot) = match e.kind {
            _ if all_spot => (true, true),
            ase::Kind::Spot => (true, true),
            ase::Kind::Global => (true, false),
            ase::Kind::Normal => (false, false),
        };
        Swatch { name: e.name.clone(), paint: Paint::solid(ase_color(e.model)), global, spot }
    };
    let mut lib = SwatchLibrary { name: name.into(), ..Default::default() };
    let mut names: Vec<String> = Vec::new();
    let mut push = |list: &mut Vec<Swatch>, s: Swatch| {
        if s.name == REGISTRATION || names.contains(&s.name) {
            return;
        }
        names.push(s.name.clone());
        list.push(s);
    };
    for e in &f.colors {
        push(&mut lib.swatches, conv(e));
    }
    for g in &f.groups {
        let mut grp = SwatchGroup { name: g.name.clone(), swatches: vec![] };
        for e in &g.colors {
            push(&mut grp.swatches, conv(e));
        }
        lib.groups.push(grp);
    }
    Ok(lib)
}

fn ase_entry(s: &Swatch) -> Option<ase::Entry> {
    let model = match s.paint.color()? {
        Color::Rgb { r, g, b } => ase::Model::Rgb([r, g, b]),
        Color::Cmyk { c, m, y, k } => ase::Model::Cmyk([c, m, y, k]),
        Color::Lab { l, a, b } => ase::Model::Lab([l, a, b]),
        Color::Gray { k } => ase::Model::Gray(1.0 - k),
    };
    let kind = if s.spot {
        ase::Kind::Spot
    } else if s.global {
        ase::Kind::Global
    } else {
        ase::Kind::Normal
    };
    Some(ase::Entry { name: s.name.clone(), model, kind })
}

/// A library as ASE bytes (solid swatches only: gradients and patterns have no ASE form).
pub fn library_to_ase(lib: &SwatchLibrary) -> Vec<u8> {
    let f = ase::File {
        colors: lib.swatches.iter().filter_map(ase_entry).collect(),
        groups: lib.groups.iter().map(|g| ase::Group { name: g.name.clone(), colors: g.swatches.iter().filter_map(ase_entry).collect() }).collect(),
    };
    ase::write(&f)
}

/// Every bundled book, in menu order. A book whose data fails to parse is left out.
pub fn bundled_books() -> Vec<SwatchLibrary> {
    BUNDLED.iter().filter_map(|b| b.library().ok()).collect()
}

/// Add a book swatch to `doc` and return the name art should link to. An ink that is already in
/// the document (same name, spot) is reused, so adding `PANTONE 186 C` twice never makes a second
/// plate. A process swatch that happens to carry the name is left alone and the ink gets a
/// numbered name, as VectorCraft's own `swatch.library.add` does.
pub fn add_swatch(doc: &mut Document, sw: &Swatch) -> String {
    if let Some(existing) = doc.swatch(&sw.name) {
        if existing.spot && sw.spot {
            return sw.name.clone();
        }
        if existing.paint == sw.paint && existing.spot == sw.spot && existing.global == sw.global {
            return sw.name.clone();
        }
        let name = (2..).map(|i| format!("{} {i}", sw.name)).find(|n| doc.swatch(n).is_none()).unwrap_or_else(|| sw.name.clone());
        doc.swatches.push(Swatch { name: name.clone(), ..sw.clone() });
        return name;
    }
    doc.swatches.push(sw.clone());
    sw.name.clone()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_follow_the_book_convention() {
        assert_eq!(swatch_name("PANTONE", "186-c"), "PANTONE 186 C");
        assert_eq!(swatch_name("PANTONE", "186-u"), "PANTONE 186 U");
        assert_eq!(swatch_name("PANTONE", "warm-gray-1-c"), "PANTONE Warm Gray 1 C");
        assert_eq!(swatch_name("PANTONE", "yellow-0131-c"), "PANTONE Yellow 0131 C");
        assert_eq!(swatch_name("PANTONE", "process-blue-c"), "PANTONE Process Blue C");
        assert_eq!(swatch_name("PANTONE", "pantone-yellow-c"), "PANTONE Yellow C");
        assert_eq!(swatch_name("PANTONE", "186 C"), "PANTONE 186 C");
        assert_eq!(swatch_name("", "Brand Red"), "Brand Red");
    }

    #[test]
    fn hex_becomes_a_lab_definition() {
        let Some(Color::Lab { l, a, b }) = lab_from_hex("#c8102e") else { panic!() };
        // A saturated red: dark-ish, strongly positive a, positive b.
        assert!((40.0..55.0).contains(&l) && a > 55.0 && b > 25.0, "{l} {a} {b}");
        assert!(lab_from_hex("#zz").is_none());
    }

    #[test]
    fn bundled_books_load_with_every_swatch_a_lab_spot() {
        let books = bundled_books();
        assert_eq!(books.len(), 4);
        let counts: Vec<(String, usize)> = books.iter().map(|b| (b.name.clone(), b.len())).collect();
        assert_eq!(counts[0], ("Solid Coated".to_string(), 1341));
        assert_eq!(counts[1], ("Solid Uncoated".to_string(), 1341));
        assert_eq!(counts[2].1, 301);
        assert_eq!(counts[3].1, 210);
        for b in &books {
            assert!(b.iter().all(|s| s.spot && s.global && matches!(s.paint.color(), Some(Color::Lab { .. }))), "{}", b.name);
        }
        let c = books[0].swatch("PANTONE 186 C").unwrap();
        let u = books[1].swatch("PANTONE 186 U").unwrap();
        assert_ne!(c.paint, u.paint, "coated and uncoated differ");
        // Every coated code has its uncoated twin.
        for s in books[0].iter() {
            let twin = format!("{}U", s.name.trim_end_matches('C'));
            assert!(books[1].swatch(&twin).is_some(), "{} has no uncoated twin", s.name);
        }
    }

    #[test]
    fn ase_round_trip_of_a_book_keeps_lab_spots() {
        let lib = BUNDLED[0].library().unwrap();
        let bytes = library_to_ase(&lib);
        let back = library_from_ase(&bytes, "x", false).unwrap();
        assert_eq!(back.len(), lib.len());
        let (a, b) = (lib.swatch("PANTONE 186 C").unwrap(), back.swatch("PANTONE 186 C").unwrap());
        assert!(b.spot && b.global);
        let (Some(Color::Lab { l, a: aa, b: ab }), Some(Color::Lab { l: l2, a: a2, b: b2 })) = (a.paint.color(), b.paint.color()) else { panic!() };
        assert!((l - l2).abs() < 1e-3 && (aa - a2).abs() < 1e-3 && (ab - b2).abs() < 1e-3);
        // A process ASE file imported as a book: every colour becomes a spot.
        let f = ase::File {
            colors: vec![ase::Entry { name: "Ink".into(), model: ase::Model::Cmyk([0.0, 1.0, 1.0, 0.0]), kind: ase::Kind::Normal }],
            groups: vec![],
        };
        let lib = library_from_ase(&ase::write(&f), "Printer", true).unwrap();
        assert!(lib.swatches[0].spot && lib.swatches[0].global);
        let lib = library_from_ase(&ase::write(&f), "Printer", false).unwrap();
        assert!(!lib.swatches[0].spot && !lib.swatches[0].global);
    }

    #[test]
    fn adding_an_ink_twice_makes_one_plate() {
        let mut d = Document::new(100.0, 100.0);
        let book = BUNDLED[0].library().unwrap();
        let ink = book.swatch("PANTONE 186 C").unwrap();
        let before = d.swatches.len();
        assert_eq!(add_swatch(&mut d, ink), "PANTONE 186 C");
        assert_eq!(add_swatch(&mut d, ink), "PANTONE 186 C");
        assert_eq!(d.swatches.len(), before + 1);
        assert_eq!(d.swatches.iter().filter(|s| s.spot).count(), 1);
        // A process swatch with the same name is not hijacked: the ink gets a numbered name.
        let mut d = Document::new(100.0, 100.0);
        d.swatches.push(Swatch { name: "PANTONE 186 C".into(), paint: Paint::solid(Color::BLACK), global: false, spot: false });
        assert_eq!(add_swatch(&mut d, ink), "PANTONE 186 C 2");
    }
}
