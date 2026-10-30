import { describe, expect, it } from 'vitest';
import { drawingOf, sheetView, withSheet } from './drawing.ts';
import { exampleHydraulicDiagram } from './example.ts';
import {
  DEFAULT_LAYER_ID,
  addLayer,
  assignLayer,
  deleteLayer,
  layerCounts,
  layerState,
  layersOf,
  moveLayer,
  updateLayer,
  without,
} from './layers.ts';
import { EMPTY_SELECTION, selectAll } from './selection.ts';
import { parseDrawing, serializeDrawing } from '../io/json.ts';

const example = () => drawingOf(exampleHydraulicDiagram(new Date('2026-10-30T12:00:00Z')));

describe('Zeichnungsebenen', () => {
  it('hat ohne Angabe nur die Standardebene', () => {
    const d = example();
    expect(d.layers).toBeUndefined();
    expect(layersOf(d).map((l) => l.id)).toEqual([DEFAULT_LAYER_ID]);
    expect(sheetView(d, 0).layers).toEqual(layersOf(d));
  });

  it('legt Ebenen an, benennt, verschiebt und löscht sie', () => {
    let d = example();
    const a = addLayer(d);
    d = addLayer(a.drawing, 'Beschriftung').drawing;
    expect(layersOf(d).map((l) => l.name)).toEqual(['Standard', 'Ebene 1', 'Beschriftung']);
    d = updateLayer(d, a.layer.id, { name: 'Hydraulik' });
    expect(updateLayer(d, a.layer.id, { name: 'Hydraulik' })).toBe(d);
    d = moveLayer(d, a.layer.id, 2);
    expect(layersOf(d).map((l) => l.name)).toEqual(['Standard', 'Beschriftung', 'Hydraulik']);
    expect(deleteLayer(d, DEFAULT_LAYER_ID)).toBe(d);
    d = deleteLayer(d, a.layer.id);
    expect(layersOf(d).map((l) => l.name)).toEqual(['Standard', 'Beschriftung']);
  });

  it('legt Teile auf eine Ebene und beim Löschen der Ebene zurück auf Standard', () => {
    const r = addLayer(example());
    const view = sheetView(r.drawing, 0);
    const c = view.components[0]!.id;
    let d = withSheet(r.drawing, 0, assignLayer(view, { ...EMPTY_SELECTION, components: [c] }, r.layer.id));
    expect(d.sheets[0]!.components[0]!.layer).toBe(r.layer.id);
    expect(layerCounts(d).get(r.layer.id)).toBe(1);
    d = deleteLayer(d, r.layer.id);
    expect(d.sheets[0]!.components[0]!.layer).toBeUndefined();
    // Standardebene wird nicht gespeichert.
    const back = assignLayer(view, { ...EMPTY_SELECTION, components: [c] }, DEFAULT_LAYER_ID);
    expect(back).toBe(view);
  });

  it('blendet Teile aus und sperrt sie, Leitungen an ausgeblendeten Bauteilen mit', () => {
    const r = addLayer(example());
    const view = sheetView(r.drawing, 0);
    const c = view.components.find((x) => view.connections.some((l) => 'componentId' in l.from && l.from.componentId === x.id))!;
    let d = withSheet(r.drawing, 0, assignLayer(view, { ...EMPTY_SELECTION, components: [c.id] }, r.layer.id));
    d = updateLayer(d, r.layer.id, { visible: false });
    const state = layerState(sheetView(d, 0));
    expect([...state.hidden.components]).toEqual([c.id]);
    expect(state.hidden.connections.size).toBeGreaterThan(0);
    const all = selectAll(sheetView(d, 0));
    expect(without(all, state.hidden).components).not.toContain(c.id);

    d = updateLayer(updateLayer(d, r.layer.id, { visible: true }), DEFAULT_LAYER_ID, { locked: true });
    const locked = layerState(sheetView(d, 0)).locked;
    expect(locked.components.has(c.id)).toBe(false);
    expect(locked.components.size).toBe(view.components.length - 1);
  });

  it('speichert Ebenen und lädt sie wieder', () => {
    const r = addLayer(example(), 'Grafik');
    const view = sheetView(r.drawing, 0);
    const d = withSheet(r.drawing, 0, assignLayer(view, { ...EMPTY_SELECTION, connections: [view.connections[0]!.id] }, r.layer.id));
    const parsed = parseDrawing(serializeDrawing(d));
    expect(parsed.ok && parsed.drawing).toEqual(d);
  });
});
