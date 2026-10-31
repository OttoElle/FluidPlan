# FluidPlan

Leichtgewichtiger Editor für einfache **Hydraulik- und Pneumatik-Schaltpläne** im Browser.

Stand: lauffähiger Editor mit mehreren Blättern, Ebenen, Rückgängig/Wiederholen, Prüfen und Export als PDF, SVG und PNG.
Schaltzeichen nach DIN ISO 1219-1 für die Grundbauteile: Pumpen, Handpumpe, Kompressor, Motoren,
Tank, Speicher, Filter, Wartungseinheit, Druck-, Strom- und Sperrventile, Kugelhahn,
Zweidruckventil, Schnelltrennkupplung, Schlauchleitung, verschlossener Anschluss (Stopfen), Manometer und Sensoren.

**Wegeventile und Zylinder sind konfigurierbar.** In der Bauteilliste stehen übliche
Vorlagen (4/2, 4/3, 5/2, …); im Eigenschaften-Fenster (Doppelklick) legt man im Reiter „Konfigurator“ fest:
Anzahl Anschlüsse und Schaltstellungen (X/Y), jede Schaltstellung per Symbolauswahl
(z. B. „Umlauf“ oder „Schwimmstellung“, Weg für Weg unter „Wege einzeln bearbeiten“),
die Ruhestellung per Optionsfeld und die Betätigungen links und rechts in drei
Symbolauswahlen (Muskelkraft, mechanisch, elektrisch/Druck) plus „Federrückstellung“
und „Vorgesteuert“. Beim Zylinder: Zylinderart als Symbol, einfachwirkend drückend/ziehend
oder doppeltwirkend, Rückstellfeder, Endlagendämpfung (kolben-/stangenseitig, einstellbar),
Kolbenstange einseitig/durchgehend, Betätigung am Stangenende (Muskelkraft, Druckknopf,
Hebel, Pedal, Rolle, Stößel) und Kolbenstellung als Schieberegler. Leitungen an Anschlüssen, die dabei
wegfallen, werden entfernt.

**Weitere Grundsymbole mit Konfigurator** (je ein Eintrag in der Bauteilliste, Auswahl
im Konfigurator als Symbolvorschau):

- Zylinder: Kolben-, Plunger- oder Teleskopzylinder, Kolbenstellung 0–100 %
- Pumpe/Kompressor und Motor: konstant/verstellbar, eine oder zwei Richtungen,
  Leckanschluss, Drehrichtungspfeil, Motor-Pumpe-Einheit mit Wellenkupplung
- Kugelhahn: 2, 3 oder 4 Wege mit Schaltstellung
- Speicher: Blase, Membran, Kolben, Gasflasche, Luftbehälter
- Tank und Behälterrückführung: offen/geschlossen, normal/klein, 1–3 Rückführungen, Leitung unter/über dem Flüssigkeitsspiegel
- Schnelltrennkupplung: ohne/mit einem/zwei Rückschlagventilen, gekuppelt/entkuppelt
- Sensor: Druck, Durchfluss, Temperatur, Näherung; schaltend, analog oder
  elektromechanisch (Druckschalter), Schaltpunkt einstellbar

Leitungen verlaufen rechtwinklig im Raster. Gezeichnet wird von Anschluss zu Anschluss
(ziehen, oder Anschluss anklicken, optional Knickpunkte auf die Fläche klicken, Ziel
anklicken; Esc bricht ab). Ohne eigene Knickpunkte wird die Leitung automatisch geführt:
senkrecht aus dem Anschluss heraus, um Bauteile herum, mit möglichst wenigen Knicken.
Ein Teilstück lässt sich mit der Maus quer verschieben; danach bleibt der Verlauf so,
bis man „Automatisch führen“ wählt. Verschiebt, dreht oder spiegelt man Bauteile, werden nur die
Teilstücke an den bewegten Anschlüssen nachgeführt; der übrige Verlauf bleibt stehen, und
unbeteiligte Leitungen ändern sich nicht. Neu geführt wird eine Leitung nur, wenn sie sonst
rückwärts in einen Anschluss, durch ein Bauteil oder auf einer fremden Leitung liefe. Wo sich Leitungen vom selben Anschluss trennen,
erscheint ein Verbindungspunkt. Entf löscht die ausgewählte Leitung bzw. das Bauteil.

