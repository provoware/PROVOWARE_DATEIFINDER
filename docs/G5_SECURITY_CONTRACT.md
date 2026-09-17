# G5 SECURITY — TESTVERTRAG 1.0

Basis: `freeze/g4-filesystem-stress` → `1eaeab97cdb54f271d8ced6fed89294cc1f97d63`

Status: **PLANUNG / FAIL-FIRST / NO-PRODUCT-CHANGE**

## 1. Zweck

G5 schließt ausschließlich die noch nicht reproduzierbar nachgewiesenen Security-Randfälle aus dem bestehenden Iterationsvertrag. Diese Phase spezifiziert Tests, verändert aber weder Produktcode noch Workflow noch Abhängigkeiten.

Grundregel: **Kein Produktcode darf geändert werden, bevor ein deterministischer G5-Test auf dem unveränderten Produktstand reproduzierbar rot ist und der Fehler eindeutig dem Produktverhalten zugeordnet wurde.**

## 2. Bereits vorhandene Security-Nachweise — nicht duplizieren

Folgende Fälle sind bereits vorhanden und gehören nicht zur neuen Fail-First-Testlücke:

- realer Child-Pfad innerhalb des freigegebenen Root wird akzeptiert und Outside-Datei abgelehnt
- Symlink-Escape auf ein Ziel außerhalb des freigegebenen Root wird abgelehnt
- Export über `MAX_EXPORT_TOTAL_BYTES` wird abgelehnt

Diese bestehenden Tests bleiben Regression-Gates. Neue Tests dürfen sie nicht durch Kopien oder Parallelimplementierungen ersetzen.

## 3. Fehlende G5-Fälle

### G5.1 — Parent-Traversal / `..`

Fixture:
- temporärer erlaubter Root
- Datei innerhalb des Root
- Datei außerhalb des Root
- Eingabepfad mit `..`, der lexikalisch vom Root nach außen zeigt

Erwartung:
- Canonicalization entscheidet anhand des realen Zielpfads
- kein Zugriff auf ein Ziel außerhalb des freigegebenen Root
- ein kanonisch innerhalb des Root verbleibender Alias darf nicht allein wegen der Schreibweise `..` falsch abgelehnt werden

Fail-First-Kriterium:
- Zugriff außerhalb Root wird akzeptiert oder ein kanonisch gültiger In-Root-Pfad wird sicherheitsbedingt falsch behandelt

### G5.2 — Unicode-Pfade

Fixture:
- Root und/oder Dateiname mit reproduzierbaren Unicode-Zeichen und Leerzeichen
- gültige Datei innerhalb Root
- Unicode-Datei außerhalb Root als Gegenprobe

Erwartung:
- gültiger In-Root-Pfad wird korrekt canonicalisiert und akzeptiert
- Outside-Pfad bleibt trotz Unicode außerhalb und wird abgelehnt
- kein verlustbehafteter Vergleich darf die Root-Grenze verändern

Fail-First-Kriterium:
- Root-Zugehörigkeit oder Zugriffsschutz hängt fehlerhaft von ASCII-only-Annahmen ab

### G5.3 — Datei während der Verarbeitung gelöscht

Fixture:
- gültige Datei innerhalb eines freigegebenen temporären Root
- Datei wird deterministisch zwischen Pfadermittlung und nachfolgendem Zugriff entfernt

Erwartung:
- kontrollierter Fehler bzw. Skip
- kein Panic
- kein Zugriff auf ein anderes Ziel
- Root-Grenze bleibt erhalten

Fail-First-Kriterium:
- Panic, undefinierter Zustand, falscher Zugriff oder Sicherheitsprüfung wird umgangen

### G5.4 — Datei während der Verarbeitung verschoben

Fixture:
- gültige Datei innerhalb Root
- deterministisches Verschieben vor dem nachfolgenden Zugriff
- soweit reproduzierbar zusätzlich Verschieben auf ein Ziel außerhalb Root

Erwartung:
- Zugriff wird gegen den tatsächlich verfügbaren/canonicalisierten Pfad geprüft
- kein Zugriff außerhalb des freigegebenen Root
- Race führt höchstens zu kontrolliertem Fehler/Skip

Fail-First-Kriterium:
- veraltete Pfadinformation ermöglicht Zugriff außerhalb Root oder verursacht Panic

### G5.5 — Fremder, nicht freigegebener Root

Fixture:
- zwei getrennte temporäre Roots A und B
- nur A ist in `AllowedRoots` registriert
- Such-/Dateioperation wird mit B angefordert

Erwartung:
- B wird unabhängig von seiner Existenz abgelehnt
- keine automatische oder implizite Freigabe

Fail-First-Kriterium:
- nicht registrierter Root wird akzeptiert

### G5.6 — Alias-/Canonicalization-Fall

Fixture:
- ein realer freigegebener Root
- mindestens ein technisch sinnvoller Alias, der auf denselben Root canonicalisiert, z. B. relative Komponenten oder unter Unix ein Symlink-Alias
- separater Alias auf ein Ziel außerhalb Root

