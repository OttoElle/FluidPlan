import { removeAnnotation } from './annotations.ts';
import { removeComponent, removeConnection, removeJunction } from './diagram.ts';
import type { Diagram } from './types.ts';

/**
 * Was gerade ausgewählt ist: beliebig viele Bauteile, Leitungen,
 * Abzweigpunkte und Grafiken (Text, Linie, Rechteck), jeweils per ID.
 */
export interface Selection {
  components: string[];
  connections: string[];
  junctions: string[];
  annotations: string[];
}

const KEYS = ['components', 'connections', 'junctions', 'annotations'] as const;

export const EMPTY_SELECTION: Selection = { components: [], connections: [], junctions: [], annotations: [] };

export function isEmpty(s: Selection): boolean {
  return selectionCount(s) === 0;
}

export function selectionCount(s: Selection): number {
  return KEYS.reduce((n, k) => n + s[k].length, 0);
}

export const selectComponent = (id: string): Selection => ({ ...EMPTY_SELECTION, components: [id] });
export const selectConnection = (id: string): Selection => ({ ...EMPTY_SELECTION, connections: [id] });
export const selectAnnotation = (id: string): Selection => ({ ...EMPTY_SELECTION, annotations: [id] });

export function selectAll(diagram: Diagram): Selection {
  return {
    components: diagram.components.map((c) => c.id),
    connections: diagram.connections.map((l) => l.id),
    junctions: diagram.junctions.map((j) => j.id),
    annotations: diagram.annotations.map((a) => a.id),
  };
}

function combine(a: Selection, b: Selection, fn: (x: string[], y: string[]) => string[]): Selection {
  return {
    components: fn(a.components, b.components),
    connections: fn(a.connections, b.connections),
    junctions: fn(a.junctions, b.junctions),
    annotations: fn(a.annotations, b.annotations),
  };
}

/** Fügt `add` hinzu; was in beiden steckt, wird abgewählt (Umschalt-Klick). */
export function toggle(s: Selection, add: Selection): Selection {
  return combine(s, add, (a, b) => [...a.filter((id) => !b.includes(id)), ...b.filter((id) => !a.includes(id))]);
}

export function union(a: Selection, b: Selection): Selection {
  return combine(a, b, (x, y) => [...new Set([...x, ...y])]);
}

/**
 * Entfernt IDs, die es im Schaltplan nicht (mehr) gibt, etwa nach Rückgängig.
 * Gibt dieselbe Auswahl zurück, wenn nichts fehlt.
 */
export function prune(diagram: Diagram, s: Selection): Selection {
  const next = combine(s, selectAll(diagram), (x, existing) => x.filter((id) => existing.includes(id)));
  return KEYS.every((k) => next[k].length === s[k].length) ? s : next;
}

/** Löscht alles Ausgewählte; Leitungen an gelöschten Bauteilen fallen mit weg. */
export function deleteSelected(diagram: Diagram, s: Selection): Diagram {
  let d = diagram;
  for (const id of s.connections) d = removeConnection(d, id);
  for (const id of s.components) d = removeComponent(d, id);
  // Abzweige können beim Löschen schon verschmolzen bzw. entfallen sein.
  for (const id of s.junctions) if (d.junctions.some((j) => j.id === id)) d = removeJunction(d, id);
  for (const id of s.annotations) d = removeAnnotation(d, id);
  return d;
}
