//! Type layers in the real-file corpus (`corpus/psd`, gitignored; feature `corpus`, fetched by
//! `scripts/fetch-corpus.sh psd`; a missing corpus fails). Ported from PhotoCraft's
//! `io/tests/text_corpus.rs`: the same strict model round trip (P2-05 done_when). PhotoCraft's
//! second part, re-rendering each layer against Photoshop's cached pixels, needs text rendering
//! into tiles (P2-08) and joins there; its `corpus_tysh_lossless` and the PSD-file half of
//! `created_text_layer_roundtrips_through_psd` need PSD import and export (P5-03).
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
