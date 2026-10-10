//! The merged document model (P3-01): VectorCraft documents round-trip through PhotoCraft's layer
//! stack unchanged, VectorCraft edits give the same result through it, and PhotoCraft's own
//! operations (copies, undo snapshots, Duplicate Layer, groups) keep working with vector layers.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::sync::Arc;

use astudio_geom::PathData;
use astudio_geom::Rect as PtRect;
use astudio_vdoc::node::{LayerColor, Node};
use astudio_vdoc::{Appearance, Artboard, Document as VectorDocument, NodeId, Symbol};

use crate::{ColorMode, Document, Layer, LayerContent, SampleType, Size, VectorLayer};

fn square(v: &mut VectorDocument, x: f64) -> Node {
    let id = v.alloc_id();
    Node::path(id, PathData::from_bezpath(&astudio_geom::shapes::rectangle(PtRect::new(x, 10.0, x + 40.0, 50.0)).to_bezpath()), Appearance::default())
}

/// A VectorCraft document with three layers (one with a nested group, one hidden), two
/// artboards, a symbol, an extra swatch-bearing default set and a CMYK colour mode.
fn sample() -> VectorDocument {
    let mut v = VectorDocument::new_with_mode(600.0, 400.0, astudio_vdoc::ColorMode::Cmyk);
    v.title = "Poster".into();
    v.artboards.push(Artboard { id: 2, name: "Back".into(), rect: PtRect::new(650.0, -20.0, 900.0, 380.0), show_center_mark: true, show_cross_hairs: false });
    let first = v.layers[0].id;
    let a = square(&mut v, 0.0);
    v.insert(Some(first), 0, a).unwrap();
    for (name, visible) in [("Shapes", true), ("Hidden", false)] {
        let id = v.alloc_id();
        let mut layer = Node::layer(id, name, LayerColor::Preset(1));
        layer.visible = visible;
        let lid = v.insert(None, v.layers.len(), layer).unwrap();
        let s = square(&mut v, 100.0);
        let t = square(&mut v, 160.0);
        let gid = v.alloc_id();
        let g = Node::group(gid, vec![Arc::new(s), Arc::new(t)]);
        v.insert(Some(lid), 0, g).unwrap();
    }
    let art = Arc::new(square(&mut v, 0.0));
    v.symbols.push(Symbol { name: "Badge".into(), art });
    v
}

fn vector_layer(l: &Layer) -> &VectorLayer {
    match &l.content {
        LayerContent::Vector(v) => v,
        other => panic!("not a vector layer: {}", other.kind_name()),
    }
}

#[test]
fn a_vector_document_round_trips_through_the_layer_stack() {
    let v = sample();
    let d = Document::from_vector(v.clone(), 144.0, SampleType::U8);
    assert_eq!(d.layers.len(), 3, "one A-Studio layer per top-level VectorCraft layer");
    assert_eq!(d.layers.iter().map(|l| l.name.as_str()).collect::<Vec<_>>(), ["Layer 1", "Shapes", "Hidden"]);
    assert!(d.layers[0].visible && !d.layers[2].visible);
    assert_eq!(d.mode, ColorMode::Cmyk);
    assert!(d.vector.layers.is_empty(), "the nodes live in the layers");
    assert_eq!(d.vector.artboards, v.artboards);
    assert_eq!(d.vector.swatches, v.swatches);
    assert_eq!(d.vector.symbols, v.symbols);
    // The canvas covers both artboards at 2 px per point: x -0..900, y -20..400.
    assert_eq!(d.size, Size::new(1800, 840));
    assert_eq!(vector_layer(&d.layers[1]).transform.m, [2.0, 0.0, 0.0, 2.0, 0.0, 40.0]);
    assert_eq!(d.vector_view(), v);
}

