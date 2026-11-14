import { describe, expect, it } from 'vitest';
import { parseDrawing, serializeDrawing } from '../io/json.ts';
import { checkDiagram } from './check.ts';
import { addComponent, connect, createDiagram, splitConnection } from './diagram.ts';
import { drawingOf } from './drawing.ts';
import {
  ACTUATION_NAMES,
  CONTACT_FUNCTION_NAMES,
  contactLayout,
  contactTables,
  contactTerminals,
  defaultCoilConfig,
  defaultContactConfig,
  defaultElectricSensorConfig,
  defaultLampConfig,
  defaultRailConfig,
  DELAY_NAMES,
  electricInsert,
  railLayout,
  type ContactActuation,
  type ContactDelay,
  type ContactFunction,
  type ElectricConfig,
} from './electric.ts';
import { autoLabel, needsLabel } from './labels.ts';
import { definitionOf, electricPalette, MODULE, PALETTE_GROUPS, typeOfConfig } from './library.ts';
import { routeAll } from './routing.ts';
import { drawingArea } from './sheet.ts';
import type { ComponentConfig, Diagram, Point } from './types.ts';

const keys = <T extends string>(r: Record<T, string>) => Object.keys(r) as T[];

function contacts(): ComponentConfig[] {
  const out: ComponentConfig[] = [];
  for (const fn of keys(CONTACT_FUNCTION_NAMES) as ContactFunction[])
    for (const actuation of keys(ACTUATION_NAMES) as ContactActuation[])
      for (const delay of keys(DELAY_NAMES) as ContactDelay[])
        for (const actuated of [false, true]) out.push({ ...defaultContactConfig(fn, actuation), delay, actuated });
  return out;
}

describe('Elektrik-Katalog', () => {
  it('hat nur die Grundformen, alle in Elektrik-Gruppen', () => {
    const palette = electricPalette();
    expect(palette.length).toBeLessThanOrEqual(16);
    for (const e of palette) {
      expect(e.catalog).toBe('electric');
      expect(PALETTE_GROUPS).toContain(e.group);
      expect(typeOfConfig(e.config!)).toBe(e.type);
    }
  });

  it('legt alle Anschlüsse aufs Raster, Breite und Höhe gerade (Drehen bleibt auf dem Raster)', () => {
    const configs: ComponentConfig[] = [
      ...contacts(),
      ...(['relay', 'on-delay', 'off-delay', 'on-off-delay', 'solenoid'] as const).map((v) => defaultCoilConfig(v)),
      defaultLampConfig(),
      defaultElectricSensorConfig(),
      defaultRailConfig('plus'),
      { ...defaultRailConfig('minus'), taps: 7, spacing: 6, text: 'L−' },
    ];
    for (const config of configs) {
      const def = definitionOf({ type: typeOfConfig(config), config })!;
      for (const v of [def.size.width, def.size.height]) expect((v / MODULE) % 2).toBe(0);
      for (const p of def.ports) {
        expect(p.offset.x % MODULE).toBe(0);
        expect(p.offset.y % MODULE).toBe(0);
      }
    }
  });

  it('nummeriert Kontaktanschlüsse nach Ordnungsziffer und Funktion', () => {
    const t = (fn: ContactFunction, delay: ContactDelay = 'none', index = 1) => contactTerminals({ ...defaultContactConfig(fn), delay, index });
    expect(t('no')).toEqual({ top: '13', bottom: '14' });
    expect(t('nc', 'none', 2)).toEqual({ top: '21', bottom: '22' });
    expect(t('changeover', 'none', 3)).toEqual({ top: '34', bottom: '31', nc: '32' });
    expect(t('no', 'on')).toEqual({ top: '17', bottom: '18' });
    expect(t('nc', 'off')).toEqual({ top: '15', bottom: '16' });
    expect(contactLayout({ ...defaultContactConfig('no', 'push') }).axis).toBe(5);
  });

  it('vergibt Kennzeichen nach DIN EN IEC 81346-2', () => {
    const d = createDiagram();
    const sheets = [d];
    const ins = (config: ElectricConfig) => electricInsert(config, sheets);
    expect(ins(defaultCoilConfig()).label).toBe('-KF1');
    expect(ins(defaultCoilConfig('solenoid')).label).toBe('-MB1');
    expect(ins(defaultContactConfig('no', 'push')).label).toBe('-SJ1');
    expect(ins(defaultContactConfig('no', 'proximity')).label).toBe('-BG1');
    expect(ins(defaultLampConfig()).label).toBe('-PF1');
    expect(ins(defaultRailConfig()).label).toBe('');
    // Relaiskontakte gehören zum letzten Relais und bekommen die nächste freie Ordnungsziffer.
    let diagram = addComponent(d, 'electric.coil', { x: 0, y: 0 }, { config: defaultCoilConfig(), label: '-KF1' }).diagram;
    diagram = addComponent(diagram, 'electric.coil', { x: 100, y: 0 }, { config: defaultCoilConfig(), label: '-KF2' }).diagram;
    diagram = addComponent(diagram, 'electric.contact', { x: 200, y: 0 }, { config: defaultContactConfig(), label: '-KF2' }).diagram;
    const next = electricInsert(defaultContactConfig('nc'), [diagram]);
    expect(next.label).toBe('-KF2');
    expect(next.config).toMatchObject({ index: 2 });
    expect(electricInsert(defaultCoilConfig(), [diagram]).label).toBe('-KF3');
  });

  it('nimmt Schienen nicht ins Kennzeichen-Pflichtfeld und lässt Elektrik bei der ISO-1219-Nummerierung aus', () => {
    expect(needsLabel({ type: 'electric.rail' })).toBe(false);
    expect(needsLabel({ type: 'electric.coil' })).toBe(true);
    const { diagram } = addComponent(createDiagram(), 'electric.coil', { x: 0, y: 0 }, { config: defaultCoilConfig(), label: '-KF1' });
    expect(autoLabel(diagram).components[0]!.label).toBe('-KF1');
  });
});

