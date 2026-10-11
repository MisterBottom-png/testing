//! Compiles a WebAssembly text plug-in (either ABI) to a `.wasm` module and checks that it loads
//! (ported from photocraft@e5e3e39):
//! `cargo run -p astudio-plugins --example wat2wasm -- plugin.wat plugin.wasm`

use astudio_plugins::{Limits, Plugin};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let (Some(input), Some(output)) = (args.first(), args.get(1)) else {
        eprintln!("usage: wat2wasm <in.wat> <out.wasm>");
        std::process::exit(2);
    };
    let bytes = match wat::parse_file(input) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };
    match Plugin::load(&bytes, Limits::default()) {
        Ok(p) => {
            let params = match p.abi() {
                astudio_plugins::Abi::Pixel => p.manifest().params_notation(),
                astudio_plugins::Abi::Vector => p.manifest().params_doc(),
            };
            println!("{} ({}, {:?} ABI): {} bytes, params {params}", p.manifest().name, p.id(), p.abi(), bytes.len());
        }
        Err(e) => {
            eprintln!("not a valid plug-in: {e}");
            std::process::exit(1);
        }
    }
    if let Err(e) = std::fs::write(output, &bytes) {
        eprintln!("{output}: {e}");
        std::process::exit(1);
    }
}
