import { describe, expect, it } from 'vitest';
import { alignComponents, alignSelection, boundsOf, distributeSelection, mirrorComponents, moveComponents, rotateComponents } from './arrange.ts';
import { portPosition, updateConnection } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { addAnnotation, annotationBox } from './annotations.ts';
import { componentBox } from './routing.ts';
import { EMPTY_SELECTION } from './selection.ts';
import type { Diagram, Point, PortRef } from './types.ts';

const allPorts = (d: Diagram, ids: string[]): Point[] =>
  d.connections
    .flatMap((l) => [l.from, l.to])
    .filter((r): r is PortRef => 'componentId' in r && ids.includes(r.componentId))
    .map((r) => portPosition(d, r));

const onGrid = (p: Point) => p.x % 10 === 0 && p.y % 10 === 0;

describe('Anordnen', () => {
  const base = exampleHydraulicDiagram(new Date(0));
  const ids = base.components.slice(0, 3).map((c) => c.id);

  it('verschiebt Bauteile samt Knickpunkten der Leitungen zwischen ihnen', () => {
    const [valve, cylinder] = [base.components[1]!, base.components[0]!];
    const inner = base.connections.find(
      (l) => JSON.stringify([l.from, l.to]).includes(`"${valve.id}"`) && JSON.stringify(l.to).includes(`"${cylinder.id}"`),
    )!;
    const d0 = updateConnection(base, inner.id, { waypoints: [{ x: 300, y: 200 }] });
    const d = moveComponents(d0, [valve.id, cylinder.id], { x: 20, y: -10 });
    expect(d.components[0]!.position).toEqual({ x: cylinder.position.x + 20, y: cylinder.position.y - 10 });
    expect(d.connections.find((l) => l.id === inner.id)!.waypoints).toEqual([{ x: 320, y: 190 }]);
    expect(moveComponents(base, ids, { x: 0, y: 0 })).toBe(base);
  });

  it('dreht ein einzelnes Bauteil auf der Stelle', () => {
    const c = base.components[1]!;
    const d = rotateComponents(base, [c.id]);
    expect(d.components[1]).toMatchObject({ position: c.position, rotation: 90 });
  });

  it('dreht eine Gruppe um ihre Mitte, Anschlüsse bleiben im Raster', () => {
    let d = base;
    for (let i = 0; i < 4; i++) {
      d = rotateComponents(d, ids);
      for (const p of allPorts(d, ids)) expect(onGrid(p), JSON.stringify(p)).toBe(true);
    }
    expect(d.components).toEqual(base.components);
  });

  it('dreht die Lage der Bauteile zueinander mit', () => {
    const [a, b] = ids;
    const center = (d: Diagram, id: string) => {
      const box = componentBox(d.components.find((c) => c.id === id)!)!;
      return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
    };
    const before = { a: center(base, a!), b: center(base, b!) };
    const d = rotateComponents(base, ids);
    const after = { a: center(d, a!), b: center(d, b!) };
    // Vektor a→b um 90° im Uhrzeigersinn gedreht: (x, y) -> (-y, x)
    expect(after.b.x - after.a.x).toBe(-(before.b.y - before.a.y));
    expect(after.b.y - after.a.y).toBe(before.b.x - before.a.x);
  });

  it('spiegelt waagerecht und senkrecht und zurück', () => {
    for (const axis of ['horizontal', 'vertical'] as const) {
      const once = mirrorComponents(base, ids, axis);
      for (const p of allPorts(once, ids)) expect(onGrid(p)).toBe(true);
      expect(boundsOf(once, ids)).toEqual(boundsOf(base, ids));
      expect(mirrorComponents(once, ids, axis).components).toEqual(base.components);
    }
  });

  it('spiegelt Anschlusslagen auf dem Blatt', () => {
    const c = base.components[1]!; // Wegeventil
    const d = mirrorComponents(base, [c.id], 'horizontal');
    const box = componentBox(c)!;
    const ref = { componentId: c.id, portId: 'P' };
    const before = portPosition(base, ref);
    const after = portPosition(d, ref);
    expect(after.x).toBe(box.minX + box.maxX - before.x);
    expect(after.y).toBe(before.y);

    const rotated = rotateComponents(base, [c.id]);
    const v = mirrorComponents(rotated, [c.id], 'vertical');
    expect(portPosition(v, ref).x).toBe(portPosition(rotated, ref).x);
    const rbox = componentBox(rotated.components[1]!)!;
    expect(portPosition(v, ref).y).toBe(rbox.minY + rbox.maxY - portPosition(rotated, ref).y);
  });

  it('richtet Kanten und Mitten aus', () => {
    const boxes = (d: Diagram) => ids.map((id) => componentBox(d.components.find((c) => c.id === id)!)!);
    const left = alignComponents(base, ids, 'left');
    expect(new Set(boxes(left).map((b) => b.minX)).size).toBe(1);
    const bottom = alignComponents(base, ids, 'bottom');
    expect(new Set(boxes(bottom).map((b) => b.maxY)).size).toBe(1);
    const center = alignComponents(base, ids, 'center');
    for (const b of boxes(center)) expect(Math.abs((b.minX + b.maxX) / 2 - (boxes(center)[0]!.minX + boxes(center)[0]!.maxX) / 2)).toBeLessThanOrEqual(5);
    for (const p of allPorts(center, ids)) expect(onGrid(p)).toBe(true);
  });

  it('richtet auch Grafiken aus, Gruppen wandern als Ganzes', () => {
    const r1 = addAnnotation(base, { kind: 'rect', position: { x: 33, y: 41 }, width: 20, height: 10, style: 'solid' });
    const r2 = addAnnotation(r1.diagram, { kind: 'rect', position: { x: 70, y: 90 }, width: 30, height: 15, style: 'solid' });
    const r3 = addAnnotation(r2.diagram, { kind: 'rect', position: { x: 200, y: 60 }, width: 10, height: 10, style: 'solid' });
    const grouped = {
      ...r3.diagram,
      groups: [{ id: 'g1', components: [], connections: [], junctions: [], annotations: [r2.annotation.id, r3.annotation.id] }],
    };
    const sel = { ...EMPTY_SELECTION, annotations: [r1.annotation.id, r2.annotation.id, r3.annotation.id] };
    const d = alignSelection(grouped, sel, 'left');
    const box = (id: string) => annotationBox(d.annotations.find((a) => a.id === id)!);
    expect(box(r1.annotation.id).minX).toBe(33);
    expect(box(r2.annotation.id).minX).toBe(33);
    // r3 gehört zur Gruppe mit r2 und behält den Abstand zu ihr.
    expect(box(r3.annotation.id).minX).toBe(163);
  });

  it('verteilt gleichmäßig, äußere Teile bleiben stehen', () => {
    const sel = { ...EMPTY_SELECTION, components: ids };
    for (const axis of ['horizontal', 'vertical'] as const) {
      const d = distributeSelection(base, sel, axis);
      const [lo, hi] = axis === 'horizontal' ? (['minX', 'maxX'] as const) : (['minY', 'maxY'] as const);
      const boxes = ids
        .map((id) => componentBox(d.components.find((c) => c.id === id)!)!)
        .sort((a, b) => a[lo] + a[hi] - b[lo] - b[hi]);
      const gaps = boxes.slice(1).map((b, i) => b[lo] - boxes[i]![hi]);
      expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(10);
      for (const p of allPorts(d, ids)) expect(onGrid(p)).toBe(true);
    }
    expect(distributeSelection(base, { ...EMPTY_SELECTION, components: ids.slice(0, 2) }, 'horizontal')).toBe(base);
  });
});
