import { annotationSnapPoints } from './annotations.ts';
import { portPosition } from './diagram.ts';
import { definitionOf } from './library.ts';
import { GRID } from './routing.ts';
import type { Diagram, Point } from './types.ts';

/**
 * Fangen beim Zeichnen freier Grafik: Punkte rasten am Raster, an
 * Bauteilanschlüssen oder an Endpunkten (Linienenden, Ecken, Leitungsknicke) ein.
 *
 * Bauteile und Leitungen bleiben immer im Raster, weil die Leitungsführung
 * (routing.ts) darauf rechnet. Die Schalter wirken daher auf Text und Grafik.
 */
export interface SnapOptions {
  grid: boolean;
  connector: boolean;
  endpoint: boolean;
}

export const DEFAULT_SNAP: SnapOptions = { grid: true, connector: true, endpoint: true };

/** Feine Schrittweite ohne Raster (1 Einheit = 0,25 mm); Rasterweite GRID kommt aus routing.ts. */
export const FINE = 1;

export type SnapKind = 'grid' | 'connector' | 'endpoint';

export interface SnapTargets {
  connectors: Point[];
  endpoints: Point[];
}

/**
 * Fangpunkte im Schaltplan. `paths` sind die geführten Leitungsverläufe
 * (routeAll); `exclude` lässt eine Grafik aus, etwa die gerade bearbeitete.
 */
export function snapTargets(
  diagram: Diagram,
  paths: ReadonlyMap<string, Point[]>,
  exclude?: string,
  extra: readonly Point[] = [],
): SnapTargets {
  const connectors: Point[] = [];
  for (const c of diagram.components) {
    for (const port of definitionOf(c)?.ports ?? []) {
      connectors.push(portPosition(diagram, { componentId: c.id, portId: port.id }));
    }
  }
  const endpoints: Point[] = [...extra];
  for (const a of diagram.annotations) if (a.id !== exclude) endpoints.push(...annotationSnapPoints(a));
  for (const path of paths.values()) endpoints.push(...path);
  for (const j of diagram.junctions) endpoints.push(j.position);
  return { connectors, endpoints };
}

/**
 * Fängt `p`: der nächste Anschluss bzw. Endpunkt im Umkreis `radius` gewinnt,
 * sonst das Raster (oder die feine Schrittweite, wenn das Raster aus ist).
 */
export function snapPoint(
  p: Point,
  targets: SnapTargets,
  options: SnapOptions,
  radius: number,
): { point: Point; kind: SnapKind | null } {
  let best: { point: Point; kind: SnapKind; d: number } | null = null;
  const consider = (list: Point[], kind: SnapKind) => {
    for (const q of list) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d <= radius && (!best || d < best.d)) best = { point: q, kind, d };
    }
  };
  if (options.connector) consider(targets.connectors, 'connector');
  if (options.endpoint) consider(targets.endpoints, 'endpoint');
  const found = best as { point: Point; kind: SnapKind } | null;
  if (found) return { point: { ...found.point }, kind: found.kind };
  const step = options.grid ? GRID : FINE;
  return { point: { x: Math.round(p.x / step) * step, y: Math.round(p.y / step) * step }, kind: options.grid ? 'grid' : null };
}
