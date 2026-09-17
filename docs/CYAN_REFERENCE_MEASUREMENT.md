# P1 — Cyan-Referenzvermessung

Stand: 17.09.2026
Basis: Foundation-Freeze `cbd8fe8ce14a254cbd043fea502a01a094be1cb2` (eingefrorene Codebasis `e01ff57`)

## Scope

Nur Vermessung und Soll/Ist-Abgleich. Keine Änderung an HTML, CSS, TypeScript, Rust, Golden Reference oder Testschwellen.

## Referenzvertrag

- Einzelansicht: **768 × 512 px**
- Cyan ist die obere rechte 768×512-Ansicht der 1536×1024-Vorlage.
- Hauptkanten: Zielabweichung höchstens **±1 px**.
- Korrekturreihenfolge bleibt: Positionen → Größen → Abstände → Typografie → Farben → Border → Schatten/Glow → Icons.

## Vermessene Cyan-Zielgeometrie

| Bereich | Ziel |
| --- | ---: |
| Viewport | 768 × 512 px |
| Sidebar-Trennkante | x ≈ 159/160 px |
| Inhaltsbeginn | x ≈ 169 px |
| rechter Inhaltsrand | x ≈ 755 px |
| oberer Content-/Panelbeginn | y ≈ 70/71 px |
| Suchpanel-Unterkante | y ≈ 180/181 px |
| Resultat-/Preview-Trennbereich | x ≈ 556 px |
| Actionbar-/Footerbeginn | y ≈ 440/441 px |
| äußerer Innenabstand rechts | ≈ 12 px |
| Hauptspaltengap | ≈ 8 px |

Die Werte sind bewusst als Kanten-/Leitlinien dokumentiert. Subpixel-, Border- und Antialiasingeffekte werden erst im späteren Pixel-Diff bewertet.

## Abgleich mit eingefrorener Implementierung

Die Foundation definiert bereits:

- `--window-width: 768px`
- `--window-height: 512px`
- `--sidebar-width: 160px`
- `--gap: 8px`
- Workspace: `padding: 0 8px 8px`
- Topbar: `68px`
- Hauptspalte: Suchbereich `111px` plus `8px` Gap
- Preview-Spalte: `200px`
- Actionbar-Zeile: `62px`

Damit sind Viewport, Sidebarbreite und Grundgap bereits auf dem Zielraster. Die vermessene Referenz zeigt jedoch, dass die exakten Content-, Panel- und Footerkanten im nächsten Schritt gegen einen deterministisch gerenderten Ist-Screenshot geprüft werden müssen. Aus dieser Vermessung allein wird **keine CSS-Korrektur abgeleitet**.

## Gate-Ergebnis

**PASS — P1 Punkt 1 ist als reine Vermessung abgeschlossen.**

Begründung: Zielbild, Referenzmodus, Leitkanten, Toleranz und Korrekturreihenfolge sind jetzt explizit dokumentiert; die eingefrorene Foundation wurde nicht verändert.

## Nächster logisch sicherer Schritt

Ausschließlich **P1 Punkt 2: Screenshot-Harness auf Fixture-Daten** herstellen bzw. den vorhandenen Harness so eng erweitern, dass ein deterministischer 768×512-Cyan-Ist-Screenshot mit den sichtbaren Referenz-Fixtures entsteht. Noch **kein Pixel-Tuning, kein Golden-Update und kein Layoutumbau**.