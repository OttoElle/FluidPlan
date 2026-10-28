import { addComponent, connect, createDiagram } from './diagram.ts';
import type { Diagram } from './types.ts';

/** Kleiner Beispielschaltplan: Pumpe, DBV, 4/3-Wegeventil und Zylinder. */
export function exampleHydraulicDiagram(now = new Date()): Diagram {
  let d = createDiagram('hydraulic', 'Beispiel: Zylindersteuerung', now);
  const add = (type: string, x: number, y: number, label: string) => {
    const r = addComponent(d, type, { x, y }, { label });
    d = r.diagram;
    return r.component.id;
  };
  const cylinder = add('actuator.cylinder-double', 140, 40, '1A1');
  const valve = add('valve.4-3', 130, 140, '1V1');
  const pump = add('supply.pump', 160, 260, '0P1');
  const relief = add('valve.pressure-relief', 250, 230, '0V1');
  const tank = add('supply.tank', 230, 360, '0Z1');

  const link = (a: string, ap: string, b: string, bp: string) => {
    d = connect(d, { componentId: a, portId: ap }, { componentId: b, portId: bp }).diagram;
  };
  link(valve, 'A', cylinder, 'A');
  link(valve, 'B', cylinder, 'B');
  link(pump, 'P', valve, 'P');
  link(pump, 'P', relief, 'P');
  link(relief, 'T', tank, 'T');
  link(valve, 'T', tank, 'T');
  return d;
}
