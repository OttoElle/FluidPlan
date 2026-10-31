import { fontSizeFor } from '../../model/lettering.ts';
import { LINE_HEIGHT, STROKE_DASH, annotationBox, rectFromCorners, textLines, type NewAnnotation } from '../../model/annotations.ts';
import type { Annotation, Point } from '../../model/types.ts';

/** Werkzeuge, deren Form durch Aufziehen entsteht. */
export type DragTool = 'line' | 'rect' | 'circle' | 'ellipse';

/**
 * Anfasser einer Linie (Anfang, Ende), eines Rechtecks bzw. einer Ellipse (Ecken des
 * Umrisses), eines Kreises (Radius) oder eines Linienzugs (Nummer des Punkts).
 */
export type Handle = 'from' | 'to' | 'nw' | 'ne' | 'sw' | 'se' | 'radius' | number;

/** Größe der Formen, wenn nur geklickt statt gezogen wird. */
const DEFAULT_LINE = 100;
const DEFAULT_RECT = { width: 200, height: 120 };
const DEFAULT_RADIUS = 40;
const DEFAULT_ELLIPSE = { rx: 80, ry: 50 };

export const toPoints = (path: Point[]) => path.map((p) => `${p.x},${p.y}`).join(' ');

const rectProps = (r: { position: Point; width: number; height: number }) => ({
  x: r.position.x,
  y: r.position.y,
  width: r.width,
  height: r.height,
});

/**
 * Neue Form aus dem aufgezogenen Bereich. Linie und Rechteck bzw. Ellipse gehen
 * von Ecke zu Ecke, der Kreis vom Mittelpunkt bis zum Rand. Ein bloßer Klick
 * ergibt beim Anlegen (`final`) eine Standardgröße.
 */
export function createdShape(tool: DragTool, start: Point, end: Point, final = true): NewAnnotation {
  const clicked = final && start.x === end.x && start.y === end.y;
  switch (tool) {
    case 'line':
      return { kind: 'line', from: start, to: clicked ? { x: start.x + DEFAULT_LINE, y: start.y } : end, style: 'solid' };
    case 'circle': {
      const radius = clicked ? DEFAULT_RADIUS : Math.round(Math.hypot(end.x - start.x, end.y - start.y));
      return { kind: 'circle', center: start, radius, style: 'solid' };
    }
    case 'ellipse': {
      if (clicked) return { kind: 'ellipse', center: start, ...DEFAULT_ELLIPSE, style: 'solid' };
      return { kind: 'ellipse', ...ellipseFromCorners(start, end), style: 'solid' };
    }
    case 'rect': {
      const corner = clicked ? { x: start.x + DEFAULT_RECT.width, y: start.y + DEFAULT_RECT.height } : end;
      return { kind: 'rect', ...rectFromCorners(start, corner), style: 'dashdot' };
    }
  }
}

function ellipseFromCorners(a: Point, b: Point): { center: Point; rx: number; ry: number } {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    rx: Math.abs(b.x - a.x) / 2,
    ry: Math.abs(b.y - a.y) / 2,
  };
}

/** Umriss als zwei gegenüberliegende Ecken (Rechteck, Ellipse). */
function outline(a: Annotation): [Point, Point] | null {
  if (a.kind === 'rect') return [a.position, { x: a.position.x + a.width, y: a.position.y + a.height }];
  if (a.kind === 'ellipse') {
    return [
      { x: a.center.x - a.rx, y: a.center.y - a.ry },
      { x: a.center.x + a.rx, y: a.center.y + a.ry },
    ];
  }
  return null;
}

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;

function corner([p, q]: [Point, Point], h: (typeof CORNERS)[number]): Point {
  return { x: h === 'nw' || h === 'sw' ? p.x : q.x, y: h === 'nw' || h === 'ne' ? p.y : q.y };
}

/** Lage der Anfasser einer Grafik. */
function handlesOf(a: Annotation): [Handle, Point][] {
  if (a.kind === 'line') return [['from', a.from], ['to', a.to]];
  if (a.kind === 'circle') return [['radius', { x: a.center.x + a.radius, y: a.center.y }]];
  if (a.kind === 'polyline') return a.points.map((p, i) => [i, p]);
  const box = outline(a);
  return box ? CORNERS.map((h) => [h, corner(box, h)]) : [];
}

