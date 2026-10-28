import { DiagramError, nextId } from './diagram.ts';
import type { Box } from './routing.ts';
import type { Annotation, Diagram, LineAnnotation, Point, RectAnnotation, StrokeStyle, TextAnnotation } from './types.ts';

/**
 * Freier Text und einfache Grafik (Linie, Rechteck) auf dem Blatt.
 * Wie diagram.ts: reine Funktionen, die einen neuen Diagram-Wert liefern.
 */

/** Schrifthöhen nach ISO 3098 in Einheiten (1 Einheit = 0,25 mm). */
export const TEXT_SIZES: readonly { size: number; name: string }[] = [
  { size: 10, name: '2,5 mm' },
  { size: 14, name: '3,5 mm' },
  { size: 20, name: '5 mm' },
  { size: 28, name: '7 mm' },
];
export const DEFAULT_TEXT_SIZE = 14;

/** Zeilenabstand als Vielfaches der Schrifthöhe. */
export const LINE_HEIGHT = 1.25;

/** Strichmuster in Einheiten; `undefined` = durchgezogen. */
export const STROKE_DASH: Record<StrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dashdot: '16 4 2 4',
};

/** Neue Grafik ohne ID; die vergibt `addAnnotation`. */
export type NewAnnotation =
  | Omit<TextAnnotation, 'id'>
  | Omit<LineAnnotation, 'id'>
  | Omit<RectAnnotation, 'id'>;

export function addAnnotation(diagram: Diagram, a: NewAnnotation): { diagram: Diagram; annotation: Annotation } {
  const annotation = structuredClone({ ...a, id: nextId('a', diagram.annotations) }) as Annotation;
  return { diagram: { ...diagram, annotations: [...diagram.annotations, annotation] }, annotation };
}

/** Ändert Felder einer Grafik; `kind` und `id` bleiben. */
export function updateAnnotation(
  diagram: Diagram,
  id: string,
  changes: Partial<Omit<TextAnnotation, 'id' | 'kind'>> &
    Partial<Omit<LineAnnotation, 'id' | 'kind'>> &
    Partial<Omit<RectAnnotation, 'id' | 'kind'>>,
): Diagram {
  if (!diagram.annotations.some((a) => a.id === id)) throw new DiagramError(`Grafik "${id}" existiert nicht`);
  return {
    ...diagram,
    annotations: diagram.annotations.map((a) => {
      if (a.id !== id) return a;
      // Nur Felder übernehmen, die diese Art kennt.
      const next = { ...a } as Record<string, unknown>;
      for (const [k, v] of Object.entries(changes)) if (k in a && v !== undefined) next[k] = v;
      return next as unknown as Annotation;
    }),
  };
}

export function removeAnnotation(diagram: Diagram, id: string): Diagram {
  return { ...diagram, annotations: diagram.annotations.filter((a) => a.id !== id) };
}

const shift = (p: Point, d: Point): Point => ({ x: p.x + d.x, y: p.y + d.y });

export function moveAnnotations(diagram: Diagram, ids: readonly string[], delta: Point): Diagram {
  if ((delta.x === 0 && delta.y === 0) || ids.length === 0) return diagram;
  return {
    ...diagram,
    annotations: diagram.annotations.map((a) => {
      if (!ids.includes(a.id)) return a;
      if (a.kind === 'line') return { ...a, from: shift(a.from, delta), to: shift(a.to, delta) };
      return { ...a, position: shift(a.position, delta) };
    }),
  };
}

/** Rechteck aus zwei beliebigen Ecken. */
export function rectFromCorners(a: Point, b: Point): Pick<RectAnnotation, 'position' | 'width' | 'height'> {
  return {
    position: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) },
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function textLines(t: Pick<TextAnnotation, 'text'>): string[] {
  return t.text.split('\n');
}

/**
 * Umriss einer Grafik. Bei Text geschätzt (mittlere Zeichenbreite 0,6 × Schrifthöhe),
 * das genügt für Auswahlrahmen und Prüfung.
 */
export function annotationBox(a: Annotation): Box {
  if (a.kind === 'line') {
    return {
      minX: Math.min(a.from.x, a.to.x),
      minY: Math.min(a.from.y, a.to.y),
      maxX: Math.max(a.from.x, a.to.x),
      maxY: Math.max(a.from.y, a.to.y),
    };
  }
  if (a.kind === 'rect') {
    return { minX: a.position.x, minY: a.position.y, maxX: a.position.x + a.width, maxY: a.position.y + a.height };
  }
  const lines = textLines(a);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  return {
    minX: a.position.x,
    minY: a.position.y - a.size * 0.8,
    maxX: a.position.x + longest * a.size * 0.6,
    maxY: a.position.y + (lines.length - 1) * a.size * LINE_HEIGHT + a.size * 0.25,
  };
}