#[test]
fn vectorcraft_edits_give_the_same_result_through_the_merged_model() {
    let v = sample();
    let mut d = Document::from_vector(v.clone(), 72.0, SampleType::U8);
    let revisions = |d: &Document| d.vector_layers().iter().map(|(_, l)| l.revision).collect::<Vec<_>>();
    let before = revisions(&d);

    // Move the first layer's square into the "Shapes" layer: two layers change, one does not.
    let edit = |v: &mut VectorDocument| {
        let from = v.layers[0].children().unwrap()[0].id;
        let to = v.layers[1].id;
        v.move_node(from, Some(to), 0).unwrap();
    };
    let mut direct = v.clone();
    edit(&mut direct);
    d.edit_vector(edit);
    assert_eq!(d.vector_view(), direct);
    let after = revisions(&d);
    assert!(after[0] != before[0] && after[1] != before[1] && after[2] == before[2], "{before:?} -> {after:?}");

    // A new top-level layer becomes a new A-Studio layer; a deleted one goes away.
    let add = |v: &mut VectorDocument| {
        let id = v.alloc_id();
        v.insert(None, v.layers.len(), Node::layer(id, "Added", LayerColor::Preset(2))).unwrap();
        let hidden = v.layers[2].id;
        v.remove(hidden).unwrap();
    };
    add(&mut direct);
    d.edit_vector(add);
    assert_eq!(d.vector_view(), direct);
    assert_eq!(d.layers.iter().map(|l| l.name.as_str()).collect::<Vec<_>>(), ["Layer 1", "Shapes", "Added"]);
    // The document-level items move with the edits (ids, swatches, styles).
    assert_eq!(d.vector.peek_next_id(), direct.peek_next_id());

    // A new layer below everything is the new bottom layer; one between two goes between them.
    let add2 = |v: &mut VectorDocument| {
        let a = v.alloc_id();
        v.insert(None, 0, Node::layer(a, "Bottom", LayerColor::Preset(3))).unwrap();
        let b = v.alloc_id();
        v.insert(None, 2, Node::layer(b, "Between", LayerColor::Preset(4))).unwrap();
    };
    add2(&mut direct);
    d.edit_vector(add2);
    assert_eq!(d.vector_view(), direct);
    assert_eq!(d.layers.iter().map(|l| l.name.as_str()).collect::<Vec<_>>(), ["Bottom", "Layer 1", "Between", "Shapes", "Added"]);
}

#[test]
fn photocraft_operations_keep_working_with_vector_layers() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U16);
    // An undo snapshot is a clone: the vector space and every node are shared, not copied.
    let snapshot = d.clone();
    assert!(Arc::ptr_eq(&snapshot.vector, &d.vector));
    assert!(Arc::ptr_eq(&vector_layer(&snapshot.layers[1]).nodes[0], &vector_layer(&d.layers[1]).nodes[0]));
    d.edit_vector(|v| v.title = "Changed".into());
    assert_eq!(snapshot.vector.title, "Poster", "editing after a snapshot leaves the snapshot alone");

    // Duplicate Layer copies the nodes with their ids; the views and the next edit give them new
    // ones, since VectorCraft needs every id once.
    let dup = d.layers[1].duplicate();
    d.layers.push(dup);
    let mut ids = Vec::new();
    d.vector_view().walk(|n: &Node| ids.push(n.id));
    let unique: std::collections::HashSet<NodeId> = ids.iter().copied().collect();
    assert_eq!(unique.len(), ids.len(), "the view has every id once");
    d.edit_vector(|_| ());
    let mut ids = Vec::new();
    d.vector_view().walk(|n: &Node| ids.push(n.id));
    assert_eq!(ids.iter().copied().collect::<std::collections::HashSet<_>>().len(), ids.len());
    assert_eq!(d.vector_layers().len(), 4);

    // A vector layer inside a group is part of the vector document in stack order.
    let shapes = d.layers.remove(1);
    d.layers.insert(1, Layer::group("Group", vec![shapes]));
    let names: Vec<_> = d.vector_view().layers.iter().map(|n| n.name.clone().unwrap_or_default()).collect();
    assert_eq!(names, ["Layer 1", "Shapes", "Hidden", "Shapes"]);
    assert_eq!(d.layer_count(), 5);
    assert_eq!(d.layers[1].content.kind_name(), "Group");
    assert_eq!(d.layer(d.vector_layers()[1].0).map(|l| l.content.kind_name()), Some("Vector"));
}

#[test]
fn a_pixel_document_has_an_empty_vector_space() {
    let d = Document::new("Untitled", Size::new(300, 150), ColorMode::Rgb, SampleType::U8);
    assert!(d.vector.layers.is_empty() && d.vector_layers().is_empty());
    assert_eq!(d.vector.artboards.len(), 1);
    assert_eq!(d.vector.artboards[0].rect, PtRect::new(0.0, 0.0, 300.0, 150.0), "the canvas in points at 72 dpi");
    assert!(!d.vector.swatches.is_empty(), "VectorCraft's default swatches");
}

