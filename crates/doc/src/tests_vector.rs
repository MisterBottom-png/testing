//! The merged document model (P3-01): VectorCraft documents round-trip through PhotoCraft's layer
//! stack unchanged, VectorCraft edits give the same result through it, and PhotoCraft's own
//! operations (copies, undo snapshots, Duplicate Layer, groups, pixel layers) keep working with
//! vector layers.
// Test helpers outside #[test] functions (clippy.toml allows these only inside them).
#![allow(clippy::unwrap_used, clippy::expect_used, clippy::panic)]

use std::collections::HashSet;
use std::sync::Arc;

use astudio_geom::PathData;
use astudio_geom::Rect as PtRect;
use astudio_vdoc::node::{LayerColor, Node};
use astudio_vdoc::{Appearance, Artboard, Document as VectorDocument, NodeId, Symbol};

use crate::{Affine, Color, ColorMode, Document, Layer, LayerContent, SampleType, Size, VectorLayer};

fn square(v: &mut VectorDocument, x: f64) -> Node {
    let id = v.alloc_id();
    Node::path(id, PathData::from_bezpath(&astudio_geom::shapes::rectangle(PtRect::new(x, 10.0, x + 40.0, 50.0)).to_bezpath()), Appearance::default())
}

/// A VectorCraft document with three layers (one with a nested group, one hidden), two
/// artboards, a symbol and a CMYK colour mode.
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

fn names(d: &Document) -> Vec<String> {
    d.layers.iter().map(|l| l.name.clone()).collect()
}

fn all_ids(v: &VectorDocument) -> Vec<NodeId> {
    let mut ids = Vec::new();
    v.walk(|n: &Node| ids.push(n.id));
    ids
}

fn unique(ids: &[NodeId]) -> bool {
    ids.iter().copied().collect::<HashSet<_>>().len() == ids.len()
}

#[test]
fn a_vector_document_round_trips_through_the_layer_stack() {
    let v = sample();
    let d = Document::from_vector(v.clone(), 144.0, SampleType::U8);
    assert_eq!(names(&d), ["Layer 1", "Shapes", "Hidden"], "one A-Studio layer per top-level VectorCraft layer");
    assert!(d.layers[0].visible && !d.layers[2].visible);
    assert_eq!(d.mode, ColorMode::Cmyk);
    assert!(d.vector.layers.is_empty(), "the nodes live in the layers");
    assert_eq!(d.vector.artboards, v.artboards);
    assert_eq!(d.vector.swatches, v.swatches);
    assert_eq!(d.vector.symbols, v.symbols);
    // The canvas covers both artboards at 2 px per point: x 0..900, y -20..400.
    assert_eq!(d.size, Size::new(1800, 840));
    // The document maps points to pixels (resolution and artboard offset); layers add nothing.
    let vl = vector_layer(&d.layers[1]);
    assert_eq!(vl.transform, Affine::translate(0.0, 0.0));
    assert_eq!(d.vector_transform(vl).m, [2.0, 0.0, 0.0, 2.0, 0.0, 40.0]);
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

    // A new top-level layer becomes a new A-Studio layer in place; a deleted one goes away.
    let add = |v: &mut VectorDocument| {
        let id = v.alloc_id();
        v.insert(None, v.layers.len(), Node::layer(id, "Added", LayerColor::Preset(2))).unwrap();
        let hidden = v.layers[2].id;
        v.remove(hidden).unwrap();
        let a = v.alloc_id();
        v.insert(None, 0, Node::layer(a, "Bottom", LayerColor::Preset(3))).unwrap();
        let b = v.alloc_id();
        v.insert(None, 2, Node::layer(b, "Between", LayerColor::Preset(4))).unwrap();
    };
    add(&mut direct);
    d.edit_vector(add);
    assert_eq!(d.vector_view(), direct);
    assert_eq!(names(&d), ["Bottom", "Layer 1", "Between", "Shapes", "Added"]);
    assert_eq!(d.vector.peek_next_id(), direct.peek_next_id(), "the shared items move with the edits");
}

