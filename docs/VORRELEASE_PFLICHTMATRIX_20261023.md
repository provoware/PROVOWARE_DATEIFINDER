# Vorrelease-Pflichtmatrix – 2026-10-23

Repository: provoware/PROVOWARE_DATEIFINDER
Ausgangs-HEAD (main): 5ee7ee727fae80e5daea12fa3b453a3ff36a347c
Branch: agent/20261023-hardening-evidence-accuracy

## Ausgangsproblem / Änderung / Nutzermehrwert
Das bisherige Hardening-Protokoll behauptete pauschal, Prüfungen seien ausgeführt, selbst wenn GitHub nach einem Fehler spätere Schritte übersprungen hatte. Jetzt werden sechs tatsächliche Schrittzustände aus GitHub Actions protokolliert. So ist ein grüner Gesamteindruck ohne grüne Prüfnachweise leichter zu erkennen. Keine Änderung an Nutzerdaten, Scanlogik oder Oberfläche.

## Nachweise
- Workflow: .github/workflows/autonomous-hardening.yml
- Neue Schritte-IDs: quick, deep, stress, security, ui, golden
- Strukturprüfung am aus GitHub gelesenen Branch: alle sechs IDs einmal vorhanden; sechs outcome-Referenzen vorhanden; always-Bericht vorhanden: PASS (statische Prüfung, kein CI-Lauf).
- GitHub CI nach Commit: OFFEN, bis tatsächlicher Workflow-Lauf vorliegt.

## Pflichtmatrix: Soll / Ist / Evidenz / Status
| Bereich | Soll | Ist / Evidenz | Status |
|---|---|---|---|
| Fachfunktionen | Suche, Sortierung, Vorschau, Export | README v0.1.1 | OFFEN: vollständiger Lauf |
| Schnittstellen | Tauri-Rust/TS-Grenzen | AGENTS.md | OFFEN |
| Datenverlustschutz | read-only Dateizugriff | README-Sicherheitsvertrag | OFFEN: Test |
| Sicherheit | kanonische Roots, minimale Rechte | Hardening-Gates vorhanden | OFFEN: CI |
| Fehlerfälle | Datei weg, Zugriff verweigert, Abbruch | Roadmap enthält offene Fälle | OFFEN |
| Performance | 100000+ Matcher, virtualisierte Treffer | Roadmap dokumentiert | OFFEN: erneute Prüfung |
| Wartbarkeit | Capability-Architektur | README/AGENTS | OFFEN |
| Design/UX | 768×512 Referenz, vier Themes | Golden-Gate vorhanden | OFFEN: CI |
| 800×600 / hohe Skalierung | bedienbar bei 200 % | UI-Gate vorgesehen | OFFEN |
| Tastatur/Barrierefreiheit | Tastaturfokus, 200 % | AGENTS/README | OFFEN: CI |
| Import/Export | TXT-Export, Quellenzugriff | README | OFFEN: Regression |
| Sicherung/Restore | keine stillen Datenverluste | keine neue Evidenz | OFFEN |
| Installation/Start | Tauri-Build installierbar | README | OFFEN: frische Installation |
| Einheiten-/Integrationstests | TS/Rust erfolgreich | quality.yml | OFFEN: CI |
| End-to-End/GUI | Playwright + Golden | Hardening-Workflow | OFFEN: CI |
| Regression | alte Fehler nicht zurück | Workflow prüft Quellen und UI | OFFEN: CI |
| CI | wahrheitsgemäße Prüfergebnisse | Workflowänderung + Strukturprüfung | TEILWEISE |
| Dokumentation | Head, Branch, Risiken, Aufgaben | diese Datei | PASS: gespeichert |
| Paketierung | reproduzierbar und signiert | Roadmap P5 offen | OFFEN |
| Abhängigkeiten | Lockfiles konsolidiert | Issue #36 offen | OFFEN |

## Ergebnis / Einschränkungen
PASS: Branch und Workflow-Commit gespeichert; sechs Schritt-IDs und Ergebnisreferenzen am GitHub-Stand statisch geprüft.
OFFEN: YAML-Parser, komplette npm-/Cargo-/Playwright-Tests und GitHub Actions müssen am finalen PR-HEAD ausgeführt werden. Ein fehlender oder roter Test ist keine Freigabe.

## Nächste Pflichtarbeit
1. Entwurfs-PR und GitHub Actions prüfen; fehlgeschlagene Schritte gezielt beheben.
2. Issue #36: npm/Cargo/Actions-Abhängigkeiten auf gemeinsamem Lockfile-Stand prüfen.
3. Vollständige UI-/Rust-/Sicherheitskette und installierbares Paket verifizieren.
Kein Merge, kein Release, keine persönliche Endabnahme vor grüner Gesamtkette.
