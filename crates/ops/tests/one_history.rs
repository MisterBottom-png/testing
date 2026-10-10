//! One undo history across pixel tiles and vector node trees (P3-03): any mix of pixel and vector
//! edits undoes and redoes to exactly the documents it went through, vector layers included (their
//! history is the whole-document snapshot, not VectorCraft's own undo); no two states of a vector
//! layer share a revision, so a cache keyed on one can't show another state's pixels; and the
//! memory budget counts vector art.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::HashMap;
use std::sync::Arc;

use astudio_doc::{Color, ColorMode, Document, Layer, SampleType, Size};
use astudio_geom::{PathData, Rect};
use astudio_ops::{History, LayerTarget};
use astudio_vdoc::node::{LayerColor, Node};
use astudio_vdoc::{Appearance, Document as VectorDocument};
use proptest::prelude::*;

fn base() -> Document {
    Document::with_background("h", Size::new(300, 200), ColorMode::Rgb, SampleType::U8, Color::WHITE)
}

fn square(v: &mut VectorDocument, x: f64) -> Node {
    let id = v.alloc_id();
    Node::path(id, PathData::from_bezpath(&astudio_geom::shapes::rectangle(Rect::new(x, 10.0, x + 40.0, 50.0)).to_bezpath()), Appearance::default())
}

#[derive(Clone, Debug)]
enum Step {
    Paint { x: u8, v: u8 },
    AddPixelLayer,
    DeleteTopLayer,
    RenameTopLayer,
    AddPath { x: u8 },
    AddVectorLayer,
    ReorderVector,
    DropSwatch,
    Resolution { dpi: u16 },
    Undo,
    Redo,
}

fn step() -> impl Strategy<Value = Step> {
    prop_oneof![
        (any::<u8>(), any::<u8>()).prop_map(|(x, v)| Step::Paint { x, v }),
        Just(Step::AddPixelLayer),
        Just(Step::DeleteTopLayer),
        Just(Step::RenameTopLayer),
        any::<u8>().prop_map(|x| Step::AddPath { x }),
        Just(Step::AddVectorLayer),
        Just(Step::ReorderVector),
        Just(Step::DropSwatch),
        (36u16..1200).prop_map(|dpi| Step::Resolution { dpi }),
        Just(Step::Undo),
        Just(Step::Undo),
        Just(Step::Redo),
    ]
}

/// Applies an edit step to `d` (undo and redo are not edits).
fn edit(d: &mut Document, s: &Step) {
    match *s {
        Step::Paint { x, v } => {
            let id = d.layers[0].id;
            if let Some(surface) = d.layer_mut(id).and_then(Layer::surface_mut) {
                surface.write_pixel(i32::from(x), 7, &[f32::from(v) / 255.0, 0.0, 0.0, 1.0]);
            }
        }
        Step::AddPixelLayer => {
            let fmt = d.pixel_format();
            d.layers.push(Layer::raster("Paint", fmt));
        }
        Step::DeleteTopLayer => {
            if d.layers.len() > 1 {
                d.layers.pop();
            }
        }
        Step::RenameTopLayer => {
            if let Some(l) = d.layers.last_mut() {
                l.name = format!("{} again", l.name);
            }
        }
        Step::AddPath { x } => d.edit_vector(|v| {
            if v.layers.is_empty() {
                let id = v.alloc_id();
                v.insert(None, 0, Node::layer(id, "Vector", LayerColor::Preset(0))).unwrap();
            }
            let parent = v.layers[0].id;
            let n = square(v, f64::from(x));
            v.insert(Some(parent), 0, n).unwrap();
        }),
        Step::AddVectorLayer => d.edit_vector(|v| {
            let id = v.alloc_id();
            v.insert(None, v.layers.len(), Node::layer(id, "Vector", LayerColor::Preset(1))).unwrap();
        }),
        Step::ReorderVector => d.edit_vector(|v| {
            if let Some(last) = v.layers.last().map(|n| n.id) {
                v.move_node(last, None, 0).unwrap();
            }
        }),
        Step::DropSwatch => d.edit_vector(|v| {
            v.swatches.pop();
        }),
        Step::Resolution { dpi } => d.set_resolution(f32::from(dpi)),
        Step::Undo | Step::Redo => {}
    }
}

proptest! {
    #[test]
    fn mixed_pixel_and_vector_edits_undo_and_redo_exactly(steps in proptest::collection::vec(step(), 1..40)) {
        let mut h = History::new(1000);
        let mut cur = Arc::new(base());
        // The reference: the documents passed through, and those undone.
        let mut past: Vec<Document> = Vec::new();
        let mut future: Vec<Document> = Vec::new();
        // Every (layer id, revision) seen in any state, with the node it drew.
        let mut drawn: HashMap<(astudio_doc::LayerId, u64), Arc<Node>> = HashMap::new();
        for s in &steps {
            match s {
                Step::Undo => {
                    let got = h.undo(cur.clone());
                    prop_assert_eq!(got.is_some(), !past.is_empty());
                    if let (Some((d, _)), Some(want)) = (got, past.pop()) {
                        future.push((*cur).clone());
                        cur = d;
                        prop_assert!(*cur == want, "undo after {:?}", steps);
                    }
                }
                Step::Redo => {
                    let got = h.redo(cur.clone());
                    prop_assert_eq!(got.is_some(), !future.is_empty());
                    if let (Some((d, _)), Some(want)) = (got, future.pop()) {
                        past.push((*cur).clone());
                        cur = d;
                        prop_assert!(*cur == want, "redo after {:?}", steps);
                    }
                }
                edit_step => {
                    let before = cur.clone();
                    let mut d = (*cur).clone();
                    edit(&mut d, edit_step);
                    past.push((*before).clone());
                    future.clear();
                    cur = Arc::new(d);
                    h.record(format!("{edit_step:?}"), before, LayerTarget::default());
                }
            }
            prop_assert_eq!(cur.vector_view().layers.len(), cur.vector_layers().len());
            for (id, vl) in cur.vector_layers() {
                let seen = drawn.entry((id, vl.revision)).or_insert_with(|| vl.node.clone());
                prop_assert!(**seen == *vl.node, "one revision, two different drawings: {:?}", steps);
            }
        }
    }
}

/// History's memory budget counts vector art, each shared node once.
#[test]
fn the_memory_budget_counts_vector_art() {
    let mut h = History::new(1000);
    let mut cur = Arc::new(base());
    let bytes = |h: &History, cur: &Document| h.unique_bytes(cur);
    for i in 0..50u8 {
        let before = cur.clone();
        let mut d = (*cur).clone();
        edit(&mut d, &Step::AddPath { x: i });
        cur = Arc::new(d);
        h.record(format!("path {i}"), before, LayerTarget::default());
    }
    let held = bytes(&h, &cur);
    assert!(held > 0, "older states hold vector art of their own");
    // Each state shares the paths it has in common with the next one, so history holds about one
    // layer node per state, less than the current art (51 nodes) twice over; counting every
    // state's art in full would be about 25 times the current art.
    let current = cur.vector_bytes(&mut std::collections::HashSet::new());
    assert!(held < 2 * current, "history {held} bytes, current art {current}");
    // A budget below what history holds drops the oldest states, keeping one undo.
    h.max_bytes = h.pixel_bytes(&cur) / 2;
    assert!(h.trim(&cur) > 0);
    assert!(h.past_len() >= 1 && h.undo(cur.clone()).is_some());
}
