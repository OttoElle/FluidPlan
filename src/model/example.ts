import { addComponent, connect, createDiagram } from './diagram.ts';
import type { Diagram } from './types.ts';

/** Kleiner Beispielschaltplan: Pumpe, DBV, 4/2-Wegeventil und Zylinder. */
export function exampleHydraulicDiagram(now = new Date()): Diagram {
  let d = createDiagram('hydraulic', 'Beispiel: Zylindersteuerung', now);
  // Verschoben, damit der Plan innerhalb des Zeichnungsrahmens liegt.
  const add = (type: string, x: number, y: number, label: string) => {
    const r = addComponent(d, type, { x: x + 120, y: y + 60 }, { label });
    d = r.diagram;
    return r.component.id;
  };
  const cylinder = add('actuator.cylinder', 140, 40, '1A1');
  const valve = add('valve.directional', 80, 140, '1V1');
  const pump = add('supply.pump', 90, 250, '0P1');
  const relief = add('valve.pressure-relief', 250, 240, '0V1');
  const tank = add('supply.tank', 240, 370, '0Z1');

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
