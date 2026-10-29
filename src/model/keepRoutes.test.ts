import { describe, expect, it } from 'vitest';
import { moveComponents, rotateComponents } from './arrange.ts';
import { endpointPosition } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { componentBox, endpointDirection, keepRoutes, routeAll } from './routing.ts';
import type { Diagram, Point } from './types.ts';

const base = exampleHydraulicDiagram(new Date(0));
const idOf = (label: string) => base.components.find((c) => c.label === label)!.id;

const touches = (d: Diagram, lineId: string, componentId: string) => {
  const l = d.connections.find((c) => c.id === lineId)!;
  return [l.from, l.to].some((e) => 'componentId' in e && e.componentId === componentId);
};

/** Rechtwinklig, an den Anschlüssen, und verlässt jeden Anschluss in seiner Richtung. */
function expectClean(d: Diagram) {
  const paths = routeAll(d);
  for (const l of d.connections) {
    const p = paths.get(l.id)!;
    expect(p.slice(1).every((b, i) => p[i]!.x === b.x || p[i]!.y === b.y)).toBe(true);
    expect(p[0]).toEqual(endpointPosition(d, l.from));
    expect(p[p.length - 1]).toEqual(endpointPosition(d, l.to));
    for (const [a, b, ref] of [
      [p[0]!, p[1]!, l.from],
      [p[p.length - 1]!, p[p.length - 2]!, l.to],
    ] as const) {
      const dir = endpointDirection(d, ref);
      if (dir) expect([Math.sign(b.x - a.x), Math.sign(b.y - a.y)]).toEqual([dir.x, dir.y]);
    }
  }
}

describe('Leitungen beim Verschieben', () => {
  it('lässt nicht angeschlossene Leitungen unverändert', () => {
    const before = routeAll(base);
    const relief = idOf('0V1');
    const d = moveComponents(base, [relief], { x: 40, y: 0 });
    const after = routeAll(d);
    for (const l of base.connections) {
      if (!touches(base, l.id, relief)) expect(after.get(l.id)).toEqual(before.get(l.id));
    }
    expectClean(d);
  });

  it('führt nur die Teilstücke am verschobenen Anschluss nach', () => {
    const before = routeAll(base);
    const cylinder = idOf('1A1');
    const d = moveComponents(base, [cylinder], { x: 30, y: 0 });
    const after = routeAll(d);
    for (const l of base.connections.filter((c) => touches(base, c.id, cylinder))) {
      const a = after.get(l.id)!;
      const b = before.get(l.id)!;
      // Das Ende am Ventil bleibt, wo es war; eine gerade Leitung bekommt höchstens zwei Knicke.
      expect(a[0]).toEqual(b[0]);
      expect(a.length).toBeLessThanOrEqual(b.length === 2 ? 4 : b.length);
      // Ab dem zweiten Knick (vom Zylinder aus gezählt) ist der Verlauf unverändert.
      if (b.length > 3) expect(a.slice(0, -2)).toEqual(b.slice(0, -2));
    }
    expectClean(d);
  });

  it('bleibt sauber bei großen Wegen, Drehen und mehreren Schritten', () => {
    let d: Diagram = base;
    // Druckbegrenzungsventil nach rechts, nach unten neben den Tank, weit nach rechts oben.
    const steps: Point[] = [
      { x: 100, y: 0 },
      { x: 0, y: 60 },
      { x: 10, y: 0 },
      { x: 200, y: -150 },
      { x: -150, y: 0 },
    ];
    for (const delta of steps) {
      d = moveComponents(d, [idOf('0V1')], delta);
      expectClean(d);
    }
    d = rotateComponents(d, [idOf('1V1')]);
    expectClean(d);
  });

  it('keine nachgeführte Leitung läuft durch das verschobene Bauteil', () => {
    const valve = idOf('1V1');
    const d = moveComponents(base, [valve], { x: -60, y: 0 });
    const box = componentBox(d.components.find((c) => c.id === valve)!)!;
    for (const p of routeAll(d).values()) {
      for (let i = 1; i < p.length; i++) {
        const [a, b] = [p[i - 1]!, p[i]!];
        const inside =
          Math.min(a.x, b.x) < box.maxX && Math.max(a.x, b.x) > box.minX &&
          Math.min(a.y, b.y) < box.maxY && Math.max(a.y, b.y) > box.minY;
        expect(inside).toBe(false);
      }
    }
  });

  it('keepRoutes ohne Änderung lässt den Plan gleich', () => {
    const d = keepRoutes(base, base);
    expect(routeAll(d)).toEqual(routeAll(base));
  });
});