/// P3-01 review H1: reordering top-level layers reorders the vector layers, among the places
/// they hold; pixel layers between them stay where they are.
#[test]
fn reordering_vectorcraft_layers_reorders_the_vector_layers() {
    let v = sample();
    let mut d = Document::from_vector(v.clone(), 72.0, SampleType::U8);
    let fmt = d.pixel_format();
    d.layers.insert(1, Layer::raster("Paint", fmt));
    let reorder = |v: &mut VectorDocument| {
        let top = v.layers[2].id;
        v.move_node(top, None, 0).unwrap();
    };
    let mut direct = v;
    reorder(&mut direct);
    d.edit_vector(reorder);
    assert_eq!(d.vector_view(), direct);
    assert_eq!(names(&d), ["Hidden", "Paint", "Layer 1", "Shapes"]);
    assert!(!d.layers[0].visible, "a layer moves with its own properties");
}

/// P3-01 review H2: the first vector layer of a pixel document goes on top, not under the
/// Background.
#[test]
fn the_first_vector_layer_of_a_pixel_document_goes_on_top() {
    let mut d = Document::with_background("Photo", Size::new(200, 100), ColorMode::Rgb, SampleType::U8, Color::rgb(1.0, 1.0, 1.0));
    d.edit_vector(|v| {
        let id = v.alloc_id();
        let lid = v.insert(None, 0, Node::layer(id, "Layer 1", LayerColor::Preset(0))).unwrap();
        let s = square(v, 0.0);
        v.insert(Some(lid), 0, s).unwrap();
    });
    assert_eq!(names(&d), ["Background", "Layer 1"]);
    assert_eq!(vector_layer(&d.layers[1]).transform, Affine::translate(0.0, 0.0), "new layers carry no extra transform");
}

/// P3-01 review M1: a change to the shared space bumps the vector revision; a no-op edit changes
/// nothing, so undo snapshots keep sharing the space.
#[test]
fn shared_space_changes_mark_every_vector_layer_stale() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U8);
    let snapshot = d.clone();
    d.edit_vector(|_| ());
    assert_eq!(d.vector_revision, snapshot.vector_revision);
    assert!(Arc::ptr_eq(&d.vector, &snapshot.vector));
    assert_eq!(d.vector_layers().iter().map(|(_, l)| l.revision).collect::<Vec<_>>(), [1, 1, 1]);

    let fresh = |d: &Document| d.vector_layers().iter().filter(|(_, l)| l.fresh_cache(d.vector_revision).is_some()).count();
    for (_, l) in d.layers.iter_mut().map(|l| (l.id, l)) {
        if let LayerContent::Vector(vl) = &mut l.content {
            vl.cache = Some(crate::Surface::new(crate::PixelFormat::RGBA8));
            vl.cache_revision = (vl.revision, 0);
        }
    }
    assert_eq!(fresh(&d), 3);
    d.edit_vector(|v| {
        v.swatches.clear();
        let art = Arc::new(square(v, 5.0));
        v.symbols[0].art = art;
    });
    assert!(d.vector_revision > snapshot.vector_revision);
    assert_eq!(fresh(&d), 0, "every vector layer redraws");
    assert!(!snapshot.vector.swatches.is_empty(), "the snapshot keeps its own space");
}

/// P3-01 review M2: name and visibility are kept in step both ways.
#[test]
fn names_and_visibility_stay_in_step() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U8);
    d.edit_vector(|v| {
        let n = Arc::make_mut(&mut v.layers[1]);
        n.name = Some("Renamed".into());
        n.visible = false;
    });
    assert_eq!(d.layers[1].name, "Renamed");
    assert!(!d.layers[1].visible);

    d.layers[2].name = "Shown again".into();
    d.layers[2].visible = true;
    let view = d.vector_view();
    assert_eq!(view.layers[2].name.as_deref(), Some("Shown again"));
    assert!(view.layers[2].visible);
    d.edit_vector(|_| ());
    assert_eq!(d.layers[2].name, "Shown again");
    assert!(d.layers[2].visible);
}

