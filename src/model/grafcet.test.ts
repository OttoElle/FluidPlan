import { describe, expect, it } from 'vitest';
import { checkDiagram } from './check.ts';
import { addComponent, connect, createDiagram, transformLocalPoint } from './diagram.ts';
import {
  ACTION_TYPE_NAMES,
  CONNECTOR_DIRECTION_NAMES,
  grafcetConnections,
  negationParts,
  nextStepName,
  STEP_VARIANT_NAMES,
  SYNC_COUNTS,
  SYNC_SPACINGS,
  upwardArrows,
  type ActionType,
  type ConnectorDirection,
  type StepVariant,
} from './grafcet.ts';
import { definitionOf, grafcetPalette, PALETTE_GROUPS, typeOfConfig } from './library.ts';
import { needsLabel } from './labels.ts';
import { routeAll } from './routing.ts';
import type { ComponentConfig, Diagram } from './types.ts';

function variants(): ComponentConfig[] {
  const out: ComponentConfig[] = [];
  for (const variant of Object.keys(STEP_VARIANT_NAMES) as StepVariant[])
    for (const name of ['', '1', '12', 'Füllen', 'M10'])
      for (const active of [false, true]) out.push({ kind: 'grafcet-step', variant, name, active });
  for (const name of ['', '8', '14a'])
    for (const condition of ['', 'a', '!b1 · b0', '3s/X27', '[C1 = 3] + ↑S1'])
      out.push({ kind: 'grafcet-transition', name, condition });
  for (const type of Object.keys(ACTION_TYPE_NAMES) as ActionType[])
    for (const text of ['', 'Y1', 'Ventil 2 öffnen'])
      for (const condition of ['', 'd', '↑(a + b)']) out.push({ kind: 'grafcet-action', type, text, condition });
  for (const above of SYNC_COUNTS)
    for (const below of SYNC_COUNTS) for (const spacing of SYNC_SPACINGS) out.push({ kind: 'grafcet-sync', above, below, spacing });
  for (const direction of Object.keys(CONNECTOR_DIRECTION_NAMES) as ConnectorDirection[])
    for (const target of ['', 'Schritt 83\nSeite 13']) out.push({ kind: 'grafcet-connector', direction, target });
  return out;
}

describe('GRAFCET-Elemente', () => {
  it('legen alle Anschlüsse auf den Rand und in jeder Lage aufs Raster', () => {
    for (const config of variants()) {
      const def = definitionOf({ type: typeOfConfig(config), config })!;
      const ids = def.ports.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of def.ports) {
        const { width, height } = def.size;
        expect(p.offset.x === 0 || p.offset.x === width || p.offset.y === 0 || p.offset.y === height, `${def.name} ${p.id}`).toBe(true);
        for (const rotation of [0, 90, 180, 270] as const)
          for (const mirrored of [false, true]) {
            const at = transformLocalPoint({ position: { x: 0, y: 0 }, rotation, mirrored }, def, p.offset);
            expect(Number.isInteger(at.x / 10) && Number.isInteger(at.y / 10), `${def.name} ${p.id} ${JSON.stringify(config)}`).toBe(true);
          }
      }
    }
  });

  it('stehen im eigenen Katalog ohne Medium und ohne Kennzeichen', () => {
    const palette = grafcetPalette();
    expect(palette.length).toBeGreaterThan(5);
    for (const e of palette) {
      expect(e.catalog).toBe('grafcet');
      expect(e.medium).toBeUndefined();
      expect(PALETTE_GROUPS as readonly string[]).toContain(e.group);
      expect(needsLabel(e)).toBe(false);
    }
    expect(new Set(palette.map((e) => e.key)).size).toBe(palette.length);
  });

  it('macht Schritte mit langen Bezeichnungen breiter, Quadrat 4M sonst', () => {
    const size = (name: string) => definitionOf({ type: 'grafcet.step', config: { kind: 'grafcet-step', variant: 'step', name, active: false } })!.size;
    expect(size('2')).toEqual({ width: 40, height: 40 });
    expect(size('Füllen und Warten').width).toBeGreaterThan(40);
  });
});

describe('Negation in Bedingungen', () => {
  it('überstreicht Namen und Klammern nach !', () => {
    expect(negationParts('!b1 · b0')).toEqual([
      { text: 'b1', over: true },
      { text: ' · b0', over: false },
    ]);
    expect(negationParts('a + !(b · c)')).toEqual([
      { text: 'a + ', over: false },
      { text: '(b · c)', over: true },
    ]);
    expect(negationParts('x!')).toEqual([{ text: 'x!', over: false }]);
  });
});

/** Ablaufkette 1 → (a) → 2 → (b) → zurück zu 1. */
function chain(): Diagram {
  let d = createDiagram('Test');
  const put = (type: string, x: number, y: number, config: ComponentConfig) => {
    const r = addComponent(d, type, { x, y }, { config });
    d = r.diagram;
    return r.component.id;
  };
  const s1 = put('grafcet.step', 100, 100, { kind: 'grafcet-step', variant: 'initial', name: '1', active: false });
  const t1 = put('grafcet.transition', 110, 180, { kind: 'grafcet-transition', name: '', condition: 'a' });
  const s2 = put('grafcet.step', 100, 240, { kind: 'grafcet-step', variant: 'step', name: '2', active: false });
  const t2 = put('grafcet.transition', 110, 320, { kind: 'grafcet-transition', name: '', condition: 'b' });
  const a2 = put('grafcet.action', 180, 240, { kind: 'grafcet-action', type: 'continuous', text: 'Y1', condition: '' });
  const link = (a: string, pa: string, b: string, pb: string) => {
    d = connect(d, { componentId: a, portId: pa }, { componentId: b, portId: pb }).diagram;
  };
  link(s1, 'out', t1, 'in');
  link(t1, 'out', s2, 'in');
  link(s2, 'out', t2, 'in');
  link(t2, 'out', s1, 'in');
  link(s2, 'act', a2, 'in');
  return d;
}

describe('Wirkungslinien', () => {
  it('erkennt Leitungen zwischen GRAFCET-Elementen', () => {
    const d = chain();
    expect(grafcetConnections(d).size).toBe(d.connections.length);
  });

  it('setzt nur auf die Rückführung nach oben einen Pfeil', () => {
    const d = chain();
    const arrows = upwardArrows(d, routeAll(d));
    expect(arrows).toHaveLength(1);
    expect(arrows[0]!.id).toBe(d.connections[3]!.id);
  });

  it('nummeriert neue Schritte fortlaufend', () => {
    expect(nextStepName([chain()])).toBe('3');
    expect(nextStepName([createDiagram('leer')])).toBe('1');
  });

  it('prüft doppelte Schritte und fehlende Bedingungen, aber keine offenen Enden', () => {
    let d = chain();
    d = addComponent(d, 'grafcet.step', { x: 400, y: 100 }, { config: { kind: 'grafcet-step', variant: 'step', name: '2', active: false } }).diagram;
    d = addComponent(d, 'grafcet.transition', { x: 400, y: 300 }, { config: { kind: 'grafcet-transition', name: '', condition: '' } }).diagram;
    const messages = checkDiagram(d).map((i) => i.message);
    expect(messages).toContain('Schritt 2 ist 2-mal vergeben.');
    expect(messages).toContain('Eine Transition hat keine Transitionsbedingung.');
    expect(messages.some((m) => m.includes('offen'))).toBe(false);
    expect(messages.some((m) => m.includes('Kennzeichen'))).toBe(false);
  });
});
