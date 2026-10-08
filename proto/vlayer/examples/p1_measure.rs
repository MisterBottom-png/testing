//! P1-04 numbers for docs/baseline.md: `cargo run --release -p vlayer --example p1_measure`.
//! Medians; the redraw is measured over 21 edits, the first render over 3 runs.

use std::time::Instant;

use photocraft_geom::Rect;
use vlayer::VectorTiles;
use vlayer::bench_doc::{H, Spread, W, document, move_path, vector_mut};

fn median(mut v: Vec<f64>) -> f64 {
    v.sort_by(f64::total_cmp);
    v.get(v.len() / 2).copied().unwrap_or(f64::NAN)
}

fn ms(t: Instant) -> f64 {
    t.elapsed().as_secs_f64() * 1000.0
}

/// Peak resident memory of this process (Linux), in MB.
fn peak_rss_mb() -> Option<f64> {
    let s = std::fs::read_to_string("/proc/self/status").ok()?;
    let kb: f64 = s.lines().find(|l| l.starts_with("VmHWM:"))?.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb / 1024.0)
}

fn main() {
    let canvas = Rect::new(0, 0, W, H);
    println!(
        "canvas {W} x {H} px ({:.1} MP), 1000 paths, {} CPU threads",
        f64::from(W) * f64::from(H) / 1e6,
        std::thread::available_parallelism().map_or(0, |n| n.get())
    );
    for spread in [Spread::Scaled, Spread::Sparse] {
        let mut first = Vec::new();
        let mut doc = document(1000, spread);
        let mut tiles = VectorTiles::new();
        let mut cached = 0;
        for _ in 0..3 {
            let mut d = document(1000, spread);
            let mut t = VectorTiles::new();
            let start = Instant::now();
            if let Some(v) = vector_mut(&mut d) {
                cached = t.redraw(v, canvas, None).map_or(0, |s| s.tiles_cached);
            }
            first.push(ms(start));
        }
        if let Some(v) = vector_mut(&mut doc) {
            let _ = tiles.redraw(v, canvas, None);
        }
        let start = Instant::now();
        std::hint::black_box(photocraft_compose::render(&doc, canvas));
        let full_composite = ms(start);

        let (mut redraw, mut composite, mut total, mut redrawn) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        for step in 0..21usize {
            let d = if step.is_multiple_of(2) { 6.0 } else { -6.0 };
            let i = 100 + 37 * step;
            let t0 = Instant::now();
            let Some(dirty) = move_path(&mut doc, i, d, d) else { continue };
            let mut n = 0;
            if let Some(v) = vector_mut(&mut doc) {
                n = tiles.redraw(v, canvas, Some(dirty)).map_or(0, |s| s.tiles_rendered);
            }
            let t1 = Instant::now();
            std::hint::black_box(photocraft_compose::render(&doc, vlayer::tile_region(dirty.intersect(&canvas))));
            redraw.push((t1 - t0).as_secs_f64() * 1000.0);
            composite.push(ms(t1));
            total.push(ms(t0));
            redrawn.push(n as f64);
        }
        println!(
            "{spread:?}: first render {:.0} ms ({cached} non-empty tiles of 384, cache {:.0} MB); full composite {:.0} ms",
            median(first),
            cached as f64 * 0.25,
            full_composite
        );
        println!(
            "{spread:?}: change one path -> redraw {:.1} ms + composite {:.1} ms = {:.1} ms (median of {}; {} tiles redrawn, median)",
            median(redraw),
            median(composite),
            median(total),
            redrawn.len(),
            median(redrawn)
        );
    }
    if let Some(mb) = peak_rss_mb() {
        println!("peak memory {mb:.0} MB");
    }
}
