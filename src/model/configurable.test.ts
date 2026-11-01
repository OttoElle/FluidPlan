import { describe, expect, it } from 'vitest';
import { parseDiagram, serializeDiagram } from '../io/json.ts';
import { MANIFOLD_OUTLETS, type ManifoldConfig, type PressureConverterConfig, type PrimeMoverConfig, type SwivelConfig } from './actuators.ts';
import { BORES, FORMS, normalizeBallValve, type BallValveConfig, type BallValveWays } from './ballValve.ts';
import { CHECK_COUNTS, type CouplingConfig } from './coupling.ts';
import { defaultCylinderConfig, normalizeCylinder, readCylinderConfig, ROD_ACTUATORS, type CylinderConfig } from './cylinder.ts';
import { addComponent, configureComponent, connect, createDiagram, transformLocalPoint } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { definitionOf, typeOfConfig } from './library.ts';
import { defaultMotorConfig, defaultPumpConfig, normalizeRotary, type RotaryConfig } from './rotary.ts';
import { defaultSensorConfig, normalizeSensor, type SensorConfig } from './sensor.ts';
import { ACCUMULATOR_NAMES, TANK_LINES, type AccumulatorConfig, type AccumulatorType, type TankConfig } from './storage.ts';
import type { ComponentConfig } from './types.ts';
import type { CoolerConfig, FilterConfig } from './conditioning.ts';
import {
  PRESSURE_FUNCTION_NAMES,
  type CheckValveConfig,
  type FlowDividerConfig,
  type PressureFunction,
  type PressureValveConfig,
  type ThrottleConfig,
} from './fluidValves.ts';
import { INSTRUMENT_NAMES, type IndicatorConfig, type InstrumentConfig, type InstrumentQuantity } from './instruments.ts';
import {
  ACTUATORS,
  defaultValveConfig,
  normalizeValve,
  positionTemplates,
  resizeValve,
  type DirectionalValveConfig,
  type ValvePosition,
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
            for (const springPort of [false, true])
              out.push(normalizeCylinder({ ...defaultCylinderConfig(action, design), rod, spring, stroke, springPort }));
  for (const rodActuator of ROD_ACTUATORS)
    for (const stroke of [0, 50])
      out.push(normalizeCylinder({ ...defaultCylinderConfig('single'), rodActuator, stroke }));
  for (const pistonType of ['plain', 'magnet', 'magnetic-transmission', 'slide', 'slide-magnet', 'coupled-slide'] as const)
    for (const rod of ['single', 'through', 'none'] as const)
      for (const limitSwitch of ['none', 'right'] as const)
        for (const hollowRod of [false, true])
          out.push(normalizeCylinder({ ...defaultCylinderConfig('double'), pistonType, rod, limitSwitch, hollowRod, stroke: 100 }));
  for (const detent of ['retracted', 'extended', 'both'] as const)
    for (const spring of ['none', 'rod', 'piston'] as const)
      for (const stroke of [0, 50, 100])
        out.push(normalizeCylinder({ ...defaultCylinderConfig(spring === 'none' ? 'double' : 'single'), spring, stroke, detent }));
  // Membranzylinder, kolbenstangenlos, Endschalter, Entlüftung, Hubbegrenzung
  for (const design of ['piston', 'diaphragm'] as const)
    for (const action of ['double', 'single'] as const)
      for (const rod of ['single', 'through', 'none'] as const)
        for (const spring of ['rod', 'piston'] as const)
          for (const limitSwitch of ['none', 'left', 'right', 'both'] as const)
            for (const stroke of [0, 100])
              for (const extra of [false, true])
                out.push(
                  normalizeCylinder({
                    ...defaultCylinderConfig(action, design),
                    rod,
                    spring,
                    limitSwitch,
                    stroke,
                    vent: extra,
                    strokeLimiter: extra,
                    rodActuator: extra ? 'pedal' : 'none',
                  }),
                );
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
              for (const pumpMotor of [false, true])
                out.push(normalizeRotary({ ...base, displacement, directions, drain, electricMotor, pumpMotor }));
  return out;
}

