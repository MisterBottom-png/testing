//! Vector layers and the document's vector space (P3-01).
//!
//! A-Studio's document is PhotoCraft's layer stack plus a **Vector** layer kind. A vector layer
//! holds VectorCraft nodes: usually one top-level VectorCraft layer, as `.vectorcraft` files open
//! with one A-Studio layer per top-level layer (`docs/05-file-format.md`). Everything those nodes
//! refer to by id or name lives once per document, in [`Document::vector`]: the artboards (in
//! points), swatches and swatch groups, graphic, character and paragraph styles, symbols, images,
//! patterns, text threads and the node-id counter. Its own `layers` list stays empty; the nodes
//! are in the layers of the stack.
//!
//! VectorCraft code works on a whole `astudio_vdoc::Document`. [`Document::vector_view`] assembles
//! one (the space plus every vector layer's nodes, bottom to top), and [`Document::edit_vector`]
//! lends one out for editing and hands each node back to the layer it came from, so edits across
//! layers (threaded text, moving art from one layer to another) keep working.
//!
//! The PhotoCraft artboards (a top-level group with [`crate::Group::artboard`], as in PSD files)
//! stay as they are; the vector space's artboards are VectorCraft's. Joining the two in one
//! Artboards panel is UI work (P4).

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use astudio_vdoc::node::Node;
use astudio_vdoc::{Document as VectorDocument, NodeId};

use crate::{Affine, ColorMode, Document, Layer, LayerContent, LayerId, SampleType, Size, Surface};

/// Most pixels on a side of a document opened from a vector document (PhotoCraft's canvas limit).
const MAX_SIDE: u32 = 300_000;

/// A layer holding VectorCraft nodes. The nodes are in points; `transform` maps them to the
/// document's pixels. `cache` holds the last rendered pixels: [`Layer::surface`] returns them
/// even when stale (the editor shows the old pixels until the renderer catches up); they are up
/// to date while `cache_revision == revision`. Rendering lives in a higher-layer crate.
#[derive(Clone, Debug, PartialEq)]
pub struct VectorLayer {
    /// Top-level VectorCraft nodes, bottom first (a `.vectorcraft` file's `layers` array).
    pub nodes: Vec<Arc<Node>>,
    /// Points → pixels (`[a c e; b d f]`, column vectors, like every PhotoCraft transform).
    pub transform: Affine,
    /// Bumped on every change of `nodes` or `transform`.
    pub revision: u64,
    pub cache: Option<Surface>,
    pub cache_revision: u64,
}

impl VectorLayer {
    /// A vector layer at `resolution_dpi`: 1 pt = dpi / 72 px, origin at the top left. A
    /// non-finite or non-positive resolution (from a damaged file) counts as 72 dpi.
    pub fn new(nodes: Vec<Arc<Node>>, resolution_dpi: f32) -> Self {
        let k = points_to_pixels(resolution_dpi);
        Self { nodes, transform: Affine { m: [k, 0.0, 0.0, k, 0.0, 0.0] }, revision: 1, cache: None, cache_revision: 0 }
    }

    /// The cached pixels, if they are up to date.
    pub fn fresh_cache(&self) -> Option<&Surface> {
        self.cache.as_ref().filter(|_| self.cache_revision == self.revision)
    }

    /// Marks the cached pixels stale.
    pub fn touch(&mut self) {
        self.revision = self.revision.wrapping_add(1);
    }
}

/// Pixels per point at `resolution_dpi` (72 dpi for a damaged resolution).
fn points_to_pixels(resolution_dpi: f32) -> f64 {
    let dpi = if resolution_dpi.is_finite() && resolution_dpi > 0.0 { resolution_dpi } else { 72.0 };
    f64::from(dpi) / 72.0
}

/// The vector space of a new document of `size` pixels at `resolution_dpi`: one artboard covering
/// the canvas and the default swatches and graphic styles of `mode`, no layers.
pub fn new_vector_space(size: Size, resolution_dpi: f32, mode: ColorMode) -> VectorDocument {
    let k = points_to_pixels(resolution_dpi);
    let vmode = if mode == ColorMode::Cmyk { astudio_vdoc::ColorMode::Cmyk } else { astudio_vdoc::ColorMode::Rgb };
    let mut v = VectorDocument::new_with_mode(f64::from(size.width) / k, f64::from(size.height) / k, vmode);
    v.layers.clear();
    v
}

