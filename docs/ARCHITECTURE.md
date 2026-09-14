# Architektur

## Ziel

Eine gemeinsame Codebasis für Desktop und Mobile. Unterschiede des Betriebssystems werden an wenigen Grenzen gekapselt.

```text
UI (HTML/CSS/TypeScript)
        │
        ├─ AppState / Darstellung
        │
        └─ kleine Tauri-Adapterfunktionen
                │
             Tauri IPC
                │
        Rust Commands / Search Core
                │
        Desktop / spätere Mobile-Provider
```

## Aktueller Foundation-Stand

Die erste belastbare Version hält die Zahl der Dateien bewusst klein: Frontendkoordination liegt aktuell in `src/main.ts`, der Rust-Kern in `src-tauri/src/lib.rs`. Erst nach grünem Build-/Test-Gate werden diese Dateien entlang stabiler Verantwortlichkeiten aufgeteilt. So vermeiden wir frühe Abstraktionen, die später wieder verworfen werden.

Geplante Extraktion nach dem Foundation-Gate:

- `src/app/` – Zustand, Aktionen und gemeinsame Typen.
- `src/platform/` – Tauri-Adapter / Capability-Abfragen.
- `src-tauri/src/search/` – Scanner und Matcher.
- `src-tauri/src/commands/` – dünne IPC-Kommandos.
- `src-tauri/src/models.rs` – serialisierte IPC-Verträge.

## Sicherheitsgrenze

Der Desktop-Suchort wird **nicht** vom Frontend als beliebiger Pfad freigeschaltet. `pick_search_root` öffnet den nativen Dialog im Rust-Kern, kanonisiert den gewählten Ordner und registriert ihn nur für die laufende Sitzung. `start_search`, `open_file` und `reveal_file` akzeptieren anschließend nur registrierte Roots und kanonische Kindpfade darunter.

Damit reicht ein manipuliertes Frontendargument nicht aus, um beliebige Pfade außerhalb eines bewusst gewählten Suchorts zu öffnen.

## Search Pipeline

```text
freigegebener Root
→ breadth-first directory queue
→ Symlinks überspringen
→ Dateiname normalisieren
→ AND-Token-Matcher
→ Metadaten
→ Batches (10..500)
→ Tauri Event
→ UI-Liste
```

Hard Limits:

- `maxResults`: 1..250000 im Rust-Kern; UI fordert aktuell max. 20000 an.
- sichtbare DOM-Zeilen: zunächst max. 2000; echte Virtualisierung folgt im Performance-Gate.
- Export: max. 250000 Zeilen.
- Exportzeile: max. 32768 Zeichen.
- registrierte Suchroots pro Sitzung: max. 64.

## Race-/Abbruchschutz

Die UI erzeugt die Search-Session-ID **vor** `start_search`. Dadurch können keine frühen Batch-Events zwischen Start und Rückgabe der Command-ID verloren gehen. Neue Suchen brechen die vorherige Session ab; alte Events werden anhand der Session-ID ignoriert.

## Mobile

Der offizielle Tauri-Dialog bietet Android/iOS keine allgemeine Ordnerauswahl wie auf Desktop. Mobile wird deshalb nicht mit Desktop-Pfadannahmen nachgebaut.

Geplante Provider:

- `PickedFilesSource` – systemseitig ausgewählte Dateien.
- `AndroidTreeSource` – Storage Access Framework / persistente Tree-URI.
- `IosDocumentSource` – Document Provider / security-scoped Zugriff.

UI und `FileEntry` bleiben gleich; Unterschiede liegen hinter Capability-/Provider-Grenzen.

## Entscheidungsregel

Erst wenn CI, Desktop-Suche und der 768×512-Visual-Master stabil sind, wird weiter modularisiert. Ziel ist **weniger Kopplung**, nicht möglichst viele Dateien.