function accessoryVariants(): ComponentConfig[] {
  const out: ComponentConfig[] = [];
  for (const form of FORMS)
    for (const bore of Object.keys(BORES[form]))
      out.push(normalizeBallValve({ kind: 'ball-valve', ways: Number(form[0]) as BallValveWays, angle: form === '2a', bore } satisfies BallValveConfig));
  for (const type of Object.keys(ACCUMULATOR_NAMES) as AccumulatorType[]) out.push({ kind: 'accumulator', type } satisfies AccumulatorConfig);
  for (const closed of [false, true])
    for (const lines of TANK_LINES)
      for (const lineEnd of ['below', 'above'] as const)
        for (const size of ['normal', 'small'] as const) out.push({ kind: 'tank', closed, lines, lineEnd, size } satisfies TankConfig);
  for (const checks of CHECK_COUNTS) for (const coupled of [false, true]) for (const checkSide of ['top', 'bottom'] as const) out.push({ kind: 'coupling', checks, checkSide, coupled } satisfies CouplingConfig);
  for (const quantity of ['pressure', 'flow', 'temperature', 'position'] as const)
    for (const output of ['switching', 'analog', 'mechanical'] as const)
      for (const adjustable of [false, true]) out.push(normalizeSensor({ ...defaultSensorConfig(quantity, output), adjustable } satisfies SensorConfig));
  return out;
}

function catalogVariants(): ComponentConfig[] {
  const out: ComponentConfig[] = [];
  const bools = [false, true];
  for (const double of bools)
    for (const spring of bools) for (const piloted of bools) out.push({ kind: 'check-valve', double, spring, piloted } satisfies CheckValveConfig);
  for (const fn of Object.keys(PRESSURE_FUNCTION_NAMES) as PressureFunction[])
    for (const adjustable of bools) for (const piloted of bools) out.push({ kind: 'pressure-valve', function: fn, adjustable, piloted } satisfies PressureValveConfig);
  for (const element of ['throttle', 'orifice'] as const)
    for (const adjustable of bools) for (const check of bools) out.push({ kind: 'throttle', element, adjustable, check } satisfies ThrottleConfig);
  for (const mode of ['divide', 'combine'] as const) out.push({ kind: 'flow-divider', mode } satisfies FlowDividerConfig);
  for (const design of ['filter', 'breather'] as const)
    for (const indicator of ['none', 'optical', 'gauge'] as const)
      for (const magnet of bools) for (const bypass of bools) out.push({ kind: 'filter', design, indicator, magnet, bypass } satisfies FilterConfig);
  for (const coolant of ['none', 'liquid', 'fan'] as const) out.push({ kind: 'cooler', coolant } satisfies CoolerConfig);
  for (const quantity of Object.keys(INSTRUMENT_NAMES) as InstrumentQuantity[]) out.push({ kind: 'instrument', quantity } satisfies InstrumentConfig);
  for (const type of ['optical', 'digital', 'acoustic'] as const) out.push({ kind: 'indicator', type } satisfies IndicatorConfig);
  for (const action of ['double', 'single'] as const) out.push({ kind: 'swivel', action } satisfies SwivelConfig);
  for (const type of ['converter', 'intensifier'] as const) out.push({ kind: 'pressure-converter', type } satisfies PressureConverterConfig);
  for (const engine of ['electric', 'combustion'] as const)
    for (const rotation of ['none', 'cw', 'ccw', 'both'] as const) out.push({ kind: 'prime-mover', engine, rotation } satisfies PrimeMoverConfig);
  for (const outlets of MANIFOLD_OUTLETS) out.push({ kind: 'manifold', outlets } satisfies ManifoldConfig);
  return out;
}

const definition = (config: ComponentConfig) => definitionOf({ type: typeOfConfig(config), config })!;

