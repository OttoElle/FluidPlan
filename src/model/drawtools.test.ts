import { describe, expect, it } from 'vitest';
import { parseDiagram, serializeDiagram } from '../io/json.ts';
import { addAnnotation, annotationBox, moveAnnotations } from './annotations.ts';
import { copySelection, pasteFragment } from './clipboard.ts';
import { connect, splitConnection } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { expandGroups, group, pruneGroups, ungroup } from './groups.ts';
import { routeAll } from './routing.ts';
import { EMPTY_SELECTION, deleteSelected } from './selection.ts';
import { DEFAULT_SNAP, snapPoint, snapTargets } from './snap.ts';
import type { Diagram } from './types.ts';

const base = () => exampleHydraulicDiagram(new Date('2026-10-29T12:00:00Z'));
const ids = (d: Diagram, labels: string[]) => d.components.filter((c) => labels.includes(c.label)).map((c) => c.id);

describe('Kopieren und Einfügen', () => {
  it('nimmt Leitungen zwischen kopierten Bauteilen mit, andere nicht', () => {
    const d = base();
    const [cyl, valve] = [ids(d, ['1A1'])[0]!, ids(d, ['1V1'])[0]!];
    const f = copySelection(d, { ...EMPTY_SELECTION, components: [cyl, valve] })!;
    expect(f.components).toHaveLength(2);
    // Ventil A/B zum Zylinder: zwei Leitungen; Pumpe und Tank bleiben draußen.
    expect(f.connections).toHaveLength(2);
    const r = pasteFragment(d, f, { x: 40, y: 20 });
    expect(r.diagram.components).toHaveLength(d.components.length + 2);
    expect(r.diagram.connections).toHaveLength(d.connections.length + 2);
    expect(r.selection.components).toHaveLength(2);
    const copy = r.diagram.components.find((c) => c.id === r.selection.components[0])!;
    expect(copy.position).toEqual({ x: d.components.find((c) => c.id === cyl)!.position.x + 40, y: d.components.find((c) => c.id === cyl)!.position.y + 20 });
    // Neue IDs, die Leitungen zeigen auf die Kopien.
    for (const id of r.selection.connections) {
      const l = r.diagram.connections.find((x) => x.id === id)!;
      expect(r.selection.components).toContain((l.from as { componentId: string }).componentId);
    }
    // Die Datei bleibt gültig.
    expect(parseDiagram(serializeDiagram(r.diagram)).ok).toBe(true);
  });

  it('nimmt Abzweige mit, wenn sie zwischen kopierten Bauteilen liegen', () => {
    let d = base();
    const [pump, valve, relief] = [ids(d, ['0P1'])[0]!, ids(d, ['1V1'])[0]!, ids(d, ['0V1'])[0]!];
    // Pumpe→Ventil an einem Abzweig mit dem DBV verbinden.
    const line = d.connections.find((l) => JSON.stringify(l).includes(`"${pump}"`) && JSON.stringify(l).includes(`"${valve}"`))!;
    const path = routeAll(d).get(line.id)!;
    const s = splitConnection(d, line.id, path, path[1]!);
    d = connect(s.diagram, { junctionId: s.junction.id }, { componentId: relief, portId: 'T' }).diagram;
    const all = copySelection(d, { ...EMPTY_SELECTION, components: [pump, valve, relief] })!;
    expect(all.junctions).toHaveLength(1);
    // Ohne DBV hängen am Abzweig nur noch zwei Leitungen: sie werden eine.
    const two = copySelection(d, { ...EMPTY_SELECTION, components: [pump, valve] })!;
    expect(two.junctions).toHaveLength(0);
    expect(two.connections).toHaveLength(1);
  });

  it('kopiert Grafik und nichts, wenn nichts Passendes ausgewählt ist', () => {
    const r = addAnnotation(base(), { kind: 'circle', center: { x: 100, y: 100 }, radius: 20, style: 'solid' });
    const f = copySelection(r.diagram, { ...EMPTY_SELECTION, annotations: [r.annotation.id] })!;
    const p = pasteFragment(r.diagram, f, { x: 20, y: 0 });
    const pasted = p.diagram.annotations.at(-1)!;
    expect(pasted).toMatchObject({ kind: 'circle', center: { x: 120, y: 100 } });
    expect(pasted.id).not.toBe(r.annotation.id);
    expect(copySelection(base(), { ...EMPTY_SELECTION, connections: ['l1'] })).toBeNull();
  });
});

