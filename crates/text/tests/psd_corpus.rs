//! Type layers in the real-file corpus (`corpus/psd`, gitignored; feature `corpus`, fetched by
//! `scripts/fetch-corpus.sh psd`; a missing corpus fails). Ported from PhotoCraft's
//! `io/tests/text_corpus.rs`: the same strict model round trip (P2-05 done_when), and its second
//! part, each layer redrawn against Photoshop's cached pixels (P2-18). Its `corpus_tysh_lossless`
//! and the PSD-file half of `created_text_layer_roundtrips_through_psd` need PSD import and
//! export (P5-03).
#![cfg(feature = "corpus")]
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::path::{Path, PathBuf};

use astudio_psd::resources::ids;
use astudio_psd::{PsdFile, ResolutionInfo};
use astudio_text::psd;

fn collect(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    for e in rd.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect(&p, out);
        } else if p.extension().and_then(|e| e.to_str()).is_some_and(|e| e.eq_ignore_ascii_case("psd") || e.eq_ignore_ascii_case("psb")) {
            out.push(p);
        }
    }
}

/// The document resolution as PhotoCraft's PSD import reads it (72 dpi when absent).
fn dpi(file: &PsdFile) -> f32 {
    file.resources
        .iter()
        .find(|r| r.id == ids::RESOLUTION_INFO)
        .and_then(|r| ResolutionInfo::from_bytes(&r.data).ok())
        .map_or(72.0, |ri| (ri.h_res() * if ri.h_res_unit == 2 { 2.54 } else { 1.0 }) as f32)
}

#[test]
fn corpus_text_layers_round_trip() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../corpus/psd");
    assert!(root.is_dir(), "{} is missing: run `scripts/fetch-corpus.sh psd`", root.display());
    let mut files = Vec::new();
    collect(&root, &mut files);
    files.sort();
    let (mut n, mut exact, mut files_with_text) = (0, 0, 0);
    for f in files {
        let bytes = std::fs::read(&f).unwrap();
        if !bytes.windows(4).any(|w| w == b"TySh") {
            continue;
        }
        let name = f.strip_prefix(&root).unwrap_or(&f).display().to_string();
        let Ok(file) = PsdFile::from_bytes(&bytes) else {
            continue;
        };
        let dpi = dpi(&file);
        let txt2 = file.global_blocks.iter().find(|b| &b.key == b"Txt2").and_then(|b| psd::parse_txt2(&b.data));
        let mut any = false;
        for rec in file.layers() {
            let Some(block) = rec.block(b"TySh") else { continue };
            n += 1;
            any = true;
            let layer = String::from_utf8_lossy(&rec.name).into_owned();
            let mut t = psd::text_layer_from_tysh(&block.data, dpi).unwrap_or_else(|| panic!("{name}/{layer}: TySh does not parse"));
            if let Some(txt2) = &txt2 {
                psd::apply_txt2(&mut t, &block.data, txt2);
            }
            // As PhotoCraft's PSD import does: the original block is kept, and writing patches it,
            // so Photoshop-only settings survive.
            t.psd_raw = Some(std::sync::Arc::new(block.data.clone()));
            assert!(!t.runs.is_empty(), "{name}/{layer}: no style runs parsed");
            assert_eq!(t.runs.iter().map(|r| r.len).sum::<usize>().min(t.text.len()), t.text.len(), "{name}/{layer}: runs cover text");
            let st = &t.runs[0].style;
            assert!(st.size_pt > 0.0 && st.postscript_name.is_some(), "{name}/{layer}: {st:?}");
            // Round trip of the model through our own TySh writer.
            let rebuilt = psd::build_tysh(&t, dpi, None);
            let mut back = psd::text_layer_from_tysh(&rebuilt, dpi).unwrap();
            if let Some(txt2) = &txt2 {
                psd::apply_txt2(&mut back, &rebuilt, txt2);
            }
            let mut diff = Vec::new();
            if back.text != t.text {
                diff.push("text");
            }
            if back.char_runs() != t.char_runs() {
                diff.push("character runs");
            }
            if back.paragraph_runs() != t.paragraph_runs() {
                diff.push("paragraph runs");
            }
            if back.shape != t.shape {
                diff.push("shape");
            }
            if diff.is_empty() {
                exact += 1;
            } else {
                println!("{name}/{layer}: {} differ", diff.join(", "));
            }
        }
        files_with_text += usize::from(any);
    }
    println!("text layers: {n} in {files_with_text} files, {exact} round-trip exactly");
    assert!(n > 0, "the corpus has text layers");
    // PhotoCraft's rate: every text layer (21 of 21 on its pinned corpus, docs/baseline.md).
    assert_eq!(exact, n, "every text layer round-trips exactly, as in PhotoCraft");
}