/// P3-01 review M3: art from another document (ids at or above this one's counter) never shares
/// an id with art made next.
#[test]
fn foreign_node_ids_raise_the_counter() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U8);
    let mut other = VectorDocument::new(100.0, 100.0);
    other.reserve_ids(1000);
    let id = other.alloc_id();
    let mut foreign = Node::layer(id, "Pasted", LayerColor::Preset(0));
    let inner = square(&mut other, 0.0);
    foreign.children_mut().unwrap().push(Arc::new(inner));
    d.layers.push(Layer::new("Pasted", LayerContent::Vector(VectorLayer::new(Arc::new(foreign)))));
    d.edit_vector(|v| {
        for _ in 0..3 {
            let id = v.alloc_id();
            v.insert(None, v.layers.len(), Node::layer(id, "New", LayerColor::Preset(0))).unwrap();
        }
    });
    let ids = all_ids(&d.vector_view());
    assert!(unique(&ids), "{ids:?}");
    assert_eq!(d.vector_layers().len(), 7);
    assert!(d.vector.peek_next_id() > 1001);
}

/// P3-01 review M4: an empty VectorCraft layer is a layer like any other and stays.
#[test]
fn an_empty_vector_layer_stays() {
    let mut d = Document::new("Untitled", Size::new(100, 100), ColorMode::Rgb, SampleType::U8);
    d.edit_vector(|v| {
        let id = v.alloc_id();
        v.insert(None, 0, Node::layer(id, "Empty", LayerColor::Preset(0))).unwrap();
    });
    d.edit_vector(|_| ());
    d.edit_vector(|v| v.title = "Still".into());
    assert_eq!(names(&d), ["Empty"]);
}

/// P3-01 review L2 and re-review 2: a new document's artboard and art to come follow the
/// resolution it is given; once it has vector art, a change of resolution moves nothing in
/// pixels (art, artboards), like the pixel layers.
#[test]
fn resolution_changes_keep_vector_art_in_place() {
    let mut d = Document::new("Print", Size::new(3000, 1500), ColorMode::Rgb, SampleType::U8);
    d.set_resolution(300.0);
    assert_eq!(d.vector.artboards[0].rect, PtRect::new(0.0, 0.0, 720.0, 360.0));
    assert_eq!(d.vector_mapping, Affine::scale(300.0 / 72.0), "art to come: 300 dpi");

    let mut v = Document::from_vector(sample(), 72.0, SampleType::U8);
    let boards = v.vector.artboards.clone();
    let place = v.vector_transform(vector_layer(&v.layers[1]));
    let size = v.size;
    v.set_resolution(144.0);
    assert_eq!(v.vector.artboards, boards, "a document's own artboards stay");
    assert_eq!(v.vector_transform(vector_layer(&v.layers[1])), place, "the art stays put in pixels");
    assert_eq!(v.size, size);
    v.set_resolution(f32::NAN);
    assert_eq!(v.resolution_dpi, 72.0);
    // P3-01 third review: with its layers gone, the document's own artboards still decide the
    // mapping, so new art lines up with them.
    let mapping = v.vector_mapping;
    v.layers.clear();
    v.set_resolution(300.0);
    assert_eq!(v.vector_mapping, mapping);
    assert_eq!(v.vector.artboards, boards);
}

/// P3-01 re-review 1: drawing a path redraws its layer only; the id counter moving (and the
/// title, a bookkeeping field) is no change to what the other layers draw.
#[test]
fn adding_a_path_redraws_only_its_layer() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U8);
    d.edit_vector(|v| {
        let parent = v.layers[0].id;
        let s = square(v, 3.0);
        v.insert(Some(parent), 0, s).unwrap();
        v.title = "Renamed".into();
    });
    assert_eq!(d.vector_revision, 0);
    assert_eq!(d.vector_layers().iter().map(|(_, l)| l.revision).collect::<Vec<_>>(), [2, 1, 1]);
    assert_eq!(d.vector.title, "Renamed", "the change is kept all the same");
}

/// P3-01 re-review 3: two layers with one id (a damaged file) are both kept through a reorder,
/// and no stand-in is left behind.
#[test]
fn layers_sharing_an_id_survive_a_reorder() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U8);
    let twin = d.layers[1].clone();
    d.layers.push(twin);
    d.edit_vector(|v| {
        let top = v.layers[3].id;
        v.move_node(top, None, 0).unwrap();
    });
    assert_eq!(d.layers.len(), 4);
    assert!(d.layers.iter().all(|l| l.content.kind_name() == "Vector"), "{:?}", names(&d));
    assert!(unique(&all_ids(&d.vector_view())));
}