Endet eine neue Leitung auf einer bestehenden Leitung, entsteht dort ein Abzweig (T-Verteiler)
mit Verbindungspunkt; an einem Abzweig treffen höchstens 4 Leitungen zusammen. Abzweige
lassen sich ziehen und löschen. Bleiben an einem Abzweig nur zwei Leitungen übrig, werden
sie automatisch wieder zu einer. Optional (Blatt-Einstellung „Leitungssprünge an Kreuzungen“)
springen waagerechte Leitungen mit einem kleinen Bogen über Kreuzungen ohne Verbindung.

Symbole sind im Modul M gezeichnet, ein Rasterschritt der Zeichenfläche ist 1M (10 Einheiten).
Anschlüsse liegen in jeder Drehung und Spiegelung auf dem Raster, benachbarte Anschlüsse
sind wie in der Norm 2M auseinander. Wegeventile und Zylinder folgen den Maßen der Norm
(Abschnitt 8.4, 8.5 und 9.2): Schaltfeld 4M (bei 5 Anschlüssen 6M breit), Anschlussleitungen
2M, Betätigungen mit Mittellinie 1M über der Feld-Unterkante und weiteren Elementen im
Abstand 2M darüber (Reihenfolge Druck, Magnet, Feder, Hand), Magnet 3M × 2M, Feder 2,5M,
Zylinderrahmen 9M × 4M mit 2M breitem Kolben; ihre Anschlüsse liegen auf dem 2M-Raster.

Gezeichnet wird auf einem Blatt (A4 bis A1, hoch oder quer, wahlweise mit Rahmen und
Schriftfeld nach DIN EN ISO 5457), festgelegt beim Anlegen über „Neuer Schaltplan“ (Symbol ganz links in der Werkzeugleiste) und später im
Fenster „Blatt und Schriftfeld“ änderbar (Werkzeugleiste oder Klick ins Schriftfeld). Maßstab: 1 Einheit = 0,25 mm, also 1M = 2,5 mm auf dem Papier.
Mausrad zoomt um den Mauszeiger, Ziehen auf freier Fläche oder mit der mittleren Maustaste
verschiebt die Ansicht; 100 % entspricht der Papiergröße.

Bedienung: Bauteile per Klick oder Ziehen aus der Bauteilliste aufs Blatt bringen; die Liste
ist am rechten Rand in der Breite ziehbar. Was ausgewählt ist, bearbeitet eine kleine Leiste
über dem Blatt (Drehen, Spiegeln, Ausrichten, Linienart, Löschen). Doppelklick oder Enter
öffnet das Eigenschaften-Fenster: oben Vorschau, Kennzeichen und Bezeichnung (je mit
„Anzeigen“ für das Blatt), darunter Reiter wie
„Konfigurator“ und „Lage“; „OK“ übernimmt alles als einen Rückgängig-Schritt. Hell/Dunkel
und eine Übersicht der Bedienung stehen rechts in der Werkzeugleiste.

## Schnellstart

**Online:** https://ottoelle.github.io/FluidPlan/ (wird bei jedem Push auf `main` automatisch neu veröffentlicht).

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
- jsPDF und svg2pdf.js nur für den PDF-Export (werden erst beim Export geladen). Desktop-Paketierung mit Tauri ist später möglich.

## Aufbau

