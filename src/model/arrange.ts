import { definitionOf } from './library.ts';
import { GRID, componentBox, keepRoutes, type Box } from './routing.ts';
import type { ComponentInstance, Diagram, Point, PortRef, Rotation } from './types.ts';

/**
 * Anordnen mehrerer Bauteile auf einmal: verschieben, drehen, spiegeln, ausrichten.
 *
 * Eine Gruppe wird um die Mitte ihres Umrisses gedreht bzw. gespiegelt, auf
 * das Raster gerundet, damit alle Anschlüsse im Raster bleiben. Ein einzelnes
 * Bauteil dreht sich um seine eigene Mitte und bleibt dabei an seinem Platz.
 * Leitungen, deren beide Enden an Bauteilen der Gruppe hängen, wandern mit
 * ihren Knickpunkten mit; alle anderen werden an den Enden neu angeschlossen.
 */

const snap = (v: number) => Math.round(v / GRID) * GRID;

/** Bauteil, an dem ein Leitungsende hängt (Abzweigpunkte haben keins). */
const componentOf = (ref: PortRef | object): string | undefined =>
  'componentId' in ref ? (ref as PortRef).componentId : undefined;

const junctionOf = (ref: PortRef | object): string | undefined =>
  'junctionId' in ref ? (ref as { junctionId: string }).junctionId : undefined;

/**
 * Abzweigpunkte, deren Leitungen alle (ggf. über weitere Abzweige) nur zu
 * Bauteilen der Gruppe führen: Sie wandern mit der Gruppe mit.
 */
function internalJunctions(diagram: Diagram, ids: ReadonlySet<string>): Set<string> {
  const inside = new Set(diagram.junctions.map((j) => j.id));
  for (let changed = true; changed; ) {
    changed = false;
    for (const l of diagram.connections) {
      const ends = [l.from, l.to];
      const outside = ends.some((e) => {
        const c = componentOf(e);
        const j = junctionOf(e);
        return c !== undefined ? !ids.has(c) : j === undefined || !inside.has(j);
      });
      if (!outside) continue;
      for (const e of ends) {
        const j = junctionOf(e);
        if (j !== undefined && inside.delete(j)) changed = true;
      }
    }
  }
  return inside;
}

function internalConnections(diagram: Diagram, ids: ReadonlySet<string>, junctions: ReadonlySet<string>): Set<string> {
  const inGroup = (ref: PortRef | object) => {
    const id = componentOf(ref);
    if (id !== undefined) return ids.has(id);
    const j = junctionOf(ref);
    return j !== undefined && junctions.has(j);
  };
  return new Set(diagram.connections.filter((l) => inGroup(l.from) && inGroup(l.to)).map((l) => l.id));
}

/** Gemeinsamer Umriss der Bauteile `ids` (nach Drehung und Spiegelung). */
export function boundsOf(diagram: Diagram, ids: readonly string[]): Box | undefined {
  const boxes = diagram.components
    .filter((c) => ids.includes(c.id))
    .map(componentBox)
    .filter((b): b is Box => b !== undefined);
  if (boxes.length === 0) return undefined;
  return {
    minX: Math.min(...boxes.map((b) => b.minX)),
    minY: Math.min(...boxes.map((b) => b.minY)),
    maxX: Math.max(...boxes.map((b) => b.maxX)),
    maxY: Math.max(...boxes.map((b) => b.maxY)),
  };
}

/**
 * Wendet eine Punktabbildung auf die Gruppe an: auf die Mitte jedes Bauteils
 * (dessen Lage sich zusätzlich per `orient` ändert) und auf die Knickpunkte
 * der mitwandernden Leitungen.
 */
