# 💾 PROVOWARE – Standard für einzeilige Schnellnotizen

**Stand:** 01.11.2026 · **Status:** projektübergreifende Referenz, keine automatische Änderung fremder Projekte · **Version:** 1.0

> [!IMPORTANT]
> Dieser Standard beschreibt das gewünschte **Verhalten**. Er ist keine Anweisung, bestehende Speicherorte, Sicherungen oder Projektfreigaben ungeprüft zu ersetzen. Die jeweiligen `AGENTS.md`-Dateien und vorhandenen Datenerhaltungsregeln gelten weiterhin.

## 1 · Für Nutzer: drei Schritte

1. **Notiz eingeben:** Die dauerhaft sichtbare, einzeilige Eingabe im Dashboard verwenden.
2. **Speichern:** **Enter** drücken oder die Schaltfläche **💾 Speichern** wählen.
3. **Ergebnis prüfen:** Eine Textmeldung bestätigt den Erfolg und nennt den tatsächlichen Speicherpfad. Bei Fehlern bleibt der eingegebene Text stehen.

**Prinzip:** Eine bestätigte Eingabe erzeugt genau einen neuen, datierten Eintrag. Ältere Einträge bleiben erhalten. Kein automatisches Absenden und keine Cloudpflicht.

## 2 · Verbindlicher Bedienvertrag für neue Übernahmen

| Bereich | Mindestanforderung |
|---|---|
| Eingabe | Sichtbares `input`-/`QLineEdit`-Feld mit genau einer Zeile, gutem Kontrast und Beschriftung |
| Auslösen | Enter **und** klar beschriftete Speichern-Schaltfläche, beide rufen denselben Schreibweg auf |
| Erfolg | Eingabe erst **nach bestätigtem Schreiben** leeren; Status und wirklichen Dateipfad ausgeben |
| Fehler | Eingabe behalten; verständliche Ursache und sicheren nächsten Schritt anzeigen |
| Tastatur/Zoom | Erreichbare Fokusreihenfolge, sichtbarer Fokus, kein verdeckter Speichern-Knopf; kleine Fenster und 200 % Zoom prüfen |
| Privatsphäre | Keine Notizinhalte in Debug-Logs, Telemetrie, Git, Diagnosepakete oder Konsolenausgaben schreiben |
| Mehrfachklick | Während eines Speichervorgangs doppeltes Absenden derselben Eingabe verhindern; nach Erfolg erneute Eingabe ermöglichen |

Für bestehende Projekte gilt der **kompatible Bestandsschutz**: Abweichende Beschriftungen oder ein bereits etablierter Speicherort werden nicht allein für optische Vereinheitlichung verändert.

## 3 · Format und Eingabeprüfung

- Neue einzeilige Eingaben haben **1 bis 1.024 UTF-8-Byte** nach dem erlaubten Rand-Leerraumabgleich. **Bytes, nicht Zeichen** begrenzen; Umlaute und Emojis können mehrere Bytes benötigen.
- Leertext, Zeilenwechsel, Steuerzeichen und die Unicode-Zeilentrenner U+2028/U+2029 werden **abgewiesen**, nicht still in mehrere Einträge umgewandelt.
- Jede Zeile enthält einen lokalen oder UTC-Zeitstempel im eindeutigen **ISO-8601-Format** mit Zeitzone sowie den Notiztext; beim Lesen bleibt die ursprüngliche Zeichenfolge erhalten.
- Standarddarstellung: `2026-11-01T09:09:00+01:00 | Beispielnotiz`. Vorhandene Formate anderer Projekte werden nicht ohne geprüfte Migration umgeschrieben.
- Nur einen vom Programm fest vorgegebenen Zielnamen verwenden; **keine frei editierbaren Dateipfade** aus der Notizeingabe bilden.
- Einen Größenhöchstwert für die Datei festlegen und verständlich melden, wenn er erreicht wird. Die Video-Automation setzt derzeit 8 MiB durch; der Grenzwert ist **nicht** für alle bestehenden Projekte identisch.