```
src/
  model/
    types.ts         Datenmodell: Diagram, ComponentInstance, Connection, Ports
    library.ts       Bauteilbibliothek (feste und konfigurierbare Bauteile, Bauteilliste)
    valve.ts         Konfigurierbares Wegeventil: Konfiguration, Geometrie, Vorlagen
    cylinder.ts      Konfigurierbarer Zylinder (Kolben, Plunger, Teleskop)
    rotary.ts        Konfigurierbare Pumpe/Kompressor und Motor
    ballValve.ts     Konfigurierbarer Kugelhahn
    storage.ts       Konfigurierbare Speicher und Tanks
    coupling.ts      Konfigurierbare Schnelltrennkupplung
    sensor.ts        Konfigurierbarer Sensor/Schalter
    configRead.ts    Hilfen zum Einlesen von Konfigurationen aus Dateien
    diagram.ts       Reine Funktionen zum Bearbeiten (hinzufügen, verbinden, löschen, Anschlussposition)
    routing.ts       Rechtwinklige Leitungsführung im Raster (A*-Suche, Teilstücke verschieben)
    labels.ts        Automatische Kennzeichnung nach ISO 1219-2:2019 (0.1, 1.1, 1.2, …)
    check.ts         „Zeichnung prüfen“: doppelte Kennzeichen, offene Anschlüsse, Überlappungen
    example.ts       Beispielschaltplan
  io/
    json.ts          Dateiformat, Speichern (serialize) und Laden mit Prüfung (parse)
    browser.ts       Download und Datei-Öffnen im Browser
    export.ts        Export als PDF, SVG und PNG in echter Papiergröße
  ui/
    App.tsx          Oberfläche: Werkzeugleiste, Bauteilliste, Kontextleiste
    DiagramView.tsx  SVG-Zeichenfläche
    symbols.tsx      Schaltzeichen nach ISO 1219 (im Modul M gezeichnet)
    symbolParts.tsx  Grundelemente (Pfeil, Dreieck, Feder, Drossel, Rückschlagelement)
    valveSymbol.tsx  Wegeventil aus seiner Konfiguration
    cylinderSymbol.tsx Zylinder aus seiner Konfiguration
    properties/      Eigenschaften-Fenster: PropertiesDialog, Reiter (tabs.tsx),
                     Konfiguratoren je config.kind (configEditors.tsx, valveEditor.tsx),
                     Segmented, SymbolPicker (Auswahl mit Schaltzeichen)
    SheetDialog.tsx  Fenster „Blatt und Schriftfeld“
    layout.ts        Hell/Dunkel und Breite der Bauteilliste (gespeichert)
    ExportDialog.tsx Dialog „Exportieren“
    CheckPanel.tsx   Ergebnisliste von „Zeichnung prüfen“
    IconButton.tsx   Schaltfläche mit Symbol (lucide-react), Beschriftung als Tooltip
    Tooltip.tsx      Gemeinsamer Tooltip für alle Elemente mit data-tooltip
    SymbolPreview.tsx Verkleinertes Schaltzeichen für die Bauteilliste
```

## Datenmodell

- **Bauteildefinition** (in der Bibliothek): Typ-Schlüssel wie `valve.check`, Name, Medium
  (Hydraulik/Pneumatik), Größe und Anschlüsse. Anschlüsse heißen wie im Normsymbol:
  Hydraulik `P`, `T`, `A`, `B`; Pneumatik `1`, `2`, `3`, `4`, `5`, `12`, `14`.
- **Bauteil** (im Schaltplan): ID, Typ-Verweis, Position, Drehung (0/90/180/270),
  Spiegelung, Bezeichnungsschlüssel (z. B. `1.2`) und freie Kennwerte.
  Konfigurierbare Bauteile (`valve.directional`, `actuator.cylinder`, `supply.pump`,
  `actuator.motor`, `supply.tank`, `supply.accumulator`, `valve.ball`, `line.coupling`,
  `measure.sensor`) tragen zusätzlich
  `config`; Größe und Anschlüsse werden daraus berechnet (`definitionOf`). Ventilanschlüsse
  heißen intern immer `P`, `T`, `A`, `B`, `R`, `S`, `X`, `Y` und werden in der Pneumatik
  als `1`, `3`, `2`, `4`, `3`, `5`, `14`, `12` angezeigt. Ältere Dateien mit festen Typen
  wie `valve.4-2` oder `supply.compressor` werden beim Laden umgestellt.
