# PROVOWARE DateiFinder – Release Validation

## Herkunft

- Repository: provoware/PROVOWARE_DATEIFINDER
- Basis: PR #13, Commit 80f4e21313712328eb313fecc456fc4a95c2da0c
- Isolierte Vollvalidierung: GitHub Actions Run 35475208724, vollständig GRÜN
- Produktversion: 0.1.1

## Behobene Inkonsistenzen

- Golden-Referenz an den bewusst geänderten 768×512-Stand angeglichen.
- Suchhilfe im engen Referenzlayout auf `? Hilfe` komprimiert.
- Markenbereich so gehärtet, dass `DateiFinder` nicht abgeschnitten wird.
- P1-Roadmap an vorhandene Messungs-, Fixture-, Pixel- und Theme-Gates angeglichen.
- npm-, Cargo- und Tauri-Versionen synchronisiert.
- Start- und lokale Prüfskripte ergänzt.
- `src-tauri/gen/` bleibt generierter Build-Output und wird nicht versioniert.

## Verbindliche Gates

Der finale PR-Head darf erst nach grünen normalen GitHub-Gates gemergt werden:
Source Contracts, TypeScript, Build, rustfmt, Clippy, Rust-Tests, Stress, Security,
UI-E2E, 200%-Layout und Golden Regression.
