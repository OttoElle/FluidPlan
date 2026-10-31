import { DiagramError, nextId } from './diagram.ts';
import type { Box } from './routing.ts';
import { fontSizeFor } from './lettering.ts';
import type {
  Annotation,
  CircleAnnotation,
  Diagram,
  EllipseAnnotation,
  LineAnnotation,
  Point,
  PolylineAnnotation,
  RectAnnotation,
  StrokeStyle,
  TextAnnotation,
} from './types.ts';

/**
 * Freier Text und einfache Grafik (Linie, Rechteck, Kreis, Ellipse, Linienzug) auf dem Blatt.
 * Wie diagram.ts: reine Funktionen, die einen neuen Diagram-Wert liefern.
 */

/**
 * Schrifthöhen h nach ISO 3098 (Versalhöhe) in Einheiten (1 Einheit = 0,25 mm).
 * Gezeichnet wird mit fontSizeFor(h), siehe lettering.ts.
 */
export const TEXT_SIZES: readonly { size: number; name: string }[] = [
  { size: 10, name: '2,5 mm' },
  { size: 14, name: '3,5 mm' },
  { size: 20, name: '5 mm' },
  { size: 28, name: '7 mm' },
];
export const DEFAULT_TEXT_SIZE = 14;

/**
 * Zeilenabstand als Vielfaches der Schriftgröße (Geviert): 1,4 em ≈ 1,9 h, der
 * Grundlinienabstand b1 für Groß- und Kleinbuchstaben mit Umlauten (ISO 3098-1, Tabelle 2).
 */
export const LINE_HEIGHT = 1.4;

/** Strichmuster in Einheiten; `undefined` = durchgezogen. */
export const STROKE_DASH: Record<StrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dashdot: '16 4 2 4',
};

/** Neue Grafik ohne ID; die vergibt `addAnnotation`. */
export type NewAnnotation = Annotation extends infer A ? (A extends Annotation ? Omit<A, 'id'> : never) : never;

/** Alle änderbaren Felder aller Grafikarten. */
type AnnotationChanges = Partial<Omit<TextAnnotation, 'id' | 'kind'>> &
  Partial<Omit<LineAnnotation, 'id' | 'kind'>> &
  Partial<Omit<RectAnnotation, 'id' | 'kind'>> &
  Partial<Omit<CircleAnnotation, 'id' | 'kind'>> &
  Partial<Omit<EllipseAnnotation, 'id' | 'kind'>> &
  Partial<Omit<PolylineAnnotation, 'id' | 'kind'>>;

export function addAnnotation(diagram: Diagram, a: NewAnnotation): { diagram: Diagram; annotation: Annotation } {
  const annotation = structuredClone({ ...a, id: nextId('a', diagram.annotations) }) as Annotation;
  return { diagram: { ...diagram, annotations: [...diagram.annotations, annotation] }, annotation };
}

/** Ändert Felder einer Grafik; `kind` und `id` bleiben. */
export function updateAnnotation(
  diagram: Diagram,
  id: string,
  changes: AnnotationChanges,
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

/** Dieselbe Grafik um `delta` verschoben. */
export function shiftAnnotation<A extends Annotation>(a: A, delta: Point): A {
  switch (a.kind) {
    case 'line':
      return { ...a, from: shift(a.from, delta), to: shift(a.to, delta) };
    case 'circle':
    case 'ellipse':
      return { ...a, center: shift(a.center, delta) };
    case 'polyline':
      return { ...a, points: a.points.map((p) => shift(p, delta)) };
    default:
      return { ...a, position: shift((a as TextAnnotation | RectAnnotation).position, delta) };
  }
}

export function moveAnnotations(diagram: Diagram, ids: readonly string[], delta: Point): Diagram {
  if ((delta.x === 0 && delta.y === 0) || ids.length === 0) return diagram;
  return {
    ...diagram,
    annotations: diagram.annotations.map((a) => (ids.includes(a.id) ? shiftAnnotation(a, delta) : a)),
  };
}

/**
 * Markante Punkte einer Grafik zum Fangen: Enden von Linie und Linienzug,
 * Ecken des Rechtecks, Mittelpunkt von Kreis und Ellipse.
 */
export function annotationSnapPoints(a: Annotation): Point[] {
  switch (a.kind) {
    case 'line':
      return [a.from, a.to];
    case 'polyline':
      return a.points;
    case 'rect': {
      const { x, y } = a.position;
      return [
        { x, y },
        { x: x + a.width, y },
        { x, y: y + a.height },
        { x: x + a.width, y: y + a.height },
      ];
    }
    case 'circle':
    case 'ellipse':
      return [a.center];
    case 'text':
      return [];
  }
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
  if (a.kind === 'circle') {
    const { x, y } = a.center;
    return { minX: x - a.radius, minY: y - a.radius, maxX: x + a.radius, maxY: y + a.radius };
  }
  if (a.kind === 'ellipse') {
    const { x, y } = a.center;
    return { minX: x - a.rx, minY: y - a.ry, maxX: x + a.rx, maxY: y + a.ry };
  }
  if (a.kind === 'polyline') {
    const xs = a.points.map((p) => p.x);
    const ys = a.points.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  const lines = textLines(a);
  const longest = Math.max(1, ...lines.map((l) => l.length));
  const em = fontSizeFor(a.size);
  return {
    minX: a.position.x,
    minY: a.position.y - em * 0.8,
    maxX: a.position.x + longest * em * 0.6,
    maxY: a.position.y + (lines.length - 1) * em * LINE_HEIGHT + em * 0.25,
  };
}