- **Leitung**: verbindet zwei Anschlüsse (`{ componentId, portId }`), hat eine Linienart
  (`working` Arbeitsleitung, `pilot` Steuerleitung, `drain` Leckageleitung) und optionale Knickpunkte.
  Leere Knickpunktliste = automatisch geführt. Ein Leitungsende kann statt eines Anschlusses
  auch ein **Abzweigpunkt** sein (`{ junctionId }`, Liste `junctions` im Schaltplan, ab Dateiversion 3).
- **Grafik** (`annotations`, ab Dateiversion 4): freier Text, Linie oder Rechteck
  (`solid`, `dashed`, `dashdot`; Strich-Punkt = Baugruppen-Umrandung nach ISO 1219-1).
  Schrifthöhe h (Versalhöhe nach ISO 3098) in Einheiten (14 = 3,5 mm). Funktionen in `annotations.ts`.
- **Schriftfeld** nach DIN EN ISO 7200 (180 × 27 mm): Titel, Sachnummer (`drawingNumber`),
  gesetzlicher Eigentümer (`organization`), Erstellt durch, Geprüft von, Genehmigt von
  (`approvedBy`), Dokumentenart (`documentType`) und Änderungsindex stehen in `meta`;
  Ausgabedatum, Papierformat und Blatt füllt das Programm. Rahmen nach ISO 5457 mit
  Mittenmarken und Feldeinteilung (`frameMarks` in `sheet.ts`).

Das Datenmodell wird nur über die Funktionen in `diagram.ts` verändert. Sie geben jeweils
einen neuen Schaltplan zurück, was Undo/Redo später einfach macht.

## Dateiformat

Schaltpläne werden als `*.fluidplan.json` gespeichert:

```json
{
  "format": "fluidplan",
  "version": 4,
  "diagram": {
    "domain": "hydraulic",
    "meta": { "title": "…", "author": "", "drawingNumber": "", "organization": "", "checkedBy": "", "revision": "", "created": "…", "modified": "…" },
    "sheet": { "format": "A4", "orientation": "landscape", "frame": true },
    "components": [
      { "id": "c1", "type": "actuator.cylinder-double", "position": { "x": 140, "y": 40 },
        "rotation": 0, "mirrored": false, "label": "1A1", "properties": {} }
    ],
    "connections": [
      { "id": "l1", "from": { "componentId": "c2", "portId": "A" },
        "to": { "componentId": "c1", "portId": "A" }, "kind": "working", "waypoints": [] },
      { "id": "l2", "from": { "componentId": "c3", "portId": "P" },
        "to": { "junctionId": "j1" }, "kind": "working", "waypoints": [] }
    ],
    "junctions": [{ "id": "j1", "position": { "x": 100, "y": 200 } }],
    "annotations": [
      { "id": "a1", "kind": "text", "position": { "x": 300, "y": 80 }, "text": "Hubeinheit", "size": 14 },
      { "id": "a2", "kind": "rect", "position": { "x": 120, "y": 20 }, "width": 260, "height": 200, "style": "dashdot" },
      { "id": "a3", "kind": "line", "from": { "x": 0, "y": 0 }, "to": { "x": 100, "y": 0 }, "style": "dashed" }
    ]
  }
}
```

Beim Laden wird die Datei vollständig geprüft (Aufbau, unbekannte Bauteiltypen, doppelte IDs,
Leitungen zu nicht vorhandenen Anschlüssen). Fehler werden mit Pfad angezeigt, z. B.
`diagram.components[0].rotation: einer von 0, 90, 180, 270 erwartet`.
Bei inkompatiblen Formatänderungen wird `version` erhöht und ältere Dateien werden beim Laden migriert.