## 4 · Zielordner und Datenerhalt

**Neues Quellprojekt:** Bevorzugter sichtbarer Dateiname `SCHNELLSPEICHER.txt`. Liegt das tatsächlich gestartete Quellprojekt in einem beschreibbaren lokalen Arbeitsverzeichnis, darf die Datei dort im **Projekt-Hauptverzeichnis** liegen, wenn das vom Nutzer für dieses Projekt gewünscht ist. Sie muss in `.gitignore` stehen.

**Installierte Anwendung:** Der Programmordner ist oft schreibgeschützt; deshalb im **lokalen Anwendungsdatenordner** speichern und den exakten Pfad anzeigen. Unter Linux beispielsweise `$XDG_DATA_HOME/<app-id>/SCHNELLSPEICHER.txt` beziehungsweise `~/.local/share/<app-id>/SCHNELLSPEICHER.txt`. Niemals ohne Prüfung eine Datei in einem Git-Repository anlegen, die ins Internet übertragen werden könnte.

**Vorhandenes Projekt mit eigener Notizablage:** Alte Schreibpfade, Sicherungen und Wiederherstellungsverträge **nicht automatisch ändern**. Eine Migration benötigt eine bestätigte Sicherung, einen Test der Wiederherstellung und ausdrücklich nachvollziehbare Freigabe. Keine Altnotiz löschen, umbenennen oder „bereinigen“.

**Datenregeln:** Bestehenden Inhalt nicht überschreiben oder kürzen; ausschließlich sicher anhängen beziehungsweise bei bestehendem transaktionalem Speichersystem dessen geprüften Weg verwenden. Den Erfolg erst nach erfolgreichem Abschluss anzeigen. Bei unklarer Teilschreibsituation keine automatische Wiederholung mit Duplikatgefahr.

## 5 · Sicherheit und technische Umsetzung

1. **Zielprüfung:** Nur erlaubtes lokales Verzeichnis; Dateiname und Projektkennung sind feste Programmwerte, keine unkontrollierte Nutzereingabe.
2. **Dateityp prüfen:** Symbolische Links und andere Nicht-Dateien am Ziel abweisen. Unter Linux möglichst `O_NOFOLLOW` und `fstat` **am geöffneten Deskriptor** verwenden; auch übergeordnete Verzeichnisse und Wechsel zwischen Prüfung und Öffnen berücksichtigen.
3. **Anhängen schützen:** Exklusive Sperre beziehungsweise geeigneter Schreibschutz gegen gleichzeitige Vorgänge. Für vorhandene Speicherformate die etablierte Transaktions-/Atomarstrategie beibehalten.
4. **Dauerhaft sichern:** Alle Bytes prüfen und den erfolgreichen Speichervorgang vor der Bestätigung abschließen (zum Beispiel `fsync` auf der Datei, soweit erforderlich).
5. **Fehlerfall:** Berechtigungsfehler, volles Laufwerk, Link, ungültiger Text, Dateigrenze und nicht eindeutige Speicherung **sichtbar** behandeln. Kein verschluckter Fehler und kein stilles Löschen der Eingabe.
6. **Datenschutz:** Keine vollständigen Notiztexte in Ausnahmen, Fehlermeldungen, Prüfprotokollen, Screenshots oder Git-Artefakten ablegen.

> [!WARNING]
> Ein bloßes `is_symlink()` **vor** `open()` reicht gegen ein zwischenzeitlich ausgetauschtes Dateiziel nicht aus. Neue Implementierungen müssen den Schutz am tatsächlich geöffneten Dateiobjekt nachweisen. Dieser Text bescheinigt keine bereits abgeschlossene Sicherheitsprüfung sämtlicher Referenzimplementierungen.

## 6 · Bestehende Referenzen (Ist-Stand, nicht austauschbarer Code)