describe('Konfigurierbare Bauteile', () => {
  const all: ComponentConfig[] = [...valveVariants(), ...cylinderVariants(), ...rotaryVariants(), ...accessoryVariants(), ...catalogVariants()];

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

  it('setzen die Betätigung ans Stangenende, nur beim Kolbenzylinder', () => {
    const plain = definition(defaultCylinderConfig('single'));
    const pedal = definition({ ...defaultCylinderConfig('single'), rodActuator: 'pedal' });
    expect(pedal.size.width).toBeGreaterThan(plain.size.width);
    expect(pedal.ports).toEqual(plain.ports);
    expect(normalizeCylinder({ ...defaultCylinderConfig('single', 'plunger'), rodActuator: 'pedal' }).rodActuator).toBe('none');
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
    expect(pump.size.width).toBe(200);
    const compressor = definition(normalizeRotary({ ...defaultPumpConfig('pneumatic'), directions: 2, drain: true }));
    expect(compressor.ports.map((p) => [p.id, p.label])).toEqual([['P', '1']]);
  });

  it('halten Membranzylinder und kolbenstangenlose Zylinder in sinnvollen Einstellungen', () => {
    const rodless = normalizeCylinder({ ...defaultCylinderConfig('single'), rod: 'none', rodActuator: 'pedal', spring: 'rod' });
    expect(rodless).toMatchObject({ action: 'single', spring: 'rod', rodActuator: 'none' });
    const diaphragm = normalizeCylinder({ ...defaultCylinderConfig('single', 'diaphragm'), spring: 'none', rod: 'through', vent: true });
    expect(diaphragm).toMatchObject({ spring: 'piston', rod: 'single', vent: true });
    expect(definition(diaphragm).ports.map((p) => p.id)).toEqual(['B']);
    // Entlüftung nur am Raum ohne Anschluss, Hubbegrenzung nur beim Membranzylinder
    expect(normalizeCylinder({ ...defaultCylinderConfig('double'), vent: true, strokeLimiter: true })).toMatchObject({ vent: false, strokeLimiter: false });
  });

  it('lesen den kolbenstangenlosen Zylinder vom 31.10. als Zylinder ohne Stange mit gekoppeltem Schlitten', () => {
    const errors: string[] = [];
    const c = readCylinderConfig({ ...defaultCylinderConfig('double'), rod: 'rodless' }, 'c', errors);
    expect(errors).toEqual([]);
    expect(c).toMatchObject({ rod: 'none', pistonType: 'coupled-slide', action: 'double' });
    expect(normalizeCylinder({ ...defaultCylinderConfig('double'), rod: 'none' }).pistonType).toBe('plain');
  });

  it('geben die Raste nur dem Kolbenzylinder mit einseitiger Stange ohne Betätigung', () => {
    expect(normalizeCylinder({ ...defaultCylinderConfig('double'), detent: 'both' }).detent).toBe('both');
    expect(normalizeCylinder({ ...defaultCylinderConfig('double'), detent: 'both', rod: 'through' }).detent).toBe('none');
    expect(normalizeCylinder({ ...defaultCylinderConfig('double'), detent: 'both', rodActuator: 'pedal' }).detent).toBe('none');
    expect(normalizeCylinder({ ...defaultCylinderConfig('double', 'diaphragm'), detent: 'both' }).detent).toBe('none');
  });

  it('setzen Endschalter über den Rahmen, ohne die Anschlüsse seitlich zu verschieben', () => {
    const plain = definition(defaultCylinderConfig('double'));
    const right = definition({ ...defaultCylinderConfig('double'), limitSwitch: 'right' });
    expect(right.size.height).toBe(plain.size.height + 30);
    expect(right.ports.map((p) => p.offset.x)).toEqual(plain.ports.map((p) => p.offset.x));
  });

  it('zeichnen Pumpe/Motor nur bei hydraulischen Pumpen', () => {
    expect(normalizeRotary({ ...defaultPumpConfig('pneumatic'), pumpMotor: true }).pumpMotor).toBe(false);
    expect(normalizeRotary({ ...defaultMotorConfig('hydraulic'), pumpMotor: true }).pumpMotor).toBe(false);
    expect(definition({ ...defaultPumpConfig('hydraulic'), pumpMotor: true, directions: 2 }).name).toBe('Pumpe/Motor (konstant, reversierbar)');
  });

  it('führen die Drehrichtung beim Motor mit den Drehrichtungen', () => {
    const motor = defaultMotorConfig('hydraulic');
    expect(normalizeRotary({ ...motor, directions: 2, rotation: 'cw' }).rotation).toBe('both');
    expect(normalizeRotary({ ...motor, rotation: 'both' }).rotation).toBe('cw');
    expect(normalizeRotary({ ...motor, rotation: 'none', directions: 2 }).rotation).toBe('none');
    expect(normalizeRotary({ ...defaultPumpConfig('hydraulic'), rotation: 'ccw' }).rotation).toBe('ccw');
  });

  it('benennen Ventilanschlüsse in der Pneumatik nach ISO 5599', () => {
    const def = definition({ ...defaultValveConfig('pneumatic', 5, 2), left: ['pilot'], right: ['pilot'] });
    expect(Object.fromEntries(def.ports.map((p) => [p.id, p.label ?? p.id]))).toEqual({
      A: '2',
      B: '4',
      R: '3',
      P: '1',
      S: '5',
      // DIN ISO 11727, 4.3: links schaltet die linke Stellung (1→2), rechts die rechte (1→4).
      X: '12',
      Y: '14',
    });
  });

  it('benennt pneumatische Steueranschlüsse nach der geschalteten Verbindung', () => {
    const base = defaultValveConfig('pneumatic', 3, 2);
    const open12: ValvePosition = { paths: [{ from: 'P', to: 'A', kind: 'flow' }] };
    const closed: ValvePosition = { paths: [{ from: 'A', to: 'T', kind: 'flow' }] };
    const label = (positions: ValvePosition[]) =>
      definition({ ...base, positions, rest: 1, left: ['pilot'], right: ['spring'] }).ports.find((p) => p.id === 'X')!.label;
    expect(label([open12, closed])).toBe('12');
    expect(label([closed, open12])).toBe('10');
  });

  it('ordnet Betätigungen nach der Norm und begrenzt sie', () => {
    const c = normalizeValve({ ...defaultValveConfig('hydraulic'), right: ['push', 'spring', 'solenoid', 'pilot', 'roller'] });
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
    let d = createDiagram();
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
    const i = file.drawing.sheets[0].components.findIndex((c: { type: string }) => c.type === 'valve.directional');
    file.drawing.sheets[0].components[i].config.ports = 7;
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/config\.ports/);
  });

  it('speichern und laden alle neuen Grundsymbole', () => {
    let d = createDiagram();
    for (const config of [...rotaryVariants().slice(0, 4), ...accessoryVariants(), ...cylinderVariants().slice(-6), ...catalogVariants()]) {
      d = addComponent(d, typeOfConfig(config), { x: 0, y: 0 }, { config }).diagram;
    }
    expect(parseDiagram(serializeDiagram(d))).toEqual({ ok: true, diagram: d });
  });

  it('geben früher festen Pumpen, Motoren, Tanks und Speichern eine Konfiguration', () => {
    // Pneumatik-Plan aus Version 7, als das Medium noch an der Zeichnung hing.
    const file = JSON.parse(serializeDiagram(createDiagram()));
    file.version = 7;
    file.drawing.domain = 'pneumatic';
    const component = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, rotation: 0, mirrored: false, label: '', properties: {} });
    file.drawing.sheets[0].components = [component('c1', 'supply.compressor'), component('c2', 'actuator.air-motor'), component('c3', 'supply.accumulator')];
    file.drawing.sheets[0].connections = [{ id: 'l1', from: { componentId: 'c1', portId: '1' }, to: { componentId: 'c2', portId: 'A' }, kind: 'working', waypoints: [] }];
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagram.components.map((c) => [c.type, c.config?.kind])).toEqual([
      ['supply.pump', 'pump'],
      ['actuator.motor', 'motor'],
      ['supply.accumulator', 'accumulator'],
    ]);
    expect(r.diagram.components[2]!.config).toEqual({ kind: 'accumulator', type: 'air-reservoir' });
    expect(r.diagram.components.every((c) => c.medium === 'pneumatic')).toBe(true);
    expect(r.diagram.connections[0]!.from).toEqual({ componentId: 'c1', portId: 'P' });
  });

  it('stellen alte feste Sperr-, Strom- und Druckventile, Filter und Manometer auf Konfiguratoren um', () => {
    const file = JSON.parse(serializeDiagram(createDiagram()));
    const component = (id: string, type: string) => ({ id, type, position: { x: 0, y: 0 }, rotation: 0, mirrored: false, label: '', properties: {} });
    file.drawing.sheets[0].components = [
      component('c1', 'valve.pressure-relief'),
      component('c2', 'valve.check-piloted'),
      component('c3', 'valve.throttle-check'),
      component('c4', 'supply.filter'),
      component('c5', 'measure.gauge'),
      component('c6', 'valve.sequence'),
    ];
    file.drawing.sheets[0].connections = [{ id: 'l1', from: { componentId: 'c1', portId: 'P' }, to: { componentId: 'c2', portId: 'X' }, kind: 'working', waypoints: [] }];
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.diagram.components.map((c) => [c.type, c.config])).toEqual([
      ['valve.pressure', { kind: 'pressure-valve', function: 'relief', adjustable: true, piloted: false }],
      ['valve.check', { kind: 'check-valve', double: false, spring: true, piloted: true }],
      ['valve.throttle', { kind: 'throttle', element: 'throttle', adjustable: true, check: true }],
      ['supply.filter', { kind: 'filter', design: 'filter', magnet: false, indicator: 'none', bypass: false }],
      ['measure.gauge', { kind: 'instrument', quantity: 'pressure' }],
      ['valve.pressure', { kind: 'pressure-valve', function: 'sequence', adjustable: true, piloted: false }],
    ]);
    expect(r.diagram.connections[0]).toMatchObject({ from: { portId: 'P' }, to: { portId: 'X' } });
  });

  it('lesen Kupplungen aus älteren Dateien ohne Seite des Rückschlagventils', () => {
    const d = addComponent(createDiagram(), 'line.coupling', { x: 0, y: 0 }).diagram;
    const file = JSON.parse(serializeDiagram(d));
    delete file.drawing.sheets[0].components[0].config.checkSide;
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok && r.diagram.components[0]!.config).toMatchObject({ checkSide: 'top' });
  });

  it('lesen Zylinder aus älteren Dateien ohne Bauart und Kolbenstellung', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram()));
    const cyl = file.drawing.sheets[0].components.find((c: { type: string }) => c.type === 'actuator.cylinder');
    delete cyl.config.design;
    delete cyl.config.stroke;
    delete cyl.config.rodActuator;
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.diagram.components.find((c) => c.type === 'actuator.cylinder')?.config).toMatchObject({ design: 'piston', stroke: 0, rodActuator: 'none' });
  });

  it('stellen alte feste Ventil- und Zylindertypen um', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram()));
    for (const c of file.drawing.sheets[0].components) {
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

  it('ersetzen Betätigungen, die es in der Norm 2019 nicht mehr gibt, durch „Drücken“', () => {
    const file = JSON.parse(serializeDiagram(exampleHydraulicDiagram()));
    const comps = file.drawing.sheets[0].components;
    const valve = comps.find((c: { type: string }) => c.type === 'valve.directional');
    valve.config.left = ['manual'];
    valve.config.right = ['pushbutton', 'spring'];
    comps.find((c: { type: string }) => c.type === 'actuator.cylinder').config.rodActuator = 'pushbutton';
    const r = parseDiagram(JSON.stringify(file));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.diagram.components.find((c) => c.type === 'valve.directional')!.config as DirectionalValveConfig;
    expect([v.left, v.right]).toEqual([['push'], ['spring', 'push']]);
    expect(r.diagram.components.find((c) => c.type === 'actuator.cylinder')?.config).toMatchObject({ rodActuator: 'push' });
  });
});

