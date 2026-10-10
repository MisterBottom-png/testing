//! One undo history across pixel tiles and vector node trees (P3-03): any mix of pixel and vector
//! edits undoes and redoes to exactly the documents it went through, vector layers included (their
//! history is the whole-document snapshot, not VectorCraft's own undo); no two states of a vector
//! layer share a revision, so a cache keyed on one can't show another state's pixels; and the
//! memory budget counts vector art.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::HashMap;
use std::sync::Arc;

use astudio_doc::{Affine, Color, ColorMode, Document, Layer, LayerContent, LayerId, SampleType, Size};
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
    GroupTopVector,
    RemoveTopVector,
    DuplicateVector,
    MoveVector { dx: i8 },
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
        Just(Step::GroupTopVector),
        Just(Step::RemoveTopVector),
        Just(Step::DuplicateVector),
        any::<i8>().prop_map(|dx| Step::MoveVector { dx }),
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
        Step::GroupTopVector => {
            if let Some(i) = d.layers.iter().rposition(|l| matches!(l.content, LayerContent::Vector(_))) {
                let l = d.layers.remove(i);
                d.layers.insert(i, Layer::group("Group", vec![l]));
            }
        }
        Step::RemoveTopVector => d.edit_vector(|v| {
            if let Some(last) = v.layers.last().map(|n| n.id) {
                v.remove(last).unwrap();
            }
        }),
        Step::DuplicateVector => {
            if let Some(l) = d.layers.iter().find(|l| matches!(l.content, LayerContent::Vector(_))) {
                let copy = l.duplicate();
                d.layers.push(copy);
            }
        }
        Step::MoveVector { dx } => {
            if let Some(LayerContent::Vector(vl)) = d.layers.iter_mut().map(|l| &mut l.content).find(|c| matches!(c, LayerContent::Vector(_))) {
                let t = vl.transform.mul(&Affine::translate(f64::from(dx), 0.0));
                vl.set_transform(t);
            }
        }
        Step::Undo | Step::Redo => {}
    }
}

/// The layers a state targets: here, its top layer.
fn target(d: &Document) -> LayerTarget {
    LayerTarget { active: d.layers.last().map(|l| l.id), selected: d.layers.last().map(|l| vec![l.id]).unwrap_or_default() }
}

proptest! {
    /// Any mix of pixel and vector edits undoes and redoes to exactly the documents (and targeted
    /// layers) it went through, with the history trimmed to a memory budget and a state count;
    /// one layer revision never stands for two drawings, one vector revision never for two
    /// vector spaces.
    #[test]
    fn mixed_pixel_and_vector_edits_undo_and_redo_exactly(
        steps in proptest::collection::vec(step(), 1..40),
        budget_kb in prop_oneof![Just(0usize), 1usize..3000],
        max_states in 2usize..60,
    ) {
        let mut h = History::new(max_states);
        h.max_bytes = budget_kb * 1024;
        let mut cur = Arc::new(base());
        let mut cur_target = LayerTarget::default();
        // The reference: the states passed through and those undone, each with its target.
        let mut past: Vec<(Document, LayerTarget)> = Vec::new();
        let mut future: Vec<(Document, LayerTarget)> = Vec::new();
        let mut drawn: HashMap<(LayerId, u64), (Arc<Node>, Affine)> = HashMap::new();
        let mut spaces: HashMap<u64, (Vec<astudio_vdoc::Artboard>, Affine, usize)> = HashMap::new();
        for s in &steps {
            match s {
                Step::Undo => {
                    let got = h.undo(cur.clone());
                    prop_assert_eq!(got.is_some(), !past.is_empty());
                    if let (Some((d, t)), Some((want, want_t))) = (got, past.pop()) {
                        future.push(((*cur).clone(), cur_target.clone()));
                        cur = d;
                        cur_target = t;
                        prop_assert!(*cur == want, "undo after {:?}", steps);
                        prop_assert_eq!(&cur_target, &want_t);
                    }
                }
                Step::Redo => {
                    let got = h.redo(cur.clone());
                    prop_assert_eq!(got.is_some(), !future.is_empty());
                    if let (Some((d, t)), Some((want, want_t))) = (got, future.pop()) {
                        past.push(((*cur).clone(), cur_target.clone()));
                        cur = d;
                        cur_target = t;
                        prop_assert!(*cur == want, "redo after {:?}", steps);
                        prop_assert_eq!(&cur_target, &want_t);
                    }
                }
                edit_step => {
                    let before = cur.clone();
                    let mut d = (*cur).clone();
                    edit(&mut d, edit_step);
                    past.push(((*before).clone(), cur_target.clone()));
                    future.clear();
                    cur_target = target(&d);
                    cur = Arc::new(d);
                    h.record(format!("{edit_step:?}"), before, cur_target.clone());
                    if past.len() > max_states {
                        past.remove(0);
                    }
                    let dropped = h.trim(&cur);
                    past.drain(..dropped.min(past.len()));
                    prop_assert_eq!(h.past_len(), past.len());
                    prop_assert!(h.max_bytes == 0 || !past.is_empty(), "the last step stays undoable");
                }
            }
            prop_assert_eq!(cur.vector_view().layers.len(), cur.vector_layers().len());
            for (id, vl) in cur.vector_layers() {
                let seen = drawn.entry((id, vl.revision)).or_insert_with(|| (vl.node.clone(), vl.transform));
                prop_assert!(*seen.0 == *vl.node && seen.1 == vl.transform, "one revision, two different drawings: {:?}", steps);
            }
            let space = spaces.entry(cur.vector_revision).or_insert_with(|| (cur.vector.artboards.clone(), cur.vector_mapping, cur.vector.swatches.len()));
            prop_assert!(space.0 == cur.vector.artboards && space.2 == cur.vector.swatches.len(), "one vector revision, two spaces: {:?}", steps);
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
    // A budget between the current document and the current document plus history's art drops
    // some of the oldest states and keeps the newer ones: only the vector art is over it (the
    // pixel tiles are all shared, so a pixels-only count would drop nothing).
    let own = h.pixel_bytes(&cur) - held;
    h.max_bytes = own + held / 2;
    let dropped = h.trim(&cur);
    assert!(dropped > 0 && h.past_len() > 1, "dropped {dropped}, kept {}", h.past_len());
    assert!(h.pixel_bytes(&cur) <= h.max_bytes);
    assert!(h.undo(cur.clone()).is_some());
}
