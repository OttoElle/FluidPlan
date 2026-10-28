import { describe, expect, it } from 'vitest';
import { parseDiagram, serializeDiagram } from '../io/json.ts';
import { defaultCylinderConfig, type CylinderConfig } from './cylinder.ts';
import { addComponent, configureComponent, connect, createDiagram, transformLocalPoint } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { definitionOf } from './library.ts';
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
  for (const action of ['double', 'single'] as const)
    for (const rod of ['single', 'through'] as const)
      for (const spring of ['none', 'rod', 'piston'] as const)
        out.push({ ...defaultCylinderConfig(action), rod, spring: action === 'double' ? 'none' : spring });
  return out;
}

const definition = (config: ComponentConfig) =>
  definitionOf({ type: config.kind === 'cylinder' ? 'actuator.cylinder' : 'valve.directional', config })!;

describe('Konfigurierbare Bauteile', () => {
  const all: ComponentConfig[] = [...valveVariants(), ...cylinderVariants()];

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
    for (const config of all) {
      for (const p of definition(config).ports) {
        expect(p.offset.x % 20, `${definition(config).name} ${p.id}`).toBe(0);
      }
    }
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
    expect(after.connections.map((l) => l.from.portId)).toEqual(['P']);
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
