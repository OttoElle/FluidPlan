import { describe, expect, it } from 'vitest';
import { addAnnotation, annotationBox, moveAnnotations, rectFromCorners, updateAnnotation } from './annotations.ts';
import { createDiagram } from './diagram.ts';
import { deleteSelected, selectAll } from './selection.ts';

describe('Text und Grafik', () => {
  const empty = createDiagram('hydraulic', 'Test', new Date(0));

  it('vergibt IDs und verschiebt Linien wie Rechtecke', () => {
    let d = addAnnotation(empty, { kind: 'line', from: { x: 0, y: 0 }, to: { x: 40, y: 0 }, style: 'solid' }).diagram;
    const r = addAnnotation(d, { kind: 'rect', ...rectFromCorners({ x: 50, y: 60 }, { x: 10, y: 20 }), style: 'dashdot' });
    d = r.diagram;
    expect(d.annotations.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(r.annotation).toMatchObject({ position: { x: 10, y: 20 }, width: 40, height: 40 });
    d = moveAnnotations(d, ['a1', 'a2'], { x: 10, y: 5 });
    expect(d.annotations[0]).toMatchObject({ from: { x: 10, y: 5 }, to: { x: 50, y: 5 } });
    expect(d.annotations[1]).toMatchObject({ position: { x: 20, y: 25 } });
  });

  it('übernimmt beim Ändern nur passende Felder', () => {
    const d = addAnnotation(empty, { kind: 'text', position: { x: 0, y: 0 }, text: 'A', size: 14 }).diagram;
    const next = updateAnnotation(d, 'a1', { text: 'B', style: 'dashed' });
    expect(next.annotations[0]).toEqual({ id: 'a1', kind: 'text', position: { x: 0, y: 0 }, text: 'B', size: 14 });
  });

  it('schätzt den Umriss mehrzeiliger Texte', () => {
    const { annotation } = addAnnotation(empty, { kind: 'text', position: { x: 0, y: 20 }, text: 'abcde\nx', size: 20 });
    const box = annotationBox(annotation);
    // Größe 20 = 5 mm Versalhöhe, gezeichnet mit rund 7 mm Schriftgröße.
    expect(box.maxX).toBeCloseTo(5 * 0.6 * (20 / 0.716), 1);
    expect(box.maxY).toBeGreaterThan(40);
  });

  it('wird mit der Auswahl gelöscht', () => {
    const d = addAnnotation(empty, { kind: 'text', position: { x: 0, y: 0 }, text: 'A', size: 14 }).diagram;
    expect(deleteSelected(d, selectAll(d)).annotations).toEqual([]);
  });
});
