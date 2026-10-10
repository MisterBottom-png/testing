//! Buffers of the wrong size don't stop the app (P2-20 review): each of these asserted, or
//! panicked on a short buffer, before.

use crate::content_aware::{FillOptions, fill_with};
use crate::inpaint::{CompleteParams, complete_with};
use crate::poisson::{seamless_clone, solve_membrane};
use crate::pyramid::blend;
use crate::segment::RgbImage;
use crate::segment::maxflow::Graph;
use astudio_raster::Interrupt;

#[test]
fn inpaint_refuses_mismatched_buffers() {
    let r = complete_with(4, 4, 3, &[0.0; 10], &[true; 16], &CompleteParams::default(), &Interrupt::NONE);
    assert!(matches!(r, Ok(None)));
    let r = complete_with(4, 4, 3, &[0.0; 48], &[true; 3], &CompleteParams::default(), &Interrupt::NONE);
    assert!(matches!(r, Ok(None)));
}

#[test]
fn content_aware_fill_returns_mismatched_buffers_unfilled() {
    let img = [0.25f32; 10];
    let r = fill_with(4, 4, 3, &img, &[true; 16], &[true; 16], &FillOptions::default(), &Interrupt::NONE);
    assert_eq!(r.ok().as_deref(), Some(&img[..]));
    let img = [0.25f32; 48];
    let r = fill_with(4, 4, 3, &img, &[true; 16], &[false; 2], &FillOptions::default(), &Interrupt::NONE);
    assert_eq!(r.ok().as_deref(), Some(&img[..]));
}

#[test]
fn pyramid_blend_returns_the_first_image_on_mismatch() {
    let a = [0.5f32; 12];
    let b = [1.0f32; 12];
    assert_eq!(blend(2, 2, 3, &[&a, &b], &[vec![1.0; 4]], 3), a.to_vec(), "one weight map short");
    assert_eq!(blend(2, 2, 3, &[&a[..5], &b], &[vec![1.0; 4], vec![1.0; 4]], 3), a[..5].to_vec());
    assert!(blend(2, 2, 3, &[], &[vec![1.0; 4]], 3).is_empty());
}

#[test]
fn poisson_leaves_mismatched_buffers_alone() {
    let mut v = vec![0.5f32; 9];
    solve_membrane(4, 4, &[true; 16], &mut v);
    assert_eq!(v, vec![0.5; 9]);
    let dst = [0.75f32; 48];
    assert_eq!(seamless_clone(4, 4, 3, &[0.0; 47], &dst, &[true; 16]), dst.to_vec());
    assert_eq!(seamless_clone(4, 4, 3, &[0.0; 48], &dst, &[true; 15]), dst.to_vec());
}

#[test]
fn a_short_rgba_buffer_is_padded() {
    let img = RgbImage::from_rgba(&[[1.0, 0.0, 0.0, 1.0]], 2, 2);
    assert_eq!(img.at(0, 0), [1.0, 0.0, 0.0]);
    assert_eq!(img.at(1, 1), [0.5; 3]);
}

#[test]
fn a_self_edge_is_ignored() {
    let mut g = Graph::with_capacity(2, 2);
    g.add_edge(1, 1, 1.0, 1.0);
    g.add_edge(0, 1, 1.0, 1.0);
}
