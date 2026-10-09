//! Values from files and command parameters must never crash the document model (AGENTS.md: never
//! crash). Each test here panicked before P2-13's fixes.

use super::*;
use crate::live::{GradientMesh, MeshPoint, grid_points};
use astudio_geom::{Point, Rect};

fn mesh(rows: u32, cols: u32, points: usize) -> GradientMesh {
    let p = MeshPoint { p: Point::ZERO, color: color::Color::WHITE, opacity: 1.0, handles: Default::default() };
    GradientMesh { rows, cols, points: vec![p; points] }
}

#[test]
fn huge_mesh_sizes_are_invalid_not_a_crash() {
    for (r, c) in [(u32::MAX, u32::MAX), (65_535, 65_535), (u32::MAX, 1), (5_000, 5_000)] {
        let m = mesh(r, c, 0);
        assert!(!m.is_valid(), "{r}x{c}");
        assert!(m.quads(1).is_empty());
    }
    // A valid mesh still tessellates; a big one gets fewer quads per patch, never gigabytes.
    assert_eq!(mesh(2, 3, 12).quads(2).len(), 2 * 3 * 4);
    let big = mesh(300, 300, 301 * 301);
    assert!(big.is_valid() && big.quads(64).len() <= GradientMesh::MAX_QUADS);
}

#[test]
fn mesh_edit_on_a_damaged_mesh_does_nothing() {
    let mut m = mesh(5, 1, 4); // rows/cols do not match the 4 points
    assert!(!m.remove_point_lines(2));
    assert_eq!((m.rows, m.cols, m.points.len()), (5, 1, 4));
}

#[test]
fn grid_points_are_capped() {
    let r = Rect::new(0.0, 0.0, 10.0, 10.0);
    assert_eq!(grid_points(r, 2, 3).len(), 12);
    assert_eq!(grid_points(r, u32::MAX, u32::MAX).len(), (live::MAX_GRID_LINES as usize + 1).pow(2));
}

#[test]
fn id_counters_from_a_file_do_not_overflow() {
    let mut d = Document::new(100.0, 100.0);
    d.next_id = u64::MAX;
    let _ = (d.alloc_id(), d.alloc_id());
    let mut d = Document::new(100.0, 100.0);
    if let Some(g) = d.graphic_styles.first_mut() {
        g.id = u32::MAX;
    }
    let _ = d.next_graphic_style_id();
    assert_eq!(d.graphic_style_id(usize::MAX), 0, "no such style: no id");
}

/// Embedded images are decoded within A-Studio's own limits: a PNG header claiming a huge size is
/// refused before any pixel memory is allocated.
#[test]
fn oversized_embedded_images_are_refused() {
    let mut png = Vec::new();
    image::RgbaImage::new(2, 2).write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).unwrap();
    assert!(crate::pixels::decode(&png).is_some());
    // IHDR width/height live at bytes 16..24; claim 100,000 x 100,000 (the CRC no longer matches,
    // which must not matter: the size check comes first or the decode fails, never a 40 GB buffer).
    png[16..20].copy_from_slice(&100_000u32.to_be_bytes());
    png[20..24].copy_from_slice(&100_000u32.to_be_bytes());
    assert!(crate::pixels::decode(&png).is_none());
}
