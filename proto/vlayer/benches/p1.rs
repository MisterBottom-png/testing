//! P1-04: 24 MP canvas, 1,000 paths; change one path and redraw (dirty tiles + composite).
//! Target: under 100 ms. `cargo bench -p vlayer` (release build).

use criterion::{Criterion, criterion_group, criterion_main};
use photocraft_geom::Rect;
use vlayer::VectorTiles;
use vlayer::bench_doc::{H, Spread, W, document, move_path, vector_mut};

fn p1(c: &mut Criterion) {
    let canvas = Rect::new(0, 0, W, H);
    for spread in [Spread::Scaled, Spread::Sparse] {
        let mut doc = document(1000, spread);
        let mut tiles = VectorTiles::new();
        if let Some(v) = vector_mut(&mut doc) {
            let _ = tiles.redraw(v, canvas, None);
        }
        let mut step = 0usize;
        c.bench_function(&format!("p1_redraw_one_path_{spread:?}"), |b| {
            b.iter(|| {
                step += 1;
                let d = if step.is_multiple_of(2) { 6.0 } else { -6.0 };
                let Some(dirty) = move_path(&mut doc, 500, d, d) else { return };
                if let Some(v) = vector_mut(&mut doc) {
                    let _ = tiles.redraw(v, canvas, Some(dirty));
                }
                let area = vlayer::tile_region(dirty.intersect(&canvas));
                std::hint::black_box(photocraft_compose::render(&doc, area));
            });
        });
    }
}

criterion_group! {
    name = benches;
    config = Criterion::default().sample_size(30);
    targets = p1
}
criterion_main!(benches);
