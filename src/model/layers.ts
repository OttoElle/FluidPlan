import { nextId } from './diagram.ts';
import type { Selection } from './selection.ts';
import type { Diagram, Drawing, Layer } from './types.ts';

/**
 * Zeichnungsebenen (Layer) wie in CAD-Programmen.
 *
 * Die Ebenen gelten für die ganze Zeichnung, also für alle Blätter. Bauteile,
 * Leitungen und Grafik tragen die ID ihrer Ebene in `layer`; fehlt sie oder
 * gibt es die Ebene nicht (mehr), liegt das Teil auf der Standardebene.
 * Die Standardebene ist immer da und lässt sich nicht löschen.
 *
 * Ausgeblendete Ebenen werden weder gezeichnet noch exportiert, gesperrte
 * werden gezeichnet, lassen sich auf dem Blatt aber nicht anklicken.
 * Abzweigpunkte haben keine eigene Ebene: sie sind sichtbar, solange eine
 * ihrer Leitungen sichtbar ist, und gesperrt, wenn alle ihre Leitungen es sind.
 */

export const DEFAULT_LAYER_ID = '0';
export const DEFAULT_LAYER: Layer = { id: DEFAULT_LAYER_ID, name: 'Standard', visible: true, locked: false };

/** Ebenen der Zeichnung; ältere Dateien haben nur die Standardebene. */
export function layersOf(drawing: Pick<Drawing, 'layers'>): Layer[] {
  const layers = drawing.layers;
  // Gleicher Wert bei jedem Aufruf, damit Ansichten ohne Änderung nicht neu zeichnen.
  if (!layers) return ONLY_DEFAULT;
  return layers.some((l) => l.id === DEFAULT_LAYER_ID) ? layers : [DEFAULT_LAYER, ...layers];
}
const ONLY_DEFAULT: Layer[] = [DEFAULT_LAYER];

/** Ebene eines Teils; unbekannte Ebenen zählen als Standardebene. */
export function layerOf(layers: readonly Layer[], item: { layer?: string }): Layer {
  return (
    layers.find((l) => l.id === (item.layer ?? DEFAULT_LAYER_ID)) ??
    layers.find((l) => l.id === DEFAULT_LAYER_ID) ??
    DEFAULT_LAYER
  );
}

function withLayers(drawing: Drawing, layers: Layer[]): Drawing {
  return { ...drawing, layers };
}

/** Freier Name „Ebene n“. */
function freshName(layers: readonly Layer[]): string {
  const names = new Set(layers.map((l) => l.name));
  let n = layers.length;
  while (names.has(`Ebene ${n}`)) n++;
  return `Ebene ${n}`;
}

export function addLayer(drawing: Drawing, name?: string): { drawing: Drawing; layer: Layer } {
  const layers = layersOf(drawing);
  const layer: Layer = { id: nextId('l', layers), name: name ?? freshName(layers), visible: true, locked: false };
  return { drawing: withLayers(drawing, [...layers, layer]), layer };
}

export function updateLayer(drawing: Drawing, id: string, changes: Partial<Omit<Layer, 'id'>>): Drawing {
  const layers = layersOf(drawing);
  const old = layers.find((l) => l.id === id);
  if (!old || (Object.keys(changes) as (keyof typeof changes)[]).every((k) => old[k] === changes[k])) return drawing;
  return withLayers(
    drawing,
    layers.map((l) => (l.id === id ? { ...l, ...changes } : l)),
  );
}

/** Verschiebt eine Ebene in der Liste an die Stelle `to`. */
export function moveLayer(drawing: Drawing, id: string, to: number): Drawing {
  const layers = [...layersOf(drawing)];
  const from = layers.findIndex((l) => l.id === id);
  const target = Math.max(0, Math.min(layers.length - 1, to));
  if (from < 0 || from === target) return drawing;
  const [l] = layers.splice(from, 1);
  layers.splice(target, 0, l!);
  return withLayers(drawing, layers);
}

/** Entfernt `layer` von allen Teilen, die auf einer der Ebenen `ids` liegen (= Standardebene). */
function clearLayer<T extends { layer?: string }>(items: T[], ids: ReadonlySet<string>): T[] {
  if (!items.some((x) => x.layer !== undefined && ids.has(x.layer))) return items;
  return items.map((x) => {
    if (x.layer === undefined || !ids.has(x.layer)) return x;
    const { layer: _layer, ...rest } = x;
    return rest as T;
  });
}

/** Löscht eine Ebene; ihre Teile kommen auf die Standardebene. */
export function deleteLayer(drawing: Drawing, id: string): Drawing {
  if (id === DEFAULT_LAYER_ID) return drawing;
  const layers = layersOf(drawing);
  if (!layers.some((l) => l.id === id)) return drawing;
  const ids = new Set([id]);
  return {
    ...drawing,
    layers: layers.filter((l) => l.id !== id),
    sheets: drawing.sheets.map((s) => {
      const components = clearLayer(s.components, ids);
      const connections = clearLayer(s.connections, ids);
      const annotations = clearLayer(s.annotations, ids);
      return components === s.components && connections === s.connections && annotations === s.annotations
        ? s
        : { ...s, components, connections, annotations };
    }),
  };
}

