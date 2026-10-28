import { describe, expect, it } from 'vitest';
import { exampleHydraulicDiagram } from './example.ts';
import { connectionPath, junctions, moveSegment, obstaclesOf, orthogonalize, route, type Box } from './routing.ts';
import type { Point } from './types.ts';

const isOrthogonal = (path: Point[]) =>
  path.slice(1).every((b, i) => path[i]!.x === b.x || path[i]!.y === b.y);

const crosses = (path: Point[], box: Box) =>
  path.slice(1).some((b, i) => {
    const a = path[i]!;
    const x1 = Math.min(a.x, b.x);
    const x2 = Math.max(a.x, b.x);
    const y1 = Math.min(a.y, b.y);
    const y2 = Math.max(a.y, b.y);
    return x1 < box.maxX && x2 > box.minX && y1 < box.maxY && y2 > box.minY;
  });

describe('route', () => {
  it('verbindet gegenüberliegende Anschlüsse geradlinig', () => {
    const path = route({ start: { x: 0, y: 0 }, startDir: { x: 0, y: -1 }, end: { x: 0, y: -100 }, endDir: { x: 0, y: 1 }, obstacles: [] });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -100 },
    ]);
  });

  it('führt rechtwinklig, verlässt und erreicht Anschlüsse senkrecht zur Kante', () => {
    const path = route({ start: { x: 0, y: 0 }, startDir: { x: 0, y: -1 }, end: { x: 100, y: -100 }, endDir: { x: 0, y: 1 }, obstacles: [] });
    expect(isOrthogonal(path)).toBe(true);
    expect(path[1]!.x).toBe(0); // erst nach oben
    expect(path[path.length - 2]!.x).toBe(100); // von unten in den Zielanschluss
    expect(path).toHaveLength(4);
  });

  it('umgeht Bauteile', () => {
    const box = { minX: -30, minY: -70, maxX: 30, maxY: -30 };
    const path = route({ start: { x: 0, y: 0 }, startDir: { x: 0, y: -1 }, end: { x: 0, y: -100 }, endDir: { x: 0, y: 1 }, obstacles: [box] });
    expect(isOrthogonal(path)).toBe(true);
    expect(crosses(path, box)).toBe(false);
  });
});

describe('Beispielschaltplan', () => {
  it('alle Leitungen sind rechtwinklig und liegen im Raster', () => {
    const d = exampleHydraulicDiagram();
    for (const l of d.connections) {
      const path = connectionPath(d, l);
      expect(isOrthogonal(path)).toBe(true);
      expect(path.every((p) => p.x % 10 === 0 && p.y % 10 === 0)).toBe(true);
    }
  });

  it('keine automatisch geführte Leitung schneidet ein Bauteil', () => {
    const d = exampleHydraulicDiagram();
    const boxes = obstaclesOf(d);
    for (const l of d.connections) {
      const path = connectionPath(d, l);
      for (const box of boxes) {
        // Ein winziges Stück Rand am eigenen Anschluss zählt nicht: Box um 1 verkleinern.
        expect(crosses(path, { minX: box.minX + 1, minY: box.minY + 1, maxX: box.maxX - 1, maxY: box.maxY - 1 })).toBe(false);
      }
    }
  });

  it('setzt einen Verbindungspunkt, wo sich zwei Leitungen vom selben Anschluss trennen', () => {
    const d = exampleHydraulicDiagram();
    const paths = new Map(d.connections.map((l) => [l.id, connectionPath(d, l)]));
    expect(junctions(d.connections, paths).length).toBeGreaterThan(0);
  });
});

describe('orthogonalize', () => {
  it('fügt Knicke ein und beachtet die Anschlussrichtung', () => {
    expect(orthogonalize([{ x: 0, y: 0 }, { x: 50, y: -50 }], { x: 0, y: -1 })).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -50 },
      { x: 50, y: -50 },
    ]);
  });
});

describe('moveSegment', () => {
  const path = [
    { x: 0, y: 0 },
    { x: 0, y: -50 },
    { x: 100, y: -50 },
    { x: 100, y: -100 },
  ];

  it('verschiebt ein waagerechtes Mittelstück senkrecht', () => {
    expect(moveSegment(path, 1, -20)).toEqual([
      { x: 0, y: -70 },
      { x: 100, y: -70 },
    ]);
  });

  it('lässt ein Endstück am Anschluss hängen', () => {
    const wp = moveSegment(path, 0, 30);
    const full = [path[0]!, ...wp, path[3]!];
    expect(isOrthogonal(full)).toBe(true);
    // Kurzer Stich nach oben, dann seitlich versetzt weiter.
    expect(wp.slice(0, 3)).toEqual([
      { x: 0, y: -10 },
      { x: 30, y: -10 },
      { x: 30, y: -50 },
    ]);
  });
});