/// Each text layer redrawn with this machine's fonts against the pixels Photoshop cached for it
/// (PhotoCraft's second half of `corpus_text_layers`, P2-18): ink placed and sized within
/// PhotoCraft's tolerance (centre within a quarter of the ink height, left edge within half,
/// height 0.6 to 1.6 times), and a width check of our own. The fonts usually differ (Arial, Myriad Pro and the rest fall back),
/// so overlap (IoU) is printed, not asserted. PhotoCraft gets every layer on the pinned corpus.
#[test]
fn corpus_text_layers_redraw_where_photoshop_drew_them() {
    use astudio_color::PixelFormat;
    use astudio_text::{FontDb, system_font_dirs};
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../corpus/psd");
    assert!(root.is_dir(), "{} is missing: run `scripts/fetch-corpus.sh psd`", root.display());
    let db = FontDb::with_font_dirs(system_font_dirs());
    db.load_system_fonts();
    let mut files = Vec::new();
    collect(&root, &mut files);
    files.sort();
    let (mut n, mut good, mut off) = (0, 0, Vec::new());
    for f in files {
        let bytes = std::fs::read(&f).unwrap();
        if !bytes.windows(4).any(|w| w == b"TySh") {
            continue;
        }
        let name = f.strip_prefix(&root).unwrap_or(&f).display().to_string();
        let Ok(file) = PsdFile::from_bytes(&bytes) else { continue };
        if file.header.depth != 8 {
            continue;
        }
        let dpi = dpi(&file);
        let txt2 = file.global_blocks.iter().find(|b| &b.key == b"Txt2").and_then(|b| psd::parse_txt2(&b.data));
        for rec in file.layers() {
            let Some(block) = rec.block(b"TySh") else { continue };
            let Some(mut t) = psd::text_layer_from_tysh(&block.data, dpi) else { continue };
            if let Some(txt2) = &txt2 {
                psd::apply_txt2(&mut t, &block.data, txt2);
            }
            // Photoshop's cached pixels: the layer's transparency.
            let Ok(alpha) = rec.decode_channel(-1, 8, file.header.version) else { continue };
            let Ok((w, h)) = rec.rect.size() else { continue };
            let mut ps = (i32::MAX, i32::MAX, i32::MIN, i32::MIN);
            for y in 0..h {
                for x in 0..w {
                    if alpha.get(y * w + x).is_some_and(|a| *a > 0) {
                        let (px, py) = (rec.rect.left + x as i32, rec.rect.top + y as i32);
                        ps = (ps.0.min(px), ps.1.min(py), ps.2.max(px + 1), ps.3.max(py + 1));
                    }
                }
            }
            if ps.0 > ps.2 {
                continue;
            }
            n += 1;
            let (_, out) = astudio_text::render::render_layer(&db, &t, dpi, PixelFormat::RGBA8);
            let ob = out.surface.content_bounds();
            let union = astudio_geom::pixel::Rect::new(ps.0.min(ob.x0), ps.1.min(ob.y0), ps.2.max(ob.x1), ps.3.max(ob.y1));
            let ours = out.surface.read_region(union);
            let ch = out.surface.channels();
            let (uw, uh) = (union.width() as usize, union.height() as usize);
            let (mut inter, mut uni) = (0f32, 0f32);
            for y in 0..uh {
                for x in 0..uw {
                    let (px, py) = (union.x0 + x as i32, union.y0 + y as i32);
                    let inside = px >= rec.rect.left && py >= rec.rect.top && px < rec.rect.left + w as i32 && py < rec.rect.top + h as i32;
                    let theirs = if inside { f32::from(alpha[(py - rec.rect.top) as usize * w + (px - rec.rect.left) as usize]) / 255.0 } else { 0.0 };
                    let mine = ours.get((y * uw + x) * ch + ch - 1).copied().unwrap_or(0.0);
                    inter += theirs.min(mine);
                    uni += theirs.max(mine);
                }
            }
            let iou = if uni > 0.0 { inter / uni } else { 1.0 };
            let ph = (ps.3 - ps.1).max(1) as f32;
            let dy = ((ps.1 + ps.3) - (ob.y0 + ob.y1)) as f32 / 2.0;
            let dx0 = (ps.0 - ob.x0) as f32;
            let dh = (ob.y1 - ob.y0) as f32 / ph;
            // And its width: the substitute fonts keep it within 0.8 to 1.3 times Photoshop's
            // (PhotoCraft's own range on this corpus: 0.89 to 1.27; P2-18 review), or, for tiny
            // text where a pixel of antialiasing counts, within half the ink height of it.
            let (ow, pw) = ((ob.x1 - ob.x0) as f32, (ps.2 - ps.0).max(1) as f32);
            let width_ok = (0.8..1.3).contains(&(ow / pw)) || (ow - pw).abs() <= 0.5 * ph;
            let ok = dy.abs() <= 0.25 * ph && dx0.abs() <= 0.5 * ph && (0.6..1.6).contains(&dh) && width_ok;
            let layer = rec.name();
            println!(
                "{name:40} {layer:16} {:?} ps=({}, {}, {}, {}) ours=({}, {}, {}, {}) iou={iou:.2} dy={dy:+.1} dx0={dx0:+.1} h×{dh:.2} {}",
                t.shape,
                ps.0,
                ps.1,
                ps.2 - ps.0,
                ps.3 - ps.1,
                ob.x0,
                ob.y0,
                ob.x1 - ob.x0,
                ob.y1 - ob.y0,
                if ok { "ok" } else { "OFF" }
            );
            if ok {
                good += 1;
            } else {
                off.push(format!("{name}/{layer}"));
            }
        }
    }
    println!("text layers: {n}, geometry within tolerance: {good}");
    assert!(n > 0, "the corpus has text layers");
    assert!(off.is_empty(), "placed differently from Photoshop: {off:?}");
}