/** Legt die Teile der Auswahl auf eine Ebene (Abzweige haben keine eigene). */
export function assignLayer(diagram: Diagram, s: Pick<Selection, 'components' | 'connections' | 'annotations'>, layerId: string): Diagram {
  const set = <T extends { id: string; layer?: string }>(items: T[], ids: readonly string[]): T[] => {
    if (!items.some((x) => ids.includes(x.id) && (x.layer ?? DEFAULT_LAYER_ID) !== layerId)) return items;
    return items.map((x) => {
      if (!ids.includes(x.id)) return x;
      const { layer: _layer, ...rest } = x;
      return (layerId === DEFAULT_LAYER_ID ? rest : { ...rest, layer: layerId }) as T;
    });
  };
  const components = set(diagram.components, s.components);
  const connections = set(diagram.connections, s.connections);
  const annotations = set(diagram.annotations, s.annotations);
  if (components === diagram.components && connections === diagram.connections && annotations === diagram.annotations) {
    return diagram;
  }
  return { ...diagram, components, connections, annotations };
}

/** IDs je Art, z. B. alle ausgeblendeten Teile eines Blatts. */
export interface ItemSets {
  components: Set<string>;
  connections: Set<string>;
  junctions: Set<string>;
  annotations: Set<string>;
}

export interface LayerState {
  /** Ausgeblendet: nicht gezeichnet, nicht exportiert, nicht auswählbar. */
  hidden: ItemSets;
  /** Gesperrt (und sichtbar): gezeichnet, aber auf dem Blatt nicht anklickbar. */
  locked: ItemSets;
}

const emptySets = (): ItemSets => ({
  components: new Set(),
  connections: new Set(),
  junctions: new Set(),
  annotations: new Set(),
});

/**
 * Welche Teile eines Blatts ausgeblendet bzw. gesperrt sind. Eine Leitung an
 * einem ausgeblendeten Bauteil wird mit ausgeblendet, sonst hinge sie in der Luft.
 */
export function layerState(diagram: Diagram): LayerState {
  const hidden = emptySets();
  const locked = emptySets();
  const layers = diagram.layers;
  if (!layers || layers.every((l) => l.visible && !l.locked)) return { hidden, locked };
  const sort = (sets: [ItemSets, ItemSets], key: 'components' | 'connections' | 'annotations', item: { id: string; layer?: string }) => {
    const l = layerOf(layers, item);
    if (!l.visible) sets[0][key].add(item.id);
    else if (l.locked) sets[1][key].add(item.id);
  };
  for (const c of diagram.components) sort([hidden, locked], 'components', c);
  for (const a of diagram.annotations) sort([hidden, locked], 'annotations', a);
  for (const l of diagram.connections) {
    const endHidden = [l.from, l.to].some((e) => 'componentId' in e && hidden.components.has(e.componentId));
    if (endHidden) hidden.connections.add(l.id);
    else sort([hidden, locked], 'connections', l);
  }
  const lines = new Map<string, string[]>();
  for (const l of diagram.connections) {
    for (const e of [l.from, l.to]) if ('junctionId' in e) lines.set(e.junctionId, [...(lines.get(e.junctionId) ?? []), l.id]);
  }
  for (const j of diagram.junctions) {
    const ids = lines.get(j.id) ?? [];
    const shown = ids.filter((id) => !hidden.connections.has(id));
    if (ids.length > 0 && shown.length === 0) hidden.junctions.add(j.id);
    else if (shown.length > 0 && shown.every((id) => locked.connections.has(id))) locked.junctions.add(j.id);
  }
  return { hidden, locked };
}

/** Lässt aus einer Auswahl weg, was in `sets` steht (z. B. Ausgeblendetes). */
export function without(s: Selection, ...sets: ItemSets[]): Selection {
  const keys = ['components', 'connections', 'junctions', 'annotations'] as const;
  if (!keys.some((k) => s[k].some((id) => sets.some((x) => x[k].has(id))))) return s;
  const next = { ...s };
  for (const k of keys) next[k] = s[k].filter((id) => !sets.some((x) => x[k].has(id)));
  return next;
}

/** Wie viele Teile auf jeder Ebene liegen, über alle Blätter. */
export function layerCounts(drawing: Drawing): Map<string, number> {
  const layers = layersOf(drawing);
  const counts = new Map(layers.map((l) => [l.id, 0]));
  for (const s of drawing.sheets) {
    for (const item of [...s.components, ...s.connections, ...s.annotations]) {
      const id = layerOf(layers, item).id;
      counts.set(id, counts.get(id)! + 1);
    }
  }
  return counts;
}
