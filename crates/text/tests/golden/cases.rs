// The golden paragraphs (P2-10), shared by `tests/golden_paragraphs.rs` (A-Studio's engine) and
// `scripts/goldens/paragraphs-vectorcraft` (VectorCraft's own, at the pinned commit), which
// writes `tests/data/golden_paragraphs.txt`. The including file names the document and geometry
// crates `doc` and `geom` and gives `craft_font`, the bytes of a craft-fonts font.

use crate::doc::{CharStyle, Justify, ParaDirection, ParaStyle, TextKind, TextObject, TextRun};
use crate::geom::{Point, Rect, shapes};

/// A paragraph: its name, the fonts it needs from craft-fonts (file under `fonts/`), and the
/// text object.
pub struct Case {
    pub name: &'static str,
    pub craft_fonts: &'static [&'static str],
    pub object: TextObject,
}

fn area(text: &str, style: CharStyle, frame: Rect) -> TextObject {
    let mut t = TextObject::point(Point::ZERO, text, style);
    t.kind = TextKind::Area { frame: shapes::rectangle(frame) };
    t
}

pub fn cases() -> Vec<Case> {
    let serif = CharStyle { font_family: "Source Serif 4".into(), size: 11.0, ..CharStyle::default() };
    let mut latin = area(
        "Typography: the office’s AVAILABLE “quoted” text, justified across a narrow column so that \
         words hyphenate, ligatures form (fi, fl, ffi) and kerning pairs (AV, To, Wa) close up. \
         A second sentence keeps the paragraph going over several more lines.\nA new paragraph, \
         indented.",
        serif.clone(),
        Rect::new(10.0, 10.0, 170.0, 400.0),
    );
    latin.runs.push(TextRun { text: " Bold-ish tail in a larger size.".into(), style: CharStyle { size: 15.0, tracking: 40.0, ..serif } });
    latin.para = ParaStyle { justify: Justify::JustifyLeft, hyphenate: true, first_line_indent: 12.0, ..ParaStyle::default() };

    let mut arabic = area(
        "مرحبا بالعالم. هذا نص عربي من اليمين إلى اليسار، فيه رقم 2026 وكلمة PDF في وسطه، ويلتف على عدة أسطر.",
        CharStyle { font_family: "Noto Sans Arabic".into(), size: 16.0, ..CharStyle::default() },
        Rect::new(0.0, 0.0, 180.0, 300.0),
    );
    arabic.para = ParaStyle { justify: Justify::Right, direction: Some(ParaDirection::RightToLeft), ..ParaStyle::default() };

    let mut japanese = area(
        "縦書きの段落です。「括弧」と、句読点。10月の数字は縦中横になり、漢字とかなは直立し、Latinは横に寝ます。",
        CharStyle { font_family: "BIZ UDMincho".into(), size: 14.0, ..CharStyle::default() },
        Rect::new(0.0, 0.0, 120.0, 150.0),
    );
    japanese.vertical = true;

    vec![
        Case { name: "latin", craft_fonts: &[], object: latin },
        Case { name: "arabic", craft_fonts: &["noto-sans-arabic/NotoSansArabic.ttf"], object: arabic },
        Case { name: "japanese-vertical", craft_fonts: &["biz-ud-mincho/BIZUDMincho-Regular.ttf"], object: japanese },
    ]
}

/// The layout as golden lines: one per line (baseline, extent) and one per glyph (source byte,
/// glyph id, pen position, advance, line, direction and the transform that draws it, which
/// carries tate-chu-yoko, upright and sideways turns, mark offsets and scaling): positions to
/// 1/1000 pt, the transform's scale and turn to six decimals.
pub fn dump(name: &str, l: &crate::Layout) -> String {
    let mut s = format!("case {name} vertical={}\n", l.vertical);
    for (i, line) in l.lines.iter().enumerate() {
        s += &format!("line {i} baseline={:.3} x0={:.3} x1={:.3}\n", line.baseline, line.x0, line.x1);
    }
    for g in &l.glyphs {
        let m = g.xf.as_coeffs();
        s += &format!(
            "glyph byte={} gid={} x={:.3} y={:.3} adv={:.3} line={} rtl={} xf={:.6},{:.6},{:.6},{:.6},{:.3},{:.3}\n",
            g.byte, g.gid, g.origin.x, g.origin.y, g.advance, g.line, g.rtl, m[0], m[1], m[2], m[3], m[4], m[5]
        );
    }
    s
}
