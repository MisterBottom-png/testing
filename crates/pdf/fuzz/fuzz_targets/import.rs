//! PDF (and PDF-compatible .ai) bytes: page info and import, then render and export.
#![no_main]

use libfuzzer_sys::fuzz_target;

/// Whatever opens must also draw and export without a panic (VectorCraft's `import_fuzz`
/// `survive`): a small render of the first artboard and an SVG export.
fn survive(d: &astudio_vdoc::Document) {
    if let Some(ab) = d.artboards.first() {
        let scale = (64.0 / ab.rect.width().max(ab.rect.height()).max(1.0)).min(1.0);
        if astudio_render::raster_size(ab.rect, scale).is_ok() {
            let _ = astudio_render::Renderer::new().render_region(d, ab.rect, scale, true).to_png();
        }
    }
    let _ = astudio_svg::export(d, &astudio_svg::ExportOptions::default());
}

fuzz_target!(|data: &[u8]| {
    let _ = astudio_pdf::info(data, None);
    let _ = astudio_pdf::editing(data);
    if let Ok(r) = astudio_pdf::import_with_report(data, &astudio_pdf::ImportOptions::default()) {
        survive(&r.document);
        let _ = astudio_pdf::export(&r.document, &astudio_pdf::PdfOptions::default());
    }
});