Erwartung:
- Sicherheitsentscheidung basiert auf canonicalisierten realen Pfaden
- Alias auf denselben erlaubten Root bleibt semantisch derselbe Root
- Alias auf außerhalb liegendes Ziel wird abgelehnt

Fail-First-Kriterium:
- lexikalischer Pfadvergleich ersetzt fälschlich die Canonicalization oder Alias ermöglicht Root-Escape

### G5.7 — Root nach Freigabe nicht mehr verfügbar

Fixture:
- temporärer Root wird zunächst gültig angelegt und freigegeben
- Root wird danach deterministisch entfernt oder unzugänglich gemacht
- anschließend erfolgt die relevante Operation

Erwartung:
- kontrollierter Fehler „Root nicht verfügbar“ oder semantisch gleichwertig
- kein Panic
- kein Fallback auf einen anderen Pfad
- keine stillschweigende neue Freigabe

Fail-First-Kriterium:
- Panic, Zugriff auf Ersatz-/Nachbarpfad oder Umgehung der Allowlist

### G5.8 — Export: maximale Zeilenanzahl

Fixture:
- Eingabe mit mehr als `MAX_EXPORT_LINES`

Erwartung:
- Ablehnung vor Ausgabe
- kein teilweiser Export

Fail-First-Kriterium:
- zu viele Zeilen werden akzeptiert

### G5.9 — Export: maximale Einzelzeilengröße

Fixture:
- mindestens eine Zeile größer als `MAX_EXPORT_LINE_BYTES`

Erwartung:
- Ablehnung vor Ausgabe
- Gesamtgrößenlimit ist hierfür nicht der einzige Schutz

Fail-First-Kriterium:
- übergroße Einzelzeile wird akzeptiert

## 4. Determinismus-Regeln

Alle G5-Tests müssen:

- ausschließlich temporäre Testdaten verwenden
- unabhängig von Nutzerdateien sein
- reproduzierbar ohne Netzwerk laufen
- keine festen systemweiten Pfade voraussetzen
- jede Fixture nach Möglichkeit selbst aufräumen
- Plattformunterschiede ausdrücklich markieren (`#[cfg(unix)]` nur wenn technisch unvermeidbar)
- Race-Fälle mit kontrollierter Reihenfolge statt Timing-Glück erzeugen
- keine Sicherheitslogik im Test nachimplementieren
- die reale vorhandene Produktfunktion bzw. einen minimal freigegebenen Test-Seam aufrufen

Ein Test, der den Produktalgorithmus kopiert, zählt **nicht** als G5-Evidence.

## 5. Scope

In der ersten G5-Implementierungsrunde erlaubt:

- Tests innerhalb bereits vorhandener Rust-Testmodule, sofern kein neuer Produkt-Seam nötig ist
- alternativ reine Test-/Hardening-Dateien
- später, nur nach dokumentiertem Testbarkeitsnachweis, eine separat freizugebende minimale Testbarkeitsextraktion

Nicht erlaubt ohne roten reproduzierbaren Produktbefund:

- Änderung des Sicherheitsverhaltens
- neue öffentliche API
- neue Dependency
- UI-Änderung
- Architektur-Refactor
- neue Funktionalität
- Aufweitung der erlaubten Roots oder Exportgrenzen

## 6. Reihenfolge der Fail-First-Implementierung

Die engste Reihenfolge lautet:

1. `..` / Parent-Traversal
2. Unicode-Pfade
3. fremder nicht freigegebener Root
4. Alias-/Canonicalization
5. nicht mehr verfügbarer Root
6. gelöschte Datei während Verarbeitung
7. verschobene Datei während Verarbeitung
8. Export-Zeilenanzahl
9. Export-Einzelzeilengröße

Die Reihenfolge minimiert zunächst Test-Harness-Komplexität und verschiebt echte Race-Fixtures nach hinten.

## 7. Bewertung roter Tests

Bei jedem roten Test ist vor einer Produktänderung zwingend zu unterscheiden:

1. Test-/Fixture-Fehler
2. Plattform-/Dateisystembesonderheit
3. Harness-/Testbarkeitsproblem
4. echter reproduzierbarer Produktfehler

Nur Fall 4 darf eine gezielte Produktkorrektur eröffnen. Diese Korrektur muss auf den kleinsten notwendigen Codebereich begrenzt werden und anschließend G0, G1, G2 sowie alle bisherigen G3/G4-Regressionsnachweise erneut bestehen.

## 8. Definition of Done für den G5-Testvertrag

Der Planungsstand ist vollständig, wenn:

- alle bislang fehlenden G5-Fälle deterministisch spezifiziert sind
- bestehende Security-Tests ausdrücklich als Regression und nicht als offene Lücke markiert sind
- für jeden neuen Fall Fixture, Erwartung und Fail-First-Kriterium feststehen
- Race-/Plattformrisiken explizit begrenzt sind
- Produktcode weiterhin unverändert ist
- noch keine G5-Testimplementierung erfolgt ist

Erst danach darf eine isolierte G5-Testimplementierungsrunde beginnen.
