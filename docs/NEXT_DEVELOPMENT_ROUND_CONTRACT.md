# NEXT DEVELOPMENT ROUND — ITERATIONSVERTRAG

Basis: `e01ff57e4522bf9bca76ff966dc355dcd9ae185b`

Status: PLANUNG / NO-FEATURE

## 1. Zweck dieser Runde

Diese Runde beginnt ausschließlich mit Planung und Nachweisführung. Bis zur formalen Freigabe dieses Vertrags sind keine Produktfunktionen, UI-Umbauten, Architektur-Refactors oder Verhaltensänderungen erlaubt.

## 2. Hauptziele

1. Bestehende Hardening-Lücken sauber schließen, bevor neue sichtbare Funktionen entstehen.
2. Echte Laufzeit-Evidenz dort ergänzen, wo bisher nur statische oder angenäherte Tests existieren.
3. Große Ergebnislisten und Abbruch-/Neustart-Szenarien belastbar prüfen.
4. Accessibility und Layout nicht nur bei 100 % und angenähert 200 %, sondern über eine reproduzierbare Matrix absichern.
5. Evidence-Ausgaben so gestalten, dass Erfolg, Skip, Fehler und tatsächlich ausgeführte Gates eindeutig voneinander getrennt werden.
6. Die stabile Basis `e01ff57` unangetastet halten; alle Arbeiten erfolgen ausschließlich auf neuen Entwicklungsbranches.

## 3. Explizit nicht im Scope

- keine neue Nutzerfunktion
- kein Redesign
- kein Feature-Scope-Wachstum
- kein großer Architekturumbau
- keine Änderung des Suchverhaltens ohne vorherigen Testvertrag
- keine Änderung an `main` oder `stable/autonomous-hardening-0.1.1`

## 4. Bekannte Risiken

### R1 — Start/Cancel/Restart-Race
Ein schneller Wechsel aus Start, Abbruch und erneutem Start kann veraltete Events oder Zustände sichtbar machen. Bestehende Session-Guards sind hilfreich, aber kein vollständiger Laufzeitnachweis.

### R2 — Stressnachweis bildet Dateisystemlast nur teilweise ab
Der vorhandene 100000-Fälle-Test belastet den Matcher, aber nicht automatisch einen realistischen großen Verzeichnisbaum mit Metadaten, Traversierung und Batching.

### R3 — Ergebnisdarstellung ist begrenzt, aber nicht vollständig als Virtualisierung nachgewiesen
Ein DOM-Limit reduziert Last, ersetzt jedoch keinen belastbaren Nachweis für große Trefferlisten, Scroll-Verhalten und Speicherstabilität.

### R4 — UI-E2E ist nicht gleich echter Tauri-IPC-E2E
Die vorhandene statische Playwright-Abnahme prüft Layout und HTML/CSS zuverlässig, aber keine vollständige JavaScript/Tauri-IPC-Laufzeitkette.

### R5 — Zoom-/Accessibility-Matrix ist noch unvollständig
Die bisherige 200-%-Prüfung nutzt ein logisches Viewport-Modell. Ein reproduzierbarer 150-%-Fall sowie zusätzliche Tastatur-/ARIA-/Viewport-Kombinationen fehlen als eigener Nachweis.

### R6 — Evidence-Integrität
Ein Evidence-Schritt darf nicht den Eindruck erwecken, alle Gates seien ausgeführt worden, wenn vorherige Gates fehlgeschlagen oder übersprungen wurden. PR-Synthetic-SHAs und echte Branch-/Merge-SHAs müssen klar getrennt werden.

### R7 — Regression durch Test-Härtung
Neue Testtechnik darf das Produktionsverhalten nicht unbemerkt verändern. Test-Infrastruktur und Produktcode müssen getrennt bewertet werden.

## 5. Prüf-Gates

### G0 — Scope Guard
Vor jeder Umsetzung: Diff gegen `e01ff57` prüfen. Nur ausdrücklich freigegebene Dateien und Änderungen sind zulässig.

### G1 — SCHNELL
- Source Contracts
- TypeScript Typecheck
- Format-/Syntax-Prüfungen
- keine Warnungen als stillschweigende Freigabe behandeln

