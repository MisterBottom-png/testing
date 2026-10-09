//! The font facts PSD text needs: PhotoCraft's default family and its PostScript-name split
//! (from PhotoCraft's `text/src/fonts.rs`; font lookup itself is `astudio-text`'s [`crate::FontDb`]).

/// Family of new text and of text whose style names none (PhotoCraft's default; bundled).
pub const DEFAULT_FAMILY: &str = "Inter";

/// Result of a PostScript-name lookup.
#[derive(Clone, Debug, PartialEq)]
pub struct ResolvedFont {
    pub family: String,
    pub weight: u16,
    pub italic: bool,
    /// True when the exact face was found; false for a heuristic family guess.
    pub exact: bool,
}

/// Heuristic PostScript-name split: `MyriadPro-BoldIt` → ("Myriad Pro", 700, italic).
pub fn guess_from_postscript(ps: &str) -> ResolvedFont {
    let (fam, style) = ps.split_once('-').unwrap_or((ps, ""));
    let fam = fam.trim_end_matches("MT").trim_end_matches("PS").trim_end_matches("Std").trim_end_matches("Pro");
    let pro = ps.split_once('-').map_or(ps, |p| p.0);
    let suffix = if pro.ends_with("Pro") {
        " Pro"
    } else if pro.ends_with("Std") {
        " Std"
    } else {
        ""
    };
    // Split camel case: "TimesNewRoman" → "Times New Roman".
    let mut family = String::new();
    let chars: Vec<char> = fam.chars().collect();
    for (i, &c) in chars.iter().enumerate() {
        if i > 0 && c.is_uppercase() && (chars[i - 1].is_lowercase() || chars.get(i + 1).is_some_and(|n| n.is_lowercase()) && chars[i - 1].is_uppercase()) {
            family.push(' ');
        }
        family.push(c);
    }
    family.push_str(suffix);
    let s = style.to_lowercase();
    let weight = if s.contains("thin") || s.contains("hairline") {
        100
    } else if s.contains("extralight") || s.contains("ultralight") {
        200
    } else if s.contains("light") {
        300
    } else if s.contains("medium") {
        500
    } else if s.contains("semibold") || s.contains("demibold") || s.contains("demi") {
        600
    } else if s.contains("extrabold") || s.contains("ultrabold") || s.contains("heavy") {
        800
    } else if s.contains("black") {
        900
    } else if s.contains("bold") {
        700
    } else {
        400
    };
    let italic = s.contains("italic") || s.ends_with("it") || s.contains("oblique");
    ResolvedFont { family: family.trim().to_string(), weight, italic, exact: false }
}