#[test]
fn hostile_vector_documents_open_safely() {
    let mut v = VectorDocument::new(100.0, 100.0);
    v.artboards[0].rect = PtRect::new(f64::NAN, 0.0, 1e300, f64::INFINITY);
    let d = Document::from_vector(v.clone(), f32::NAN, SampleType::U8);
    assert!(d.size.width >= 1 && d.size.height >= 1 && d.size.width <= 300_000);
    assert_eq!(d.resolution_dpi, 72.0);
    v.artboards.clear();
    assert_eq!(Document::from_vector(v, 300.0, SampleType::U8).size, Size::new(5, 5), "one point square at 300 dpi");
}

/// VectorCraft's example documents (in the upstream clone, when present) round-trip unchanged.
#[test]
fn upstream_example_documents_round_trip() {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../upstream/vectorcraft/examples");
    let Ok(entries) = std::fs::read_dir(dir) else {
        eprintln!("skipping: no upstream clone at {dir} (scripts/bootstrap.sh)");
        return;
    };
    let mut n = 0;
    for e in entries.flatten() {
        let path = e.path();
        if path.extension().is_none_or(|x| x != "vectorcraft") {
            continue;
        }
        let file: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        let v: VectorDocument = serde_json::from_value(file["document"].clone()).unwrap();
        let d = Document::from_vector(v.clone(), 150.0, SampleType::U8);
        assert_eq!(d.vector_view(), v, "{}", path.display());
        n += 1;
    }
    assert!(n >= 5, "{n} example documents");
}

/// One VectorCraft edit, chosen by index so any sequence is valid on any document.
#[derive(Clone, Debug)]
enum Edit {
    AddPath { layer: usize, x: u8 },
    AddLayer { at: usize },
    RemoveTop { at: usize },
    MoveArt { from: usize, to: usize },
    Rename { at: usize },
}

fn apply(v: &mut VectorDocument, e: &Edit) {
    let top = |v: &VectorDocument, i: usize| (!v.layers.is_empty()).then(|| v.layers[i % v.layers.len()].id);
    match *e {
        Edit::AddPath { layer, x } => {
            let parent = top(v, layer).filter(|id| v.layers.iter().any(|l| l.id == *id && l.is_layer()));
            let n = square(v, f64::from(x));
            let _ = v.insert(parent, 0, n);
        }
        Edit::AddLayer { at } => {
            let id = v.alloc_id();
            let _ = v.insert(None, at % (v.layers.len() + 1), Node::layer(id, &format!("L{}", id.0), LayerColor::Preset(0)));
        }
        Edit::RemoveTop { at } => {
            if let Some(id) = top(v, at) {
                let _ = v.remove(id);
            }
        }
        Edit::MoveArt { from, to } => {
            let art = top(v, from).and_then(|id| v.layers.iter().find(|l| l.id == id)).and_then(|l| l.children()).and_then(|c| c.first()).map(|n| n.id);
            let dest = top(v, to).filter(|id| v.layers.iter().any(|l| l.id == *id && l.is_layer()));
            if let (Some(art), Some(dest)) = (art, dest) {
                let _ = v.move_node(art, Some(dest), 0);
            }
        }
        Edit::Rename { at } => {
            if let Some(id) = top(v, at)
                && let Some(n) = v.layers.iter_mut().find(|l| l.id == id)
            {
                Arc::make_mut(n).name = Some(format!("Renamed {at}"));
            }
        }
    }
}

fn edit() -> impl proptest::strategy::Strategy<Value = Edit> {
    use proptest::prelude::*;
    prop_oneof![
        (0..8usize, any::<u8>()).prop_map(|(layer, x)| Edit::AddPath { layer, x }),
        (0..8usize).prop_map(|at| Edit::AddLayer { at }),
        (0..8usize).prop_map(|at| Edit::RemoveTop { at }),
        (0..8usize, 0..8usize).prop_map(|(from, to)| Edit::MoveArt { from, to }),
        (0..8usize).prop_map(|at| Edit::Rename { at }),
    ]
}

proptest::proptest! {
    /// Any sequence of VectorCraft edits gives the same vector document whether it runs on the
    /// VectorCraft document directly or through the merged model, step by step; and every
    /// A-Studio vector layer holds at least one node.
    #[test]
    fn edit_sequences_match_vectorcraft(edits in proptest::collection::vec(edit(), 0..24)) {
        let mut direct = sample();
        let mut d = Document::from_vector(direct.clone(), 72.0, SampleType::U8);
        for e in &edits {
            apply(&mut direct, e);
            d.edit_vector(|v| apply(v, e));
            proptest::prop_assert_eq!(&d.vector_view(), &direct, "after {:?}", e);
            proptest::prop_assert!(d.vector_layers().iter().all(|(_, l)| !l.nodes.is_empty()));
        }
    }
}
