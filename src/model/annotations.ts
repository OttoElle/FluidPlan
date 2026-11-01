import { DiagramError, nextId } from './diagram.ts';
import type { Box } from './routing.ts';
import { fontSizeFor } from './lettering.ts';
import type {
  Annotation,
  ArcAnnotation,
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
 * Freier Text und einfache Grafik (Linie, Rechteck, Kreis, Ellipse, Linienzug, Kreisbogen) auf dem Blatt.
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

/** Strichmuster in Einheiten bei 0,25 mm Linienbreite; `undefined` = durchgezogen. */
export const STROKE_DASH: Record<StrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: '8 4',
  dashdot: '16 4 2 4',
};

/** Einheiten je mm (1 Einheit = 0,25 mm). */
const UNITS_PER_MM = 4;

/**
 * Linienbreiten in mm, Reihe nach ISO 128-2 (Stufung ≈ √2). Symbole und Leitungen
 * zeichnet DIN ISO 1219-1 (5.12) mit 0,25 mm; dicker wirkt eine Umrandung oder
 * Hervorhebung, dünner eine Hilfslinie.
 */
export const LINE_WIDTHS: readonly number[] = [0.13, 0.18, 0.25, 0.35, 0.5, 0.7, 1];
export const DEFAULT_LINE_WIDTH = 0.25;

/** Linienbreite einer Grafik in Einheiten. */
export function strokeWidthOf(a: { lineWidth?: number }): number {
  return (a.lineWidth ?? DEFAULT_LINE_WIDTH) * UNITS_PER_MM;
}

/**
 * Strichmuster passend zur Linienbreite: ab 0,25 mm wachsen Striche und Lücken
 * mit (ISO 128-2 bemisst sie als Vielfache der Linienbreite), dünnere behalten das Grundmaß.
 */
export function strokeDash(style: StrokeStyle, lineWidth = DEFAULT_LINE_WIDTH): string | undefined {
  const base = STROKE_DASH[style];
  const factor = Math.max(1, lineWidth / DEFAULT_LINE_WIDTH);
  if (!base || factor === 1) return base;
  return base
    .split(' ')
    .map((n) => +(Number(n) * factor).toFixed(2))
    .join(' ');
}

/** Vorgeschlagene Farben für Grafik und Text; `undefined` = Zeichenfarbe. */
export const ANNOTATION_COLORS: readonly { color: string | undefined; name: string }[] = [
  { color: undefined, name: 'Zeichenfarbe (schwarz)' },
  { color: '#d32f2f', name: 'Rot' },
  { color: '#ef6c00', name: 'Orange' },
  { color: '#f9a825', name: 'Gelb' },
  { color: '#2e7d32', name: 'Grün' },
  { color: '#1565c0', name: 'Blau' },
  { color: '#6a1b9a', name: 'Violett' },
  { color: '#757575', name: 'Grau' },
];

export const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

// --- Kreisbogen ---------------------------------------------------------------

