# NEXT DEVELOPMENT ROUND — ITERATIONSVERTRAG 1.0

Basis: `e01ff57e4522bf9bca76ff966dc355dcd9ae185b`

Status: **FREIGEGEBEN FÜR TESTIMPLEMENTIERUNG / NO-FEATURE**

## 1. Zweck dieser Runde

Diese Runde beginnt ausschließlich mit Test-, Prüf- und Nachweisarbeit. Bis zur ausdrücklichen Freigabe eines späteren Produkt-Scope sind keine Produktfunktionen, UI-Umbauten, Architektur-Refactors oder sonstigen Verhaltensänderungen erlaubt.

## 2. Hauptziele

1. Bestehende Hardening-Lücken sauber schließen, bevor neue sichtbare Funktionen entstehen.
2. Echte Laufzeit-Evidenz dort ergänzen, wo bisher nur statische oder angenäherte Tests existieren.
3. Große Ergebnislisten und Abbruch-/Neustart-Szenarien belastbar prüfen.
4. Accessibility und Layout nicht nur bei 100 % und angenähert 200 %, sondern über eine reproduzierbare Matrix absichern.
5. Evidence-Ausgaben so gestalten, dass Erfolg, Skip, Fehler und tatsächlich ausgeführte Gates eindeutig voneinander getrennt werden.
6. Pfad-, Dateisystem- und Laufzeitrandfälle reproduzierbar absichern.
7. Die stabile Basis `e01ff57` unangetastet halten; alle Arbeiten erfolgen ausschließlich auf neuen Entwicklungsbranches.

## 3. Explizit nicht im Scope

- keine neue Nutzerfunktion
- kein Redesign
- kein Feature-Scope-Wachstum
- kein großer Architekturumbau
- keine Änderung des Suchverhaltens ohne vorherigen roten, reproduzierbaren Test
- keine Änderung an `main` oder `stable/autonomous-hardening-0.1.1`
- keine vorsorgliche Produktcodeänderung ohne nachgewiesene Testlücke

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

### R8 — Pfad-/Dateisystem-Randfälle
Die vorhandenen Schutztests decken Root-Grenzen, Symlink-Escape und Exportgrenzen teilweise ab, aber noch nicht alle relevanten Laufzeitrandfälle. Insbesondere `..`, Unicode-Pfade, während der Verarbeitung gelöschte oder verschobene Dateien, fremde Roots, Alias-/Canonicalization-Fälle sowie nicht mehr verfügbare Roots benötigen reproduzierbare Tests.

## 5. Prüf-Gates

### G0 — Scope Guard
Vor jeder Umsetzung: Diff gegen `e01ff57` prüfen. Nur ausdrücklich freigegebene Dateien und Änderungen sind zulässig. Produktdateien bleiben zunächst gesperrt.

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
Reproduzierbarer Start → Cancel → Restart-Test mit Session-/Event-Reihenfolge. Kein veraltetes Ergebnis und kein verspätetes Alt-Event darf eine neue Sitzung überschreiben.

### G4 — FILESYSTEM-STRESS
Temporärer großer Verzeichnisbaum mit mindestens 100000 Einträgen oder technisch gleichwertigem reproduzierbarem Lastprofil. Prüfen: Traversierung, Batching, Abbruch, Laufzeitfehler, Speicherentwicklung.

### G5 — SECURITY
- Root-Escape
- `..`
- Symlink-Escape
- Unicode-Pfade
- gelöschte/verschobene Pfade während der Verarbeitung
- fremde Root-/Alias-Situationen
- nicht mehr verfügbare Roots
- Exportgrenzen

### G6 — RENDER-/DOM-BUDGET
Messbarer Grenzwert für gleichzeitig gerenderte Treffer. Nachweis, dass große Trefferzahlen keine unkontrollierte DOM-Vergrößerung erzeugen. Erst bei nachgewiesenem roten Befund darf über echte Virtualisierung oder Produktcodeänderung entschieden werden.

### G7 — ECHTES JS-UI-E2E
JavaScript aktiviert. Tauri-Aufrufe kontrolliert mocken oder injizieren. Prüfen: Suche starten, Statuswechsel, Ergebnisbatch, Cancel, Fehlerpfad, Capability-Fail-Closed sowie verspätete Events alter Sessions.

### G8 — ACCESSIBILITY / LAYOUT
Matrix mindestens:
- 100 %
- 150 %
- 200 % logisch/reproduzierbar
- 768×512
- kleiner Responsive-Fall
- Tastaturbedienung und Tab-Reihenfolge
- sichtbarer Fokus
- ARIA/Labels
- Reduced Motion
- vorhandene Themes

