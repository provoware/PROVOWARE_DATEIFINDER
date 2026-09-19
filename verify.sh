#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "$0")"
echo "[1/4] Frontend"
npm run check
echo "[2/4] Rust Format"
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
echo "[3/4] Rust Clippy + Tests"
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
echo "[4/4] Fertig – Kernprüfungen GRÜN"
