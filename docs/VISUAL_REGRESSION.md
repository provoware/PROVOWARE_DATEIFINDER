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

Eine visuelle Änderung gilt erst als freigegeben, wenn:

1. die 768×512-Darstellung bewusst geprüft wurde,
2. die neue Referenz nachvollziehbar zur Änderung gehört,
3. TypeScript, Production Build, Rustfmt, Clippy und Rust-Tests weiterhin grün sind,
4. keine Referenzdatei außerhalb einer beabsichtigten UI-Änderung aktualisiert wurde.
