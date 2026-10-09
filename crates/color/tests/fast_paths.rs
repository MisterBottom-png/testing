//! The 8-bit fast paths of the colour engine (P2-12, docs/13-colour-engine.md) keep its accuracy:
//! RGB to CMYK gives exactly what the general table path gives, and RGB to RGB and CMYK to RGB are
//! never further from the exact pipeline than the general path was.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::cms::{Builtin, Intent, Transform, TransformOptions};

fn noise(n: usize, seed: u32) -> Vec<u8> {
    let mut x = seed;
    (0..n)
        .map(|_| {
            x ^= x << 13;
            x ^= x >> 17;
            x ^= x << 5;
            x as u8
        })
        .collect()
}

/// (fast-path output, general-path output, exact output) for `n` random pixels.
fn run(src: Builtin, dst: Builtin, n: usize) -> (Vec<u8>, Vec<u8>, Vec<f32>) {
    let t = Transform::new(src.profile(), dst.profile(), Intent::RelativeColorimetric, false).unwrap();
    let (i, o) = (t.inputs(), t.outputs());
    let px = noise(n * i, 0x9e37_79b9);
    let mut fast = vec![0u8; n * o];
    t.convert_u8(&px, i, &mut fast, o, false);
    // The general path: table evaluation per pixel (what convert_u8 did before the fast paths).
    let mut general = vec![0u8; n * o];
    let mut out = [0.0f32; 16];
    for (s, d) in px.chunks_exact(i).zip(general.chunks_exact_mut(o)) {
        let inp: Vec<f32> = s.iter().map(|v| f32::from(*v) / 255.0).collect();
        t.eval_fast(&inp, &mut out);
        for (k, v) in d.iter_mut().enumerate() {
            *v = (out[k].clamp(0.0, 1.0) * 255.0 + 0.5) as u8;
        }
    }
    let exact_t =
        Transform::with_options(src.profile(), dst.profile(), TransformOptions { intent: Intent::RelativeColorimetric, bpc: false, precise_float: true })
            .unwrap();
    let f: Vec<f32> = px.iter().map(|v| f32::from(*v) / 255.0).collect();
    let mut exact = vec![0.0f32; n * o];
    exact_t.convert_f32(&f, i, &mut exact, o, false);
    (fast, general, exact)
}

/// (sum, max) of 8-bit distances to the rounded exact result.
fn err(out: &[u8], exact: &[f32]) -> (u64, u32) {
    out.iter().zip(exact).fold((0, 0), |(s, m), (a, e)| {
        let d = (i32::from(*a) - (e.clamp(0.0, 1.0) * 255.0).round() as i32).unsigned_abs();
        (s + u64::from(d), m.max(d))
    })
}

#[test]
fn rgb_to_cmyk_is_bit_identical_to_the_general_path() {
    let (fast, general, _) = run(Builtin::Srgb, Builtin::CoatedCmyk, 200_000);
    assert_eq!(fast, general);
}

#[test]
fn rgb_to_rgb_and_cmyk_to_rgb_are_at_least_as_accurate() {
    for (s, d) in [
        (Builtin::Srgb, Builtin::DisplayP3),
        (Builtin::AdobeRgbCompat, Builtin::Srgb),
        (Builtin::ProPhotoCompat, Builtin::Srgb),
        (Builtin::Srgb, Builtin::Rec2020),
        (Builtin::CoatedCmyk, Builtin::Srgb),
    ] {
        let (fast, general, exact) = run(s, d, 200_000);
        let (fs, fm) = err(&fast, &exact);
        let (gs, gm) = err(&general, &exact);
        // The fast path rounds its output exactly; its core values carry the same small error as
        // before, so which rare values land one step off can move: never further, and at most one
        // value in 100,000 more often.
        let slack = exact.len() as u64 / 100_000;
        assert!(fs <= gs + slack && fm <= gm, "{s:?} -> {d:?}: fast sum {fs} max {fm}, general sum {gs} max {gm}");
    }
}

/// The colour study's open note (docs/13, P2-02): absolute colorimetric had no test. A-Studio's
/// built-in RGB profiles are ICC v4 with a D50 media white, so absolute colorimetric equals
/// relative colorimetric between them (VectorCraft's old moxcms path differed for Display P3).
#[test]
fn absolute_colorimetric_equals_relative_for_d50_white_profiles() {
    let opts = |intent| TransformOptions { intent, bpc: false, precise_float: true };
    for (s, d) in [(Builtin::Srgb, Builtin::DisplayP3), (Builtin::Srgb, Builtin::AdobeRgbCompat), (Builtin::DisplayP3, Builtin::Srgb)] {
        let abs = Transform::with_options(s.profile(), d.profile(), opts(Intent::AbsoluteColorimetric)).unwrap();
        let rel = Transform::with_options(s.profile(), d.profile(), opts(Intent::RelativeColorimetric)).unwrap();
        for c in [[1.0f32, 1.0, 1.0], [0.0, 0.0, 0.0], [0.8, 0.2, 0.1], [0.1, 0.5, 0.9]] {
            let (mut a, mut r) = ([0.0f32; 3], [0.0f32; 3]);
            abs.eval(&c, &mut a);
            rel.eval(&c, &mut r);
            assert!(a.iter().zip(&r).all(|(x, y)| (x - y).abs() < 1e-4), "{s:?} -> {d:?} {c:?}: {a:?} vs {r:?}");
        }
    }
}
