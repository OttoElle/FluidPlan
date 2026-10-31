import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  annotationBox,
  arcEnd,
  arcFromPoints,
  arcPath,
  arcStart,
  strokeDash,
  strokeWidthOf,
  updateAnnotation,
} from './annotations.ts';
import { createDiagram } from './diagram.ts';
import { serializeDiagram, parseDiagram } from '../io/json.ts';
import type { ArcAnnotation } from './types.ts';

const close = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 6);
  expect(p.y).toBeCloseTo(y, 6);
};

describe('Kreisbogen', () => {
  const c = { x: 100, y: 100 };

  it('läuft je nach Richtung oben oder unten herum', () => {
    // Von rechts nach links: im Uhrzeigersinn (Bildschirm) unten herum, sonst oben.
    const cw = arcFromPoints(c, { x: 140, y: 100 }, { x: 60, y: 100 }, true)!;
    const ccw = arcFromPoints(c, { x: 140, y: 100 }, { x: 60, y: 100 }, false)!;
    expect(cw).toMatchObject({ radius: 40, start: 0, sweep: 180 });
    expect(ccw).toMatchObject({ radius: 40, start: 0, sweep: -180 });
    const bcw = annotationBox({ id: 'x', kind: 'arc', ...cw, style: 'solid' });
    const bccw = annotationBox({ id: 'x', kind: 'arc', ...ccw, style: 'solid' });
    expect(bcw).toMatchObject({ minY: 100, maxY: 140 });
    expect(bccw).toMatchObject({ minY: 60, maxY: 100 });
  });

  it('nimmt den Radius vom Anfang und nur die Richtung vom Ende', () => {
    const a = arcFromPoints(c, { x: 100, y: 60 }, { x: 300, y: 100 }, true)!;
    expect(a).toMatchObject({ radius: 40, start: -90, sweep: 90 });
    const arc = { id: 'x', kind: 'arc', ...a, style: 'solid' } as ArcAnnotation;
    close(arcStart(arc), 100, 60);
    close(arcEnd(arc), 140, 100);
    expect(arcPath(arc)).toBe('M 100 60 A 40 40 0 0 1 140 100');
  });

  it('kennt große Bögen und lehnt leere ab', () => {
    const big = arcFromPoints(c, { x: 140, y: 100 }, { x: 100, y: 60 }, true)!;
    expect(big.sweep).toBe(270);
    expect(arcPath(big)).toContain(' 0 1 1 ');
    expect(arcFromPoints(c, { x: 140, y: 100 }, { x: 180, y: 100 }, true)).toBeNull();
    expect(arcFromPoints(c, c, { x: 180, y: 100 }, true)).toBeNull();
  });
});

describe('Linienbreite und Farbe', () => {
  const empty = createDiagram('Test', new Date(0));

  it('setzt und entfernt Linienbreite und Farbe', () => {
    let d = addAnnotation(empty, { kind: 'line', from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, style: 'dashed' }).diagram;
    d = addAnnotation(d, { kind: 'text', position: { x: 0, y: 0 }, text: 'A', size: 14 }).diagram;
    d = updateAnnotation(d, 'a1', { lineWidth: 0.5, color: '#d32f2f' });
    d = updateAnnotation(d, 'a2', { lineWidth: 0.5, color: '#1565c0' });
    expect(d.annotations[0]).toMatchObject({ lineWidth: 0.5, color: '#d32f2f' });
    // Text hat keine Linienbreite.
    expect(d.annotations[1]).not.toHaveProperty('lineWidth');
    expect(d.annotations[1]).toMatchObject({ color: '#1565c0' });
    expect(strokeWidthOf(d.annotations[0] as { lineWidth?: number })).toBe(2);
    expect(strokeDash('dashed', 0.5)).toBe('16 8');
    expect(strokeDash('dashed', 0.18)).toBe('8 4');
    d = updateAnnotation(d, 'a1', { lineWidth: 0.25, color: null });
    expect(d.annotations[0]).not.toHaveProperty('lineWidth');
    expect(d.annotations[0]).not.toHaveProperty('color');
  });

  it('speichert Bogen, Linienbreite und Farbe in der Datei', () => {
    let d = addAnnotation(empty, {
      kind: 'arc',
      center: { x: 10, y: 10 },
      radius: 20,
      start: 0,
      sweep: -90,
      style: 'solid',
      lineWidth: 0.7,
      color: '#2e7d32',
    }).diagram;
    d = addAnnotation(d, { kind: 'text', position: { x: 0, y: 0 }, text: 'A', size: 14, color: '#d32f2f' }).diagram;
    const back = parseDiagram(serializeDiagram(d));
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.diagram.annotations).toEqual(d.annotations);
  });

  it('meldet ungültige Farben', () => {
    const d = addAnnotation(empty, { kind: 'line', from: { x: 0, y: 0 }, to: { x: 4, y: 0 }, style: 'solid' }).diagram;
    const text = serializeDiagram(d).replace('"style": "solid"', '"style": "solid", "color": "rot"');
    const r = parseDiagram(text);
    expect(r.ok).toBe(false);
  });
});
