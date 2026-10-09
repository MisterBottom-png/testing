//! CSV colour books. The header names the columns; the order does not matter:
//!
//! - `code` or `pantone`: the ink's code, e.g. `186-c`, `186 C`, `Warm Gray 1 C` (required);
//! - `hex`: `#rrggbb` screen simulation (used when there is no Lab);
//! - `l`, `a`, `b`: CIE Lab D50, L 0..100 (preferred when present);
//! - `name`: a display name that replaces the code in the swatch name (optional).
//!
//! Lines that do not parse are skipped (a line may start with `#rrggbb`, so `#` is not a comment
//! marker). Sizes are capped so a bad file cannot exhaust memory.

/// Longest line and most rows a book may have.
pub const MAX_LINE: usize = 1024;
pub const MAX_ROWS: usize = 100_000;

/// One row of a CSV book.
#[derive(Clone, Debug, PartialEq)]
pub struct Row {
    pub code: String,
    pub name: Option<String>,
    pub hex: Option<String>,
    /// CIE Lab D50: L 0..100, a and b about -128..127.
    pub lab: Option<[f32; 3]>,
}

/// Is `text` a CSV book (a header with a `code` or `pantone` column)?
pub fn sniff(text: &str) -> bool {
    let first = text.trim_start_matches('\u{feff}').lines().next().unwrap_or_default();
    let cols = columns(first);
    cols.iter().any(|c| c == "code" || c == "pantone")
}

/// Split one CSV line on commas or semicolons, trimming spaces and quotes.
fn columns(line: &str) -> Vec<String> {
    let sep = if line.contains(';') && !line.contains(',') { ';' } else { ',' };
    line.split(sep).map(|c| c.trim().trim_matches('"').trim().to_ascii_lowercase()).collect()
}

fn cells(line: &str) -> Vec<String> {
    let sep = if line.contains(';') && !line.contains(',') { ';' } else { ',' };
    line.split(sep).map(|c| c.trim().trim_matches('"').trim().to_string()).collect()
}

/// Read the rows of a CSV book. Errors only when the header has no code column.
pub fn read(text: &str) -> Result<Vec<Row>, String> {
    let text = text.trim_start_matches('\u{feff}');
    let mut lines = text.lines();
    let header = lines.next().ok_or("empty file")?;
    let cols = columns(header);
    let find = |names: &[&str]| cols.iter().position(|c| names.contains(&c.as_str()));
    let code = find(&["code", "pantone", "id"]).ok_or("no `code` or `pantone` column")?;
    let (hex, name) = (find(&["hex", "html", "rgb"]), find(&["name"]));
    let (l, a, b) = (find(&["l", "lab_l", "l*"]), find(&["a", "lab_a", "a*"]), find(&["b", "lab_b", "b*"]));
    let mut rows = Vec::new();
    for line in lines {
        if rows.len() >= MAX_ROWS {
            break;
        }
        if line.len() > MAX_LINE || line.trim().is_empty() {
            continue;
        }
        let c = cells(line);
        let Some(code) = c.get(code).filter(|s| !s.is_empty()) else { continue };
        let get = |i: Option<usize>| i.and_then(|i| c.get(i)).filter(|s| !s.is_empty()).cloned();
        let num = |i: Option<usize>| get(i).and_then(|s| s.parse::<f32>().ok()).filter(|v| v.is_finite());
        let lab = match (num(l), num(a), num(b)) {
            (Some(l), Some(a), Some(b)) if (0.0..=100.0).contains(&l) && a.abs() <= 200.0 && b.abs() <= 200.0 => Some([l, a, b]),
            _ => None,
        };
        let hex = get(hex).filter(|h| {
            let h = h.strip_prefix('#').unwrap_or(h);
            (h.len() == 6 || h.len() == 3) && h.chars().all(|c| c.is_ascii_hexdigit())
        });
        if lab.is_none() && hex.is_none() {
            continue;
        }
        rows.push(Row { code: code.clone(), name: get(name), hex, lab });
    }
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_hex_and_lab_columns_in_any_order() {
        let text = "\u{feff}hex,pantone\n#f6eb61,100-c\n#c8102e,186-c\nnope,187-c\n,\n";
        assert!(sniff(text));
        let rows = read(text).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[1], Row { code: "186-c".into(), name: None, hex: Some("#c8102e".into()), lab: None });
        let text = "Code;Name;L;a;b\n186 C;Brand Red;47.5;68.2;43.9\n9999 C;Out of range;120;0;0\n";
        let rows = read(text).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].name.as_deref(), Some("Brand Red"));
        assert_eq!(rows[0].lab, Some([47.5, 68.2, 43.9]));
        assert!(read("hex\n#000000\n").is_err(), "no code column");
        assert!(!sniff("GIMP Palette\n"));
    }

    #[test]
    fn caps_rows_and_skips_long_lines() {
        let mut text = String::from("code,hex\n");
        text.push_str(&format!("long,#{}\n", "0".repeat(MAX_LINE)));
        for i in 0..(MAX_ROWS + 10) {
            text.push_str(&format!("{i}-c,#000000\n"));
        }
        let rows = read(&text).unwrap();
        assert_eq!(rows.len(), MAX_ROWS);
        assert_eq!(rows[0].code, "0-c");
    }
}