/**
 * Selbsthaltung: Strompfad 1 Taster -SJ1 (Ein) und -SJ2 (Aus) vor der Spule
 * -KF1, Pfad 2 Selbsthaltekontakt, Pfad 3 Magnetspule -MB1, Pfad 4 Meldelampe.
 */
export function selfHoldingExample(): Diagram {
  let d = createDiagram('Selbsthaltung');
  d = { ...d, sheet: { ...d.sheet, format: 'A4', orientation: 'landscape' } };
  const area = drawingArea(d.sheet);
  const M = MODULE;
  const plus = defaultRailConfig('plus');
  const rail = railLayout(plus);
  const origin = { x: Math.round((area.x + 300) / M) * M, y: Math.round((area.y + 120) / M) * M };
  const pathX = (i: number) => origin.x + rail.taps[i]! * M;
  const yRail = origin.y + rail.lineY * M;
  const add = (type: string, config: ComponentConfig, at: Point, label = '') => {
    const r = addComponent(d, type, at, { config, label });
    d = r.diagram;
    return r.component.id;
  };
  const contactAt = (config: ReturnType<typeof defaultContactConfig>, path: number, y: number, label: string) =>
    add('electric.contact', config, { x: pathX(path) - contactLayout(config).axis * M, y: yRail + y * M }, label);
  const coilAt = (config: ElectricConfig, path: number, y: number, label: string) => add(typeOfConfig(config), config, { x: pathX(path) - 2 * M, y: yRail + y * M }, label);

  const top = add('electric.rail', plus, origin);
  const minus = defaultRailConfig('minus');
  const bottomY = yRail + 30 * M;
  const bottom = add('electric.rail', minus, { x: origin.x, y: bottomY });

  const sj1 = contactAt(defaultContactConfig('no', 'push'), 0, 4, '-SJ1');
  const sj2 = contactAt(defaultContactConfig('nc', 'push'), 0, 14, '-SJ2');
  const kf1 = coilAt(defaultCoilConfig('relay'), 0, 22, '-KF1');
  const hold = contactAt(defaultContactConfig('no'), 1, 4, '-KF1');
  const k2 = contactAt({ ...defaultContactConfig('no'), index: 2 }, 2, 4, '-KF1');
  const mb1 = coilAt(defaultCoilConfig('solenoid'), 2, 22, '-MB1');
  const k3 = contactAt({ ...defaultContactConfig('nc'), index: 3 }, 3, 4, '-KF1');
  const pf1 = coilAt({ ...defaultLampConfig(), color: 'GN' }, 3, 22, '-PF1');

  const wire = (a: string, ap: string, b: string, bp: string) => {
    d = connect(d, { componentId: a, portId: ap }, { componentId: b, portId: bp }).diagram;
    return d.connections[d.connections.length - 1]!.id;
  };
  wire(top, 't1', sj1, 'top');
  const line = wire(sj1, 'bottom', sj2, 'top');
  wire(sj2, 'bottom', kf1, 'A1');
  wire(kf1, 'A2', bottom, 't1');
  wire(top, 't2', hold, 'top');
  wire(top, 't3', k2, 'top');
  wire(k2, 'bottom', mb1, 'A1');
  wire(mb1, 'A2', bottom, 't3');
  wire(top, 't4', k3, 'top');
  wire(k3, 'bottom', pf1, 'X1');
  wire(pf1, 'X2', bottom, 't4');
  // Selbsthaltekontakt parallel zu -SJ1: Abzweig auf der Leitung zu -SJ2.
  const split = splitConnection(d, line, routeAll(d).get(line)!, { x: pathX(0), y: yRail + 11 * M });
  d = split.diagram;
  d = connect(d, { componentId: hold, portId: 'bottom' }, { junctionId: split.junction.id }).diagram;
  return d;
}