/** Neue Lage, wenn der Anfasser `handle` nach `to` gezogen wird. */
export function reshape(a: Annotation, handle: Handle, to: Point): Partial<Annotation> {
  if (a.kind === 'line') return handle === 'from' ? { from: to } : { to };
  if (a.kind === 'circle') {
    const radius = Math.round(Math.hypot(to.x - a.center.x, to.y - a.center.y));
    return radius > 0 ? { radius } : {};
  }
  if (a.kind === 'polyline' && typeof handle === 'number') {
    return { points: a.points.map((p, i) => (i === handle ? to : p)) };
  }
  const box = outline(a);
  if (!box || typeof handle !== 'string' || !CORNERS.includes(handle as (typeof CORNERS)[number])) return {};
  // Gezogene Ecke bewegen, die gegenüberliegende bleibt stehen.
  const opposite = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' } as const;
  const fixed = corner(box, opposite[handle as (typeof CORNERS)[number]]);
  // Eine Form ohne Fläche wäre nicht mehr anzufassen.
  if (to.x === fixed.x || to.y === fixed.y) return {};
  return a.kind === 'rect' ? rectFromCorners(to, fixed) : ellipseFromCorners(to, fixed);
}

export function AnnotationShape({
  annotation: a,
  selected = false,
  handles = false,
  className,
  onPointerDown,
  onHandlePointerDown,
}: {
  annotation: Annotation;
  selected?: boolean;
  handles?: boolean;
  /** Zusätzliche Klasse, z. B. "creating" für die Vorschau beim Aufziehen. */
  className?: string;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onHandlePointerDown?: (handle: Handle, origin: Point, e: React.PointerEvent) => void;
}) {
  const dash = 'style' in a ? STROKE_DASH[a.style] : undefined;
  /** Unsichtbare breite Kontur zum Anklicken und die sichtbare Linie. */
  const stroke = (el: (props: { className: string; strokeDasharray?: string }) => React.ReactNode) => (
    <>
      {el({ className: 'stroke-hit' })}
      {el({ className: 'note-line', strokeDasharray: dash })}
    </>
  );
  let shape: React.ReactNode;
  if (a.kind === 'text') {
    const box = annotationBox(a);
    shape = (
      <>
        <rect x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} className="hit" />
        <text className="note" x={a.position.x} y={a.position.y} fontSize={fontSizeFor(a.size)}>
          {textLines(a).map((line, i) => (
            <tspan key={i} x={a.position.x} dy={i === 0 ? 0 : fontSizeFor(a.size) * LINE_HEIGHT}>
              {/* Leere Zeilen brauchen Inhalt, sonst zählt dy nicht. */}
              {line || ' '}
            </tspan>
          ))}
        </text>
      </>
    );
  } else if (a.kind === 'line') {
    shape = stroke((p) => <line {...p} x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />);
  } else if (a.kind === 'rect') {
    shape = stroke((p) => <rect {...p} {...rectProps(a)} />);
  } else if (a.kind === 'circle') {
    shape = stroke((p) => <circle {...p} cx={a.center.x} cy={a.center.y} r={a.radius} />);
  } else if (a.kind === 'ellipse') {
    shape = stroke((p) => <ellipse {...p} cx={a.center.x} cy={a.center.y} rx={a.rx} ry={a.ry} />);
  } else {
    const points = toPoints(a.points);
    shape = stroke((p) => (a.closed ? <polygon {...p} points={points} /> : <polyline {...p} points={points} />));
  }
  const grips = handles
    ? handlesOf(a).map(([h, p]) => (
        <rect
          key={h}
          className={`handle ${typeof h === 'number' ? 'point' : h}`}
          x={p.x - 3}
          y={p.y - 3}
          width={6}
          height={6}
          onPointerDown={(e) => onHandlePointerDown?.(h, p, e)}
        />
      ))
    : null;
  return (
    <g
      className={`annotation ${a.kind}${selected ? ' selected' : ''}${className ? ' ' + className : ''}`}
      onPointerDown={onPointerDown}
    >
      {shape}
      {grips}
    </g>
  );
}
