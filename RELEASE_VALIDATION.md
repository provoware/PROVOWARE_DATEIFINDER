# PROVOWARE DateiFinder – Release Validation

## Herkunft

- Repository: provoware/PROVOWARE_DATEIFINDER
- Basis: PR #13, Commit 80f4e21313712328eb313fecc456fc4a95c2da0c
- Isolierte Vollvalidierung: GitHub Actions Run 35475208724, vollständig GRÜN
- Produktversion: 0.1.1

## Behobene Inkonsistenzen

- Golden-Referenz an den bewusst geänderten 768×512-Stand angeglichen.
- Suchhilfe im engen Referenzlayout auf `? Hilfe` komprimiert.
- Markenbereich so gehärtet, dass `DateiFinder` nicht abgeschnitten wird.
- P1-Roadmap an vorhandene Messungs-, Fixture-, Pixel- und Theme-Gates angeglichen.
- npm-, Cargo- und Tauri-Versionen synchronisiert.
- Start- und lokale Prüfskripte ergänzt.
- `src-tauri/gen/` bleibt generierter Build-Output und wird nicht versioniert.

## Verbindliche Gates

Der finale PR-Head darf erst nach grünen normalen GitHub-Gates gemergt werden:
Source Contracts, TypeScript, Build, rustfmt, Clippy, Rust-Tests, Stress, Security,
UI-E2E, 200%-Layout und Golden Regression.

## Native Dialogprüfung und Versionsabgleich - 01.11.2026

Der historische Nachweis oben ersetzt diese neue Prüfung nicht. Ausgangspunkt:
`main` cd6cc9e; die Namenshärtung aus #77 ist im geprüften gemeinsamen Stand enthalten.

### Ursache und Korrektur

- Der unveränderte native Build brach wegen Tauri 2.11.5 / JS-API 2.12.4 und Dialog 2.7.3 / JS-Plugin 2.8.4 ab.
- Tauri auf 2.12.4, Dialog auf 2.8.4, Speicher-Plugin beidseitig auf 2.4.5 abgeglichen; benötigtes tauri-build 2.7.4 und beide Lockdateien aktualisiert. Mindest-Rust 1.90 im Manifest und README berichtigt.
- Die strenge Prüfung mit Rust 1.98.1 verlangt `is_multiple_of` statt des gleichwertigen Restvergleichs. Der Schutz gegen Breite 0 bleibt vor der Operation erhalten.
- Frischer Start zeigte in der Liste fälschlich 80 %, obwohl die Webansicht mit 100 % lief. Die 100-%-Option ist jetzt ausdrücklich vorausgewählt. Bestehende Oberflächenprüfung um diesen Bedienvertrag ergänzt.
- Capability-Dateien und Dateisystemrechte unverändert; keine zusätzlichen Produktabhängigkeiten.

### Tatsächlich ausgeführte Prüfung

Ubuntu-24.04-Testumgebung, nativer Tauri-Debug-Build mit eingebautem Produktions-Frontend, WebKitGTK 2.52.3, Xvfb/X11 und tauri-driver 2.1.0. Frische, isolierte Einstellungen; keine persönlichen Dateien. Testumgebungsabhängigkeiten wurden separat bereitgestellt.

- `npm run tauri -- build --debug --no-bundle`: erfolgreich, ohne Versionsprüfung zu umgehen.
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`: bestanden.
- `cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: bestanden.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml`: 40 Tests bestanden.
- `node --test tests/hardening/source-contracts.mjs`: 25 bestanden.
- Vier Themes bei 768x512 und Dialog bei 620x420: Browser-Bedienprüfung bestanden, keine horizontale Seitenüberbreite bei 768x512. Das ist keine native Wayland-Abnahme.

Native Messung: äußeres Fenster exakt 800x600; nach Auswahl 150 % logische Webansicht 533x400, devicePixelRatio 1.5, CSS-zoom leer. Dialog 440x360 logische Punkte, scrollbarer Inhalt. Der Schließen-Knopf liegt am Anfang unterhalb des sichtbaren Ausschnitts, ist per Tab/Scroll erreichbar und danach vollständig sichtbar (y=323..361 bei 400 Höhe). Drei native Mausklick-Abschlüsse und ein Enter-Abschluss erfolgreich. Frischer Start zeigt 100 %.

Messwerte und SHA-256 der geprüften Produktdateien: [native-dialog-150-20261101.json](docs/native-dialog-150-20261101.json). Die native Maus wurde in Bildschirmkoordinaten über X11 bedient; keine DOM-Klicks, keine CSS-Zoomsimulation und kein erzwungener Klick.

### Grenzen und Wiederholung

Der frühere CSS-Zoom-Browserbefund bestätigt keine native Unerreichbarkeit. Diese native Stichprobe widerlegt ihn für die geprüfte Linux-Konfiguration. Ein erweiterter nativer Rundlauf nach zusätzlicher Zoomrückstellung/Fensteränderung verlor die WebDriver-Verbindung und ist **nicht bestanden / Ursache offen**; daraus wird keine Programmabsturz-Ursache behauptet. Die angeforderte 800x600-/150-%-Prüfung lief separat vollständig erfolgreich.

Zum praktischen Wiederholen: nativen Build starten, Fenster auf 800x600 setzen, Einstellungen öffnen, 100-%-Standard prüfen, 150 % auswählen, mit Tab zum Schließen-Knopf wechseln, einmal mit Enter und nach erneutem Öffnen mit der Maus schließen. Auf dem eigenen Kubuntu-/Wayland-Desktop bleibt die abschließende Zielsystemabnahme offen; kein Release durch diesen Prüfbericht.

Offizielle Grundlage: https://v2.tauri.app/develop/updating-dependencies/ und https://v2.tauri.app/develop/tests/webdriver/example/selenium/.
