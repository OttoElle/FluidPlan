import { removeComponent, removeConnection } from './diagram.ts';
import type { Diagram } from './types.ts';

/**
 * Was gerade ausgewählt ist: beliebig viele Bauteile, Leitungen und
 * Abzweigpunkte, jeweils per ID.
 */
export interface Selection {
  components: string[];
  connections: string[];
  junctions: string[];
}

export const EMPTY_SELECTION: Selection = { components: [], connections: [], junctions: [] };

export function isEmpty(s: Selection): boolean {
  return s.components.length === 0 && s.connections.length === 0 && s.junctions.length === 0;
}

export function selectionCount(s: Selection): number {
  return s.components.length + s.connections.length + s.junctions.length;
}

export const selectComponent = (id: string): Selection => ({ ...EMPTY_SELECTION, components: [id] });
export const selectConnection = (id: string): Selection => ({ ...EMPTY_SELECTION, connections: [id] });

export function selectAll(diagram: Diagram): Selection {
  return {
    components: diagram.components.map((c) => c.id),
    connections: diagram.connections.map((l) => l.id),
    junctions: [],
  };
}

/** Fügt `add` hinzu; was in beiden steckt, wird abgewählt (Umschalt-Klick). */
export function toggle(s: Selection, add: Selection): Selection {
  const flip = (a: string[], b: string[]) => [...a.filter((id) => !b.includes(id)), ...b.filter((id) => !a.includes(id))];
  return {
    components: flip(s.components, add.components),
    connections: flip(s.connections, add.connections),
    junctions: flip(s.junctions, add.junctions),
  };
}

export function union(a: Selection, b: Selection): Selection {
  const merge = (x: string[], y: string[]) => [...new Set([...x, ...y])];
  return {
    components: merge(a.components, b.components),
    connections: merge(a.connections, b.connections),
    junctions: merge(a.junctions, b.junctions),
  };
}

/**
 * Entfernt IDs, die es im Schaltplan nicht (mehr) gibt, etwa nach Rückgängig.
 * Gibt dieselbe Auswahl zurück, wenn nichts fehlt.
 */
export function prune(diagram: Diagram, s: Selection): Selection {
  const components = s.components.filter((id) => diagram.components.some((c) => c.id === id));
  const connections = s.connections.filter((id) => diagram.connections.some((l) => l.id === id));
  if (components.length === s.components.length && connections.length === s.connections.length) return s;
  return { ...s, components, connections };
}

/** Löscht alles Ausgewählte; Leitungen an gelöschten Bauteilen fallen mit weg. */
export function deleteSelected(diagram: Diagram, s: Selection): Diagram {
  let d = diagram;
  for (const id of s.connections) d = removeConnection(d, id);
  for (const id of s.components) d = removeComponent(d, id);
  return d;
}