describe('Stromlaufplan', () => {
  it('Selbsthaltung: keine Fehler, Kontaktspiegel unter -KF1 mit den Strompfaden', () => {
    const d = selfHoldingExample();
    const errors = checkDiagram(d).filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
    expect(checkDiagram(d).filter((i) => /offen|Relaisspule/.test(i.message))).toEqual([]);
    const tables = contactTables(d, definitionOf, MODULE);
    expect(tables).toHaveLength(1);
    expect(tables[0]!.no).toEqual(['2', '3']);
    expect(tables[0]!.nc).toEqual(['4']);
    // Unter der 0-V-Schiene.
    const rail = d.components.find((c) => c.config?.kind === 'electric-rail' && c.config.polarity === 'minus')!;
    expect(tables[0]!.at.y).toBe(rail.position.y + MODULE);
  });

  it('meldet doppelte Kontaktanschlüsse und Relaiskontakte ohne Spule', () => {
    let d = createDiagram();
    d = addComponent(d, 'electric.contact', { x: 0, y: 0 }, { config: defaultContactConfig(), label: '-KF5' }).diagram;
    d = addComponent(d, 'electric.contact', { x: 100, y: 0 }, { config: defaultContactConfig(), label: '-KF5' }).diagram;
    const messages = checkDiagram(d).map((i) => i.message);
    expect(messages.some((m) => m.includes('Anschluss 13'))).toBe(true);
    expect(messages.some((m) => m.includes('keine Relaisspule -KF5'))).toBe(true);
    expect(messages.some((m) => m.includes('-mal vergeben'))).toBe(false);
  });

  it('übersteht Speichern und Laden', async () => {
    const drawing = drawingOf(selfHoldingExample());
    const parsed = parseDrawing(serializeDrawing(drawing));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.drawing.sheets[0]!.components).toEqual(drawing.sheets[0]!.components);
    // Beispieldatei für Screenshots: FLUIDPLAN_EXAMPLE=pfad npx vitest run electric
    const out = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FLUIDPLAN_EXAMPLE;
    if (out) {
      const fs = (await import(/* @vite-ignore */ 'node:fs' as string)) as { writeFileSync: (p: string, t: string) => void };
      fs.writeFileSync(out, serializeDrawing(drawing));
    }
  });
});
