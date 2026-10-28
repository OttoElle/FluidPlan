import { describe, expect, it } from 'vitest';
import { removeComponent } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { EMPTY_SELECTION, deleteSelected, isEmpty, prune, selectAll, toggle, union } from './selection.ts';

describe('Auswahl', () => {
  const d = exampleHydraulicDiagram(new Date(0));
  const [a, b] = d.components.map((c) => c.id);

  it('schaltet mit Umschalt-Klick hinzu und heraus', () => {
    let s = toggle(EMPTY_SELECTION, { ...EMPTY_SELECTION, components: [a!] });
    s = toggle(s, { ...EMPTY_SELECTION, components: [b!] });
    expect(s.components).toEqual([a, b]);
    s = toggle(s, { ...EMPTY_SELECTION, components: [a!] });
    expect(s.components).toEqual([b]);
    expect(union(s, { ...EMPTY_SELECTION, components: [a!, b!] }).components).toEqual([b, a]);
  });

  it('vergisst gelöschte Teile', () => {
    const s = selectAll(d);
    expect(prune(d, s)).toBe(s);
    const pruned = prune(removeComponent(d, a!), s);
    expect(pruned.components).not.toContain(a);
    expect(pruned.connections.length).toBeLessThan(s.connections.length);
  });

  it('löscht alles Ausgewählte', () => {
    const empty = deleteSelected(d, selectAll(d));
    expect(empty.components).toEqual([]);
    expect(empty.connections).toEqual([]);
    expect(isEmpty(prune(empty, selectAll(d)))).toBe(true);
  });
});
