import { shiftAnnotation } from './annotations.ts';
import { isJunctionRef, nextId, normalizeJunctions } from './diagram.ts';
import { expandGroups } from './groups.ts';
import { EMPTY_SELECTION, type Selection } from './selection.ts';
import type { Diagram, Endpoint, Point } from './types.ts';

/**
 * Kopieren, Ausschneiden und Einfügen.
 *
 * Ein Ausschnitt (Fragment) ist selbst ein kleiner Schaltplan (gleiches Blatt
 * und Schriftfeld wie das Original, damit er als Datei geprüft werden kann): die kopierten
 * Bauteile und Grafiken, dazu alle Leitungen zwischen den kopierten Bauteilen
 * samt den Abzweigen darauf, auch wenn diese nicht eigens ausgewählt waren.
 * Leitungen zu nicht kopierten Bauteilen fallen weg; Abzweige, an denen dann
 * nur noch zwei Leitungen hängen, werden wie beim Löschen wieder zu einer Leitung.
 */
export type Fragment = Pick<Diagram, 'components' | 'connections' | 'junctions' | 'annotations' | 'groups'>;

export function copySelection(diagram: Diagram, selection: Selection): Diagram | null {
  const s = expandGroups(diagram, selection);
  const components = diagram.components.filter((c) => s.components.includes(c.id));
  const annotations = diagram.annotations.filter((a) => s.annotations.includes(a.id));
  if (components.length === 0 && annotations.length === 0) return null;
  const copied = new Set(components.map((c) => c.id));
  const inside = (e: Endpoint) => isJunctionRef(e) || copied.has(e.componentId);
  // Erst alle Abzweige mitnehmen; normalizeJunctions räumt auf, was nicht zwischen kopierten Bauteilen liegt.
  const net = normalizeJunctions({
    ...diagram,
    components,
    connections: diagram.connections.filter((l) => inside(l.from) && inside(l.to)),
    annotations,
    groups: [],
  });
  const kept = {
    ...EMPTY_SELECTION,
    components: [...copied],
    connections: net.connections.map((l) => l.id),
    junctions: net.junctions.map((j) => j.id),
    annotations: annotations.map((a) => a.id),
  };
  // Gruppen nur, wenn sie ganz im Ausschnitt liegen.
  const groups = diagram.groups.filter((g) =>
    (['components', 'connections', 'junctions', 'annotations'] as const).every((k) => g[k].every((id) => kept[k].includes(id))),
  );
  return structuredClone({
    ...diagram,
    components,
    connections: net.connections,
    junctions: net.junctions,
    annotations,
    groups,
  });
}

/**
 * Fügt einen Ausschnitt um `offset` verschoben ein. Alle Teile bekommen neue
 * IDs; die Rückgabe enthält die eingefügten Teile als Auswahl.
 */
export function pasteFragment(diagram: Diagram, fragment: Fragment, offset: Point): { diagram: Diagram; selection: Selection } {
  const map = (prefix: string, ids: { id: string }[], existing: { id: string }[]) => {
    const pool = [...existing];
    const out = new Map<string, string>();
    for (const { id } of ids) {
      const fresh = nextId(prefix, pool);
      out.set(id, fresh);
      pool.push({ id: fresh });
    }
    return out;
  };
  const cIds = map('c', fragment.components, diagram.components);
  const lIds = map('l', fragment.connections, diagram.connections);
  const jIds = map('j', fragment.junctions, diagram.junctions);
  const aIds = map('a', fragment.annotations, diagram.annotations);
  const gIds = map('g', fragment.groups, diagram.groups);
  const add = (p: Point): Point => ({ x: p.x + offset.x, y: p.y + offset.y });
  const end = (e: Endpoint): Endpoint =>
    isJunctionRef(e) ? { junctionId: jIds.get(e.junctionId)! } : { componentId: cIds.get(e.componentId)!, portId: e.portId };

  const components = fragment.components.map((c) => ({ ...structuredClone(c), id: cIds.get(c.id)!, position: add(c.position) }));
  const junctions = fragment.junctions.map((j) => ({ id: jIds.get(j.id)!, position: add(j.position) }));
  const connections = fragment.connections.map((l) => ({
    ...l,
    id: lIds.get(l.id)!,
    from: end(l.from),
    to: end(l.to),
    waypoints: l.waypoints.map(add),
  }));
  const annotations = fragment.annotations.map((a) => ({ ...shiftAnnotation(structuredClone(a), offset), id: aIds.get(a.id)! }));
  const groups = fragment.groups.map((g) => ({
    id: gIds.get(g.id)!,
    components: g.components.map((id) => cIds.get(id)!),
    connections: g.connections.map((id) => lIds.get(id)!),
    junctions: g.junctions.map((id) => jIds.get(id)!),
    annotations: g.annotations.map((id) => aIds.get(id)!),
  }));

  return {
    diagram: {
      ...diagram,
      components: [...diagram.components, ...components],
      connections: [...diagram.connections, ...connections],
      junctions: [...diagram.junctions, ...junctions],
      annotations: [...diagram.annotations, ...annotations],
      groups: [...diagram.groups, ...groups],
    },
    selection: {
      components: components.map((c) => c.id),
      connections: connections.map((l) => l.id),
      junctions: junctions.map((j) => j.id),
      annotations: annotations.map((a) => a.id),
    },
  };
}
