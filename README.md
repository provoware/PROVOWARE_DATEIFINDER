# PROVOWARE DateiFinder

<!-- PROVOWARE_DREISTUFIGER_EINSTIEG_20261101 -->
## 🚀 Zuerst starten – 3 kurze Schritte

> [!IMPORTANT]
> **Linux Mint, Kubuntu oder Ubuntu:** Terminal im gewünschten Arbeitsordner öffnen. Jeden Befehl einzeln kopieren. Dies ist ein **Entwicklungsstand**, keine fertig abgenommene Installation.

1. **Projekt holen**
   ```bash
   git clone https://github.com/provoware/PROVOWARE_DATEIFINDER.git
   ```
2. **Ordner öffnen**
   ```bash
   cd PROVOWARE_DATEIFINDER
   ```
3. **Programm starten**
   ```bash
   ./start.sh
   ```

## 🧭 Drei Hilfestufen

| Stufe | Für wen? | Direkter Einstieg |
|---|---|---|
| 🟢 **1 · Kurz** | Sofort ausprobieren | [Die drei Befehle](#-zuerst-starten--3-kurze-schritte) |
| 🔵 **2 · Ausführlich** | Voraussetzungen, Suchmöglichkeiten und Bedienung | [Schnellstart](#schnellstart) · [Dateisuche](#suche-und-fenstergröße) |
| 🟠 **3 · Ohne Vorwissen** | Probleme erkennen und sicher lösen | [Fehlerhilfe unten](#-hilfe-ohne-vorkenntnisse) |

> [!TIP]
> **Zuerst nur prüfen:** Nach Schritt 2 kannst du `./start.sh --check` ausführen. Damit prüfst du die Umgebung, ohne das Programm zu starten oder etwas zu reparieren.

## 🧩 Hilfe ohne Vorkenntnisse

- **Was ist ein Terminal?** Ein Fenster für Befehle; auf Kubuntu häufig mit **Strg + Alt + T** öffnen. Kopierten Befehl mit **Enter** bestätigen.
- **„git: command not found“:** Git fehlt. Auf Ubuntu/Kubuntu/Mint kann es über die Paketverwaltung installiert werden.
- **„Permission denied“ beim Start:** Im Projektordner `bash ./start.sh` verwenden, wenn die Datei nicht ausführbar markiert ist.
- **Fehlende Werkzeuge:** Zuerst `./start.sh --check` verwenden und die konkrete Fehlermeldung lesen. Der normale Start kann notwendige Installationsschritte vorschlagen.
- **Dateisicherheit:** Suchordner bewusst auswählen. Originaldateien nicht nur zum Testen verschieben oder löschen.
- **TXT-Export:** Nach [PR #74](https://github.com/provoware/PROVOWARE_DATEIFINDER/pull/74) werden unsichtbare Unicode-Richtungszeichen in Namen und Pfaden als sichtbare `\\uXXXX`-Folgen ausgegeben. Die gespeicherten Originaldateien bleiben unverändert.

> [!WARNING]
> **Noch offen:** Mobile-Dateiquellen, reale Plattformabnahme und Lizenzentscheidung sind nicht abgeschlossen. 🟢 = geprüft, 🟠 = offen, 🔴 = gesperrt; die Farben besitzen immer eine Textbeschreibung.

---

Lokale Dateinamen schnell durchsuchen – **Tauri 2 + Vanilla TypeScript + HTML/CSS + Rust**, ohne Cloudpflicht.

## Status

**Browser-Testschutz (02.11.2026, PR-Entwurf):** Playwright begrenzt einzelne Browseraktionen auf 15 Sekunden und Navigationen auf 30 Sekunden. Die bisherige 30-Sekunden-Testgrenze, 30-Sekunden-Serverstartgrenze und die bestehenden CI-Jobgrenzen bleiben unverändert. Drei zusätzliche Vertragsprüfungen einschließlich Negativfällen sichern die Konfiguration ab. Das betrifft ausschließlich die Testumgebung, nicht die Laufzeit der Dateisuche. Eine erfolgreiche CI-Prüfung ersetzt keine reale Kubuntu-Endabnahme.

**v0.1.1 – Foundation Frozen / Desktop Search MVP**

- ✅ Foundation-Baseline auf `e01ff57` eingefroren
- ✅ Tauri-2-Grundgerüst
- ✅ vier Theme-Tokens: Cyan, Violett, Grün, Orange
- ✅ Referenzmodus 768 × 512 px
- ✅ rekursive Desktop-Dateinamensuche in Rust
- ✅ inkrementelle Ergebnis-Batches
- ✅ Suchabbruch
- ✅ Sortierung, Mehrfachauswahl, Vorschau-Metadaten
- ✅ Datei öffnen / im Dateimanager anzeigen
- ✅ TXT-Export
  - Dateinamen mit Tabulatoren, Zeilenumbrüchen oder Steuerzeichen bleiben beim TXT-Export je Datei in einer Zeile. Sonderzeichen erscheinen als sichtbare Folgen wie `\\t`, `\\n` und `\\\\`.
- ✅ serverseitige Root-Freigabe: Desktop-Suchorte werden im Rust-Kern registriert
- ✅ minimale plattformspezifische Capabilities
- ✅ responsive Mobile-Basis
- ✅ Foundation-CI und Hardening-Gates grün
- 🟡 Mobile-Dateiquellen sind vorbereitet; Android SAF/iOS Document Provider folgen separat
- ✅ Nutzerfreundlichkeit / Barrierefreiheit nach PR #17/#18 geprüft und eingefroren
- ✅ große Trefferlisten virtualisiert; 20.000-Treffer-Grenze wird sichtbar gemeldet
- ✅ Scanner prüft eingereihte Ordner vor Zugriff erneut gegen den freigegebenen Suchort
- ✅ vollständige Hardening-Suite inklusive 5.000-Treffer-, 200-%- und Golden-Prüfung
- ✅ wöchentliche Abhängigkeitsüberwachung für npm, Cargo und GitHub-Actions
- ✅ flexible Fenstergröße (Start 768×512, Mindestgröße 620×420) und intern scrollbar begrenzte Trefferliste
- ✅ vor der Suche kombinierbare Dateitypfilter für Bilder, Dokumente, Audio und Sonstige
- ✅ Mehrwortsuche mit „alle Wörter“ oder „mindestens eines“
- ✅ live sichtbare Prüfzahlen, Treffer, Laufzeit und Suchgeschwindigkeit (Fortschritt ohne erfundene Prozentzahl)
- ✅ kompakte, farbige Fund-Statistik nach Dateityp, Änderungsjahr oder Größenklasse mit exakten Stückzahlen
- ✅ bis zu 20 benannte Suchvorlagen samt Dateitypfiltern und Wortmodus, inklusive JSON-Import/Export
- ✅ Wiederverwendung des letzten Suchorts nach erneuter Prüfung und ausdrücklicher Freigabe beim Start
- ✅ persistenter Zoom (80–150 %) über Einstellungen, Strg + Mausrad oder Strg + 0
- ✅ optionale Textinhaltssuche und Textvorschau für ausgewählte UTF-8-Formate bis 256 KB pro Datei
- ✅ vollständigen Dateipfad aus der Vorschau kopieren
- ✅ Einstellungen im Dashboard-Header für Farbschema und Suchwort-Vorgabe
- ✅ dezente Farbtönung der Ergebniszeilen für Bilder, Dokumente, Audio und sonstige Dateien
- ✅ Startprüfung für belegten Vite-Port 1420 mit sicherer Zuordnung statt blindem Prozessabbruch
- ✅ adaptives Großbildschirm-Layout mit breiterer Navigation, lesbareren Bedienelementen und informativeren Leerzuständen
- ✅ Datei-Details mit großem Dateitypsymbol statt einer irreführenden statischen Vorschaugrafik auf breiten Bildschirmen

## Schnellstart

Voraussetzungen: Node.js >= 20.19, Rust >= 1.90 und die Tauri-Systempakete für das jeweilige Betriebssystem.

### Empfohlen: Linux Mint, Kubuntu und Ubuntu

Der Startassistent prüft vor jedem Start den Projektordner, Node.js/npm,
Linux-Bibliotheken, Rust/Cargo und die JavaScript-Abhängigkeiten. Fehlende
Komponenten werden nach verständlicher Rückfrage eingerichtet; nötige
Administratorrechte fordert Linux selbst an. Der Starter führt weder
`apt upgrade` noch `npm audit fix --force` aus.

```bash
./start.sh --check       # Nur prüfen, nichts reparieren oder starten
./start.sh               # Prüfen, bei Bedarf reparieren, Anwendung starten
```

Weitere Optionen: `--no-repair` (niemals installieren), `--audit` (zusätzliche
Sicherheitsprüfung), `--yes` (freigegebene Reparaturen ohne Rückfrage erlauben)
und `--help`. Mit `Strg+C` lässt sich der laufende Start beenden. Das
Diagnoseprotokoll wird jeweils im Terminal angezeigt und unter
`~/.local/state/provoware-dateifinder/` gespeichert (gegebenenfalls unter
`$XDG_STATE_HOME`).

Die automatische Systemreparatur ist bewusst auf Tauri 2 unter Debian-basiertem
Linux begrenzt. Fehlt eine geeignete Node.js-Version und ist kein `nvm`
vorinstalliert, verweist der Assistent auf die manuelle Node.js-Installation.
Er kann keine Projektfehler im Quellcode selbstständig beheben.

**Falls Port 1420 bereits belegt ist:** Der Assistent prüft zuerst den
Prozessbesitzer, den genauen Projektordner und den Vite-Startbefehl. Einen
eindeutig eigenen Entwicklungsserver beendet er erst nach Zustimmung (mit
`--yes` ist diese Zustimmung vorab erteilt). Fremde oder nicht eindeutig
erkannte Prozesse werden **niemals** beendet; stattdessen zeigt der Starter
einen verständlichen Hinweis. `--check` verändert nichts, `--no-repair`
stoppt ohne Reparatur. Ein erst beim Programmstart entstandener Portkonflikt
erhält höchstens einen weiteren Startversuch. Ohne `ss` ist keine sichere
automatische Prozesszuordnung möglich; dann gibt es nur eine Warnung.

### Manueller Entwicklungsstart

```bash
npm install
npm run tauri dev
```

Nur Frontend:

```bash
npm run dev
```

Prüfen:

```bash
npm run typecheck
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## Architektur in einem Satz

Die UI kennt nur **Fähigkeiten und Ports**, nicht Windows/Android/iOS-Sonderfälle. Desktop durchsucht freigegebene Ordner über Rust; Mobile erhält eigene Quellenadapter hinter derselben Schnittstelle.

## ☑ Trefferauswahl und 💾 Schnellspeicher

> [!TIP]
> **Projektübergreifender Standard:** [PROVOWARE-Schnellspeicher – Bedienung, Datenschutz, sichere Ablage und Prüffälle](docs/PROVOWARE_SCHNELLSPEICHER_STANDARD.md). Bestehende Notizordner anderer Projekte werden nicht ungeprüft geändert.

- **Alle auswählen / Alle abwählen:** Direkt über der Trefferliste schaltet der Knopf zwischen allen aktuell gefundenen Treffern und keiner Auswahl um. Das gilt auch für Treffer, die erst beim Scrollen sichtbar werden (bis zur angezeigten Treffergrenze von 20.000). Während einer laufenden Suche kommen möglicherweise neue, noch nicht ausgewählte Treffer hinzu. Für Kopieren, Verschieben und ZIP gelten unverändert die Sicherheitsgrenzen von maximal **100 Dateien / 8 GiB** je Vorgang.
- **Schnellspeicher:** Im oberen Dashboard die Notiz einzeilig eingeben und mit **Enter** oder **💾 Speichern** bestätigen. Jede Notiz wird mit Zeitstempel **am Ende** der festen Datei `SCHNELLSPEICHER.txt` angehängt. Vorhandene Einträge werden nicht überschrieben. Leere Eingaben, Zeilenumbrüche und zu lange Eingaben werden abgewiesen. Bei Speicherfehlern bleibt der Text im Feld.
- **Ablage:** Beim Entwicklungsstart (`./start.sh` / `npm run tauri dev`) liegt die Datei direkt im **Projekt-Hauptverzeichnis** neben `README.md`. In einer installierten Programmversion ist dieser Quellordner nicht zuverlässig vorhanden oder beschreibbar; dort wird die Datei unter dem **lokalen Anwendungsdatenverzeichnis** des Systems angelegt. Der nach dem Speichern angezeigte vollständige Pfad zeigt den tatsächlichen Ort. Die Datei ist in `.gitignore` eingetragen, damit private Notizen nicht versehentlich auf GitHub landen.

## Suche und Fenstergröße

1. Suchordner wählen und mehrere Wörter eingeben (z. B. `rechnung 2025`).
2. Wahlweise **alle Wörter** oder **mindestens eines** verlangen.
3. Vor dem Start **Dateitypen** anklicken. Mehrere Gruppen lassen sich kombinieren; **Alle** hebt die Eingrenzung auf.
4. Während der Suche zeigt der Ergebnisbereich geprüfte Einträge, Trefferzahl, Laufzeit und Einträge pro Sekunde. Weil die Gesamtzahl vorab unbekannt ist, läuft der Balken ohne Prozentversprechen.

Das Fenster lässt sich verkleinern und vergrößern. Große Trefferlisten erweitern nicht das Fenster, sondern scrollen innerhalb des Ergebnisbereichs. Über das Zahnrad im Header lassen sich Farbschema und Standard-Suchmodus einstellen.

Über **„▥ Grafik“** bei den Ergebnissen lässt sich die kleine Fund-Statistik ein- und ausblenden. Sie zeigt die Mengen grafisch und als lesbare Zahlen. Im Auswahlfeld **„Funde nach“** wechselst du zwischen **Dateityp**, **Jahr** (letztes Änderungsdatum) und **Dateigröße** (0 Byte, unter 1 MB, 1–10 MB, 10–100 MB, 100 MB–1 GB, ab 1 GB). Bei älteren oder fehlenden Zeitangaben gibt es die Gruppen „Ältere“ beziehungsweise „Ohne Datum“. Auf großen Bildschirmen öffnet sich die Statistik mit den ersten Treffern automatisch; in kleinen Fenstern öffnest du sie bei Bedarf, ohne die Liste zu verkleinern. Sie zählt die tatsächlich angezeigten Treffer, nicht alle geprüften Dateien. Während der Suche ist das ein Zwischenstand; bei einer Trefferbegrenzung ist die Statistik ebenfalls unvollständig.

Ab einer Fensterbreite von 1200 CSS-Pixeln wachsen Navigation, Schrift,
Suchbedienelemente und Dateidetails kontrolliert mit. Wenn noch keine Treffer
existieren, erklärt die Mitte den nächsten sinnvollen Schritt: Ordner wählen,
Suchbegriff eingeben oder bei null Treffern die Filter anpassen. Die
Detailkarte zeigt Dateityp, Größe, Datum und Pfad; sie verspricht bewusst
keine Inhaltsvorschau. Ein neu gewählter Suchordner setzt die bisherigen
Treffer zurück, damit alte Ergebnisse nicht als Treffer des neuen Ordners
erscheinen. Die kompakte 768×512-Ausgangsansicht bleibt erhalten.

Die Trefferliste markiert Bilder dezent cyanblau, Dokumente rosarot,
Audio violett und sonstige Dateien grünlich. Die Dateinamen bleiben gut
lesbar; die Farben ergänzen Dateisymbol und Dateityp, statt sie zu ersetzen.

### Markierte Dateien sicher kopieren, verschieben und zippen

Nach der Suche gewünschte Treffer anklicken. Oberhalb der Treffer erscheinen
**„Kopieren“**, **„Verschieben“** und **„Als ZIP“**. Aktion wählen, optional einen
neuen Unterordner bzw. ZIP-Namen eintragen und den Zielordner über den
Linux-Systemdialog auswählen. Währenddessen zeigt DateiFinder die abgeschlossene
Dateianzahl und bietet **„Abbrechen“**.

Es werden höchstens 100 Dateien mit zusammen maximal 8 GiB je Vorgang
angenommen. Bestehende Dateien werden **niemals überschrieben**. Wenn zwei
markierte Dateien denselben Namen tragen, müssen sie getrennt übertragen werden.
Das Programm legt erst eine temporäre Kopie im Zielverzeichnis an, vergleicht
den Inhalt byteweise und gibt sie danach frei. Beim Verschieben wird die
Originaldatei erst nach dem erfolgreichen Zielvergleich gelöscht. Bei Fehlern
werden unvollständige Zwischendateien entfernt; bereits erfolgreich
übertragene Dateien bleiben bestehen und werden als Teilabschluss gemeldet.
Auf einigen USB-Laufwerken ohne Hardlink-Unterstützung wird ein alternativer
exklusiver Kopierweg verwendet.

Für **„Als ZIP“** muss auf Linux das Paket `zip` installiert sein
(`sudo apt install zip`). ZIP-Archive werden vor der Freigabe mit `zip -T`
getestet und nach dem Übertragen erneut verglichen. Die Quelldateien bleiben
beim ZIP-Erstellen immer erhalten. Bei einem Abbruch während des Verschiebens
können bereits fertig verschobene Dateien im Ziel liegen; der Status informiert
über die Anzahl. Eine bestehende Datei wird auch dann nie still überschrieben.

**Vorbereitung auf Version 0.2:** Der Dialog zeigt zusätzlich verarbeitete Byte,
Gesamtgröße, durchschnittliche Übertragungsrate und – soweit sinnvoll – eine
vorsichtige Restzeit-Schätzung. Bei ZIP wird zunächst der Kopierfortschritt der
Quelldaten angezeigt; Komprimierung und Archivprüfung werden danach als eigene
Schritte ausgewiesen. Die Anzeige verspricht nicht, die Komprimierungszeit
exakt zu berechnen. Fortschrittsereignisse werden gedrosselt, damit auch große
Dateien die Oberfläche nicht mit Meldungen überlasten.

Kontrollierte Tests prüfen nun auch Abbruch **mitten im Schreiben**, während
der Übertragung veränderte Quelldateien, plötzlich entstandene Zielkollisionen
und einen sicheren erneuten Versuch nach einer älteren temporären Datei.
Zurückgelassene fremde oder unbekannte temporäre Dateien werden aus
Sicherheitsgründen nicht automatisch gelöscht.

### Gespeicherte Suchvorlagen und Startassistent

Unter **Einstellungen** kannst du die aktuelle Suchanfrage mit einem Namen speichern. Der DateiFinder merkt sich dazu die Wortverknüpfung und ausgewählte Dateitypen. Bereits vorhandene Vorlagen erscheinen als Schnellzugriff in der Suche. Bis zu 20 Vorlagen sind möglich. Import und Export funktionieren über JSON-Dateien; vorhandene Namen werden beim Import nicht ungefragt ersetzt. **Strg + Umschalt + S** öffnet die Vorlageneinstellungen.

Der letzte Suchordner und die letzte Suchanfrage werden für den nächsten Start gespeichert. Dabei gilt: Ein alter Ordnername verleiht noch keine Zugriffsberechtigung. Beim Neustart prüft DateiFinder zuerst, ob der Ordner lesbar ist, und fragt über **„Diesen Ordner verwenden“**, **„Anderen Ordner wählen“** oder **„Jetzt nicht“**, wie es weitergehen soll.

### Textsuche, Vorschau und Anzeigegröße

In **Einstellungen → Inhaltssuche** lässt sich ergänzend zur Dateinamensuche das Durchsuchen lesbarer Textdateien einschalten. Unterstützt werden unter anderem TXT, MD, CSV, JSON, LOG, HTML und gängige Quelltextformate. Pro Datei werden höchstens 256 KB gelesen; größere Dateien, PDFs, Office- und Binärformate werden **nicht inhaltlich durchsucht**. Der vorhandene Suchabbruch bleibt aktiv; auf sehr großen Dateibäumen kann die Inhaltssuche länger dauern.

Beim Auswählen einer passenden Textdatei erscheint anstelle des Typsymbols eine scrollbar begrenzte Textvorschau. Sie liest nur innerhalb des freigegebenen Suchorts, akzeptiert UTF-8 und zeigt höchstens 20.000 Zeichen. Der Pfad lässt sich über den kleinen Knopf daneben kopieren. In **Einstellungen → Anzeigegröße** sind 80–150 % möglich; Strg + Mausrad ändert die Zoomstufe, Strg + 0 stellt 100 % wieder her. Das Farbschema, der Suchmodus, die Inhaltssuche und der Zoom bleiben gespeichert.

Siehe:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`docs/ROADMAP.md`](docs/ROADMAP.md)
- [`AGENTS.md`](AGENTS.md)

## Sicherheitsprinzip

DateiFinder verarbeitet Dateinamen lokal. Der Desktop-Suchort wird im Rust-Kern per Systemdialog gewählt und dort für die laufende Sitzung registriert. `start_search`, `open_file` und `reveal_file` akzeptieren nur registrierte Roots und kanonische Kindpfade.

## Lizenz

Noch nicht festgelegt. Vor einer öffentlichen Release-Version bewusst entscheiden.

## Verifizierter Kandidat 2026-09-20

Die UI-/Accessibility-Änderungen aus PR #13 wurden in einem isolierten Vollvalidierungslauf geprüft. Der finale PR-Head wird nach diesem Commit erneut durch die normalen Quality- und Hardening-Gates geprüft. Versionsfelder in npm, Cargo und Tauri sind auf 0.1.1 synchronisiert.

## Zeitlimits und sichere Wiederaufnahme

Der [PROVOWARE-Zeitlimitstandard](docs/PROVOWARE_TIMEOUT_STANDARD.md) legt eine abgestufte Überwachung fest. Die bereits vorhandenen CI-Obergrenzen bleiben unverändert. Keine unkontrollierten Wiederholungen oder Dateneingriffe bei Stillstand. Eine beschriebene Regel ist noch kein Nachweis einer vollständig eingebauten technischen Überwachung.
