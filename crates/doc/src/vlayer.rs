//! Vector layers and the document's vector space (P3-01).
//!
//! A-Studio's document is PhotoCraft's layer stack plus a **Vector** layer kind. Each vector layer
//! holds one top-level VectorCraft node, normally a VectorCraft layer, so a `.vectorcraft` file
//! opens as one A-Studio layer per top-level layer (`docs/05-file-format.md`). Everything those
//! nodes refer to by id or name lives once per document, in [`Document::vector`]: the artboards (in
//! points), swatches and swatch groups, graphic, character and paragraph styles, symbols, images,
//! patterns, text threads and the node-id counter. Its own `layers` list stays empty; the nodes
//! are in the layers of the stack.
//!
//! VectorCraft code works on a whole `astudio_vdoc::Document`. [`Document::vector_view`] assembles
//! one (the space plus every vector layer's node, bottom to top through groups), and
//! [`Document::edit_vector`] lends one out for editing and maps the result back onto the stack, so
//! edits across layers (threaded text, moving art, reordering layers) behave as in VectorCraft.
//!
//! Who owns what:
//! - A layer's **name and visibility** are the A-Studio layer's; the node mirrors them in both
//!   directions (the view takes them from the layer, an edit's result gives them back).
//! - Its **opacity, blend mode, mask and effects** are the A-Studio layer's and act on the layer's
//!   pixels, like any layer's; the node's own opacity and blend act inside the art.
//! - The **pixels** come from VectorCraft's renderer (task P3-09), cached per
//!   ([`VectorLayer::revision`], [`Document::vector_revision`]): a change to the node redraws that
//!   layer, a change to the shared space (a symbol, a style, a swatch) redraws every vector layer.
//!
//! The PhotoCraft artboards (a top-level group with [`crate::Group::artboard`], as in PSD files)
//! stay as they are; the vector space's artboards are VectorCraft's. Joining the two in one
//! Artboards panel is UI work (P4-01).

use std::collections::HashMap;
use std::sync::Arc;

use astudio_vdoc::node::Node;
use astudio_vdoc::{Document as VectorDocument, NodeId};

use crate::{Affine, ColorMode, Document, Layer, LayerContent, LayerId, LayerPath, SampleType, Size, Surface};

/// Most pixels on a side of a document opened from a vector document (PhotoCraft's canvas limit).
const MAX_SIDE: u32 = 300_000;

/// What a layer is called when its node has no name.
const UNNAMED: &str = "Layer";

/// The identity transform.
const IDENTITY: Affine = Affine { m: [1.0, 0.0, 0.0, 1.0, 0.0, 0.0] };

/// A layer holding one top-level VectorCraft node. The node is in points; it is drawn through the
/// document's [`Document::vector_mapping`], then `transform` ([`Document::vector_transform`]; the
/// `.astudio` file stores `transform · vector_mapping · scale(72 / resolution)`, its spec's form).
/// `cache` holds the last rendered pixels:
/// [`Layer::surface`] returns them even when stale (the editor shows the old pixels until the
/// renderer catches up); see [`VectorLayer::fresh_cache`].
#[derive(Clone, Debug, PartialEq)]
pub struct VectorLayer {
    pub node: Arc<Node>,
    /// After the document's vector mapping, pixels → document pixels (`[a c e; b d f]`, column
    /// vectors, like every PhotoCraft transform).
    pub transform: Affine,
    /// Bumped on every change of `node` or `transform`.
    pub revision: u64,
    pub cache: Option<Surface>,
    /// The (`revision`, [`Document::vector_revision`]) the cache was drawn at.
    pub cache_revision: (u64, u64),
}

impl VectorLayer {
    /// A vector layer for `node` with no extra transform.
    pub fn new(node: Arc<Node>) -> Self {
        Self { node, transform: IDENTITY, revision: 1, cache: None, cache_revision: (0, 0) }
    }

