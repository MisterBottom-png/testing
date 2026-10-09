//! # astudio-pathops (L2)
//!
//! VectorCraft's path operations (`pathops`, ported from vectorcraft@8b036df in P2-14).
//!
//! VectorCraft path operations: booleans (Pathfinder), shape builder regions, offset, outline stroke,
//! simplify and the other Object → Path commands.
//!
//! Booleans are curve-preserving: `linesweeper`'s robust sweep-line works directly on cubic
//! Béziers, and the pieces it splits curves into are refitted afterwards so results carry few
//! anchors. See the crate README for the API overview.
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

/// Layer of this crate in the A-Studio layering table (`xtask/src/table.rs`).
pub const LAYER: &str = "L2";

mod boolean;
mod edit;
mod fit;
mod offset;
mod pathfinder;
mod planar;

pub use boolean::{BoolOp, DEFAULT_PRECISION, area, boolean, boolean_n, normalize, try_boolean, try_normalize, unite_all};
pub use edit::{
    AverageAxis, SimplifyOptions, add_anchor_points, average, join, remove_anchor, remove_redundant_points, simplify, simplify_with, smooth, split_into_grid,
};
pub use offset::{Cap, Join, offset_path, outline_stroke, stroke_region};
pub use pathfinder::{PathfinderOp, Region, Shape, merge_regions, pathfinder, region_at, regions};
pub use planar::{BuilderArrangement, SHAPE_BUILDER_MAX_SEGMENTS, cut_out, encloses_area, interior_point, live_paint, shape_builder};

/// Errors from fallible operations.
#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
pub enum PathOpsError {
    #[error("input contains NaN or infinite coordinates")]
    NonFinite,
    #[error("input path could not be closed")]
    OpenPath,
    #[error("the shapes are too degenerate to combine")]
    Degenerate,
}