#[test]
fn photocraft_operations_keep_working_with_vector_layers() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U16);
    // An undo snapshot is a clone: the vector space and every node are shared, not copied.
    let snapshot = d.clone();
    assert!(Arc::ptr_eq(&snapshot.vector, &d.vector));
    assert!(Arc::ptr_eq(&vector_layer(&snapshot.layers[1]).node, &vector_layer(&d.layers[1]).node));
    d.edit_vector(|v| v.title = "Changed".into());
    assert_eq!(snapshot.vector.title, "Poster", "editing after a snapshot leaves the snapshot alone");

    // A vector layer inside a group is part of the vector document in stack order.
    let shapes = d.layers.remove(1);
    d.layers.insert(1, Layer::group("Group", vec![shapes]));
    let view: Vec<_> = d.vector_view().layers.iter().map(|n| n.name.clone().unwrap_or_default()).collect();
    assert_eq!(view, ["Layer 1", "Shapes", "Hidden"]);
    assert_eq!(d.layer_count(), 4);
    assert_eq!(d.layers[1].content.kind_name(), "Group");
    assert_eq!(d.layer(d.vector_layers()[1].0).map(|l| l.content.kind_name()), Some("Vector"));
}

/// Duplicate Layer copies the node with its ids; the copy, wherever it sits, takes new ones and
/// the original keeps its own (P3-01 review L5), so ids other items name (threads, selections)
/// stay with the original.
#[test]
fn a_duplicated_vector_layer_takes_new_ids() {
    let mut d = Document::from_vector(sample(), 72.0, SampleType::U8);
    let original: Vec<NodeId> = {
        let mut ids = Vec::new();
        vector_layer(&d.layers[1]).node.walk(&mut |n| ids.push(n.id));
        ids
    };
    let mut dup = d.layers[1].duplicate();
    dup.name = "Shapes copy".into();
    d.layers.insert(0, dup);
    assert!(unique(&all_ids(&d.vector_view())), "the view has every id once");
    d.edit_vector(|_| ());
    assert!(unique(&all_ids(&d.vector_view())));
    let mut kept = Vec::new();
    vector_layer(&d.layers[2]).node.walk(&mut |n| kept.push(n.id));
    assert_eq!(d.layers[2].name, "Shapes");
    assert_eq!(kept, original, "the original keeps its ids");
    assert_eq!(names(&d), ["Shapes copy", "Layer 1", "Shapes", "Hidden"]);
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

/// One edit, chosen by index so any sequence is valid on any document. All but `AddPixelLayer`
/// are VectorCraft edits; that one only touches the A-Studio stack.
#[derive(Clone, Debug)]
enum Edit {
    AddPath { layer: usize, x: u8 },
    AddLayer { at: usize },
    RemoveTop { at: usize },
    MoveArt { from: usize, to: usize },
    Reorder { from: usize, to: usize },
    Nest { from: usize, into: usize },
    Unnest { from: usize, at: usize },
    Rename { at: usize },
    Hide { at: usize },
    DropSwatch,
    AddPixelLayer { at: usize },
}

fn top(v: &VectorDocument, i: usize) -> Option<NodeId> {
    (!v.layers.is_empty()).then(|| v.layers[i % v.layers.len()].id)
}

fn top_layer(v: &VectorDocument, i: usize) -> Option<NodeId> {
    top(v, i).filter(|id| v.layers.iter().any(|l| l.id == *id && l.is_layer()))
}

fn apply(v: &mut VectorDocument, e: &Edit) {
    match *e {
        Edit::AddPath { layer, x } => {
            let parent = top_layer(v, layer);
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
            if let (Some(art), Some(dest)) = (art, top_layer(v, to)) {
                let _ = v.move_node(art, Some(dest), 0);
            }
        }
        Edit::Reorder { from, to } => {
            if let Some(id) = top(v, from) {
                let to = to % v.layers.len().max(1);
                let _ = v.move_node(id, None, to);
            }
        }
        Edit::Nest { from, into } => {
            if let (Some(id), Some(dest)) = (top(v, from), top_layer(v, into))
                && id != dest
            {
                let _ = v.move_node(id, Some(dest), 0);
            }
        }
        Edit::Unnest { from, at } => {
            let child = top(v, from).and_then(|id| v.layers.iter().find(|l| l.id == id)).and_then(|l| l.children()).and_then(|c| c.first()).map(|n| n.id);
            if let Some(child) = child {
                let at = at % (v.layers.len() + 1);
                let _ = v.move_node(child, None, at);
            }
        }
        Edit::Rename { at } => {
            if let Some(id) = top(v, at)
                && let Some(n) = v.layers.iter_mut().find(|l| l.id == id)
            {
                Arc::make_mut(n).name = Some(format!("Renamed {at}"));
            }
        }
        Edit::Hide { at } => {
            if let Some(id) = top(v, at)
                && let Some(n) = v.layers.iter_mut().find(|l| l.id == id)
            {
                let n = Arc::make_mut(n);
                n.visible = !n.visible;
            }
        }
        Edit::DropSwatch => {
            v.swatches.pop();
        }
        Edit::AddPixelLayer { .. } => {}
    }
}

fn edit() -> impl proptest::strategy::Strategy<Value = Edit> {
    use proptest::prelude::*;
    prop_oneof![
        (0..8usize, any::<u8>()).prop_map(|(layer, x)| Edit::AddPath { layer, x }),
        (0..8usize).prop_map(|at| Edit::AddLayer { at }),
        (0..8usize).prop_map(|at| Edit::RemoveTop { at }),
        (0..8usize, 0..8usize).prop_map(|(from, to)| Edit::MoveArt { from, to }),
        (0..8usize, 0..8usize).prop_map(|(from, to)| Edit::Reorder { from, to }),
        (0..8usize, 0..8usize).prop_map(|(from, into)| Edit::Nest { from, into }),
        (0..8usize, 0..8usize).prop_map(|(from, at)| Edit::Unnest { from, at }),
        (0..8usize).prop_map(|at| Edit::Rename { at }),
        (0..8usize).prop_map(|at| Edit::Hide { at }),
        Just(Edit::DropSwatch),
        (0..8usize).prop_map(|at| Edit::AddPixelLayer { at }),
    ]
}

proptest::proptest! {
    /// Any sequence of edits gives the same vector document whether the VectorCraft edits run on
    /// the VectorCraft document directly or through the merged model, step by step, with pixel
    /// layers mixed into the stack; every vector layer shows its node's name and visibility, and
    /// layers the edit did not touch keep their revision.
    #[test]
    fn edit_sequences_match_vectorcraft(edits in proptest::collection::vec(edit(), 0..24)) {
        let mut direct = sample();
        let mut d = Document::from_vector(direct.clone(), 72.0, SampleType::U8);
        for e in &edits {
            if let Edit::AddPixelLayer { at } = *e {
                let fmt = d.pixel_format();
                let at = at % (d.layers.len() + 1);
                d.layers.insert(at, Layer::raster("Paint", fmt));
                continue;
            }
            let untouched: Vec<(crate::LayerId, Arc<Node>, u64)> = d.vector_layers().iter().map(|(id, l)| (*id, l.node.clone(), l.revision)).collect();
            let revision = d.vector_revision;
            apply(&mut direct, e);
            d.edit_vector(|v| apply(v, e));
            if !matches!(e, Edit::DropSwatch) {
                proptest::prop_assert_eq!(d.vector_revision, revision, "node edits leave the space's revision: {:?}", e);
            }
            proptest::prop_assert_eq!(&d.vector_view(), &direct, "after {:?}", e);
            for (_, _, l) in d.walk() {
                if let LayerContent::Vector(vl) = &l.content {
                    proptest::prop_assert_eq!(vl.node.name.clone().unwrap_or_else(|| "Layer".into()), l.name.clone());
                    proptest::prop_assert_eq!(vl.node.visible, l.visible);
                }
            }
            for (id, node, rev) in untouched {
                if let Some(LayerContent::Vector(vl)) = d.layer(id).map(|l| &l.content)
                    && Arc::ptr_eq(&vl.node, &node)
                {
                    proptest::prop_assert_eq!(vl.revision, rev);
                }
            }
        }
    }
}
