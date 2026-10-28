import { describe, expect, it } from 'vitest';
import { addComponent, connect, createDiagram, isJunctionRef, splitConnection } from './diagram.ts';
import { routeAll } from './routing.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { autoLabel, componentCode } from './labels.ts';
import type { Diagram } from './types.ts';

const labelsOf = (d: Diagram) => Object.fromEntries(d.components.map((c) => [c.id, c.label]));

describe('autoLabel', () => {
  it('ordnet Kennbuchstaben nach ISO 1219-2 zu', () => {
    expect(componentCode('supply.pump')).toBe('P');
    expect(componentCode('supply.compressor')).toBe('P');
    expect(componentCode('supply.electric-motor')).toBe('M');
    expect(componentCode('actuator.cylinder')).toBe('A');
    expect(componentCode('valve.directional')).toBe('V');
    expect(componentCode('supply.tank')).toBe('Z');
    expect(componentCode('measure.gauge')).toBe('Z');
  });

  it('kennzeichnet den Beispielplan wie von Hand', () => {
    const d = exampleHydraulicDiagram();
    const cleared = { ...d, components: d.components.map((c) => ({ ...c, label: '' })) };
    expect(labelsOf(autoLabel(cleared))).toEqual(labelsOf(d));
  });

  it('nummeriert Kreise nach Antrieben von links nach rechts', () => {
    let d = createDiagram('hydraulic');
    const add = (type: string, x: number, y: number) => {
      const r = addComponent(d, type, { x, y });
      d = r.diagram;
      return r.component.id;
    };
    const link = (a: string, ap: string, b: string, bp: string) => {
      d = connect(d, { componentId: a, portId: ap }, { componentId: b, portId: bp }).diagram;
    };
    const right = add('actuator.cylinder', 500, 100);
    const left = add('actuator.cylinder', 100, 100);
    const v1 = add('valve.directional', 100, 200);
    const v2 = add('valve.directional', 500, 200);
    const throttle = add('valve.throttle-check', 520, 160);
    const pump = add('supply.pump', 300, 400);
    const relief = add('valve.pressure-relief', 400, 400);
    link(v1, 'A', left, 'A');
    link(v2, 'A', throttle, '1');
    link(throttle, '2', right, 'A');
    link(pump, 'P', v1, 'P');
    link(pump, 'P', v2, 'P');
    link(pump, 'P', relief, 'P');
    const labels = labelsOf(autoLabel(d));
    expect(labels[left]).toBe('1A1');
    expect(labels[right]).toBe('2A1');
    expect(labels[v1]).toBe('1V1');
    expect(labels[throttle]).toBe('2V1');
    expect(labels[v2]).toBe('2V2');
    expect(labels[pump]).toBe('0P1');
    expect(labels[relief]).toBe('0V1');
  });

  it('folgt Leitungen über Abzweigpunkte', () => {
    const d = exampleHydraulicDiagram();
    const [cylinder, valve, pump, relief] = d.components;
    // Pumpe → Abzweig → Ventil P und DBV P statt zwei Leitungen am Pumpenanschluss.
    const next = connect(
      { ...d, connections: d.connections.filter((l) => isJunctionRef(l.from) || l.from.componentId !== pump!.id) },
      { componentId: pump!.id, portId: 'P' },
      { componentId: valve!.id, portId: 'P' },
    );
    const paths = routeAll(next.diagram);
    const path = paths.get(next.connection.id)!;
    const mid = path.find((_, i) => i > 0 && i < path.length - 1)!;
    const split = splitConnection(next.diagram, next.connection.id, path, mid);
    const withRelief = connect(split.diagram, { junctionId: split.junction.id }, { componentId: relief!.id, portId: 'P' });
    const cleared = {
      ...withRelief.diagram,
      components: withRelief.diagram.components.map((c) => ({ ...c, label: '' })),
    };
    const labels = labelsOf(autoLabel(cleared));
    expect([labels[cylinder!.id], labels[valve!.id], labels[pump!.id], labels[relief!.id]]).toEqual([
      '1A1',
      '1V1',
      '0P1',
      '0V1',
    ]);
  });

  it('lässt Entlüftungen ohne Kennzeichen', () => {
    const { diagram } = addComponent(createDiagram('pneumatic'), 'supply.exhaust', { x: 0, y: 0 });
    expect(autoLabel(diagram).components[0]!.label).toBe('');
  });
});
