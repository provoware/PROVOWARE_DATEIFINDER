# G3 – Start → Cancel → Restart Race Contract

Status: READY FOR TEST IMPLEMENTATION

Base: `freeze/g0-g10a-evidence-foundation` / `eaf857feab3d4855b418435ac7bbdc944e07209e`

## Ziel

Beweisen, dass verspätete Events einer abgebrochenen Suchsitzung niemals Zustand, Treffer, Fortschritt oder Abschlussstatus einer unmittelbar danach gestarteten neuen Sitzung verändern.

## Enger Scope

Zunächst ausschließlich Test-/CI-Infrastruktur. Keine Produktfunktion, kein UI-Umbau, kein Refactor und keine vorsorgliche Änderung an `src/**` oder `src-tauri/**`.

## Reproduzierbare Testsequenz

1. Session A starten.
2. A liefert mindestens einen gültigen Batch und Fortschritt.
3. A abbrechen.
4. Session B unmittelbar starten, bevor alle A-Ereignisse abgearbeitet sind.
5. B liefert eigene Treffer und Fortschritt.
6. Danach gezielt verspätete A-Ereignisse einspeisen: Batch, Progress, Cancelled, Finished.
7. Prüfen, dass ausschließlich B den sichtbaren Zustand bestimmt.

## Harte Assertions

- `activeSessionId` bleibt B.
- Kein verspäteter A-Treffer erscheint in B.
- A-Progress überschreibt B-Progress nicht.
- A-Cancelled setzt B nicht auf abgebrochen.
- A-Finished setzt B nicht auf abgeschlossen.
- B kann anschließend normal weitere Batches empfangen und sauber abschließen.
- Test ist deterministisch und benötigt keine Timing-Zufälle.

## Fail-First-Regel

Zuerst wird der Test gegen den unveränderten Produktstand implementiert. Nur wenn der reproduzierbare Test rot wird, darf eine minimale Produktkorrektur vorgeschlagen werden. Ein grüner Test beendet G3 ohne Produktänderung.

## Gate

G3 ist nur grün, wenn der Race-Test mehrfach deterministisch erfolgreich läuft und die bestehenden Baselines `G0 → G10a → SCHNELL → TIEF` unverändert grün bleiben.

## Abbruchregeln

Sofort stoppen bei Produktänderung ohne vorher reproduzierten roten G3-Test, flakey/timingabhängigem Test, Scope-Verletzung oder Regression eines bestehenden Gates.

## Definition of Done

G3 ist abgeschlossen, wenn die reale Start→Cancel→Restart-Sequenz einschließlich verspäteter A-Events automatisiert nachgewiesen ist, keine Regression besteht und die Evidence den G3-Outcome explizit ausweist.