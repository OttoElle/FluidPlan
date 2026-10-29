import { describe, expect, it } from 'vitest';
import { parseDiagram, serializeDiagram } from '../io/json.ts';
import { BORES, WAYS, type BallValveConfig } from './ballValve.ts';
import { CHECK_COUNTS, type CouplingConfig } from './coupling.ts';
import { defaultCylinderConfig, normalizeCylinder, type CylinderConfig } from './cylinder.ts';
import { addComponent, configureComponent, connect, createDiagram, transformLocalPoint } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { definitionOf, typeOfConfig } from './library.ts';
import { defaultMotorConfig, defaultPumpConfig, normalizeRotary, type RotaryConfig } from './rotary.ts';
import { defaultSensorConfig, normalizeSensor, type SensorConfig } from './sensor.ts';
import { ACCUMULATOR_NAMES, TANK_LINES, type AccumulatorConfig, type AccumulatorType, type TankConfig } from './storage.ts';
import type { ComponentConfig } from './types.ts';
import {
  ACTUATORS,
  defaultValveConfig,
  normalizeValve,
  positionTemplates,
  resizeValve,
  type DirectionalValveConfig,
} from './valve.ts';

function valveVariants(): DirectionalValveConfig[] {
  const out: DirectionalValveConfig[] = [];
  for (const medium of ['hydraulic', 'pneumatic'] as const) {
    for (const ports of [2, 3, 4, 5] as const) {
      for (const positions of [2, 3, 4]) {
        const base = defaultValveConfig(medium, ports, positions);
        out.push(base);
        // jede Betätigung einzeln links und rechts sowie gestapelt
        for (const a of ACTUATORS) out.push(normalizeValve({ ...base, left: [a], right: ['pilot', a, 'spring'] }));
      }
    }
  }
  return out;
}

function cylinderVariants(): CylinderConfig[] {
  const out: CylinderConfig[] = [];
  for (const design of ['piston', 'plunger', 'telescopic'] as const)
    for (const action of ['double', 'single'] as const)
      for (const rod of ['single', 'through'] as const)
        for (const spring of ['none', 'rod', 'piston'] as const)
          for (const stroke of [0, 35, 50, 100])
            out.push(normalizeCylinder({ ...defaultCylinderConfig(action, design), rod, spring, stroke }));
  return out;
}

function rotaryVariants(): RotaryConfig[] {
  const out: RotaryConfig[] = [];
  for (const medium of ['hydraulic', 'pneumatic'] as const)
    for (const base of [defaultPumpConfig(medium), defaultMotorConfig(medium)])
      for (const displacement of ['fixed', 'variable'] as const)
        for (const directions of [1, 2] as const)
          for (const drain of [false, true])
            for (const electricMotor of [false, true])
              out.push(normalizeRotary({ ...base, displacement, directions, drain, electricMotor }));
  return out;
}

function accessoryVariants(): ComponentConfig[] {
  const out: ComponentConfig[] = [];
  for (const ways of WAYS) for (const bore of Object.keys(BORES[ways])) out.push({ kind: 'ball-valve', ways, bore } satisfies BallValveConfig);
  for (const type of Object.keys(ACCUMULATOR_NAMES) as AccumulatorType[]) out.push({ kind: 'accumulator', type } satisfies AccumulatorConfig);
  for (const closed of [false, true])
    for (const lines of TANK_LINES)
      for (const lineEnd of ['below', 'above'] as const) out.push({ kind: 'tank', closed, lines, lineEnd } satisfies TankConfig);
  for (const checks of CHECK_COUNTS) for (const coupled of [false, true]) out.push({ kind: 'coupling', checks, coupled } satisfies CouplingConfig);
  for (const quantity of ['pressure', 'flow', 'temperature', 'position'] as const)
    for (const output of ['switching', 'analog', 'mechanical'] as const)
      for (const adjustable of [false, true]) out.push(normalizeSensor({ ...defaultSensorConfig(quantity, output), adjustable } satisfies SensorConfig));
  return out;
}

const definition = (config: ComponentConfig) => definitionOf({ type: typeOfConfig(config), config })!;

