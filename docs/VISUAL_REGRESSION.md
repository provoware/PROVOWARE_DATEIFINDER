# Visual Regression Gate

## Zweck

Der DateiFinder besitzt eine feste **768×512 Golden Reference**. Sie schützt die Grundoberfläche vor unbeabsichtigten Layout-, Abstands-, Farb- und Größenänderungen.

Die visuelle Prüfung ergänzt die funktionalen Gates. Sie ersetzt weder TypeScript-/Build-Prüfungen noch Rust-Tests.

## Deterministische Testumgebung

Die Referenz wird unter folgenden festen Bedingungen erzeugt und geprüft:

- Ubuntu 24.04 GitHub Runner
- Node.js 22.23.2
- Playwright 1.63.0
- Chromium aus genau dieser Playwright-Version
- Viewport exakt 768×512 CSS-Pixel
- Device Scale Factor 1
- Farbschema dunkel
- reduzierte Animationen
- JavaScript für die Golden Reference deaktiviert

JavaScript ist absichtlich deaktiviert. Dadurch prüft dieses Gate ausschließlich die statische, für Tauri gerenderte Grundoberfläche aus HTML und CSS. Native Tauri-Aufrufe, Dateidialoge und Betriebssystemzustände können das Referenzbild deshalb nicht zufällig verändern.

## Vergleichsregel

Playwright vergleicht den aktuellen Screenshot mit der versionierten Referenz. Erlaubt sind höchstens **200 abweichende Pixel** bei einer Farb-Toleranz von `0.1`. Das entspricht bei 768×512 weniger als 0,051 Prozent der Bildfläche und fängt kleine Render-/Antialiasing-Abweichungen ab, ohne echte Layoutverschiebungen zu verdecken.

Unerwartete Abweichung = CI rot.

## Lokale Befehle

Prüfen:

```bash
npm run test:visual
```

Referenz nur nach einer bewusst freigegebenen Designänderung erneuern:

```bash
npm run test:visual:update
```

Eine neue Referenz darf nicht automatisch akzeptiert werden, nur damit CI wieder grün wird. Vor dem Aktualisieren ist zu prüfen, ob die sichtbare Änderung beabsichtigt ist.

## Abnahme

### Bewusste Referenzanpassung – flexible Suche

Die neue Suchmaske mit Dateityp-Schaltern, Verknüpfung mehrerer Suchbegriffe,
Statuskennzahlen und Einstellungszugang verändert die statische Darstellung
absichtlich. Der GitHub-CI-Lauf `40192458583` hat bei 768×512 folgende
neuen SHA-256-Prüfsummen der PNG-Aufnahmen gemessen:

- DateiFinder: `1d4e722121803ad4d25255b1b5782e385d4a61f70fee3c0455bc318ed654b57d`
- Cyan-Fixture (gemeinsames Stylesheet): `fd51974e4954b9f6705a8e8c52212dc6f43becd12b091c62909aea8b0d576ea8`

Die Prüfsummen sind zur geänderten Oberfläche versioniert; die vollständige
Browser- und Layoutabnahme bleibt ein eigenständiges Pflicht-Gate.

### Bewusste Referenzanpassung – Farben für Dateiarten

Die Trefferzeilen besitzen jetzt abhängig vom Dateityp einen dezenten
Farbverlauf. Das 768×512-Hauptfenster bleibt unverändert; nur die
Beispiel-Trefferliste der Cyan-Fixture zeigt die neue Zeilenfarbe. Der
GitHub-CI-Lauf `40196871576` hat für diese beabsichtigte Änderung
folgende neue PNG-SHA-256-Prüfsumme ermittelt:

- Cyan-Fixture: `cbc76211e6e5e06840232c65f06234561e9c4a5644a57bc1d85123691a3f6019`
- Hauptfenster: weiterhin `1d4e722121803ad4d25255b1b5782e385d4a61f70fee3c0455bc318ed654b57d`

Die Regression umfasst weiterhin beide unabhängigen Referenzen. Die neue
Trefferfarbgebung wird zusätzlich für vier Themes im interaktiven Browser-
Test geprüft.

Eine visuelle Änderung gilt erst als freigegeben, wenn:

1. die 768×512-Darstellung bewusst geprüft wurde,
2. die neue Referenz nachvollziehbar zur Änderung gehört,
3. TypeScript, Production Build, Rustfmt, Clippy und Rust-Tests weiterhin grün sind,
4. keine Referenzdatei außerhalb einer beabsichtigten UI-Änderung aktualisiert wurde.