describe('Gruppen', () => {
  it('wählt, verschiebt und löst Gruppen auf', () => {
    const d0 = base();
    const [a, b] = d0.components.map((c) => c.id);
    const { diagram: d, group: g } = group(d0, { ...EMPTY_SELECTION, components: [a!, b!] });
    expect(g).toBeDefined();
    expect(expandGroups(d, { ...EMPTY_SELECTION, components: [a!] }).components).toEqual([a, b]);
    expect(ungroup(d, { ...EMPTY_SELECTION, components: [b!] }).groups).toEqual([]);
    // Ein einzelnes Teil ergibt keine Gruppe.
    expect(group(d0, { ...EMPTY_SELECTION, components: [a!] }).group).toBeUndefined();
  });

  it('räumt Gruppen nach dem Löschen auf und speichert sie', () => {
    const d0 = base();
    const [a, b, c] = d0.components.map((x) => x.id);
    const d = group(d0, { ...EMPTY_SELECTION, components: [a!, b!, c!] }).diagram;
    const after = deleteSelected(d, { ...EMPTY_SELECTION, components: [a!, b!] });
    expect(after.groups).toEqual([]);
    const kept = deleteSelected(d, { ...EMPTY_SELECTION, components: [a!] });
    expect(kept.groups[0]!.components).toEqual([b, c]);
    expect(pruneGroups(kept)).toBe(kept);
    const loaded = parseDiagram(serializeDiagram(d));
    expect(loaded.ok && loaded.diagram.groups).toEqual(d.groups);
  });

  it('weist Gruppen mit unbekannten Teilen zurück', () => {
    const file = JSON.parse(serializeDiagram(base()));
    file.diagram.groups = [{ id: 'g1', components: ['c1', 'c99'], connections: [], junctions: [], annotations: [] }];
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(false);
  });
});

describe('Neue Grafikarten', () => {
  it('speichert Kreis, Ellipse und Linienzug und verschiebt sie', () => {
    let d = base();
    d = addAnnotation(d, { kind: 'circle', center: { x: 100, y: 100 }, radius: 20, style: 'solid' }).diagram;
    d = addAnnotation(d, { kind: 'ellipse', center: { x: 200, y: 100 }, rx: 40, ry: 20, style: 'dashed' }).diagram;
    d = addAnnotation(d, {
      kind: 'polyline',
      points: [{ x: 0, y: 0 }, { x: 30, y: 10 }, { x: 10, y: 40 }],
      closed: true,
      style: 'dashdot',
    }).diagram;
    const r = parseDiagram(serializeDiagram(d));
    expect(r.ok && r.diagram.annotations).toEqual(d.annotations);
    const moved = moveAnnotations(d, d.annotations.map((a) => a.id), { x: 10, y: 10 });
    expect(annotationBox(moved.annotations[0]!)).toEqual({ minX: 90, minY: 90, maxX: 130, maxY: 130 });
    expect(annotationBox(moved.annotations[2]!)).toEqual({ minX: 10, minY: 10, maxX: 40, maxY: 50 });
  });

  it('lädt Dateien der Version 4 ohne Gruppen', () => {
    const file = JSON.parse(serializeDiagram(base()));
    file.version = 4;
    delete file.diagram.groups;
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok && r.diagram.groups).toEqual([]);
  });
});

describe('Fangen', () => {
  const d = addAnnotation(base(), { kind: 'line', from: { x: 103, y: 47 }, to: { x: 200, y: 47 }, style: 'solid' }).diagram;
  const targets = snapTargets(d, routeAll(d));

  it('fängt Endpunkte vor dem Raster', () => {
    expect(snapPoint({ x: 105, y: 45 }, targets, DEFAULT_SNAP, 5)).toEqual({ point: { x: 103, y: 47 }, kind: 'endpoint' });
    expect(snapPoint({ x: 105, y: 45 }, targets, { ...DEFAULT_SNAP, endpoint: false }, 5).kind).toBe('grid');
  });

  it('rundet ohne Raster nur auf die feine Schrittweite', () => {
    const off = { grid: false, connector: false, endpoint: false };
    expect(snapPoint({ x: 12.4, y: 7.6 }, targets, off, 5)).toEqual({ point: { x: 12, y: 8 }, kind: null });
  });

  it('fängt Bauteilanschlüsse', () => {
    const p = targets.connectors[0]!;
    expect(snapPoint({ x: p.x + 2, y: p.y - 2 }, targets, { grid: true, connector: true, endpoint: false }, 5)).toEqual({
      point: p,
      kind: 'connector',
    });
  });
});
