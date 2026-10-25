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

### Sichtprüfung des 768×512-Referenzmodus

Im PR #43 wurde das echte Chromium-Screenshot der neuen Startansicht begutachtet:
Suchfilter, Statuszeile und Ergebnisbereich sind innerhalb der 768×512-Grenzen.
Die ältere Cyan-Fixture-Referenz bleibt unverändert. Nur der bewusst geänderte
Startbildschirm erhält eine aktualisierte Referenz-PNG und SHA-256-Prüfsumme.

## Implementiert – Dateiaktionen (in PR #43 geprüft und gemergt)

- Kopieren in einen systemseitig gewählten Zielordner, wahlweise mit neuem
  Unterordner. Eingaben und einzelne Dateipfade werden erneut geprüft.
- Verschieben durch temporäre Kopie, byteweisen Vergleich und exklusiven
  Ziel-Commit; Quelle erst danach löschen. Bestehende Ziele werden abgewiesen.
- ZIP als Zwischenarchiv erzeugen, mittels `zip -T` testen, danach ohne
  Überschreiben freigeben. `zip` ist dafür als Linux-Systempaket erforderlich.
- Abbruch-Flag pro Sitzung, gut lesbare Schritte und Fortschritt je Datei;
  abgeschlossene Dateien werden benannt statt stillschweigend zurückgerollt.
- Grenzen: 100 Dateien und 8 GiB je Vorgang. Doppelte Dateinamen werden vor
  dem Schreiben abgewiesen; nicht lesbare Dateien, symlink-aufgelöste Pfade
  außerhalb des autorisierten Suchorts und Kollisionen führen zu einem Stopp.
- Temporäre Dateien und noch leere neue Zielordner werden bei Fehlern
  entfernt. Bei Dateisystemen ohne Hardlinks erfolgt ein exklusiver,
  überprüfter Ersatzweg ohne Überschreiben.

Der bisherige Funktionsstand wurde in GitHub-CI **quality #137** und
**autonomous-hardening #86** vollständig bestanden und anschließend als PR #43
gemergt. Das gilt nicht automatisch für spätere Änderungen.

## Version 0.2 – Fehlerfälle und Byte-Fortschritt (erneute CI erforderlich)

- Die Rust-Kopierroutine zählt pro Schreibblock verarbeitete Quelldaten.
  Fortschrittsereignisse sind auf ungefähr fünf pro Sekunde begrenzt.
- Der Dialog zeigt Byte-Menge, Gesamtmenge, Durchschnittsrate und vorsichtige
  Restzeit. Während ZIP-Erstellung/-Prüfung gilt kein scheinbarer 100-%-Wert.
- Kontrollierte Rust-Tests unter eigenen temporären Testordnern simulieren
  Schreibabbruch, gleichzeitige Quelldatei-Änderung und Zielkollision nach
  Vorvalidierung; zusätzlich werden monotone Bytezähler getestet.
- Ein alter temporärer Pfad wird weder überschrieben noch automatisch gelöscht.
  Nach bewusstem Entfernen im Test kann die gleiche Aktion sicher wiederholt
  werden. Das ist **keine automatische Wiederaufnahme nach Stromausfall**.
- Ziel für die nächste Freigabe: Rustfmt, Clippy, Rusttests, Frontend,
  vollständige Browser-Härtung inklusive 200 % und 768×512-Golden erneut grün.

## Nächste Schritte

1. Für den vorliegenden Stand den Rust-Gate und den vollständigen UI-Gate
   inklusive 768×512, vier Themes und 200 %-Ansicht ausführen.
2. Neue Dateiaktionen inklusive isolierter Rust-Testdateien und Browser-Tests
   gegen Kopie, Verschiebung, ZIP, Kollision und Abbruch prüfen.
3. Erst nach grünen Nachweisen PR freigeben und mergen.