impl Document {
    /// A document opened from a VectorCraft document at `resolution_dpi`: one Vector layer per
    /// top-level layer (bottom first, with its name and visibility), the canvas covering every
    /// artboard, and the artboards, swatches, styles and the rest in [`Document::vector`].
    pub fn from_vector(mut v: VectorDocument, resolution_dpi: f32, depth: SampleType) -> Self {
        let k = points_to_pixels(resolution_dpi);
        let bounds = v.artboards.iter().map(|a| a.rect).reduce(|a, b| a.union(b));
        let (x0, y0, w, h) = bounds.map_or((0.0, 0.0, 1.0, 1.0), |r| (r.x0, r.y0, r.width(), r.height()));
        let side = |pt: f64| {
            let px = (pt * k).ceil();
            if px.is_finite() { px.clamp(1.0, f64::from(MAX_SIDE)) as u32 } else { 1 }
        };
        let (x0, y0) = if x0.is_finite() && y0.is_finite() { (x0, y0) } else { (0.0, 0.0) };
        let mode = if v.color_mode == astudio_vdoc::ColorMode::Cmyk { ColorMode::Cmyk } else { ColorMode::Rgb };
        let mut d = Document::new(v.title.clone(), Size::new(side(w), side(h)), mode, depth);
        d.resolution_dpi = if resolution_dpi.is_finite() && resolution_dpi > 0.0 { resolution_dpi } else { 72.0 };
        let transform = Affine { m: [k, 0.0, 0.0, k, -x0 * k, -y0 * k] };
        for node in std::mem::take(&mut v.layers) {
            let name = node.name.clone().unwrap_or_else(|| "Layer".into());
            let visible = node.visible;
            let mut layer = Layer::new(name, LayerContent::Vector(VectorLayer { transform, ..VectorLayer::new(vec![node], resolution_dpi) }));
            layer.visible = visible;
            d.layers.push(layer);
        }
        d.vector = Arc::new(v);
        d
    }

    /// The whole vector document: the vector space with every vector layer's nodes, bottom to top
    /// through groups (what `.vectorcraft` Save As and the VectorCraft exporters write).
    /// Nodes that share an id with an earlier one (a duplicated layer not edited since) get fresh
    /// ids in the copy.
    pub fn vector_view(&self) -> VectorDocument {
        let mut v = (*self.vector).clone();
        let mut seen: HashSet<NodeId> = HashSet::new();
        for (_, vl) in self.vector_layers() {
            for node in &vl.nodes {
                let mut dup = false;
                node.walk(&mut |n| dup |= !seen.insert(n.id));
                let node = if dup { Arc::new(v.reid(node)) } else { node.clone() };
                v.layers.push(node);
            }
        }
        v
    }

    /// The vector layers, bottom to top through groups.
    pub fn vector_layers(&self) -> Vec<(LayerId, &VectorLayer)> {
        self.walk()
            .into_iter()
            .filter_map(|(_, _, l)| match &l.content {
                LayerContent::Vector(v) => Some((l.id, v)),
                _ => None,
            })
            .collect()
    }

