//! A-Studio prototype (throwaway): colour books for spot inks.
//!
//! A colour book is a swatch library whose every swatch is a named spot ink defined in Lab, the
//! way printers' ink books work. This crate reads books from CSV (`code,hex` or `code,L,a,b`
//! columns) and from ASE (Adobe Swatch Exchange, the file printers and brand guides hand out),
//! writes ASE, turns them into VectorCraft `SwatchLibrary` values, and adds book swatches to a
//! document without creating a second plate for an ink that is already there.
//!
//! Nothing here edits upstream VectorCraft; the real port adds `book` and `code` fields to
//! `Swatch` and these readers to `palette_io` (see `docs/research/pantone-spot-colours.md`).
#![forbid(unsafe_code)]
#![deny(clippy::unwrap_used, clippy::expect_used, clippy::panic, clippy::unimplemented, clippy::todo, clippy::unreachable)]

pub mod ase;
pub mod book;
pub mod csv;

pub use book::{Book, add_swatch, bundled_books, lab_from_hex, library_from_ase, library_to_ase, swatch_name};
