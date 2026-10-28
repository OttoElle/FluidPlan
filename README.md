# FluidPlan

Leichtgewichtiger Editor für einfache **Hydraulik- und Pneumatik-Schaltpläne** im Browser.

Stand: Projektgerüst mit Datenmodell, Bauteilbibliothek und Speichern/Laden als JSON.
Erste Schaltzeichen nach DIN ISO 1219-1: Hydropumpe, Kompressor, 4/2-Wegeventil und
doppeltwirkender Zylinder. Die übrigen Bauteile erscheinen noch als beschriftete Rahmen;
das Zeichnen von Leitungen per Maus folgt.

Symbole sind im Modul M gezeichnet, ein Rasterschritt der Zeichenfläche ist 1M (10 Einheiten).
Anschlüsse liegen in jeder Drehung und Spiegelung auf dem Raster, benachbarte Anschlüsse
sind wie in der Norm 2M auseinander.

## Schnellstart

Voraussetzung: Node.js 22 oder neuer.

**Windows:** `start.bat` doppelklicken. Beim ersten Start werden die Abhängigkeiten
installiert, danach öffnet sich der Editor im Browser. Schließen des Fensters beendet ihn.

Oder von Hand:

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm test           # Tests (Vitest)
npm run build      # Typprüfung und Produktions-Build nach dist/
```

## Technik

- TypeScript, React, SVG
- Vite als Build-Werkzeug, Vitest für Tests
- Keine weiteren Laufzeitabhängigkeiten. Desktop-Paketierung mit Tauri ist später möglich.

## Aufbau

```
src/
  model/
    types.ts         Datenmodell: Diagram, ComponentInstance, Connection, Ports
    library.ts       Bauteilbibliothek (Definitionen mit Anschlüssen)
    diagram.ts       Reine Funktionen zum Bearbeiten (hinzufügen, verbinden, löschen, Anschlussposition)
    example.ts       Beispielschaltplan
  io/
    json.ts          Dateiformat, Speichern (serialize) und Laden mit Prüfung (parse)
    browser.ts       Download und Datei-Öffnen im Browser
  ui/
    App.tsx          Oberfläche: Werkzeugleiste, Bauteilliste, Eigenschaften
    DiagramView.tsx  SVG-Zeichenfläche
    symbols.tsx      Schaltzeichen nach ISO 1219 (im Modul M gezeichnet)
```

## Datenmodell

- **Bauteildefinition** (in der Bibliothek): Typ-Schlüssel wie `valve.4-3`, Name, Medium
  (Hydraulik/Pneumatik), Größe und Anschlüsse. Anschlüsse heißen wie im Normsymbol:
  Hydraulik `P`, `T`, `A`, `B`; Pneumatik `1`, `2`, `3`, `4`, `5`, `12`, `14`.
- **Bauteil** (im Schaltplan): ID, Typ-Verweis, Position, Drehung (0/90/180/270),
  Spiegelung, Betriebsmittelkennzeichen (z. B. `1V1`) und freie Kennwerte.
- **Leitung**: verbindet zwei Anschlüsse (`{ componentId, portId }`), hat eine Linienart
  (`working` Arbeitsleitung, `pilot` Steuerleitung, `drain` Leckageleitung) und optionale Knickpunkte.

Das Datenmodell wird nur über die Funktionen in `diagram.ts` verändert. Sie geben jeweils
einen neuen Schaltplan zurück, was Undo/Redo später einfach macht.

## Dateiformat

Schaltpläne werden als `*.fluidplan.json` gespeichert:

```json
{
  "format": "fluidplan",
  "version": 1,
  "diagram": {
    "domain": "hydraulic",
    "meta": { "title": "…", "author": "", "created": "…", "modified": "…" },
    "components": [
      { "id": "c1", "type": "actuator.cylinder-double", "position": { "x": 140, "y": 40 },
        "rotation": 0, "mirrored": false, "label": "1A1", "properties": {} }
    ],
    "connections": [
      { "id": "l1", "from": { "componentId": "c2", "portId": "A" },
        "to": { "componentId": "c1", "portId": "A" }, "kind": "working", "waypoints": [] }
    ]
  }
}
```

Beim Laden wird die Datei vollständig geprüft (Aufbau, unbekannte Bauteiltypen, doppelte IDs,
Leitungen zu nicht vorhandenen Anschlüssen). Fehler werden mit Pfad angezeigt, z. B.
`diagram.components[0].rotation: einer von 0, 90, 180, 270 erwartet`.
Bei inkompatiblen Formatänderungen wird `version` erhöht und ältere Dateien werden beim Laden migriert.
