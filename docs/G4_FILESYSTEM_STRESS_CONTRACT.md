# G4 – Filesystem Stress Contract

Status: planning contract; no product change authorized.

Baseline: `freeze/g3-runtime-race` / `e999688022fd80361a6acb8591bf77a56d8e5eba`.

## Goal

Prove that the existing scanner remains correct and bounded while traversing a reproducible real temporary directory tree. This gate must exercise filesystem traversal; the existing 100000-name matcher test is not sufficient evidence for G4.

## Scope

First implementation is test/CI only. No product refactor, UI change, new feature, dependency replacement, or performance tuning is permitted before a reproducible failing G4 case exists.

## Required fixture

Create the complete fixture inside a test-owned temporary directory and remove it after the test. Never scan the runner home, repository parent, mounted external media, or any user directory.

The deterministic fixture must contain:

1. multiple directory levels (minimum depth 6),
2. at least 10000 regular files distributed across directories rather than one flat folder,
3. matching and non-matching names,
4. empty directories,
5. Unicode and whitespace in valid filenames,
6. zero-byte and non-zero-byte files,
7. a symlink loop or equivalent cycle fixture where supported, handled without unbounded traversal,
8. a symlink escaping the fixture root where supported, which must not cause traversal outside the fixture,
9. one unreadable/permission-denied subtree where the platform permits a meaningful test; otherwise the test must explicitly report the case as unsupported rather than pretending it passed.

## Assertions

G4 passes only when all applicable assertions hold:

- traversal terminates,
- every expected in-scope match is returned exactly once,
- no out-of-root path is returned,
- cycles do not create duplicate or unbounded results,
- empty/non-matching branches do not create false positives,
- progress/result accounting remains internally consistent where exposed by the scanner API,
- cancellation is not part of G4 unless needed to prevent a hang; cancellation race semantics remain owned by G3,
- fixture cleanup succeeds after both pass and failure paths.

## Resource guard

The gate must have a hard external timeout. A timeout is a G4 failure, not a skip. The first version should favor deterministic correctness over benchmark thresholds: do not introduce machine-speed pass/fail limits beyond the hang timeout.

## Fail-first rule

Run the new G4 test against the unchanged frozen G3 product code first.

- If green: do not modify product code; record that the current implementation satisfies this G4 fixture.
- If red: isolate the smallest reproducible filesystem cause before any product change.
- If the failure is in the fixture/test harness: repair only the harness and rerun.
- Product code may change only after a reproducible product defect is demonstrated.

## CI / Evidence

G4 requires its own named CI step and its own recorded step outcome. Evidence must never infer G4 success from TIEF, the existing matcher STRESS gate, or overall job success.

Expected order once implemented:

`G0 -> G10a -> SCHNELL -> G3 -> G4 -> TIEF -> STRESS -> SECURITY -> UI -> 200% -> GOLDEN -> Evidence`

The existing STRESS matcher gate remains independent and must not be renamed to G4.

## Freeze condition

G4 may be frozen only after:

1. the real filesystem fixture test executes in CI,
2. its dedicated G4 outcome is `success`,
3. G0 and all existing baseline gates remain green,
4. Evidence reports G4 from the actual step outcome,
5. no unauthorized product change was introduced.
