//! The A-Studio layering table. Mirrors docs/02-architecture.md.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Class {
    /// A layered crate: may depend only on lower layers (or earlier crates in INTRA_LAYER).
    Layer(u8),
    /// L0 crate with no workspace dependencies.
    Standalone,
    /// Test helpers: dev-dependency only.
    Testkit,
}

pub const TABLE: &[(&str, Class)] = &[
    ("astudio-geom", Class::Layer(0)),
    ("astudio-color", Class::Layer(0)),
    ("astudio-raster", Class::Layer(0)),
    ("astudio-psd", Class::Standalone),
    ("astudio-raw", Class::Standalone),
    // codecs uses heif behind its `heif` feature, so both are plain L0 crates rather than standalone.
    ("astudio-heif", Class::Layer(0)),
    ("astudio-codecs", Class::Layer(0)),
    ("astudio-tablet", Class::Standalone),
    ("astudio-vdoc", Class::Layer(1)),
    ("astudio-doc", Class::Layer(1)),
    ("astudio-text", Class::Layer(2)),
    ("astudio-pathops", Class::Layer(2)),
    ("astudio-vbrush", Class::Layer(2)),
    ("astudio-plugins", Class::Layer(2)),
    ("astudio-effects", Class::Layer(2)),
    ("astudio-paint", Class::Layer(2)),
    ("astudio-ops", Class::Layer(2)),
    ("astudio-vector", Class::Layer(2)),
    ("astudio-algo", Class::Layer(2)),
    ("astudio-trace", Class::Layer(2)),
    ("astudio-compose", Class::Layer(3)),
    ("astudio-gpu", Class::Layer(3)),
    ("astudio-render", Class::Layer(3)),
    ("astudio-format", Class::Layer(3)),
    ("astudio-svg", Class::Layer(3)),
    ("astudio-pdf", Class::Layer(3)),
    ("astudio-eps", Class::Layer(3)),
    ("astudio-cad", Class::Layer(3)),
    ("astudio-metafile", Class::Layer(3)),
    ("astudio-io", Class::Layer(4)),
    ("astudio-tools", Class::Layer(4)),
    ("astudio-engine", Class::Layer(5)),
    ("astudio-ui", Class::Layer(6)),
    ("astudio-automation", Class::Layer(6)),
    ("astudio-testkit", Class::Testkit),
];

/// Allowed edges inside one layer: (from, to) means `from` may depend on `to`.
/// Live effects run effect plug-ins, so `astudio-effects` uses `astudio-plugins` (as in VectorCraft).
pub const INTRA_LAYER: &[(&str, &str)] = &[
    ("astudio-codecs", "astudio-heif"),
    ("astudio-color", "astudio-geom"),
    ("astudio-raster", "astudio-geom"),
    ("astudio-raster", "astudio-color"),
    ("astudio-doc", "astudio-vdoc"),
    ("astudio-effects", "astudio-plugins"),
    // Effects outline strokes and text, and combine shapes (VectorCraft's order, P2-14).
    ("astudio-effects", "astudio-pathops"),
    ("astudio-effects", "astudio-text"),
    // EPS reuses the renderer's TIFF writer for previews and opens Windows metafile previews
    // (VectorCraft's order, P2-15).
    ("astudio-eps", "astudio-render"),
    ("astudio-eps", "astudio-metafile"),
    // The GPU compositor shares the CPU compositor's effect maps, curves and blend rules and falls
    // back to it for what it can't draw (PhotoCraft's order, P2-19).
    ("astudio-gpu", "astudio-compose"),
];
