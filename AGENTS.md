# AGENTS.md — DateiFinder

Kurzer Arbeitsvertrag für automatisierte Änderungen.

## Hauptaufgaben

1. Referenzlayout nicht unbemerkt verändern.
2. Plattformcode nur über die Tauri-/Capability-Grenze führen; geplante Extraktion nach `src/platform/` / `src-tauri/src/commands/` erst nach grünem Foundation-Gate.
3. Dateisystemzugriff standardmäßig read-only behandeln.
4. Rechte minimal halten.
5. Vor Merge Frontend + Rust prüfen.

## Trigger

### Bei UI-/CSS-Änderungen
- 768×512 Referenzmodus prüfen.
- vier Themes auf Layoutshift prüfen.
- Tastaturfokus prüfen.
- Mobile-Breakpoint kurz prüfen.

### Bei Suchlogik
- Matcher-Unit-Tests ergänzen.
- Abbruchpfad prüfen.
- Symlinks/fehlende Berechtigungen berücksichtigen.
- keine Einzel-IPC-Nachricht pro Datei bei großen Scans.

### Bei Tauri-/Plugin-Änderungen
- Capability-Dateien erneut prüfen.
- keine pauschalen Scopes ohne Begründung.
- offizielle aktuelle Tauri-Dokumentation gegenprüfen.
- `Cargo.toml` und `package.json` gemeinsam aktualisieren.

### Vor Release
- `node --test tests/hardening/source-contracts.mjs`
- `npm run check`
- `npm run test:visual`
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`
- installierbaren Build frisch testen
- Debugrechte/Logs kontrollieren

## No-Gos

- Theme-Komponenten kopieren.
- OS-Abfragen quer durch UI-Komponenten.
- Root/Home pauschal freigeben.
- persönliche Dateien in Tests committen.
- neue Dependency ohne klaren Nutzen.
