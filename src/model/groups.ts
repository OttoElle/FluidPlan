import { nextId } from './diagram.ts';
import type { Selection } from './selection.ts';
import type { Diagram, Group } from './types.ts';

/**
 * Gruppen: Teile, die wie ein Teil ausgewählt und verschoben werden.
 * Gruppen sind nicht verschachtelt; wer Gruppen zusammen mit weiteren Teilen
 * gruppiert, bekommt eine einzige neue Gruppe.
 */

const KEYS = ['components', 'connections', 'junctions', 'annotations'] as const;

const count = (s: Selection) => KEYS.reduce((n, k) => n + s[k].length, 0);

const touches = (g: Group, s: Selection) => KEYS.some((k) => g[k].some((id) => s[k].includes(id)));

/** Gruppen, zu denen etwas aus `s` gehört. */
export function groupsIn(diagram: Diagram, s: Selection): Group[] {
  return diagram.groups.filter((g) => touches(g, s));
}

/** Ergänzt die Auswahl um alle übrigen Teile der berührten Gruppen. */
export function expandGroups(diagram: Diagram, s: Selection): Selection {
  const hit = groupsIn(diagram, s);
  if (hit.length === 0) return s;
  const next = { ...s };
  for (const g of hit) for (const k of KEYS) next[k] = [...new Set([...next[k], ...g[k]])];
  return next;
}

/** Fasst die Auswahl zu einer Gruppe zusammen; berührte Gruppen gehen darin auf. */
export function group(diagram: Diagram, s: Selection): { diagram: Diagram; group?: Group } {
  const all = expandGroups(diagram, s);
  if (count(all) < 2) return { diagram };
  const old = groupsIn(diagram, all);
  const g: Group = { id: nextId('g', diagram.groups), ...structuredClone(all) };
  return { diagram: { ...diagram, groups: [...diagram.groups.filter((x) => !old.includes(x)), g] }, group: g };
}

/** Löst alle Gruppen auf, zu denen etwas aus der Auswahl gehört. */
export function ungroup(diagram: Diagram, s: Selection): Diagram {
  const old = groupsIn(diagram, s);
  if (old.length === 0) return diagram;
  return { ...diagram, groups: diagram.groups.filter((g) => !old.includes(g)) };
}

/**
 * Entfernt aus den Gruppen, was es nicht mehr gibt (etwa nach dem Löschen),
 * und Gruppen mit weniger als zwei Teilen. Gibt denselben Wert zurück, wenn
 * nichts zu tun ist.
 */
export function pruneGroups(diagram: Diagram): Diagram {
  if (diagram.groups.length === 0) return diagram;
  const existing = {
    components: new Set(diagram.components.map((c) => c.id)),
    connections: new Set(diagram.connections.map((l) => l.id)),
    junctions: new Set(diagram.junctions.map((j) => j.id)),
    annotations: new Set(diagram.annotations.map((a) => a.id)),
  };
  let changed = false;
  const groups: Group[] = [];
  for (const g of diagram.groups) {
    const kept = { ...g };
    for (const k of KEYS) kept[k] = g[k].filter((id) => existing[k].has(id));
    if (KEYS.some((k) => kept[k].length !== g[k].length)) changed = true;
    if (count(kept) < 2) {
      changed = true;
      continue;
    }
    groups.push(kept);
  }
  return changed ? { ...diagram, groups } : diagram;
}
