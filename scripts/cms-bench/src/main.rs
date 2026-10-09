//! Speed and accuracy: A-Studio's engine (astudio-color, with the P2-12 fast paths), PhotoCraft cms
//! and moxcms on the same profile bytes (A-Studio colour study, docs/13-colour-engine.md).
use moxcms::{ColorProfile, Layout, RenderingIntent, TransformOptions as MoxOpts};
use photocraft_cms::{Builtin, Intent, Transform, TransformOptions};
use rayon::prelude::*;
use std::time::Instant;

const W: usize = 6000;
const H: usize = 4000;

fn noise(n: usize) -> Vec<u8> {
    let mut x = 0x9e37_79b9u32;
    (0..n)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            x as u8
        })
        .collect()
}

fn fastest(v: Vec<f64>) -> f64 {
    v.into_iter().fold(f64::INFINITY, f64::min)
}

/// Fastest of seven runs after a warm-up (the least disturbed by other load on a shared machine).
fn time<F: FnMut()>(mut f: F) -> f64 {
    f(); // warm-up
    fastest(
        (0..7)
            .map(|_| {
                let t = Instant::now();
                f();
                t.elapsed().as_secs_f64() * 1000.0
            })
            .collect(),
    )
}

/// Error of an 8-bit result against the exact float pipeline (rounded), in 8-bit steps.
fn err(out: &[u8], exact: &[f32]) -> (u32, f64, f64) {
    let d: Vec<u32> = out.iter().zip(exact).map(|(a, e)| (*a as f32 - (e.clamp(0.0, 1.0) * 255.0).round()).abs() as u32).collect();
    let mut s = d.clone();
    s.sort_unstable();
    (*s.last().unwrap(), d.iter().map(|v| *v as f64).sum::<f64>() / d.len() as f64, s[s.len() * 999 / 1000] as f64)
}

fn case(name: &str, src_b: Builtin, dst_b: Builtin, sc: usize, dc: usize, sl: Layout, dl: Layout, bpc: bool) {
    use astudio_color::cms as a;
    let (sp, dp) = (src_b.profile(), dst_b.profile());
    let id = |b: Builtin| a::Builtin::from_id(b.id()).expect("same built-ins");
    let (asp, adp) = (id(src_b).profile(), id(dst_b).profile());
    let n = W * H;
    let src = noise(n * sc);
    // PhotoCraft: build + convert (rayon on all cores), and on one thread.
    let t0 = Instant::now();
    let pc = Transform::new(sp, dp, Intent::RelativeColorimetric, bpc).unwrap();
    let pc_build = t0.elapsed().as_secs_f64() * 1000.0;
    let mut pc_out = vec![0u8; n * dc];
    let pc_mt = time(|| pc.convert_u8(&src, sc, &mut pc_out, dc, false));
    let one = rayon::ThreadPoolBuilder::new().num_threads(1).build().unwrap();
    let pc_st = one.install(|| time(|| pc.convert_u8(&src, sc, &mut pc_out, dc, false)));
    // moxcms: same profile bytes, single call (single thread), and split into rows over rayon.
    let ms = ColorProfile::new_from_slice(&sp.to_bytes()).unwrap();
    let md = ColorProfile::new_from_slice(&dp.to_bytes()).unwrap();
    let opts = MoxOpts { rendering_intent: RenderingIntent::RelativeColorimetric, ..Default::default() };
    let t1 = Instant::now();
    let mx = ms.create_transform_8bit(sl, &md, dl, opts).unwrap();
    let mx_build = t1.elapsed().as_secs_f64() * 1000.0;
    let mut mx_out = vec![0u8; n * dc];
    let mx_st = time(|| mx.transform(&src, &mut mx_out).unwrap());
    let mx_mt = time(|| {
        src.par_chunks(W * sc).zip(mx_out.par_chunks_mut(W * dc)).for_each(|(s, d)| mx.transform(s, d).unwrap());
    });
    // Exact reference: PhotoCraft's precise float pipeline on a 1 MP sample.
    let m = 1_000_000;
    let fs: Vec<f32> = src[..m * sc].iter().map(|v| *v as f32 / 255.0).collect();
    let mut exact = vec![0f32; m * dc];
    let pcf = Transform::with_options(sp, dp, TransformOptions { intent: Intent::RelativeColorimetric, bpc, ..Default::default() }).unwrap();
    pcf.convert_f32(&fs, sc, &mut exact, dc, false);
    // A-Studio: same build and conversion.
    let at = a::Transform::new(asp, adp, a::Intent::RelativeColorimetric, bpc).unwrap();
    let mut a_out = vec![0u8; n * dc];
    let a_mt = time(|| at.convert_u8(&src, sc, &mut a_out, dc, false));
    let a_st = one.install(|| time(|| at.convert_u8(&src, sc, &mut a_out, dc, false)));
    let (amax, amean, a999) = err(&a_out[..m * dc], &exact);
    let (pmax, pmean, p999) = err(&pc_out[..m * dc], &exact);
    let (mmax, mmean, m999) = err(&mx_out[..m * dc], &exact);
    println!("{name} (24 MP, bpc {bpc})");
    println!("  build ms      pc {pc_build:8.1}   mox {mx_build:8.1}");
    println!("  1 thread ms   astudio {a_st:8.1}   pc {pc_st:8.1}   mox {mx_st:8.1}   astudio/mox {:.2}", a_st / mx_st);
    println!("  all cores ms  astudio {a_mt:8.1}   pc {pc_mt:8.1}   mox {mx_mt:8.1}   astudio/mox {:.2}", a_mt / mx_mt);
    println!("  error vs exact (8-bit steps): astudio max {amax} mean {amean:.3} p99.9 {a999}   pc max {pmax} mean {pmean:.3} p99.9 {p999}   mox max {mmax} mean {mmean:.3} p99.9 {m999}");
}

fn main() {
    println!("threads: {}", rayon::current_num_threads());
    case("sRGB -> Display P3, RGB8", Builtin::Srgb, Builtin::DisplayP3, 3, 3, Layout::Rgb, Layout::Rgb, false);
    case("sRGB -> Coated CMYK, RGB8 -> CMYK8", Builtin::Srgb, Builtin::CoatedCmyk, 3, 4, Layout::Rgb, Layout::Rgba, false);
    case("Coated CMYK -> sRGB, CMYK8 -> RGB8", Builtin::CoatedCmyk, Builtin::Srgb, 4, 3, Layout::Rgba, Layout::Rgb, false);
}