Kein kritisches Bedienelement darf unerreichbar werden oder horizontal aus dem nutzbaren Bereich verschwinden.

### G9 — GOLDEN
Bestehende Golden Reference 768×512 muss unverändert grün bleiben, sofern kein ausdrücklich freigegebener visueller Scope vorliegt.

### G10 — EVIDENCE-INTEGRITÄT
Evidence ist zweistufig zu behandeln:

**G10a — Evidence-Grundlage vor den neuen Laufzeit-Gates**
- Statuswerte `success`, `failure`, `skipped`, `cancelled`, `not-run` eindeutig unterscheiden
- exakten Checkout-/Test-Commit dokumentieren
- PR-Head, Synthetic-Merge-SHA und echten Merge-Commit semantisch trennen
- keine pauschale Aussage „ausgeführt“, wenn ein Gate nicht lief

**G10b — Gesamtevidence nach allen Pflicht-Gates**
- tatsächlich ausgeführte Gates und Resultate zusammenführen
- Testanzahl bzw. Laufzeitnachweis dort ausweisen, wo dies zur Semantik gehört
- keine Erfolgsaussage bei vorherigem Pflicht-Gate-Fehler

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
- ein Sicherheits- oder Datenintegritätsrisiko ungeklärt bleibt,
- ein Produktcode-Refactor vorgeschlagen wird, ohne dass ein reproduzierbarer roter Test ihn begründet.

## 7. Abhängigkeiten und Umsetzungsreihenfolge

Die Gates sind nicht vollständig linear. Die sichere Reihenfolge lautet:

`G0 SCOPE → G10a EVIDENCE-GRUNDLAGE → G1 SCHNELL → G2 TIEF`

Danach dürfen die weitgehend unabhängigen Laufzeitblöcke gezielt aufgebaut werden:

- `G3 RACE`
- `G4 FILESYSTEM-STRESS`
- `G5 SECURITY`

Anschließend:

`G6 RENDER → G7 JS-UI-E2E → G8 ACCESSIBILITY → G9 GOLDEN → G10b GESAMTEVIDENCE → G11 FREEZE-CANDIDATE → MERGE → G12 POST-MERGE → STABLE-FREEZE`

Praktische Implementierungspriorität:

1. G0 Scope Guard
2. G10a Evidence-Grundlage
3. G1/G2 Baseline vollständig grün bestätigen
4. G3 Race-Test
5. G7 JS-UI-E2E-Grundlage
6. G6 Render-/DOM-Budget
7. G4 Filesystem-Stress
8. G5 Security-Randfälle einschließlich R8
9. G8 Accessibility-/Layout-Matrix
10. G9 Golden Regression
11. G10b Gesamtevidence
12. G11 Freeze-Candidate
13. Merge
14. G12 Post-Merge
15. Stable-Freeze

## 8. Risiko-zu-Gate-Zuordnung

- R1 → G3, G7
- R2 → G4
- R3 → G6, G7
- R4 → G7
- R5 → G8, G9
- R6 → G10a, G10b, G12
- R7 → G0, G1, G2, G9
- R8 → G5, ergänzend G4

Damit besitzt jedes bekannte Risiko mindestens einen expliziten Prüfnachweis.

## 9. Definition of Done für die Planungsphase

Die Planungsphase ist abgeschlossen, wenn:

1. dieser Vertrag als Version 1.0 geprüft ist,
2. Scope und Nicht-Scope eindeutig sind,
3. jedes Risiko mindestens einem Gate zugeordnet ist,
4. die Gate-Abhängigkeiten und Implementierungsprioritäten definiert sind,
5. kein Gate nur aufgrund seines Namens als bestanden gilt, sondern seine tatsächliche Ausführung nachgewiesen werden kann,
6. vor der ersten Codeänderung ein eigener Umsetzungsbranch bzw. klar abgegrenzter Arbeitsstand existiert,
7. Produktcode zunächst gesperrt bleibt und nur bei reproduzierbar rotem Test gezielt geöffnet werden darf.

## 10. Freigabestatus

**Iterationsvertrag 1.0 — freigegeben für Testimplementierung.**

Die erste Implementierungsrunde darf ausschließlich mit **G0 Scope Guard + G10a Evidence-Grundlage** beginnen.

Bis zur ausdrücklichen Erweiterung des Scope gilt weiterhin:

**NO FEATURE / NO REDESIGN / NO REFACTOR / NO DIRECT MAIN CHANGE**.
