import { describe, expect, it } from 'vitest';
import { addAnnotation } from '../model/annotations.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { FILE_VERSION, parseDiagram, serializeDiagram } from './json.ts';
import { fileNameFor } from './browser.ts';

const fixedDate = new Date('2026-10-28T12:00:00Z');

function mutate(fn: (file: any) => void): string {
  const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram(fixedDate)));
  fn(file);
  return JSON.stringify(file);
}

/** Baut eine Datei im Format bis Version 5 nach (ein Schaltplan unter "diagram"). */
function toV5(f: any, version: number): void {
  const { sheets, ...rest } = f.drawing;
  const { id: _id, name: _name, ...content } = sheets[0];
  f.version = version;
  f.diagram = { ...rest, ...content };
  delete f.drawing;
}

function errorsOf(text: string): string[] {
  const r = parseDiagram(text);
  if (r.ok) throw new Error('Fehler erwartet, aber Datei wurde akzeptiert');
  return r.errors;
}

describe('JSON speichern und laden', () => {
  it('ergibt nach Speichern und Laden denselben Schaltplan', () => {
    const original = exampleHydraulicDiagram(fixedDate);
    const result = parseDiagram(serializeDiagram(original));
    expect(result).toEqual({ ok: true, diagram: original });
  });

  it('speichert Text, Linien und Rechtecke', () => {
    let d = exampleHydraulicDiagram(fixedDate);
    d = addAnnotation(d, { kind: 'text', position: { x: 100, y: 100 }, text: 'Hub\nSenken', size: 14 }).diagram;
    d = addAnnotation(d, { kind: 'line', from: { x: 0, y: 0 }, to: { x: 50, y: 0 }, style: 'dashed' }).diagram;
    d = addAnnotation(d, { kind: 'rect', position: { x: 10, y: 10 }, width: 80, height: 40, style: 'dashdot' }).diagram;
    d = { ...d, meta: { ...d.meta, drawingNumber: 'FP-001', revision: 'B' } };
    expect(parseDiagram(serializeDiagram(d))).toEqual({ ok: true, diagram: d });
  });

  it('meldet fehlerhafte Grafik', () => {
    const errors = errorsOf(
      mutate((f) => {
        f.drawing.sheets[0].annotations = [
          { id: 'a1', kind: 'rect', position: { x: 0, y: 0 }, width: 0, height: 10, style: 'solid' },
          { id: 'a1', kind: 'kreis' },
        ];
      }),
    );
    expect(errors).toContain('drawing.sheets[0].annotations[0].width: positive Zahl erwartet');
    expect(errors).toContain('drawing.sheets[0].annotations[1].kind: einer von "text", "line", "rect", "circle", "ellipse", "polyline" erwartet');
  });

  it('schreibt Format und Version in die Datei', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram(fixedDate)));
    expect(file.format).toBe('fluidplan');
    expect(file.version).toBe(FILE_VERSION);
  });

  it('meldet kaputtes JSON', () => {
    expect(errorsOf('{ nope')[0]).toMatch(/Keine gültige JSON-Datei/);
  });

  it('erkennt fremde Dateien und neuere Versionen', () => {
    expect(errorsOf('{"hello": 1}')[0]).toMatch(/Keine FluidPlan-Datei/);
    expect(errorsOf(mutate((f) => (f.version = FILE_VERSION + 1)))[0]).toMatch(/kann nur bis Version/);
  });

  it('meldet Strukturfehler mit Pfad', () => {
    const errors = errorsOf(
      mutate((f) => {
        f.drawing.sheets[0].components[0].rotation = 45;
        f.drawing.sheets[0].connections[1].from = 'c1';
      }),
    );
    expect(errors).toContain('drawing.sheets[0].components[0].rotation: einer von 0, 90, 180, 270 erwartet');
    expect(errors).toContain('drawing.sheets[0].connections[1].from: Objekt erwartet');
  });

  it('meldet unbekannte Typen, doppelte IDs und ungültige Verweise', () => {
    const errors = errorsOf(
      mutate((f) => {
        f.drawing.sheets[0].components[1].id = f.drawing.sheets[0].components[0].id;
        f.drawing.sheets[0].components[2].type = 'gibt.es.nicht';
        f.drawing.sheets[0].connections[0].to.portId = 'Z';
        f.drawing.sheets[0].connections[1].from.componentId = 'c99';
      }),
    );
    expect(errors).toEqual(
      expect.arrayContaining([
        'Bauteil-ID "c1" ist doppelt vergeben',
        'Bauteil "c3": unbekannter Typ "gibt.es.nicht"',
        expect.stringMatching(/Leitung "l1": .* keinen Anschluss "Z"/),
        'Leitung "l2": Bauteil "c99" existiert nicht',
      ]),
    );
  });

  it('bildet sichere Dateinamen', () => {
    expect(fileNameFor('Presse: Hub/Senken')).toBe('Presse_ Hub_Senken.fluidplan.json');
    expect(fileNameFor('   ')).toBe('schaltplan.fluidplan.json');
  });
});

describe('Migration', () => {
  it('ergänzt bei Version-1-Dateien ein passendes Blatt', () => {
    const v1 = mutate((f) => {
      toV5(f, 1);
      delete f.diagram.sheet;
    });
    const r = parseDiagram(v1);
    expect(r.ok && r.diagram.sheet).toEqual({ format: 'A4', orientation: 'landscape', frame: true });
  });

  it('wählt ein größeres Blatt, wenn die Bauteile sonst nicht passen', () => {
    const v1 = mutate((f) => {
      toV5(f, 1);
      delete f.diagram.sheet;
      f.diagram.components[0].position = { x: 1500, y: 900 };
    });
    const r = parseDiagram(v1);
    expect(r.ok && r.diagram.sheet.format).toBe('A3');
  });

  it('ergänzt bei Version-3-Dateien Grafikliste und Schriftfeld-Angaben', () => {
    const v3 = mutate((f) => {
      toV5(f, 3);
      delete f.diagram.annotations;
      f.diagram.meta = { title: 'Alt', author: 'Otto', created: 'x', modified: 'y' };
    });
    const r = parseDiagram(v3);
    expect(r.ok && r.diagram.annotations).toEqual([]);
    expect(r.ok && r.diagram.meta).toEqual({
      title: 'Alt', author: 'Otto', drawingNumber: '', organization: '', checkedBy: '', revision: '', created: 'x', modified: 'y',
      approvedBy: '', documentType: 'Schaltplan',
    });
  });

  it('meldet ein ungültiges Blatt', () => {
    expect(errorsOf(mutate((f) => (f.drawing.sheets[0].sheet.format = 'B5')))[0]).toMatch(/drawing.sheets\[0\].sheet.format/);
  });
});
