#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "$0")"
echo "[1/5] Sicherheits- und Quellcode-Vertragsprüfungen"
node --test tests/hardening/source-contracts.mjs
echo "[2/5] Frontend"
npm run check
echo "[3/5] Rust Format"
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
echo "[4/5] Rust Clippy + Tests"
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
echo "[5/5] Fertig – Kernprüfungen GRÜN"