| Projekt | Referenzstelle | Bestehende Ablage | Besonderheit |
|---|---|---|---|
| [DateiFinder](https://github.com/provoware/PROVOWARE_DATEIFINDER) | `src-tauri/src/quick_notes.rs` | `SCHNELLSPEICHER.txt` im Quellprojekt; installiert lokal | Tauri/Rust; bestehende Rust-Tests |
| [Video-Automation](https://github.com/provoware/PROVOWARE_VIDEO_AUTOMATION_2026) | `src/videobatch_fast/quick_notes.py` | `SCHNELLSPEICHER.txt` im Quellprojekt; installiert lokal | Python, `O_NOFOLLOW`, 8-MiB-Grenze, fokussierte Tests |
| [MultiTool](https://github.com/provoware/TOOL_2026_Multi) | `app/quick_note.py`, `app/ui.py` | `daten/notizen/projekt-notizen.txt` | Transaktionale Speicherung, ältere Notizen, Sicherungs-/Wiederherstellungsvertrag |

**Nicht automatisch auf weitere Projekte anwenden:** Neue Produktfunktionen sind bei `naqya-memo` durch Feature-Freeze gesperrt. `TOOL_ZENTRALE` verlangt vor jeder Iteration eine eigene `main`-Vorprüfung; es besitzt derzeit keine lauffähige Dashboard-Anwendung. Forschungs- und Spiel-Repositories benötigen jeweils eigene Scope- und Freigabeprüfung.

## 7 · Prüfmatrix vor einer Übernahme

| Fall | Erwartung |
|---|---|
| Enter und Speichern | Beide Wege erzeugen genau einen vollständig lesbaren Eintrag |
| Zwei nacheinander gespeicherte Notizen | Beide vorhanden, Reihenfolge und alter Inhalt erhalten |
| Leertext, Zeilenwechsel, Steuerzeichen, U+2028/U+2029 | Abweisung, Zieldatei unverändert |
| 1.024 UTF-8-Byte und 1.025 UTF-8-Byte | Grenzwert akzeptiert / Grenzwert abgewiesen |
| Emoji, Umlaute, Sonderzeichen | Lesbare UTF-8-Runde ohne Datenverlust |
| Symbolischer Link, Verzeichnis statt Datei | Abweisung, fremdes Ziel unverändert |
| Keine Schreibrechte, volle Datei, volles Laufwerk | Sichtbarer Fehler, Eingabefeld unverändert |
| Zweimal schnell geklickt | Keine unbeabsichtigte doppelte Speicherung |
| Neustart, mehrere Fenster/Prozesse | Kein Verlust älterer Einträge, definierte Konfliktbehandlung |
| Installierte Ausgabe, Quellstart, Git-Status | Tatsächlicher Speicherpfad korrekt; private Notizen werden nicht veröffentlicht |
| 800 × 600, 200 % Zoom, Tastatur, Themes | Eingabe, Speicherknopf und Status ohne verdeckte Bedienung nutzbar |
| Backup und Restore bestehender Projekte | Frühere Notizen weiterhin verfügbar; keine ungeprüfte Migration |

## 8 · Einführung in einem weiteren Projekt

1. Projekt-`AGENTS.md`, aktuellen `main`, offene PRs und vorhandene Notizfunktionen **lesend prüfen**.
2. Nutzen und Datenpfad klären; vorhandene Funktion **wiederverwenden**, statt ein zweites Notizsystem zu bauen.
3. Kleinsten freigegebenen Patch im eigenen Zweig erstellen; die projektintern vorgeschriebenen Tests **auf dem konkreten Commit** ausführen.
4. Fehlerfälle inklusive Link-/Rechteprüfung und Bewahrung alter Notizen testen; Änderungen erst nach erfolgreicher Prüfung integrieren.
5. Nach dem Merge den echten `main`-Stand erneut prüfen. Fehlt die Freigabe, den Vorschlag dokumentieren und **keinen produktiven Schreibpfad** verändern.

**Geltung:** Eine dokumentierte Referenz wird erst durch die jeweiligen Projektregeln und eine geprüfte Implementierung zum verbindlichen Produktverhalten. Kein automatisches Ausrollen in fremde Repositories.
