// Run: cd scripts/goldens/paragraphs-vectorcraft && CRAFT_FONTS_DIR=<craft-fonts checkout> \
//   CARGO_TARGET_DIR=../../../target/goldens cargo run -q > ../../../crates/text/tests/data/golden_paragraphs.txt.new
// (then put the comment lines of the old file back on top). Needs upstream/ and craft-fonts
// (scripts/bootstrap.sh --fonts).
//
// Lays out the golden paragraphs (crates/text/tests/golden/cases.rs: Latin, Arabic, Japanese
// vertical) with VectorCraft's own text engine, compiled here unchanged, on the bundled fonts plus
// the craft-fonts each case names, with system font fallback off: the golden for A-Studio's P2-10
// test.
use vectorcraft_doc as doc;
use vectorcraft_geom as geom;
use vectorcraft_text::TextLayout as Layout;

#[path = "../../../../crates/text/tests/golden/cases.rs"]
mod cases;

fn main() {
    let dir = std::env::var("CRAFT_FONTS_DIR").expect("set CRAFT_FONTS_DIR to a craft-fonts checkout");
    for c in cases::cases() {
        let db = vectorcraft_text::FontDb::with_font_dirs(vec![]);
        db.set_system_fallback(false);
        for f in c.craft_fonts {
            db.add_font(std::fs::read(format!("{dir}/fonts/{f}")).expect("craft font"));
        }
        print!("{}", cases::dump(c.name, &vectorcraft_text::layout(&db, &c.object)));
    }
}
