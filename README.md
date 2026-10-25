# PROVOWARE DateiFinder

Lokale Dateinamen schnell durchsuchen – **Tauri 2 + Vanilla TypeScript + HTML/CSS + Rust**, ohne Cloudpflicht.

## Status

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
- ✅ Einstellungen im Dashboard-Header für Farbschema und Suchwort-Vorgabe
- ✅ dezente Farbtönung der Ergebniszeilen für Bilder, Dokumente, Audio und sonstige Dateien
- ✅ Startprüfung für belegten Vite-Port 1420 mit sicherer Zuordnung statt blindem Prozessabbruch
- ✅ adaptives Großbildschirm-Layout mit breiterer Navigation, lesbareren Bedienelementen und informativeren Leerzuständen
- ✅ Datei-Details mit großem Dateitypsymbol statt einer irreführenden statischen Vorschaugrafik auf breiten Bildschirmen

## Schnellstart

Voraussetzungen: Node.js >= 20.19, Rust >= 1.77.2 und die Tauri-Systempakete für das jeweilige Betriebssystem.

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

## Suche und Fenstergröße

1. Suchordner wählen und mehrere Wörter eingeben (z. B. `rechnung 2025`).
2. Wahlweise **alle Wörter** oder **mindestens eines** verlangen.
3. Vor dem Start **Dateitypen** anklicken. Mehrere Gruppen lassen sich kombinieren; **Alle** hebt die Eingrenzung auf.
4. Während der Suche zeigt der Ergebnisbereich geprüfte Einträge, Trefferzahl, Laufzeit und Einträge pro Sekunde. Weil die Gesamtzahl vorab unbekannt ist, läuft der Balken ohne Prozentversprechen.

Das Fenster lässt sich verkleinern und vergrößern. Große Trefferlisten erweitern nicht das Fenster, sondern scrollen innerhalb des Ergebnisbereichs. Über das Zahnrad im Header lassen sich Farbschema und Standard-Suchmodus einstellen.

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
