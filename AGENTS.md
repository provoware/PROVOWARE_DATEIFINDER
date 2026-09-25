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
- `npm run check`
- `cargo fmt --check`
- `cargo clippy -D warnings`
- `cargo test`
- installierbaren Build frisch testen
- Debugrechte/Logs kontrollieren

## No-Gos

- Theme-Komponenten kopieren.
- OS-Abfragen quer durch UI-Komponenten.
- Root/Home pauschal freigeben.
- persönliche Dateien in Tests committen.
- neue Dependency ohne klaren Nutzen.

---

## PROVOWARE GLOBAL DEVELOPMENT CONTRACT

Dieser globale Kern gilt zusätzlich zu den projektspezifischen Regeln. Bei Sicherheits- oder Nachvollziehbarkeitskonflikten hat er Vorrang; lokale Regeln dürfen ihn verschärfen, nicht stillschweigend abschwächen.

- **Frozen Current Plan:** Laufenden freigegebenen Plan nicht durch neue Ideen erweitern; Neues in die nächste Iteration einordnen.
- **Conflict Gate:** Unterbrechen nur bei nachgewiesenem Konflikt mit Planvoraussetzung, Sicherheit, Ausgangs-SHA, Scope oder Invariant.
- **Single Writer:** Pro produktivem Scope nur ein autorisierter Executor; Analyse/Planung/Prüfung dürfen parallel lesen.
- **SHA + Scope:** Vor Mutation HEAD und erlaubten/verbotenen Scope prüfen; keine stillen Nebenrefactorings.
- **Evidence:** Kein PASS ohne echten Test; Evidence muss zum geprüften HEAD gehören.
- **Controlled Evidence Lab:** Echte Mutationen, Fehler-Injektion und Recovery-Tests nur in isolierten Testbereichen; Produktivdaten bleiben geschützt.
- **Next Queue:** Neue Anforderungen/Findings append-only erfassen und Beziehungen wie BLOCKS, REQUIRES, SUPERSEDES, DUPLICATE oder CONFLICTS dokumentieren.
- **Statusklarheit:** OBSERVED/SUSPECTED/REPRODUCED/CONFIRMED/DISPROVED nicht vermischen.
- **Recovery Key:** Nach Abbruch oder Agentenwechsel müssen Stand, Ziel, Frozen Plan, Scope, Findings, Gates und nächster erlaubter Schritt ohne alten Chat rekonstruierbar sein.
- **Traceability:** Requirement/Decision → Finding → Plan → Change → Test/Evidence → Gate/Checkpoint nachvollziehbar halten.
- **Negativtests:** Schutzmechanismen absichtlich gegen falschen SHA, zweiten Writer, Scope-Verstoß und unbelegtes PASS testen.
- **Sichtbarer Fortschritt:** Längere Prüfungen mit Schritt, Fortschritt, Ergebnis und Ampelstatus darstellen.

Leitsatz: **Kein Agent muss sich erinnern. Kein Agent darf raten. Keine Änderung verliert ihren Ursprung. Kein PASS existiert ohne Evidence.**