/** Winkel von `center` zu `p` in Grad (0° rechts, positiv im Uhrzeigersinn). */
export function angleOf(center: Point, p: Point): number {
  return (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI;
}

/** Winkel auf (-180, 180]. */
export function normalizeAngle(deg: number): number {
  const a = ((deg % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;
}

export function arcPoint(a: Pick<ArcAnnotation, 'center' | 'radius'>, angle: number): Point {
  const r = (angle * Math.PI) / 180;
  return { x: a.center.x + a.radius * Math.cos(r), y: a.center.y + a.radius * Math.sin(r) };
}

export const arcStart = (a: ArcAnnotation) => arcPoint(a, a.start);
export const arcEnd = (a: ArcAnnotation) => arcPoint(a, a.start + a.sweep);

/**
 * Bogen von Winkel `from` bis `to` in der Richtung `clockwise`; liefert
 * die vorzeichenbehaftete Länge, 0 wenn Anfang und Ende zusammenfallen.
 */
export function sweepBetween(from: number, to: number, clockwise: boolean): number {
  const raw = ((((to - from) % 360) + 360) % 360);
  if (raw < 1e-6 || raw > 360 - 1e-6) return 0;
  return clockwise ? raw : raw - 360;
}

const roundAngle = (deg: number) => Math.round(deg * 1000) / 1000;

/**
 * Bogen um `center`, beginnend bei `from` (bestimmt den Radius), endend in
 * Richtung `to`, in Drehrichtung `clockwise`. `null`, wenn kein Bogen entsteht.
 */
export function arcFromPoints(
  center: Point,
  from: Point,
  to: Point,
  clockwise: boolean,
): Pick<ArcAnnotation, 'center' | 'radius' | 'start' | 'sweep'> | null {
  const radius = Math.round(Math.hypot(from.x - center.x, from.y - center.y) * 100) / 100;
  if (radius <= 0 || (to.x === center.x && to.y === center.y)) return null;
  const start = roundAngle(angleOf(center, from));
  const sweep = roundAngle(sweepBetween(start, angleOf(center, to), clockwise));
  return sweep === 0 ? null : { center, radius, start, sweep };
}

/** SVG-Pfad eines Kreisbogens. */
export function arcPath(a: Pick<ArcAnnotation, 'center' | 'radius' | 'start' | 'sweep'>): string {
  const p = arcPoint(a, a.start);
  const q = arcPoint(a, a.start + a.sweep);
  const large = Math.abs(a.sweep) > 180 ? 1 : 0;
  const cw = a.sweep > 0 ? 1 : 0;
  const f = (n: number) => +n.toFixed(3);
  return `M ${f(p.x)} ${f(p.y)} A ${a.radius} ${a.radius} 0 ${large} ${cw} ${f(q.x)} ${f(q.y)}`;
}

/** Umriss eines Bogens: Endpunkte und die überstrichenen Achsenpunkte (0°, 90°, …). */
function arcBox(a: ArcAnnotation): Box {
  const pts = [arcStart(a), arcEnd(a)];
  const lo = Math.min(a.start, a.start + a.sweep);
  const hi = Math.max(a.start, a.start + a.sweep);
  for (let k = Math.ceil(lo / 90); k * 90 <= hi; k++) pts.push(arcPoint(a, k * 90));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Neue Grafik ohne ID; die vergibt `addAnnotation`. */
export type NewAnnotation = Annotation extends infer A ? (A extends Annotation ? Omit<A, 'id'> : never) : never;

/** Alle änderbaren Felder aller Grafikarten. */
type AnnotationChanges = Partial<Omit<TextAnnotation, 'id' | 'kind'>> &
  Partial<Omit<LineAnnotation, 'id' | 'kind'>> &
  Partial<Omit<RectAnnotation, 'id' | 'kind'>> &
  Partial<Omit<CircleAnnotation, 'id' | 'kind'>> &
  Partial<Omit<EllipseAnnotation, 'id' | 'kind'>> &
  Partial<Omit<PolylineAnnotation, 'id' | 'kind'>> &
  Partial<Omit<ArcAnnotation, 'id' | 'kind'>>;

/** Optionale Darstellungsfelder; `null` setzt sie auf den Standard zurück. */
type LookChanges = { lineWidth?: number | null; color?: string | null; comment?: boolean | null; grafcet?: RectAnnotation['grafcet'] | null };

export function addAnnotation(diagram: Diagram, a: NewAnnotation): { diagram: Diagram; annotation: Annotation } {
  const annotation = structuredClone({ ...a, id: nextId('a', diagram.annotations) }) as Annotation;
  return { diagram: { ...diagram, annotations: [...diagram.annotations, annotation] }, annotation };
}

/** Ändert Felder einer Grafik; `kind` und `id` bleiben. */
export function updateAnnotation(
  diagram: Diagram,
  id: string,
  changes: Omit<AnnotationChanges, 'lineWidth' | 'color' | 'comment' | 'grafcet'> & LookChanges,
): Diagram {
  if (!diagram.annotations.some((a) => a.id === id)) throw new DiagramError(`Grafik "${id}" existiert nicht`);
  return {
    ...diagram,
    annotations: diagram.annotations.map((a) => {
      if (a.id !== id) return a;
      // Nur Felder übernehmen, die diese Art kennt.
      const next = { ...a } as Record<string, unknown>;
      for (const [k, v] of Object.entries(changes)) {
        if (v === undefined) continue;
        // Farbe für alles, Linienbreite für alles außer Text; beide dürfen noch fehlen.
        const look = k === 'color' || (k === 'lineWidth' && a.kind !== 'text');
        // Optionale Zusätze: Kommentar bei Text, GRAFCET-Rahmen beim Rechteck (null entfernt sie).
        const extra = (k === 'comment' && a.kind === 'text') || (k === 'grafcet' && a.kind === 'rect');
        if (extra && v === null) {
          delete next[k];
          continue;
        }
        if (!look && !extra && !(k in a)) continue;
        if (look && (v === null || (k === 'lineWidth' && v === DEFAULT_LINE_WIDTH))) delete next[k];
        else next[k] = v;
      }
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
    case 'arc':
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
 * Ecken des Rechtecks, Mittelpunkt von Kreis und Ellipse, Mitte und Enden des Bogens.
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
    case 'arc':
      return [a.center, arcStart(a), arcEnd(a)];
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

export function textLines(t: Pick<TextAnnotation, 'text' | 'comment'>): string[] {
  const lines = t.text.split('\n');
  // GRAFCET-Kommentar in deutschen Anführungszeichen (DIN EN 60848, Symbol [30]).
  if (t.comment && lines.length) {
    lines[0] = `„${lines[0]}`;
    lines[lines.length - 1] = `${lines[lines.length - 1]}“`;
  }
  return lines;
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
  if (a.kind === 'arc') return arcBox(a);
  if (a.kind === 'polyline') {
    const xs = a.points.map((p) => p.x);
    const ys = a.points.map((p) => p.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }
  const lines = textLines(a);
  const longest = Math.max(1, ...lines.map((l) => l.length)) + (a.comment ? 2 : 0);
  const em = fontSizeFor(a.size);
  return {
    minX: a.position.x,
    minY: a.position.y - em * 0.8,
    maxX: a.position.x + longest * em * 0.6,
    maxY: a.position.y + (lines.length - 1) * em * LINE_HEIGHT + em * 0.25,
  };
}