describe('Elektrohydraulische Vorsteuerung', () => {
  it('hat einen Anschluss für externes Steueröl unter dem Steuerdreieck', () => {
    const config = normalizeValve({ ...defaultValveConfig('hydraulic', 4, 3), left: ['solenoid-pilot', 'spring'], right: ['solenoid-pilot', 'spring'] });
    const def = definitionOf({ type: 'valve.directional', config })!;
    const x = def.ports.find((p) => p.id === 'X')!;
    const y = def.ports.find((p) => p.id === 'Y')!;
    expect(x.offset).toEqual({ x: 40, y: 80 });
    expect(y.offset).toEqual({ x: def.size.width - 40, y: 80 });
    const pneumatic = normalizeValve({ ...config, medium: 'pneumatic' });
    expect(definitionOf({ type: 'valve.directional', config: pneumatic })!.ports.some((p) => p.id === 'X')).toBe(false);
  });
});

describe('Federraum mit Anschluss (6.3.1)', () => {
  const ports = (c: Partial<CylinderConfig>) =>
    definitionOf({ type: 'actuator.cylinder', config: normalizeCylinder({ ...defaultCylinderConfig('single'), ...c }) })!.ports.map((p) => p.id);
  it('gibt dem einfachwirkenden Zylinder einen Anschluss am Federraum', () => {
    expect(ports({})).toEqual(['A']);
    expect(ports({ springPort: true })).toEqual(['A', 'B']);
    expect(ports({ spring: 'piston', springPort: true })).toEqual(['A', 'B']);
    expect(ports({ spring: 'piston' })).toEqual(['B']);
  });
  it('gilt nur mit Feder', () => {
    expect(normalizeCylinder({ ...defaultCylinderConfig('single'), spring: 'none', springPort: true }).springPort).toBe(false);
    expect(normalizeCylinder({ ...defaultCylinderConfig('double'), springPort: true }).springPort).toBe(false);
  });
});