function transformGroup(
  diagram: Diagram,
  ids: readonly string[],
  map: (p: Point) => Point,
  orient: (c: ComponentInstance) => Pick<ComponentInstance, 'rotation' | 'mirrored'>,
): Diagram {
  const set = new Set(ids);
  const junctions = internalJunctions(diagram, set);
  const internal = internalConnections(diagram, set, junctions);
  const after: Diagram = {
    ...diagram,
    components: diagram.components.map((c) => {
      const def = definitionOf(c);
      if (!set.has(c.id) || !def) return c;
      const w = def.size.width / 2;
      const h = def.size.height / 2;
      const center = map({ x: c.position.x + w, y: c.position.y + h });
      return { ...c, ...orient(c), position: { x: center.x - w, y: center.y - h } };
    }),
    junctions: diagram.junctions.map((j) => (junctions.has(j.id) ? { ...j, position: map(j.position) } : j)),
  };
  // Leitungen in der Gruppe wandern als Ganzes mit, an den übrigen nur die Enden.
  return keepRoutes(diagram, after, internal, map);
}

/** Drehpunkt: Mitte eines einzelnen Bauteils, sonst Mitte des Umrisses im Raster. */
function pivotOf(diagram: Diagram, ids: readonly string[]): Point | undefined {
  const box = boundsOf(diagram, ids);
  if (!box) return undefined;
  const center = { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 };
  return ids.length === 1 ? center : { x: snap(center.x), y: snap(center.y) };
}

export function moveComponents(diagram: Diagram, ids: readonly string[], delta: Point): Diagram {
  if ((delta.x === 0 && delta.y === 0) || ids.length === 0) return diagram;
  return transformGroup(
    diagram,
    ids,
    (p) => ({ x: p.x + delta.x, y: p.y + delta.y }),
    (c) => c,
  );
}

/** Dreht die Bauteile um 90° im Uhrzeigersinn. */
export function rotateComponents(diagram: Diagram, ids: readonly string[]): Diagram {
  const o = pivotOf(diagram, ids);
  if (!o) return diagram;
  return transformGroup(
    diagram,
    ids,
    // y zeigt nach unten: (dx, dy) -> (-dy, dx)
    (p) => ({ x: o.x - (p.y - o.y) + 0, y: o.y + (p.x - o.x) + 0 }),
    (c) => ({ rotation: ((c.rotation + 90) % 360) as Rotation, mirrored: c.mirrored }),
  );
}

/**
 * Spiegelt die Bauteile: `horizontal` vertauscht links und rechts,
 * `vertical` oben und unten. Das Bauteil-Flag `mirrored` wirkt vor der
 * Drehung; damit das Ergebnis auf dem Blatt stimmt, ändert sich die Drehung mit.
 */
export function mirrorComponents(diagram: Diagram, ids: readonly string[], axis: 'horizontal' | 'vertical'): Diagram {
  const o = pivotOf(diagram, ids);
  if (!o) return diagram;
  const horizontal = axis === 'horizontal';
  return transformGroup(
    diagram,
    ids,
    (p) => (horizontal ? { x: 2 * o.x - p.x + 0, y: p.y } : { x: p.x, y: 2 * o.y - p.y + 0 }),
    (c) => ({
      mirrored: !c.mirrored,
      rotation: ((horizontal ? 360 - c.rotation : 540 - c.rotation) % 360) as Rotation,
    }),
  );
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Richtet die Bauteile aneinander aus: Kanten am äußersten Bauteil,
 * Mitten an der Mitte des gemeinsamen Umrisses (auf das Raster gerundet).
 */
export function alignComponents(diagram: Diagram, ids: readonly string[], alignment: Alignment): Diagram {
  const all = boundsOf(diagram, ids);
  if (!all || ids.length < 2) return diagram;
  const deltas = new Map<string, Point>();
  for (const c of diagram.components) {
    const b = ids.includes(c.id) ? componentBox(c) : undefined;
    if (!b) continue;
    const dx = {
      left: all.minX - b.minX,
      center: snap((all.minX + all.maxX - b.minX - b.maxX) / 2),
      right: all.maxX - b.maxX,
    };
    const dy = {
      top: all.minY - b.minY,
      middle: snap((all.minY + all.maxY - b.minY - b.maxY) / 2),
      bottom: all.maxY - b.maxY,
    };
    deltas.set(c.id, {
      x: alignment in dx ? dx[alignment as keyof typeof dx] : 0,
      y: alignment in dy ? dy[alignment as keyof typeof dy] : 0,
    });
  }
  let d = diagram;
  for (const [id, delta] of deltas) d = moveComponents(d, [id], delta);
  return d;
}
