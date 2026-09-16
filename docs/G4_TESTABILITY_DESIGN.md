# G4 – Minimal Scanner Testability Design

Status: design only; no product change authorized.

Baseline contract: `55bd7cfab5a382f62556206b9b05bb3c9a6005f9` on `planning/g4-filesystem-stress-contract`.
Frozen product baseline: `freeze/g3-runtime-race` / `e999688022fd80361a6acb8591bf77a56d8e5eba`.

## Problem

The real filesystem traversal currently lives inside private `start_search()` in `src-tauri/src/lib.rs`. An external test under `tests/hardening/` cannot invoke that traversal directly without starting a Tauri application boundary. Copying the traversal algorithm into a test would test the copy, not the product scanner, and is therefore invalid G4 evidence.

G0 currently protects product paths. G4 must not silently weaken that protection merely to make the test convenient.

## Chosen seam

The smallest acceptable testability seam is a **pure internal traversal function in the existing Rust module**, called by `start_search()` and directly by an in-module `#[cfg(test)]` test.

Target shape, not implementation authorization:

- extract only the filesystem walk and accounting loop from `start_search()`;
- keep request validation, allowed-root authorization, registry ownership, thread spawning and Tauri command wiring in `start_search()`;
- pass traversal inputs explicitly: canonical root, normalized query tokens, batch/max-result bounds and cancellation flag;
- return or callback only scanner-domain data needed by the existing event adapter: batches/progress/final accounting;
- keep symlink behavior identical: never descend through symlinks;
- introduce no new crate and no public API;
- production `start_search()` must use this exact function, so G4 exercises the same traversal implementation as production.

## Why this is the minimum

A test-only duplicate scanner is rejected because it can diverge from production. A public test API is rejected because it expands the product surface. Starting a complete Tauri GUI/runtime in CI is rejected for the first G4 round because it adds unrelated runtime complexity. Moving the scanner into a new crate/module is rejected because it is a larger refactor than required.

The proposed seam changes code structure but not intended behavior. For that reason it is **not yet authorized** under the current fail-first contract; it requires an explicit narrow G0 exception before implementation.

## Required G0 exception

If implementation is authorized, G0 may permit exactly one product path for this round:

`src-tauri/src/lib.rs`

The exception must be constrained semantically as well as by path:

1. no Tauri command signature changes;
2. no UI/frontend changes;
3. no dependency changes;
4. no scanner feature changes;
5. no performance tuning;
6. only extraction of existing traversal behavior plus `#[cfg(test)]` G4 fixture/test code;
7. the PR diff must be reviewed to prove the production call path uses the extracted function;
8. all frozen baseline gates must remain green.

G0 must continue to reject every other product path.

## G4 fixture placement

Because the real traversal is private Rust logic, the deterministic fixture test should live in the existing `#[cfg(test)]` module in `src-tauri/src/lib.rs` rather than duplicating product code under `tests/hardening/`.

The test must create and clean its own temporary directory using the standard library unless an already locked dependency provides an equivalent helper. It must satisfy `G4_FILESYSTEM_STRESS_CONTRACT.md`: >=10000 files, depth >=6, matching/non-matching names, Unicode/whitespace, zero/non-zero files, symlink cycle/escape where supported, explicit unsupported reporting for meaningful permission-denied testing, exact-once results, accounting consistency and external CI timeout.

## CI evidence

The CI step remains independent:

`G4 - real filesystem traversal stress`

It runs only the named Rust G4 test with an external timeout. Evidence records `steps.g4.outcome`; TIEF/STRESS/overall success cannot substitute for it.

## Authorization gate

Before code implementation, require all of the following:

- this design is accepted as the minimum seam;
- the G0 exception is explicit and limited to `src-tauri/src/lib.rs` for G4 testability only;
- the diff contract above is enforceable/reviewable;
- no broader refactor is bundled into the same round.

Until then, product code remains frozen.
