## 2026-11-01 · Trefferauswahl und Schnellspeicher

- Ein Knopf wählt alle angezeigten Treffer (auch virtualisierte) aus oder hebt die gesamte Auswahl auf.
- Einzeiliger Schnellspeicher im Dashboard; Anhängen mit Zeitstempel an `SCHNELLSPEICHER.txt`.
- Entwicklungsmodus speichert im Projekt-Hauptverzeichnis, installierte Fassungen im lokalen Anwendungsdatenverzeichnis.
- Getrennte Auswahltests (20.000 Treffer) und Rust-Tests für Anhängen, Zeilenprüfungen und Linkschutz.

# Changelog

## Unveröffentlicht – Vorbereitung auf 0.2

- Dateiaktionen zeigen Byte-Fortschritt, Durchschnittsrate und vorsichtige
  Restzeit an; ZIP-Komprimierung und Archivprüfung bleiben eigene Phasen.
- Neue isolierte Regressionstests für Schreibabbruch, veränderte Quelldateien,
  Zielkollisionen zwischen Vor- und Nachprüfung und sichere manuelle
  Wiederholung nach zurückgelassenen temporären Daten.
- Noch keine automatische Wiederaufnahme nach unerwartetem Systemausfall;
  zuvor unbekannte temporäre Dateien werden nicht eigenmächtig gelöscht.

## 0.1.1 — 2026-09-20

- Suchhilfe mit leerem Startsuchfeld und besserer Zugänglichkeit.
- ARIA-/Statusverbesserungen und robuste `hidden`-Semantik.
- Sidebar-/Markengeometrie im 768×512-Referenzlayout korrigiert.
- Golden-Referenz bewusst auf den geprüften Stand aktualisiert.
- Start- und Prüfskripte ergänzt.
- Versionsangaben in npm, Cargo und Tauri auf 0.1.1 synchronisiert.
- Release-/Hardening-Dokumentation konsistent gemacht.