    /// The cached pixels, if they are up to date for a document at `vector_revision`.
    pub fn fresh_cache(&self, vector_revision: u64) -> Option<&Surface> {
        self.cache.as_ref().filter(|_| self.cache_revision == (self.revision, vector_revision))
    }

    /// Marks the cached pixels stale.
    pub fn touch(&mut self) {
        self.revision = self.revision.wrapping_add(1);
    }
}

/// A usable resolution: 72 dpi for a damaged one (non-finite or not positive).
fn sane_dpi(resolution_dpi: f32) -> f32 {
    if resolution_dpi.is_finite() && resolution_dpi > 0.0 { resolution_dpi } else { 72.0 }
}

/// Pixels per point at `resolution_dpi`.
fn points_to_pixels(resolution_dpi: f32) -> f64 {
    f64::from(sane_dpi(resolution_dpi)) / 72.0
}

/// The canvas of `size` pixels at `resolution_dpi`, in points: a new document's artboard.
fn canvas_artboard(size: Size, resolution_dpi: f32) -> astudio_geom::Rect {
    let k = points_to_pixels(resolution_dpi);
    astudio_geom::Rect::new(0.0, 0.0, f64::from(size.width) / k, f64::from(size.height) / k)
}

/// The vector space of a new document of `size` pixels at `resolution_dpi`: one artboard covering
/// the canvas and the default swatches and graphic styles of `mode`, no layers.
pub fn new_vector_space(size: Size, resolution_dpi: f32, mode: ColorMode) -> VectorDocument {
    let vmode = if mode == ColorMode::Cmyk { astudio_vdoc::ColorMode::Cmyk } else { astudio_vdoc::ColorMode::Rgb };
    let r = canvas_artboard(size, resolution_dpi);
    let mut v = VectorDocument::new_with_mode(r.width(), r.height(), vmode);
    v.layers.clear();
    v
}

/// A new A-Studio layer for `node`, with the node's name and visibility.
fn layer_for(node: Arc<Node>, transform: Affine) -> Layer {
    let name = node.name.clone().unwrap_or_else(|| UNNAMED.into());
    let visible = node.visible;
    let mut layer = Layer::new(name, LayerContent::Vector(VectorLayer { transform, ..VectorLayer::new(node) }));
    layer.visible = visible;
    layer
}

/// `node` with the name and visibility of `layer` (the same node when they already match).
fn node_as_layer_says(node: &Arc<Node>, layer: &Layer) -> Arc<Node> {
    let name_differs = node.name.as_deref().unwrap_or(UNNAMED) != layer.name;
    if !name_differs && node.visible == layer.visible {
        return node.clone();
    }
    let mut n = (**node).clone();
    if name_differs {
        n.name = Some(layer.name.clone());
    }
    n.visible = layer.visible;
    Arc::new(n)
}

/// The largest node id in `nodes` and their subtrees (0 for none).
fn max_id(nodes: &[Arc<Node>]) -> u64 {
    let mut max = 0;
    for n in nodes {
        n.walk(&mut |c| max = max.max(c.id.0));
    }
    max
}

