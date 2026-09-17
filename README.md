# PROVOWARE DateiFinder

Lokale Dateinamen schnell durchsuchen – **Tauri 2 + Vanilla TypeScript + HTML/CSS + Rust**, ohne Cloudpflicht.

## Status

**v0.1.1 – Foundation Frozen / Desktop Search MVP**

- ✅ Foundation-Baseline auf `e01ff57` eingefroren
- ✅ Tauri-2-Grundgerüst
- ✅ vier Theme-Tokens: Cyan, Violett, Grün, Orange
- ✅ Referenzmodus 768 × 512 px
- ✅ rekursive Desktop-Dateinamensuche in Rust
- ✅ inkrementelle Ergebnis-Batches
- ✅ Suchabbruch
- ✅ Sortierung, Mehrfachauswahl, Vorschau-Metadaten
- ✅ Datei öffnen / im Dateimanager anzeigen
- ✅ TXT-Export
- ✅ serverseitige Root-Freigabe: Desktop-Suchorte werden im Rust-Kern registriert
- ✅ minimale plattformspezifische Capabilities
- ✅ responsive Mobile-Basis
- ✅ Foundation-CI und Hardening-Gates grün
- 🟡 Mobile-Dateiquellen sind vorbereitet; Android SAF/iOS Document Provider folgen separat
- 🟡 P1 Visual Master beginnt mit der Vermessung der Cyan-Referenz gegen 768 × 512 px

## Schnellstart

Voraussetzungen: Node.js >= 20.19, Rust >= 1.77.2 und die Tauri-Systempakete für das jeweilige Betriebssystem.

```bash
npm install
npm run tauri dev
```

Nur Frontend:

```bash
npm run dev
```

Prüfen:

```bash
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Architektur in einem Satz

Die UI kennt nur **Fähigkeiten und Ports**, nicht Windows/Android/iOS-Sonderfälle. Desktop durchsucht freigegebene Ordner über Rust; Mobile erhält eigene Quellenadapter hinter derselben Schnittstelle.

Siehe:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`AGENTS.md`](AGENTS.md)

## Sicherheitsprinzip

DateiFinder verarbeitet Dateinamen lokal. Der Desktop-Suchort wird im Rust-Kern per Systemdialog gewählt und dort für die laufende Sitzung registriert. `start_search`, `open_file` und `reveal_file` akzeptieren nur registrierte Roots und kanonische Kindpfade.

## Lizenz

Noch nicht festgelegt. Vor einer öffentlichen Release-Version bewusst entscheiden.