    /// Runs `f` on the whole vector document (see [`Document::vector_view`]), then gives every
    /// top-level node back to the layer it came from. A new VectorCraft layer `f` added becomes a
    /// new Vector layer just above the layer of the node before it (at the bottom of the stack when
    /// it comes first); other new top-level art joins the layer of the node before it (a new layer
    /// when there is none). A layer left without nodes is removed. Layers whose nodes changed get a new revision. Nodes that
    /// share an id with an earlier one (a duplicated layer) get fresh ids first, since VectorCraft
    /// needs every id once.
    pub fn edit_vector<R>(&mut self, f: impl FnOnce(&mut VectorDocument) -> R) -> R {
        self.give_duplicate_nodes_fresh_ids();
        let before: Vec<(LayerId, Vec<Arc<Node>>)> = self.vector_layers().into_iter().map(|(id, vl)| (id, vl.nodes.clone())).collect();
        let owner: HashMap<NodeId, LayerId> = before.iter().flat_map(|(id, nodes)| nodes.iter().map(move |n| (n.id, *id))).collect();
        let resolution = self.resolution_dpi;
        let space = Arc::make_mut(&mut self.vector);
        space.layers = before.iter().flat_map(|(_, nodes)| nodes.iter().cloned()).collect();
        let out = f(space);
        let after = std::mem::take(&mut space.layers);

        // Who gets each node: its old layer, else the layer of the node before it, else new layers.
        let mut owned: HashMap<LayerId, Vec<Arc<Node>>> = HashMap::new();
        // New A-Studio layers: their nodes and the layer they go above (None = the bottom).
        let mut new_layers: Vec<(Option<LayerId>, Layer)> = Vec::new();
        let mut current: Option<LayerId> = None;
        for node in after {
            if let Some(&id) = owner.get(&node.id) {
                current = Some(id);
                owned.entry(id).or_default().push(node);
                continue;
            }
            let joins = (!node.is_layer()).then_some(current).flatten();
            if let Some(id) = joins {
                owned.entry(id).or_default().push(node);
                continue;
            }
            let name = node.name.clone().unwrap_or_else(|| "Layer".into());
            let visible = node.visible;
            let mut layer = Layer::new(name, LayerContent::Vector(VectorLayer::new(vec![node], resolution)));
            layer.visible = visible;
            let above = current;
            current = Some(layer.id);
            new_layers.push((above, layer));
        }
        let mut emptied: HashSet<LayerId> = HashSet::new();
        for (id, old) in &before {
            let nodes = owned.remove(id).unwrap_or_default();
            if nodes.is_empty() {
                emptied.insert(*id);
                continue;
            }
            let same = nodes.len() == old.len() && nodes.iter().zip(old).all(|(a, b)| Arc::ptr_eq(a, b));
            if !same && let Some(LayerContent::Vector(vl)) = self.layer_mut(*id).map(|l| &mut l.content) {
                vl.nodes = nodes;
                vl.touch();
            }
        }
        // In order, so a run of new layers stacks the way `f` left them.
        for (above, layer) in new_layers {
            insert_above(&mut self.layers, above, layer);
        }
        if !emptied.is_empty() {
            remove_layers(&mut self.layers, &emptied);
        }
        out
    }

    /// Re-ids every vector node (with its subtree) whose id an earlier node already has.
    fn give_duplicate_nodes_fresh_ids(&mut self) {
        let mut seen: HashSet<NodeId> = HashSet::new();
        let mut redo: Vec<(LayerId, usize)> = Vec::new();
        for (id, vl) in self.vector_layers() {
            for (i, node) in vl.nodes.iter().enumerate() {
                let mut dup = false;
                node.walk(&mut |n| dup |= !seen.insert(n.id));
                if dup {
                    redo.push((id, i));
                }
            }
        }
        for (id, i) in redo {
            let Some(node) = self.vector_layers().into_iter().find(|(l, _)| *l == id).and_then(|(_, vl)| vl.nodes.get(i).cloned()) else { continue };
            let fresh = Arc::new(Arc::make_mut(&mut self.vector).reid(&node));
            if let Some(LayerContent::Vector(vl)) = self.layer_mut(id).map(|l| &mut l.content)
                && let Some(slot) = vl.nodes.get_mut(i)
            {
                *slot = fresh;
                vl.touch();
            }
        }
    }
}

/// Inserts `layer` just above the layer `above` (in that layer's group), or at the bottom of the
/// stack when `above` is None or gone.
fn insert_above(layers: &mut Vec<Layer>, above: Option<LayerId>, layer: Layer) {
    fn rec(layers: &mut Vec<Layer>, above: LayerId, layer: Layer) -> Option<Layer> {
        if let Some(i) = layers.iter().position(|l| l.id == above) {
            layers.insert(i + 1, layer);
            return None;
        }
        let mut layer = layer;
        for l in layers.iter_mut() {
            if let Some(ch) = l.children_mut() {
                layer = rec(ch, above, layer)?;
            }
        }
        Some(layer)
    }
    let left = match above {
        Some(id) => rec(layers, id, layer),
        None => Some(layer),
    };
    if let Some(layer) = left {
        let at = if above.is_none() { 0 } else { layers.len() };
        layers.insert(at, layer);
    }
}

/// Removes the layers in `ids` from `layers` and every group in it.
fn remove_layers(layers: &mut Vec<Layer>, ids: &HashSet<LayerId>) {
    layers.retain(|l| !ids.contains(&l.id));
    for l in layers.iter_mut() {
        if let Some(ch) = l.children_mut() {
            remove_layers(ch, ids);
        }
    }
}
