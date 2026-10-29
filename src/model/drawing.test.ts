import { describe, expect, it } from 'vitest';
import { checkSheets } from './check.ts';
import { addComponent } from './diagram.ts';
import {
  addSheet,
  allSheetViews,
  deleteSheet,
  drawingOf,
  duplicateSheet,
  moveSheet,
  renameSheet,
  sheetView,
  withSheet,
} from './drawing.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { autoLabelSheets } from './labels.ts';
import { parseDrawing, serializeDiagram, serializeDrawing } from '../io/json.ts';

const fixedDate = new Date('2026-10-29T12:00:00Z');
const example = () => drawingOf(exampleHydraulicDiagram(fixedDate));

describe('Zeichnung mit mehreren Blättern', () => {
  it('legt Blätter an, benennt, verschiebt und löscht sie', () => {
    let d = example();
    const added = addSheet(d, 0);
    d = added.drawing;
    expect(d.sheets.map((s) => s.name)).toEqual(['Blatt 1', 'Blatt 2']);
    expect(added.sheet.components).toEqual([]);
    expect(added.sheet.sheet).toEqual(d.sheets[0]!.sheet);
    d = renameSheet(d, 1, 'Steuerung');
    d = moveSheet(d, 1, 0);
    expect(d.sheets.map((s) => s.name)).toEqual(['Steuerung', 'Blatt 1']);
    d = deleteSheet(d, 0);
    expect(d.sheets.map((s) => s.name)).toEqual(['Blatt 1']);
    // Das letzte Blatt bleibt.
    expect(deleteSheet(d, 0)).toBe(d);
  });

  it('dupliziert ein Blatt mit Inhalt unter neuer ID', () => {
    const d = duplicateSheet(example(), 0).drawing;
    expect(d.sheets[1]!.id).not.toBe(d.sheets[0]!.id);
    expect(d.sheets[1]!.name).toBe('Blatt 1 (Kopie)');
    expect(d.sheets[1]!.components).toEqual(d.sheets[0]!.components);
  });

  it('bearbeitet ein Blatt über die Sicht und lässt die anderen unverändert', () => {
    const d = addSheet(example(), 0).drawing;
    const view = sheetView(d, 1);
    expect(view.page).toEqual({ name: 'Blatt 2', number: 2, count: 2 });
    // Ohne Änderung bleibt die Zeichnung derselbe Wert (wichtig für Rückgängig).
    expect(withSheet(d, 1, view)).toBe(d);
    const edited = addComponent(view, 'supply.pump', { x: 100, y: 100 }).diagram;
    const next = withSheet(d, 1, { ...edited, meta: { ...edited.meta, title: 'Neu' } });
    expect(next.sheets[1]!.components).toHaveLength(1);
    expect(next.sheets[0]).toBe(d.sheets[0]);
    expect(next.meta.title).toBe('Neu');
  });

  it('speichert und lädt mehrere Blätter', () => {
    let d = addSheet(example(), 0).drawing;
    d = withSheet(d, 1, { ...sheetView(d, 1), sheet: { format: 'A3', orientation: 'portrait', frame: true } });
    d = renameSheet(d, 1, 'Steuerung');
    expect(parseDrawing(serializeDrawing(d))).toEqual({ ok: true, drawing: d });
  });

  it('lädt Dateien der Version 5 als Zeichnung mit einem Blatt', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram(fixedDate)));
    const { sheets, ...rest } = file.drawing;
    const { id: _id, name: _name, ...content } = sheets[0];
    const v5 = JSON.stringify({ format: 'fluidplan', version: 5, diagram: { ...rest, ...content } });
    expect(parseDrawing(v5)).toEqual({ ok: true, drawing: example() });
  });

  it('meldet Fehler mit Blattangabe und doppelte Blatt-IDs', () => {
    const d = addSheet(example(), 0).drawing;
    const file = JSON.parse(serializeDrawing(d));
    file.drawing.sheets[1].id = file.drawing.sheets[0].id;
    file.drawing.sheets[1].connections = [
      { id: 'l1', from: { componentId: 'c99', portId: 'P' }, to: { junctionId: 'j1' }, kind: 'working', waypoints: [] },
    ];
    const r = parseDrawing(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toContain('Blatt-ID "s1" ist doppelt vergeben');
    expect(r.errors).toContain('Blatt 2 („Blatt 2“): Leitung "l1": Bauteil "c99" existiert nicht');
  });

  it('kennzeichnet über alle Blätter durchlaufend', () => {
    const d = duplicateSheet(example(), 0).drawing;
    const [a, b] = autoLabelSheets(allSheetViews(d));
    const labelsA = a!.components.map((c) => c.label).filter(Boolean);
    const labelsB = b!.components.map((c) => c.label).filter(Boolean);
    expect(labelsB.filter((l) => labelsA.includes(l))).toEqual([]);
    // Blatt 2 setzt Kreise und Nummern fort: 1A1 auf Blatt 1, 2A1 auf Blatt 2; Pumpe 0P1 bzw. 0P2.
    expect(labelsA).toContain('1A1');
    expect(labelsB).toContain('2A1');
    expect(labelsB).toContain('0P2');
  });

  it('meldet Kennzeichen, die auf mehreren Blättern vorkommen', () => {
    const d = duplicateSheet(example(), 0).drawing;
    const issues = checkSheets(allSheetViews(d), 1);
    const dup = issues.filter((i) => i.message.startsWith('Kennzeichen 1A1 ist auch auf'));
    expect(dup.map((i) => i.sheet).sort()).toEqual([0, 1]);
    expect(dup.find((i) => i.sheet === 0)!.message).toBe('Kennzeichen 1A1 ist auch auf Blatt 2 (Blatt 1 (Kopie)) vergeben.');
    // Meldungen des angezeigten Blatts stehen vorn.
    expect(issues[0]!.sheet).toBe(1);
    const relabeled = autoLabelSheets(allSheetViews(d));
    expect(checkSheets(relabeled).filter((i) => i.message.includes('ist auch auf'))).toEqual([]);
  });
});