describe('Konfigurierbare Bauteile', () => {
  const all: ComponentConfig[] = [...valveVariants(), ...cylinderVariants(), ...rotaryVariants(), ...accessoryVariants()];

  it('legen alle Anschlüsse auf den Rand und in jeder Lage aufs Raster', () => {
    for (const config of all) {
      const def = definition(config);
      const ids = def.ports.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of def.ports) {
        const { width, height } = def.size;
        const onEdge = p.offset.x === 0 || p.offset.x === width || p.offset.y === 0 || p.offset.y === height;
        expect(onEdge, `${def.name} ${p.id}`).toBe(true);
        for (const rotation of [0, 90, 180, 270] as const) {
          for (const mirrored of [false, true]) {
            const at = transformLocalPoint({ position: { x: 0, y: 0 }, rotation, mirrored }, def, p.offset);
            expect(Number.isInteger(at.x / 10) && Number.isInteger(at.y / 10), `${def.name} ${p.id}`).toBe(true);
          }
        }
      }
    }
  });

  it('legen die Anschlüsse von Wegeventil und Zylinder auf das 2M-Raster (ISO 1219-1, 9.2.12)', () => {
    for (const config of [...valveVariants(), ...cylinderVariants()]) {
      for (const p of definition(config).ports) {
        expect(p.offset.x % 20, `${definition(config).name} ${p.id}`).toBe(0);
      }
    }
  });

  it('halten Plunger- und Teleskopzylinder in sinnvollen Einstellungen', () => {
    const plunger = normalizeCylinder({ ...defaultCylinderConfig('double', 'plunger'), rod: 'through', spring: 'rod' });
    expect(plunger).toMatchObject({ action: 'single', rod: 'single', spring: 'none' });
    expect(definition(plunger).ports.map((p) => p.id)).toEqual(['A']);
    const telescopic = defaultCylinderConfig('double', 'telescopic');
    expect(definition(telescopic).ports.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(normalizeCylinder({ ...telescopic, stroke: 60 }).stroke).toBe(0);
  });

  it('fahren den Kolben mit der Kolbenstellung aus, ohne die Anschlüsse zu verschieben', () => {
    const retracted = definition(defaultCylinderConfig('double'));
    const extended = definition({ ...defaultCylinderConfig('double'), stroke: 100 });
    expect(extended.size.width).toBeGreaterThan(retracted.size.width);
    expect(extended.ports).toEqual(retracted.ports);
  });

  it('geben Pumpe und Motor Leckanschluss und Motor-Pumpe-Einheit', () => {
    const pump = definition({ ...defaultPumpConfig('hydraulic'), drain: true, electricMotor: true });
    expect(pump.ports.map((p) => p.id)).toEqual(['P', 'S', 'L']);
    expect(pump.ports.find((p) => p.id === 'L')?.kind).toBe('drain');
    expect(pump.size.width).toBe(160);
    const compressor = definition(normalizeRotary({ ...defaultPumpConfig('pneumatic'), directions: 2, drain: true }));
    expect(compressor.ports.map((p) => [p.id, p.label])).toEqual([['P', '1']]);
  });

  it('benennen Ventilanschlüsse in der Pneumatik nach ISO 5599', () => {
    const def = definition({ ...defaultValveConfig('pneumatic', 5, 2), left: ['pilot'], right: ['pilot'] });
    expect(Object.fromEntries(def.ports.map((p) => [p.id, p.label ?? p.id]))).toEqual({
      A: '2',
      B: '4',
      R: '3',
      P: '1',
      S: '5',
      X: '14',
      Y: '12',
    });
  });

  it('ordnet Betätigungen nach der Norm und begrenzt sie', () => {
    const c = normalizeValve({ ...defaultValveConfig('hydraulic'), right: ['manual', 'spring', 'solenoid', 'pilot', 'roller'] });
    expect(c.right).toEqual(['pilot', 'solenoid', 'spring']);
  });

  it('bietet Vorlagen nur mit vorhandenen Anschlüssen', () => {
    for (const ports of [2, 3, 4, 5] as const) {
      const config = defaultValveConfig('hydraulic', ports, 2);
      for (const t of positionTemplates(ports)) {
        const withTemplate = { ...config, positions: [{ paths: t.paths }, config.positions[1]!] };
        expect(normalizeValve(withTemplate).positions[0]!.paths).toEqual(t.paths);
      }
    }
  });

  it('passt Stellungen beim Ändern der Stellungszahl an', () => {
    const c42 = defaultValveConfig('hydraulic', 4, 2);
    const c43 = resizeValve(c42, 4, 3);
    expect(c43.positions).toHaveLength(3);
    expect(c43.positions[0]).toEqual(c42.positions[0]);
    expect(c43.positions[2]).toEqual(c42.positions[1]);
    expect(c43.rest).toBe(1);
    expect(resizeValve(c43, 4, 2).positions).toEqual(c42.positions);
  });

  it('entfernt beim Umkonfigurieren Leitungen an weggefallenen Anschlüssen', () => {
    let d = createDiagram('hydraulic');
    d = addComponent(d, 'valve.directional', { x: 0, y: 0 }).diagram;
    d = addComponent(d, 'supply.tank', { x: 0, y: 200 }).diagram;
    d = connect(d, { componentId: 'c1', portId: 'T' }, { componentId: 'c2', portId: 'T' }).diagram;
    d = connect(d, { componentId: 'c1', portId: 'P' }, { componentId: 'c2', portId: 'T' }).diagram;
    const after = configureComponent(d, 'c1', defaultValveConfig('hydraulic', 2, 2));
    expect(after.connections.map((l) => ('portId' in l.from ? l.from.portId : ''))).toEqual(['P']);
  });
});

