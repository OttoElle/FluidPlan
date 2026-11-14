import { describe, expect, it } from 'vitest';
import { parseDrawing, serializeDrawing } from '../io/json.ts';
import { addAnnotation, annotationBox } from './annotations.ts';
import { checkDiagram } from './check.ts';
import { addComponent, createDiagram, updateComponent } from './diagram.ts';
import { addSheet, drawingOf, sheetView, withSheet } from './drawing.ts';
import {
  DEFAULT_PARTS_LIST,
  PARTS_LIST_HEADER,
  PARTS_LIST_ROW,
  PARTS_LIST_WIDTH,
  defaultPartsListPosition,
  fitText,
  partsListColumns,
  partsListCsv,
  partsListLayout,
  partsListRows,
} from './partsList.ts';
import { titleBlock } from './sheet.ts';
import type { Diagram, Drawing, PartsListAnnotation } from './types.ts';

function sample(): Diagram {
  let d = createDiagram();
  const add = (type: string, x: number, label: string, extra: Parameters<typeof updateComponent>[2] = {}) => {
    const r = addComponent(d, type, { x, y: 100 });
    d = updateComponent(r.diagram, r.component.id, { label, ...extra });
  };
  add('supply.pump', 100, '0.10');
  add('supply.tank', 200, '0.2', { description: 'Druckflüssigkeitsbehälter', manufacturer: 'ACME', partNumber: 'T-40' });
  add('actuator.cylinder', 300, '1.1', { technicalData: 'Ø50/32×200' });
  add('valve.directional', 400, '');
  add('supply.silencer', 500, '');
  return d;
}

describe('Stückliste', () => {
  it('nimmt Bauteile mit Kennzeichen auf und sortiert natürlich', () => {
    const rows = partsListRows(drawingOf(sample()));
    expect(rows.map((r) => r.label)).toEqual(['0.2', '0.10', '1.1', '']);
    expect(rows[0]).toMatchObject({ name: 'Druckflüssigkeitsbehälter', manufacturer: 'ACME', partNumber: 'T-40', sheet: 1 });
    // Ohne Bezeichnung steht der Symbolname da.
    expect(rows[1]!.name).not.toBe('');
    expect(rows[2]!.technicalData).toBe('Ø50/32×200');
  });

  it('folgt der Einstellung am Bauteil', () => {
    const d = sample();
    const pump = d.components[0]!;
    const silencer = d.components[4]!;
    const changed = updateComponent(updateComponent(d, pump.id, { inPartsList: false }), silencer.id, { inPartsList: true });
    const labels = partsListRows(drawingOf(changed)).map((r) => r.name);
    expect(labels).toContain('Schalldämpfer');
    expect(partsListRows(drawingOf(changed))).toHaveLength(4);
  });

  it('teilt die Breite des Schriftfelds auf die Spalten auf', () => {
    for (const technicalData of [true, false]) {
      for (const manufacturer of [true, false]) {
        const cols = partsListColumns({ technicalData, manufacturer });
        expect(cols.reduce((s, c) => s + c.width, 0)).toBe(PARTS_LIST_WIDTH);
        expect(cols.map((c) => c.key)).toEqual(
          ['label', 'name', technicalData && 'technicalData', manufacturer && 'manufacturer', 'partNumber'].filter(Boolean),
        );
      }
    }
  });

  it('steht bündig auf dem Schriftfeld und wächst nach oben', () => {
    const d = sample();
    const position = defaultPartsListPosition(d.sheet);
    const block = titleBlock(d.sheet);
    expect(position).toEqual({ x: block.x, y: block.y });
    const list: PartsListAnnotation = { id: 'a1', ...DEFAULT_PARTS_LIST, position };
    const rows = partsListRows(drawingOf(d));
    const layout = partsListLayout(list, rows);
    expect(layout.box.maxY).toBe(block.y);
    expect(layout.box.maxY - layout.box.minY).toBe(PARTS_LIST_HEADER + rows.length * PARTS_LIST_ROW);
    expect(layout.rules).toHaveLength(rows.length);
    // Kopfzeile unten: erste Zeile direkt darüber.
    const below = partsListLayout({ ...list, headerBelow: true }, rows);
    const header = below.header[0]!.y;
    const first = below.cells.find((c) => c.text === '0.2')!.y;
    const last = below.cells.find((c) => c.text === '1.1')!.y;
    expect(header).toBeGreaterThan(first);
    expect(first).toBeGreaterThan(last);
  });

  it('kürzt zu lange Texte', () => {
    expect(fitText('kurz', 1000)).toBe('kurz');
    const cut = fitText('Ein sehr langer Name für eine kleine Spalte', 60);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(20);
  });

  it('zeigt Bauteile aller Blätter oder nur des eigenen', () => {
    let drawing: Drawing = drawingOf(sample());
    drawing = addSheet(drawing, 0).drawing;
    let second = sheetView(drawing, 1);
    second = addComponent(second, 'supply.tank', { x: 100, y: 100 }).diagram;
    second = updateComponent(second, second.components[0]!.id, { label: '2.1' });
    const r = addAnnotation(second, { ...DEFAULT_PARTS_LIST, position: { x: 100, y: 400 } });
    drawing = withSheet(drawing, 1, r.diagram);
    const view = sheetView(drawing, 1);
    expect(view.partsList?.map((x) => x.label)).toEqual(['0.2', '0.10', '1.1', '2.1', '']);
    expect(sheetView(drawing, 0).partsList).toBeUndefined();
    const list = view.annotations[0] as PartsListAnnotation;
    expect(annotationBox(list, view).minY).toBe(400 - PARTS_LIST_HEADER - 5 * PARTS_LIST_ROW);
    expect(annotationBox({ ...list, onlyThisSheet: true }, view).minY).toBe(400 - PARTS_LIST_HEADER - PARTS_LIST_ROW);
  });

  it('meldet eine Stückliste über Bauteilen', () => {
    const d = sample();
    const r = addAnnotation(d, { ...DEFAULT_PARTS_LIST, position: { x: 80, y: 200 } });
    const drawing = drawingOf(r.diagram);
    const issues = checkDiagram(sheetView(drawing, 0)).map((i) => i.message);
    expect(issues.some((m) => m.startsWith('Die Stückliste verdeckt'))).toBe(true);
  });

  it('gibt CSV für Excel aus', () => {
    const rows = partsListRows(drawingOf(sample()));
    const csv = partsListCsv([{ ...rows[0]!, name: 'Behälter; groß "neu"' }], true);
    expect(csv.startsWith('﻿Kennzeichen;Bauteilbenennung;Technische Daten;Hersteller;Teilenummer;Blatt\r\n')).toBe(true);
    expect(csv).toContain('0.2;"Behälter; groß ""neu""";;ACME;T-40;1\r\n');
  });

  it('wird gespeichert und wieder gelesen', () => {
    const d = sample();
    const r = addAnnotation(d, { ...DEFAULT_PARTS_LIST, technicalData: false, headerBelow: true, position: { x: 80, y: 600 } });
    const withFlag = updateComponent(r.diagram, d.components[4]!.id, { inPartsList: true });
    const parsed = parseDrawing(serializeDrawing(drawingOf(withFlag)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const sheet = parsed.drawing.sheets[0]!;
    expect(sheet.annotations[0]).toEqual(r.annotation);
    expect(sheet.components[4]!.inPartsList).toBe(true);
  });
});
