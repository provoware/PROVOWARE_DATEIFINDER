# DateiFinder Komfort & Sicherheit – Erweiterungsauftrag

## Freigegebener Nutzerwunsch

Die Dateisuche soll sich für Laien ohne Terminalkenntnisse bedienen lassen und
weiterführende Dateiaktionen mit Vor-/Nachkontrollen anbieten.

## Realisierte, lokal prüfbare Teilfunktion

1. Farbige Statistik mit umschaltbarer Typ-, Jahres- und Größenansicht.
2. Benannte Suchvorlagen (maximal 20), Wiederverwendung und JSON-Import/Export.
3. Gespeicherter letzter Ordner und erneute explizite Freigabe beim Start.
4. Persistente Anzeigegröße von 80 bis 150 %, Strg + Mausrad und Strg + 0.
5. Optionale Inhaltssuche nach Text in zulässigen UTF-8-Formaten bis 256 KB.
6. Sichere, scrollbar begrenzte Textvorschau und Pfadkopierknopf.
7. Dezente Neonanimation der Primäraktionen unter Beachtung von `prefers-reduced-motion`.

## Ausstehend – Dateiaktionen (BLOCKS: Rust- und Browser-CI)

- Kopieren in einen ausgewählten vorhandenen Ordner und auf Wunsch einen neu
  anzulegenden Unterordner.
- Verschieben erst nach erfolgreichem und überprüftem Kopiervorgang; bei
  Fehlern Quelle erhalten, vorhandene Zielpfade nicht überschreiben.
- ZIP in eine Staging-Datei schreiben, Archiveinträge prüfen, vollständig
  verifizieren, dann ohne Überschreiben endgültig bereitstellen.
- Fortschritt, Teilabschluss, Abbruch und sichere Bereinigung temporärer Dateien;
  Tests ausschließlich in isolierten Testordnern mit Fehler-Injektion.
- Grenzen für Gesamtgröße/Dateianzahl, Symlinks, Quelldatei-Änderungen während
  einer Übertragung sowie Laufwerkswechsel explizit behandeln.

Ohne erfolgreiches Rust-Toolchain- und CI-Gate sind die noch ausstehenden
**schreibenden** Dateiaktionen bewusst nicht freizugeben. Sicherheitsprüfungen
dürfen nicht allein aufgrund eines erfolgreichen Frontend-Builds als bestanden
bezeichnet werden.

## Nächste Schritte

1. Für den vorliegenden Stand den Rust-Gate und den vollständigen UI-Gate
   inklusive 768×512, vier Themes und 200 %-Ansicht ausführen.
2. Danach die Dateiaktionen einzeln mit sicheren Transfer-Transaktionen
   implementieren und an Testdateien validieren.
3. Erst nach grünen Nachweisen PR freigeben und mergen.