impl Document {
    /// A document opened from a VectorCraft document at `resolution_dpi`: one Vector layer per
    /// top-level node (bottom first, with its name and visibility), the canvas covering every
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
        d.resolution_dpi = sane_dpi(resolution_dpi);
        d.vector_mapping = Affine::translate(-x0 * k, -y0 * k).mul(&Affine::scale(k));
        let nodes = std::mem::take(&mut v.layers);
        v.reserve_ids(max_id(&nodes).saturating_add(1));
        d.layers = nodes.into_iter().map(|node| layer_for(node, IDENTITY)).collect();
        d.vector = Arc::new(v);
        d
    }

    /// Sets the resolution (Image Size without resampling, a file's resolution on import). Vector
    /// art and artboards keep their place in pixels, like the pixel layers. A document without
    /// vector layers whose space is still on its first artboard, the canvas, takes the new
    /// resolution for the art to come: the canvas at that resolution, and its scale as the vector
    /// mapping. Otherwise the mapping stays, so artboards and art to come keep lining up.
    pub fn set_resolution(&mut self, resolution_dpi: f32) {
        let dpi = sane_dpi(resolution_dpi);
        if self.vector_layers().is_empty() {
            let old = canvas_artboard(self.size, self.resolution_dpi);
            if let [only] = self.vector.artboards.as_slice()
                && only.rect == old
            {
                let rect = canvas_artboard(self.size, dpi);
                if let Some(a) = Arc::make_mut(&mut self.vector).artboards.first_mut() {
                    a.rect = rect;
                }
                self.vector_revision = self.vector_revision.wrapping_add(1);
                self.vector_mapping = Affine::scale(points_to_pixels(dpi));
            }
        }
        self.resolution_dpi = dpi;
    }

    /// Points → document pixels for `layer`: the document's vector mapping, then its transform.
    pub fn vector_transform(&self, layer: &VectorLayer) -> Affine {
        layer.transform.mul(&self.vector_mapping)
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

    /// Every vector layer with its node as the layer names and shows it, bottom to top.
    fn vector_layer_nodes(&self) -> Vec<(LayerId, Arc<Node>)> {
        self.walk()
            .into_iter()
            .filter_map(|(_, _, l)| match &l.content {
                LayerContent::Vector(v) => Some((l.id, node_as_layer_says(&v.node, l))),
                _ => None,
            })
            .collect()
    }

    /// The whole vector document: the vector space with every vector layer's node, bottom to top
    /// through groups, named and shown as its layer is (what `.vectorcraft` Save As and the
    /// VectorCraft exporters write). Nodes whose ids clash with an older layer's (a duplicated
    /// layer not edited since) get fresh ids in the copy.
    pub fn vector_view(&self) -> VectorDocument {
        let mut v = (*self.vector).clone();
        let nodes: Vec<Arc<Node>> = self.vector_layer_nodes().into_iter().map(|(_, n)| n).collect();
        v.reserve_ids(max_id(&nodes).saturating_add(1));
        let keep = self.layers_keeping_ids();
        v.layers = nodes;
        for (i, keeps) in keep.into_iter().enumerate() {
            if keeps {
                continue;
            }
            if let Some(node) = v.layers.get(i).cloned() {
                let fresh = Arc::new(v.reid(&node));
                if let Some(slot) = v.layers.get_mut(i) {
                    *slot = fresh;
                }
            }
        }
        v
    }

    /// For each vector layer (bottom to top), whether it keeps its node ids: false when one of
    /// them is an older layer's (the smaller layer id), so a duplicate takes the new ids wherever
    /// it sits in the stack.
    fn layers_keeping_ids(&self) -> Vec<bool> {
        let layers = self.vector_layers();
        let mut by_age: Vec<usize> = (0..layers.len()).collect();
        by_age.sort_by_key(|&i| layers.get(i).map(|(id, _)| id.0));
        let mut first_claim: HashMap<NodeId, usize> = HashMap::new();
        for &i in &by_age {
            if let Some((_, vl)) = layers.get(i) {
                vl.node.walk(&mut |n| {
                    first_claim.entry(n.id).or_insert(i);
                });
            }
        }
        (0..layers.len())
            .map(|i| {
                let mut keeps = true;
                if let Some((_, vl)) = layers.get(i) {
                    vl.node.walk(&mut |n| keeps &= first_claim.get(&n.id) == Some(&i));
                }
                keeps
            })
            .collect()
    }

    /// Runs `f` on the whole vector document (see [`Document::vector_view`]), then maps the result
    /// back onto the stack:
    /// - every node goes back to its layer, which takes the node's name and visibility;
    /// - the vector layers keep the places they hold in the stack (between pixel layers, inside
    ///   groups) and are shuffled among them into the order `f` left the nodes in;
    /// - a new top-level node becomes a new Vector layer just above the layer of the node before
    ///   it (just below the next one when it comes first; at the top of the stack in a document
    ///   without vector layers);
    /// - the layer of a node `f` removed is removed.
    ///
    /// Layers whose node changed get a new revision; a change to the shared space (anything but
    /// the nodes) bumps [`Document::vector_revision`]. Clashing node ids (a duplicated layer) are
    /// renewed first, and the id counter raised above every id in the layers (art from another
    /// document), since VectorCraft needs every id once.
    pub fn edit_vector<R>(&mut self, f: impl FnOnce(&mut VectorDocument) -> R) -> R {
        self.renew_clashing_ids();
        let before = self.vector_layer_nodes();
        let mut space = (*self.vector).clone();
        space.layers = before.iter().map(|(_, n)| n.clone()).collect();
        space.fix_next_id();
        let out = f(&mut space);
        let after = std::mem::take(&mut space.layers);
        if space != *self.vector {
            // New nodes move the id counter, a rename the title: only a change to what is drawn
            // makes every vector layer redraw.
            if !space.draws_like(&self.vector) {
                self.vector_revision = self.vector_revision.wrapping_add(1);
            }
            self.vector = Arc::new(space);
        }
        self.apply_vector_order(&before, after);
        out
    }

    /// Maps the top-level nodes an edit left (`after`, bottom to top) onto the stack that held
    /// `before` (see [`Document::edit_vector`]). Layers are tracked by their place in `before`, not
    /// by id, so two layers with one id (a damaged file) cannot be mixed up.
    fn apply_vector_order(&mut self, before: &[(LayerId, Arc<Node>)], after: Vec<Arc<Node>>) {
        let owner: HashMap<NodeId, usize> = before.iter().enumerate().map(|(i, (_, n))| (n.id, i)).collect();
        let mut kept = vec![false; before.len()];
        // Each node with the place in `before` of the layer it belongs to (None = a new layer).
        let entries: Vec<(Option<usize>, Arc<Node>)> = after
            .into_iter()
            .map(|n| {
                let i = owner.get(&n.id).copied().filter(|&i| kept.get(i).is_some_and(|k| !k));
                if let Some(k) = i.and_then(|i| kept.get_mut(i)) {
                    *k = true;
                }
                (i, n)
            })
            .collect();

        // The places vector layers hold, bottom to top: the same order as `before`.
        let paths: Vec<LayerPath> = self.walk().into_iter().filter(|(_, _, l)| matches!(l.content, LayerContent::Vector(_))).map(|(p, _, _)| p).collect();
        // Take every vector layer out (removed ones stay out), then put the kept ones back in
        // the new order.
        let mut taken: Vec<Option<Layer>> = Vec::with_capacity(paths.len());
        for path in &paths {
            taken.push(self.layer_at_mut(path).map(|slot| std::mem::replace(slot, Layer::group("", Vec::new()))));
        }
        let mut slots = paths.iter().zip(&kept).filter(|(_, k)| **k).map(|(p, _)| p);
        let mut ids: Vec<Option<LayerId>> = vec![None; before.len()];
        for (i, node) in entries.iter().filter_map(|(i, n)| i.map(|i| (i, n))) {
            let (Some(path), Some(mut layer)) = (slots.next(), taken.get_mut(i).and_then(Option::take)) else { continue };
            if let LayerContent::Vector(vl) = &mut layer.content
                && !Arc::ptr_eq(&vl.node, node)
            {
                vl.node = node.clone();
                vl.touch();
            }
            layer.name = node.name.clone().unwrap_or_else(|| UNNAMED.into());
            layer.visible = node.visible;
            if let Some(id) = ids.get_mut(i) {
                *id = Some(layer.id);
            }
            if let Some(slot) = self.layer_at_mut(path) {
                *slot = layer;
            }
        }
        // The places of removed layers: drop them, last first so earlier paths stay valid.
        let mut gone: Vec<&LayerPath> = paths.iter().zip(&kept).filter(|(_, k)| !**k).map(|(p, _)| p).collect();
        gone.sort();
        for path in gone.into_iter().rev() {
            remove_at(&mut self.layers, path);
        }
        let entries: Vec<(Option<LayerId>, Arc<Node>)> = entries.into_iter().map(|(i, n)| (i.and_then(|i| ids.get(i).copied().flatten()), n)).collect();

        // New layers: above the layer of the node before them; a run before the first kept
        // layer goes below it; with no vector layer at all, at the top of the stack.
        let mut prev: Option<LayerId> = None;
        let mut leading: Vec<Layer> = Vec::new();
        for (id, node) in entries {
            match id {
                Some(id) => {
                    if prev.is_none() {
                        let mut below = id;
                        for l in leading.drain(..).rev() {
                            let lid = l.id;
                            insert_next_to(&mut self.layers, below, l, false);
                            below = lid;
                        }
                    }
                    prev = Some(id);
                }
                None => {
                    let l = layer_for(node, IDENTITY);
                    match prev {
                        Some(p) => {
                            let lid = l.id;
                            insert_next_to(&mut self.layers, p, l, true);
                            prev = Some(lid);
                        }
                        None => leading.push(l),
                    }
                }
            }
        }
        self.layers.extend(leading);
    }

    /// Gives every vector layer whose node ids clash with an older layer's fresh ones, from the
    /// vector space's counter (raised first above every id in the layers).
    fn renew_clashing_ids(&mut self) {
        let layers: Vec<(LayerId, Arc<Node>)> = self.vector_layers().into_iter().map(|(id, vl)| (id, vl.node.clone())).collect();
        let nodes: Vec<Arc<Node>> = layers.iter().map(|(_, n)| n.clone()).collect();
        let max = max_id(&nodes);
        if max >= self.vector.peek_next_id() {
            Arc::make_mut(&mut self.vector).reserve_ids(max.saturating_add(1));
        }
        let keep = self.layers_keeping_ids();
        for ((id, node), keeps) in layers.into_iter().zip(keep) {
            if keeps {
                continue;
            }
            let fresh = Arc::new(Arc::make_mut(&mut self.vector).reid(&node));
            if let Some(LayerContent::Vector(vl)) = self.layer_mut(id).map(|l| &mut l.content) {
                vl.node = fresh;
                vl.touch();
            }
        }
    }
}

/// Inserts `layer` just above (`above`) or below the layer `next_to`, in that layer's group; at
/// the top of the stack when `next_to` is gone.
fn insert_next_to(layers: &mut Vec<Layer>, next_to: LayerId, layer: Layer, above: bool) {
    fn rec(layers: &mut Vec<Layer>, next_to: LayerId, layer: Layer, above: bool) -> Option<Layer> {
        if let Some(i) = layers.iter().position(|l| l.id == next_to) {
            layers.insert(if above { i + 1 } else { i }, layer);
            return None;
        }
        let mut layer = layer;
        for l in layers.iter_mut() {
            if let Some(ch) = l.children_mut() {
                layer = rec(ch, next_to, layer, above)?;
            }
        }
        Some(layer)
    }
    if let Some(layer) = rec(layers, next_to, layer, above) {
        layers.push(layer);
    }
}

/// Removes the layer at `path`.
fn remove_at(layers: &mut Vec<Layer>, path: &[usize]) {
    let Some((last, parent)) = path.split_last() else { return };
    let mut list = layers;
    for &i in parent {
        let Some(ch) = list.get_mut(i).and_then(Layer::children_mut) else { return };
        list = ch;
    }
    if *last < list.len() {
        list.remove(*last);
    }
}
