# Developer setup

A-Studio ships for Windows only (D7). Linux and macOS work for development, not as targets. On Windows, run `scripts/*.sh` from Git Bash
(installed with Git for Windows).

## Every machine

```sh
# Rust (rustup), then:
rustup toolchain install stable
rustup component add rustfmt clippy
rustup target add wasm32-unknown-unknown
cargo install cargo-deny --locked
cargo install trunk --version 0.21.14 --locked   # web build
git clone <your a-studio repo> && cd a-studio
scripts/bootstrap.sh          # upstream clones, optional fonts, toolchain check
scripts/baseline.sh           # builds and tests both upstream apps once (or: baseline.sh photocraft test)
```

Rust 1.95 or newer is required (both upstream workspaces declare `rust-version = "1.95"`, edition 2024).

## Linux (Debian or Ubuntu)

```sh
sudo apt-get install -y --no-install-recommends \
  build-essential pkg-config git python3 python3-yaml \
  libxkbcommon-dev libwayland-dev libx11-dev libxrandr-dev libxi-dev \
  libgl1-mesa-dev libgtk-3-dev
# packaging only:
sudo apt-get install -y desktop-file-utils appstream zsync flatpak flatpak-builder librsvg2-common
```

## macOS

- Xcode command-line tools: `xcode-select --install`.
- For releases: Apple Developer Program membership and a Developer ID Application certificate.
- Universal builds: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`.

## Windows

- Visual Studio 2022 Build Tools with "Desktop development with C++" (MSVC and Windows SDK).
- For the MSI: .NET SDK, then `dotnet tool install --global wix --version 5.0.2`.
- Targets: `rustup target add x86_64-pc-windows-msvc aarch64-pc-windows-msvc i686-pc-windows-msvc`.
- Faster builds: Rust builds on Windows are slowed most by the disk and by Defender scanning every
  file the compiler writes. Put the repository and `CARGO_HOME` on a Dev Drive (Settings › System ›
  Storage › Disks & volumes › Create dev drive), or add the repository, `%USERPROFILE%\.cargo` and
  `%USERPROFILE%\.rustup` to Defender's exclusions. The baseline workflow does the same on GitHub's
  runners (`.github/workflows/baseline.yml`).

## Optional inputs

- Fonts for Japanese, Chinese and Arabic: `git clone https://github.com/storytold/craft-fonts ../craft-fonts`
  and build with `CRAFT_FONTS_DIR="$PWD/../craft-fonts"` (absolute path). Builds work without it.
- Test corpora: fetched by upstream `cargo xtask corpus --all` (photocraft-corpus, psd-tools, ag-psd,
  PngSuite), pinned by commit and sha256.

## Hardware

- Any 64-bit machine with 16 GB RAM and 30 GB free disk builds both apps; release builds of two
  290,000-line workspaces take tens of minutes on a laptop.
- A GPU with Vulkan, Metal or DirectX 12 for the wgpu canvas; software fallback works but is slow.
- A pen tablet helps test brush pressure and tilt.

## AI coding agents

Both upstream repos are written to be worked on by agents (`AGENTS.md`, `CLAUDE.md`). This kit's
`AGENTS.md` carries the same rules. Register the upstream MCP servers to drive the apps from an agent:
`photocraft-cli mcp` and `vectorcraft-cli mcp`.
