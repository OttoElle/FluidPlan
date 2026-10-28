import { describe, expect, it } from 'vitest';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { FILE_VERSION, parseDiagram, serializeDiagram } from './json.ts';
import { fileNameFor } from './browser.ts';

const fixedDate = new Date('2026-10-28T12:00:00Z');

function mutate(fn: (file: any) => void): string {
  const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram(fixedDate)));
  fn(file);
  return JSON.stringify(file);
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
        f.diagram.components[0].rotation = 45;
        f.diagram.connections[1].from = 'c1';
      }),
    );
    expect(errors).toContain('diagram.components[0].rotation: einer von 0, 90, 180, 270 erwartet');
    expect(errors).toContain('diagram.connections[1].from: Objekt erwartet');
  });

  it('meldet unbekannte Typen, doppelte IDs und ungültige Verweise', () => {
    const errors = errorsOf(
      mutate((f) => {
        f.diagram.components[1].id = f.diagram.components[0].id;
        f.diagram.components[2].type = 'gibt.es.nicht';
        f.diagram.connections[0].to.portId = 'Z';
        f.diagram.connections[1].from.componentId = 'c99';
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
      f.version = 1;
      delete f.diagram.sheet;
    });
    const r = parseDiagram(v1);
    expect(r.ok && r.diagram.sheet).toEqual({ format: 'A4', orientation: 'landscape', frame: true });
  });

  it('wählt ein größeres Blatt, wenn die Bauteile sonst nicht passen', () => {
    const v1 = mutate((f) => {
      f.version = 1;
      delete f.diagram.sheet;
      f.diagram.components[0].position = { x: 1500, y: 900 };
    });
    const r = parseDiagram(v1);
    expect(r.ok && r.diagram.sheet.format).toBe('A3');
  });

  it('meldet ein ungültiges Blatt', () => {
    expect(errorsOf(mutate((f) => (f.diagram.sheet.format = 'B5')))[0]).toMatch(/diagram.sheet.format/);
  });
});