describe('Dateien mit konfigurierbaren Bauteilen', () => {
  it('speichern und laden die Konfiguration', () => {
    let d = exampleHydraulicDiagram(new Date('2026-10-28T12:00:00Z'));
    const valve = d.components.find((c) => c.type === 'valve.directional')!;
    d = configureComponent(d, valve.id, defaultValveConfig('hydraulic', 4, 3));
    expect(parseDiagram(serializeDiagram(d))).toEqual({ ok: true, diagram: d });
  });

  it('melden ungültige Konfigurationen', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram()));
    const i = file.diagram.components.findIndex((c: { type: string }) => c.type === 'valve.directional');
    file.diagram.components[i].config.ports = 7;
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/config\.ports/);
  });

  it('speichern und laden alle neuen Grundsymbole', () => {
    let d = createDiagram('hydraulic');
    for (const config of [...rotaryVariants().slice(0, 4), ...accessoryVariants(), ...cylinderVariants().slice(-6)]) {
      d = addComponent(d, typeOfConfig(config), { x: 0, y: 0 }, { config }).diagram;
    }
    expect(parseDiagram(serializeDiagram(d))).toEqual({ ok: true, diagram: d });
  });

  it('geben früher festen Pumpen, Motoren, Tanks und Speichern eine Konfiguration', () => {
    const file = JSON.parse(serializeDiagram(createDiagram('pneumatic')));
    const component = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, rotation: 0, mirrored: false, label: '', properties: {} });
    file.diagram.components = [component('c1', 'supply.compressor'), component('c2', 'actuator.air-motor'), component('c3', 'supply.accumulator')];
    file.diagram.connections = [{ id: 'l1', from: { componentId: 'c1', portId: '1' }, to: { componentId: 'c2', portId: 'A' }, kind: 'working', waypoints: [] }];
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagram.components.map((c) => [c.type, c.config?.kind])).toEqual([
      ['supply.pump', 'pump'],
      ['actuator.motor', 'motor'],
      ['supply.accumulator', 'accumulator'],
    ]);
    expect(r.diagram.components[2]!.config).toEqual({ kind: 'accumulator', type: 'air-reservoir' });
    expect(r.diagram.connections[0]!.from).toEqual({ componentId: 'c1', portId: 'P' });
  });

  it('lesen Zylinder aus älteren Dateien ohne Bauart und Kolbenstellung', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram()));
    const cyl = file.diagram.components.find((c: { type: string }) => c.type === 'actuator.cylinder');
    delete cyl.config.design;
    delete cyl.config.stroke;
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.diagram.components.find((c) => c.type === 'actuator.cylinder')?.config).toMatchObject({ design: 'piston', stroke: 0 });
  });

  it('stellen alte feste Ventil- und Zylindertypen um', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram()));
    for (const c of file.diagram.components) {
      if (c.type === 'valve.directional') c.type = 'valve.4-2';
      if (c.type === 'actuator.cylinder') c.type = 'actuator.cylinder-double';
      delete c.config;
    }
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diagram.components.map((c) => c.type)).toContain('valve.directional');
      expect(r.diagram.components.find((c) => c.type === 'actuator.cylinder')?.config?.kind).toBe('cylinder');
    }
  });
});
