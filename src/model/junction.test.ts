import { describe, expect, it } from 'vitest';
import {
  addComponent,
  connect,
  connectionsAt,
  createDiagram,
  removeComponent,
  removeConnection,
  removeJunction,
  splitConnection,
} from './diagram.ts';
import { connectionPath, crossings, linePathData, routeAll } from './routing.ts';
import { parseDiagram, serializeDiagram } from '../io/json.ts';
import type { Diagram, Point } from './types.ts';

/** Pumpe unten, zwei Verbraucher oben: P → c2 und später ein Abzweig zu c3. */
function setup() {
  let d = createDiagram('hydraulic');
  const add = (type: string, x: number, y: number) => {
    const r = addComponent(d, type, { x, y });
    d = r.diagram;
    return r.component.id;
  };
  const pump = add('supply.pump', 100, 300);
  const g1 = add('measure.gauge', 150, 100);
  const g2 = add('measure.gauge', 300, 100);
  d = connect(d, { componentId: pump, portId: 'P' }, { componentId: g1, portId: '1' }).diagram;
  return { d, pump, g1, g2 };
}

function tee(): { d: Diagram; point: Point } {
  const { d, g2 } = setup();
  const line = d.connections[0]!;
  const path = connectionPath(d, line);
  // Ein Punkt mitten auf einem Teilstück der Leitung.
  const seg = path.findIndex((a, i) => i + 1 < path.length && Math.abs(path[i + 1]!.y - a.y) + Math.abs(path[i + 1]!.x - a.x) >= 40);
  const a = path[seg]!;
  const b = path[seg + 1]!;
  const point = a.x === b.x ? { x: a.x, y: Math.round((a.y + b.y) / 20) * 10 } : { x: Math.round((a.x + b.x) / 20) * 10, y: a.y };
  const split = splitConnection(d, line.id, path, point);
  const r = connect(split.diagram, { componentId: g2, portId: '1' }, { junctionId: split.junction.id });
  return { d: r.diagram, point };
}

describe('Abzweigpunkte', () => {
  it('teilt eine Leitung und schließt die neue am Abzweig an', () => {
    const { d, point } = tee();
    expect(d.junctions).toHaveLength(1);
    expect(d.junctions[0]!.position).toEqual(point);
    expect(connectionsAt(d, { junctionId: d.junctions[0]!.id })).toHaveLength(3);
    // Alle drei Leitungen enden am Abzweigpunkt.
    const paths = routeAll(d);
    for (const l of d.connections) {
      const p = paths.get(l.id)!;
      expect([p[0], p[p.length - 1]]).toContainEqual(point);
    }
  });

  it('verschmilzt die Leitungen wieder, wenn der Abzweig nur noch zwei hat', () => {
    const { d } = tee();
    const branch = d.connections[d.connections.length - 1]!;
    const after = removeConnection(d, branch.id);
    expect(after.junctions).toHaveLength(0);
    expect(after.connections).toHaveLength(1);
    const ends = [after.connections[0]!.from, after.connections[0]!.to].map((e) => ('portId' in e ? e.portId : ''));
    expect(ends.sort()).toEqual(['1', 'P']);
  });

  it('verschmilzt auch, wenn ein angeschlossenes Bauteil gelöscht wird', () => {
    const { d } = tee();
    const after = removeComponent(d, 'c3');
    expect(after.junctions).toHaveLength(0);
    expect(after.connections).toHaveLength(1);
  });

  it('Abzweig löschen entfernt ihn samt Leitungen', () => {
    const { d } = tee();
    const after = removeJunction(d, d.junctions[0]!.id);
    expect(after.junctions).toHaveLength(0);
    expect(after.connections).toHaveLength(0);
  });

  it('erlaubt höchstens vier Leitungen je Abzweig', () => {
    let { d } = tee();
    const j = { junctionId: d.junctions[0]!.id };
    const r = addComponent(d, 'measure.gauge', { x: 400, y: 100 });
    d = connect(r.diagram, { componentId: r.component.id, portId: '1' }, j).diagram;
    const r2 = addComponent(d, 'measure.gauge', { x: 500, y: 100 });
    expect(() => connect(r2.diagram, { componentId: r2.component.id, portId: '1' }, j)).toThrow(/höchstens 4/);
  });

  it('übersteht Speichern und Laden', () => {
    const { d } = tee();
    const loaded = parseDiagram(serializeDiagram(d));
    expect(loaded.ok && loaded.diagram).toEqual(d);
  });

  it('lädt alte Dateien ohne Abzweigpunkte', () => {
    const { d } = setup();
    const { junctions: _, ...old } = d;
    const loaded = parseDiagram(JSON.stringify({ format: 'fluidplan', version: 2, diagram: old }));
    expect(loaded.ok && loaded.diagram.junctions).toEqual([]);
  });
});

describe('Leitungssprünge', () => {
  it('findet Kreuzungen und zeichnet dort einen Bogen', () => {
    const paths = new Map([
      ['a', [{ x: 0, y: 50 }, { x: 100, y: 50 }]],
      ['b', [{ x: 50, y: 0 }, { x: 50, y: 100 }]],
      ['c', [{ x: 100, y: 0 }, { x: 100, y: 100 }]], // berührt nur das Ende von a
    ]);
    const jumps = crossings(paths);
    expect(jumps.get('a')).toEqual([{ x: 50, y: 50 }]);
    expect(jumps.has('b')).toBe(false);
    expect(linePathData(paths.get('a')!, jumps.get('a'))).toBe('M0,50 L46,50 A4,4 0 0 1 54,50 L100,50');
  });
});
