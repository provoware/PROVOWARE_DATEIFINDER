# Roadmap

## P0 — Foundation

- [x] Tauri 2 + Vanilla TypeScript + Rust Grundgerüst
- [x] strikte TypeScript-Konfiguration
- [x] vier Theme-Tokens
- [x] 768×512 Referenzmodus
- [x] Desktop-Root-Freigabe im Rust-Kern
- [x] rekursive Dateinamensuche mit Batches und Abbruch
- [x] minimale Capabilities
- [x] CI für Frontend und Rust
- [x] CI vollständig grün und Foundation auf `e01ff57` eingefroren

## P1 — Visual Master

- [x] Cyan-Referenz gegen 768×512 Golden Reference vermessen
- [x] Screenshot-Harness auf Fixture-Daten
- [x] Pixel-Diff für Cyan
- [x] Purple/Green/Orange ohne Layoutshift
- [ ] lokale Fonts und kontrollierte SVG-Icons

## P2 — Desktop Hardening

- [ ] echte Listenvirtualisierung statt Render-Cap
- [ ] Preview-Thumbnail-Pipeline
- [ ] Fehlerzustände für gelöschte/gesperrte Dateien
- [ ] Stressfixture 100000+ Einträge
- [ ] Tastatur- und Accessibility-Gate

## P3 — Mobile V1

- [ ] Phone-/Tablet-Layout auf echten Geräten
- [ ] `PickedFilesSource`
- [ ] Android Smoke-Build
- [ ] Mobile Capabilities prüfen

## P4 — Mobile Advanced

- [ ] Android SAF Tree Provider
- [ ] persistente URI-Berechtigungen
- [ ] iOS Document Provider / security-scoped Flow
- [ ] plattformübergreifende Contracttests

## P5 — Release

- [ ] reproduzierbare Bundles
- [ ] Signierung
- [ ] frische Installationsprüfung
- [ ] Release-Evidence und Prüfsummen