### G2 — TIEF
- Produktionsbuild
- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- vollständige Rust-Tests

### G3 — RACE
Reproduzierbarer Start → Cancel → Restart-Test mit Session-/Event-Reihenfolge. Kein veraltetes Ergebnis darf eine neue Sitzung überschreiben.

### G4 — FILESYSTEM-STRESS
Temporärer großer Verzeichnisbaum mit mindestens 100000 Einträgen oder technisch gleichwertigem reproduzierbarem Lastprofil. Prüfen: Traversierung, Batching, Abbruch, Laufzeitfehler, Speicherentwicklung.

### G5 — SECURITY
- Root-Escape
- `..`
- Symlink-Escape
- Unicode-Pfade
- gelöschte/verschobene Pfade während der Verarbeitung
- fremde Root-/Alias-Situationen
- Exportgrenzen

### G6 — RENDER-/DOM-BUDGET
Messbarer Grenzwert für gleichzeitig gerenderte Treffer. Nachweis, dass große Trefferzahlen keine unkontrollierte DOM-Vergrößerung erzeugen.

### G7 — ECHTES JS-UI-E2E
JavaScript aktiviert. Tauri-Aufrufe kontrolliert mocken oder injizieren. Prüfen: Suche starten, Statuswechsel, Ergebnisbatch, Cancel, Fehlerpfad, Capability-Fail-Closed.

### G8 — ACCESSIBILITY / LAYOUT
Matrix mindestens:
- 100 %
- 150 %
- 200 % logisch/reproduzierbar
- 768×512
- kleiner Responsive-Fall
- Tastaturbedienung
- sichtbarer Fokus
- ARIA/Labels
- Reduced Motion
- vorhandene Themes

Kein kritisches Bedienelement darf unerreichbar werden oder horizontal aus dem nutzbaren Bereich verschwinden.

### G9 — GOLDEN
Bestehende Golden Reference 768×512 muss unverändert grün bleiben, sofern kein ausdrücklich freigegebener visueller Scope vorliegt.

### G10 — EVIDENCE-INTEGRITÄT
Evidence muss eindeutig ausweisen:
- exakten getesteten Commit
- tatsächlich ausgeführte Gates
- `success`, `failure`, `skipped` getrennt
- keine Erfolgsaussage bei vorherigem Gate-Fehler
- PR-Head, Synthetic-Merge-SHA und echter Merge-Commit nicht vermischen

### G11 — FREEZE-CANDIDATE
Ein Kandidat darf erst markiert werden, wenn alle für die Runde verpflichtenden Gates grün sind und keine ungeklärten roten oder gelben Befunde offen bleiben.

### G12 — POST-MERGE
Nach Merge muss der echte `main`-Commit erneut durch die vorhandenen Push-Gates laufen. Erst danach darf ein neuer Stable-Freeze gesetzt werden.

## 6. Abbruchregeln

Die Runde stoppt ohne Merge, wenn:

- ein Pflicht-Gate fehlschlägt,
- der Branch vom vereinbarten Scope abweicht,
- eine Testkorrektur eine nicht freigegebene Produktänderung benötigt,
- Evidence nicht eindeutig dem getesteten Commit zugeordnet werden kann,
- ein Sicherheits- oder Datenintegritätsrisiko ungeklärt bleibt.

## 7. Reihenfolge

`SCOPE → SCHNELL → TIEF → RACE → FILESYSTEM-STRESS → SECURITY → RENDER → JS-UI-E2E → ACCESSIBILITY → GOLDEN → EVIDENCE → FREEZE-CANDIDATE → MERGE → POST-MERGE → STABLE-FREEZE`

## 8. Definition of Done für die Planungsphase

Die Planungsphase ist abgeschlossen, wenn:

1. dieser Vertrag geprüft ist,
2. Scope und Nicht-Scope eindeutig sind,
3. jedes Risiko mindestens einem Gate zugeordnet ist,
4. kein Gate nur aufgrund seines Namens als bestanden gilt, sondern seine tatsächliche Ausführung nachgewiesen werden kann,
5. vor der ersten Codeänderung ein eigener Umsetzungsbranch bzw. klar abgegrenzter Arbeitsstand existiert.

Bis dahin: **NO FEATURE / NO REFACTOR / NO MERGE**.
