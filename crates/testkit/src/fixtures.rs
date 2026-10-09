//! Vector documents in known states (VectorCraft's `testkit/src/fixtures.rs`, P2-14): the parts
//! that build documents directly. Its engine sessions (`exec`, `session_with`, `rich_session`)
//! come with the merged command engine (P3-02).

use std::sync::Arc;

use astudio_color::vector::{Color, Paint};
use astudio_geom::{PathData, Rect, shapes};
use astudio_vdoc::{Appearance, Document, Node, NodeId, NodeKind};

/// Build documents directly (without the engine), e.g. for render tests.
pub struct DocBuilder {
    pub doc: Document,
    pub layer: NodeId,
}

impl DocBuilder {
    pub fn new(w: f64, h: f64) -> Self {
        let doc = Document::new(w, h);
        let layer = doc.layers[0].id;
        Self { doc, layer }
    }
    pub fn alloc(&mut self) -> NodeId {
        self.doc.alloc_id()
    }
    /// A path node (not inserted).
    pub fn path_node(&mut self, path: PathData, appearance: Appearance) -> Node {
        let id = self.alloc();
        Node::path(id, path, appearance)
    }
    /// A filled, unstroked rectangle node (not inserted).
    pub fn rect_node(&mut self, r: Rect, fill: Color) -> Node {
        self.path_node(shapes::rectangle(r), Appearance::basic(Paint::solid(fill), Paint::None, 0.0))
    }
    /// Append `node` at the top of the current layer.
    pub fn add(&mut self, node: Node) -> NodeId {
        let l = self.layer;
        self.doc.insert(Some(l), usize::MAX, node).expect("insert")
    }
    /// Add a filled rectangle; `f` may tweak the node first.
    pub fn rect(&mut self, r: Rect, fill: Color, f: impl FnOnce(&mut Node)) -> NodeId {
        let mut n = self.rect_node(r, fill);
        f(&mut n);
        self.add(n)
    }
    /// Add any path with an appearance; `f` may tweak the node first.
    pub fn path(&mut self, path: PathData, appearance: Appearance, f: impl FnOnce(&mut Node)) -> NodeId {
        let mut n = self.path_node(path, appearance);
        f(&mut n);
        self.add(n)
    }
    /// Add a group of `children` (bottom first). With `clip`, the first child is the clipping path.
    pub fn group(&mut self, mut children: Vec<Node>, clip: bool) -> NodeId {
        if clip && let Some(NodeKind::Path { clipping, .. }) = children.first_mut().map(|n| &mut n.kind) {
            *clipping = true;
        }
        let id = self.alloc();
        let mut g = Node::group(id, children.into_iter().map(Arc::new).collect());
        if let NodeKind::Group { clip: c, .. } = &mut g.kind {
            *c = clip;
        }
        self.add(g)
    }
    /// Add a new layer and make it current.
    pub fn layer(&mut self, name: &str) -> NodeId {
        self.layer = self.doc.add_layer(Some(name));
        self.layer
    }
    pub fn build(self) -> Document {
        self.doc
    }
}

/// All non-layer nodes of a document in paint order.
pub fn art_nodes(doc: &Document) -> Vec<&Node> {
    let mut v = Vec::new();
    doc.walk(|n| {
        if !n.is_layer() {
            v.push(n)
        }
    });
    v
}

/// Ids of the top-level art (direct children of layers), bottom first.
pub fn top_level_ids(doc: &Document) -> Vec<NodeId> {
    doc.layers.iter().flat_map(|l| l.children().into_iter().flatten().map(|n| n.id)).collect()
}

/// Every node id (layers included), paint order.
pub fn all_ids(doc: &Document) -> Vec<NodeId> {
    let mut v = Vec::new();
    doc.walk(|n| v.push(n.id));
    v
}
