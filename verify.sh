#!/usr/bin/env bash
set -Eeuo pipefail
cd -- "$(dirname -- "$0")"
echo "[1/6] Sicherheits- und Quellcode-Vertragsprüfungen"
node --test tests/hardening/source-contracts.mjs
echo "[2/6] Alle vorhandenen Node-Regressionsprüfungen"
node --experimental-strip-types --test tests/*.mjs
echo "[3/6] Frontend"
npm run check
echo "[4/6] Rust Format"
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
echo "[5/6] Rust Clippy + Tests"
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path src-tauri/Cargo.toml
echo "[6/6] Fertig – Kernprüfungen GRÜN"
