//! P3-05's exit test: both upstream example plug-ins load in the one host, unchanged (their bytes
//! as PhotoCraft and VectorCraft built them), and run; each ABI refuses the other's entry point.
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use astudio_color::PixelFormat;
use astudio_geom::pixel::Rect;
use astudio_plugins::{Abi, Error, Kind, Limits, Plugin};
use astudio_raster::Surface;
use serde_json::{Value, json};

/// PhotoCraft's Invert (photocraft@e5e3e39 crates/plugins/tests/fixtures/invert.wasm).
const UPSTREAM_INVERT: &[u8] = include_bytes!("fixtures/upstream/invert.wasm");
/// VectorCraft's Desaturate (vectorcraft@8b036df crates/plugins/tests/fixtures/desaturate.wasm).
const UPSTREAM_DESATURATE: &[u8] = include_bytes!("fixtures/upstream/desaturate.wasm");
/// The same two, rebuilt from `crates/plugins/example-invert` and `crates/plugins/example`.
const INVERT: &[u8] = include_bytes!("fixtures/invert.wasm");
const DESATURATE: &[u8] = include_bytes!("fixtures/desaturate.wasm");

fn red_square() -> Surface {
    let mut s = Surface::new(PixelFormat::RGBA8);
    for y in 0..4 {
        for x in 0..4 {
            s.write_pixel(x, y, &[1.0, 0.0, 0.0, 1.0]);
        }
    }
    s
}

fn inverts(p: &Plugin) {
    let out = p.apply(&red_square(), Rect::new(0, 0, 4, 4), None, &json!({})).unwrap();
    assert_eq!(out.pixel(2, 2), vec![0.0, 1.0, 1.0, 1.0]);
}

fn desaturates(p: &Plugin) {
    let input = json!({"objects": [{"id": 3, "type": "path", "fills": [
        {"type": "solid", "color": {"model": "rgb", "r": 1.0, "g": 0.0, "b": 0.0}}]}]});
    let out: Value = serde_json::from_slice(&p.run(input.to_string().as_bytes(), br#"{"amount": 100}"#).unwrap()).unwrap();
    let c = &out["objects"][0]["fills"][0]["color"];
    assert!((c["r"].as_f64().unwrap() - 0.2126).abs() < 1e-9 && c["r"] == c["g"] && c["g"] == c["b"], "{c}");
}

#[test]
fn both_upstream_example_plugins_load_and_run() {
    let invert = Plugin::load(UPSTREAM_INVERT, Limits::default()).unwrap();
    assert_eq!((invert.abi(), invert.id(), invert.manifest().kind), (Abi::Pixel, "org.photocraft.example.invert", Kind::Filter));
    inverts(&invert);
    let desaturate = Plugin::load(UPSTREAM_DESATURATE, Limits::default()).unwrap();
    assert_eq!((desaturate.abi(), desaturate.id(), desaturate.manifest().kind), (Abi::Vector, "org.vectorcraft.example.desaturate", Kind::Filter));
    desaturates(&desaturate);
}

#[test]
fn the_rebuilt_examples_carry_astudio_ids_and_work_the_same() {
    let invert = Plugin::load(INVERT, Limits::default()).unwrap();
    assert_eq!((invert.abi(), invert.id()), (Abi::Pixel, "astudio.example.invert"));
    inverts(&invert);
    let desaturate = Plugin::load(DESATURATE, Limits::default()).unwrap();
    assert_eq!((desaturate.abi(), desaturate.id()), (Abi::Vector, "astudio.example.desaturate"));
    desaturates(&desaturate);
}

#[test]
fn each_abi_refuses_the_other_entry_point() {
    let invert = Plugin::load(INVERT, Limits::default()).unwrap();
    assert!(matches!(invert.run(br#"{"objects":[]}"#, b"{}"), Err(Error::Abi(_))));
    let desaturate = Plugin::load(DESATURATE, Limits::default()).unwrap();
    assert!(matches!(desaturate.apply(&red_square(), Rect::new(0, 0, 4, 4), None, &json!({})), Err(Error::Abi(_))));
}

#[test]
fn a_module_must_implement_exactly_one_abi() {
    let neither = wat::parse_str(r#"(module (memory (export "memory") 1))"#).unwrap();
    assert!(matches!(Plugin::load(&neither, Limits::default()), Err(Error::Abi(m)) if m.contains("neither")));
    let both = wat::parse_str(
        r#"(module (memory (export "memory") 1)
             (func (export "pc_abi_version") (result i32) (i32.const 1))
             (func (export "vc_abi_version") (result i32) (i32.const 1)))"#,
    )
    .unwrap();
    assert!(matches!(Plugin::load(&both, Limits::default()), Err(Error::Abi(m)) if m.contains("both")));
}

#[test]
fn a_vector_plugin_with_a_huge_overlap_is_refused_by_apply_not_a_crash() {
    // Before the P3-05 review fix this panicked with "attempt to multiply with overflow": the
    // overlap of a vector manifest went unchecked into the band arithmetic.
    let manifest = r#"{"id":"x.y","name":"X","kind":"filter","overlap":1073741824,"area":"canvas"}"#;
    let bytes = wat::parse_str(astudio_plugins::wat::module(manifest, "(i64.const -1)", "", 1)).unwrap();
    let p = Plugin::load(&bytes, Limits::default()).unwrap();
    assert_eq!(p.abi(), Abi::Vector);
    assert!(matches!(p.apply(&red_square(), Rect::new(0, 0, 4, 4), None, &json!({})), Err(Error::Abi(_))));
    assert!(p.output_area(&red_square(), Rect::new(0, 0, 4, 4), None).is_empty());
}
