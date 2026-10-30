import type { Domain, PortDefinition, PortKind } from './types.ts';
import { isObject, type Obj } from './configRead.ts';

/**
 * Konfigurierbares Wegeventil nach DIN ISO 1219-1.
 *
 * Statt für jede Kombination ein eigenes Symbol zu haben, beschreibt die
 * Konfiguration das Ventil aus Grundelementen:
 *   - Anzahl Anschlüsse (2 bis 5) und Schaltstellungen (2 bis 4), also "X/Y",
 *   - je Schaltstellung die Durchflusswege zwischen den Anschlüssen,
 *   - welche Stellung die Ruhestellung ist (an ihr liegen die Anschlüsse),
 *   - die Betätigungen links und rechts, von innen nach außen gestapelt.
 *
 * Anschlüsse heißen intern immer nach ISO 1219 (P, T, A, B, R, S, X, Y).
 * In der Pneumatik werden sie nach ISO 5599 angezeigt (1, 3, 2, 4, 3, 5, 14, 12).
 * So bleiben Leitungen und Wege gültig, egal wie die Anschlüsse heißen.
 *
 * Geometrie im Modul M nach DIN ISO 1219-1: Jedes Schaltfeld ist 4M × 4M und
 * liegt zwischen y = 2 und y = 6, die Anschlussleitungen sind 2M lang
 * (Gesamthöhe 8M). Anschlüsse liegen 1M bzw. 3M vom Feldrand entfernt.
 *
 * Betätigungen (Abschnitt 9.2 der Norm): Die Mittellinie des ersten Elements
 * liegt 1M über der Feld-Unterkante, parallel wirkende Elemente folgen im
 * Abstand 2M darüber, von unten nach oben in der Reihenfolge
 * Druck (hydraulisch/pneumatisch), Magnet, Feder, Handbetätigung.
 * Liegt ein Element über der Feld-Oberkante, wird eine Verbindungslinie
 * hochgezogen. Die Seitenbreite wird auf ungerade M aufgerundet, damit alle
 * Anschlüsse auf dem 2M-Raster liegen (Abschnitt 9.2.12).
 */

export type ValveRole = 'P' | 'T' | 'A' | 'B' | 'R' | 'S';
export type PilotRole = 'X' | 'Y';

export type Actuator =
  | 'push'
  | 'pull'
  | 'push-pull'
  | 'override'
  | 'lever'
  | 'pedal'
  | 'treadle'
  | 'plunger'
  | 'roller'
  | 'roller-lever'
  | 'detent'
  | 'spring'
  | 'solenoid'
  | 'solenoid-pilot'
  | 'pilot';

export const ACTUATOR_NAMES: Record<Actuator, string> = {
  push: 'Drücken',
  pull: 'Ziehen',
  'push-pull': 'Drücken und Ziehen',
  override: 'Handhilfsbetätigung',
  lever: 'Hebel',
  pedal: 'Pedal',
  treadle: 'Wippe',
  plunger: 'Stößel',
  roller: 'Rolle',
  'roller-lever': 'Rollenhebel',
  detent: 'Raste',
  spring: 'Feder',
  solenoid: 'Elektromagnet',
  'solenoid-pilot': 'Elektromagnet, vorgesteuert',
  pilot: 'Steuerdruck (Anschluss)',
};

/** Breite der Betätigungselemente in M, gemessen ab dem Schaltfeld. */
export const ACTUATOR_WIDTH: Record<Actuator, number> = {
  push: 3,
  pull: 3.75,
  'push-pull': 3.75,
  override: 3,
  lever: 3.9,
  pedal: 3.8,
  treadle: 3.8,
  plunger: 3.5,
  roller: 3.75,
  'roller-lever': 6.75,
  detent: 3,
  spring: 2.5,
  solenoid: 3,
  'solenoid-pilot': 6,
  pilot: 4,
};

/** Reihenfolge von unten nach oben nach DIN ISO 1219-1, 9.2.9. */
const ACTUATOR_ORDER: Record<Actuator, number> = {
  pilot: 0,
  solenoid: 1,
  'solenoid-pilot': 1,
  spring: 2,
  push: 3,
  pull: 3,
  'push-pull': 3,
  override: 3,
  lever: 3,
  pedal: 3,
  treadle: 3,
  plunger: 3,
  roller: 3,
  'roller-lever': 3,
  detent: 3,
};

/**
 * Betätigungen früherer Stände, die es in DIN ISO 1219-1:2019 nicht mehr gibt
 * („Muskelkraft allgemein“, „Druckknopf“); beim Laden wird daraus „Drücken“ (8.5.10).
 */
export const LEGACY_ACTUATORS: Record<string, Actuator> = { manual: 'push', pushbutton: 'push' };

export const upgradeActuator = (a: unknown): unknown => (typeof a === 'string' && a in LEGACY_ACTUATORS ? LEGACY_ACTUATORS[a] : a);

/** Höchstens so viele Betätigungen je Seite (darüber wird das Symbol unübersichtlich). */
export const MAX_ACTUATORS = 3;

export const ACTUATORS = Object.keys(ACTUATOR_NAMES) as Actuator[];

/**
 * Durchflussweg in einer Schaltstellung.
 * flow = Pfeil von `from` nach `to`, both = Pfeile in beide Richtungen,
 * open = verbunden ohne Richtungsangabe (z. B. Umlauf in der Mittelstellung).
 */
export type PathKind = 'flow' | 'both' | 'open';

export interface ValvePath {
  from: ValveRole;
  to: ValveRole;
  kind: PathKind;
}

export interface ValvePosition {
  paths: ValvePath[];
}

export interface DirectionalValveConfig {
  kind: 'directional-valve';
  medium: Domain;
  ports: 2 | 3 | 4 | 5;
  /** Schaltstellungen von links nach rechts. */
  positions: ValvePosition[];
  /** Index der Ruhestellung in `positions`. */
  rest: number;
  /** Betätigungen links, von unten nach oben (parallel wirkend). */
  left: Actuator[];
  /** Betätigungen rechts, von unten nach oben. */
  right: Actuator[];
}

export const PORT_COUNTS = [2, 3, 4, 5] as const;
export const POSITION_COUNTS = [2, 3, 4] as const;

/** Höhe eines Schaltfelds; die Breite ist 4M, bei fünf Anschlüssen 6M (Beispiele 6.2 der Norm). */
export const FIELD = 4;
export const fieldWidth = (ports: DirectionalValveConfig['ports']) => (ports === 5 ? 6 : 4);
/** Oberkante der Schaltfelder; die Unterkante liegt bei FIELD_TOP + FIELD. */
export const FIELD_TOP = 2;
const HEIGHT = 8;
/** Mittellinie der n-ten Betätigung (von unten gezählt). */
export const actuatorRowY = (row: number) => FIELD_TOP + FIELD - 1 - 2 * row;

/** Lage der Anschlüsse im Schaltfeld (x in M vom linken Feldrand), nach den Beispielen der Norm. */
const LAYOUT: Record<DirectionalValveConfig['ports'], { top: [ValveRole, number][]; bottom: [ValveRole, number][] }> = {
  2: { top: [['A', 1]], bottom: [['P', 1]] },
  3: { top: [['A', 1]], bottom: [['P', 1], ['T', 3]] },
  4: { top: [['A', 1], ['B', 3]], bottom: [['P', 1], ['T', 3]] },
  5: { top: [['A', 1], ['B', 5]], bottom: [['R', 1], ['P', 3], ['S', 5]] },
};

const ROLE_KIND: Record<ValveRole | PilotRole, PortKind> = {
  P: 'pressure',
  T: 'return',
  R: 'return',
  S: 'return',
  A: 'work',
  B: 'work',
  X: 'pilot',
  Y: 'pilot',
};

const ISO5599: Record<ValveRole | PilotRole, string> = {
  P: '1',
  A: '2',
  B: '4',
  T: '3',
  R: '3',
  S: '5',
  X: '14',
  Y: '12',
};

export function rolesOf(ports: DirectionalValveConfig['ports']): ValveRole[] {
  const { top, bottom } = LAYOUT[ports];
  return [...top, ...bottom].map(([role]) => role);
}

/** Angezeigter Name eines Anschlusses. */
export function portLabel(config: Pick<DirectionalValveConfig, 'medium'>, role: ValveRole | PilotRole): string {
  return config.medium === 'pneumatic' ? ISO5599[role] : role;
}

/** Lage eines Anschlusses im Schaltfeld: x relativ zum Feld, oben oder unten. */
export function portInField(ports: DirectionalValveConfig['ports'], role: ValveRole): { x: number; top: boolean } {
  const { top, bottom } = LAYOUT[ports];
  const t = top.find(([r]) => r === role);
  if (t) return { x: t[1], top: true };
  const b = bottom.find(([r]) => r === role)!;
  return { x: b[1], top: false };
}

/** Bezeichnung der Schaltstellungen nach ISO: a, b, … bzw. a, 0, b. */
export function positionNames(count: number): string[] {
  if (count === 3) return ['a', '0', 'b'];
  return ['a', 'b', 'c', 'd'].slice(0, count);
}

/** "4/3-Wegeventil" */
export function valveTitle(config: DirectionalValveConfig): string {
  return `${config.ports}/${config.positions.length}-Wegeventil`;
}

// --- Geometrie --------------------------------------------------------------

export interface ValveLayout {
  /** Breite der Betätigungen links bzw. rechts in M. */
  leftWidth: number;
  rightWidth: number;
  /** Linker Rand des ersten Schaltfelds. */
  fieldsX: number;
  fieldWidth: number;
  width: number;
  height: number;
}

/** Auf die nächste ungerade ganze Zahl aufrunden (mindestens 1). */
const oddCeil = (v: number) => {
  const n = Math.max(1, Math.ceil(v - 1e-9));
  return n % 2 === 1 ? n : n + 1;
};

function sideWidth(list: Actuator[]): number {
  return oddCeil(Math.max(0, ...list.map((a) => ACTUATOR_WIDTH[a])));
}

export function valveLayout(config: DirectionalValveConfig): ValveLayout {
  const leftWidth = sideWidth(config.left);
  const rightWidth = sideWidth(config.right);
  return {
    leftWidth,
    rightWidth,
    fieldsX: leftWidth,
    fieldWidth: fieldWidth(config.ports),
    width: leftWidth + config.positions.length * fieldWidth(config.ports) + rightWidth,
    height: HEIGHT,
  };
}

/** Abmessungen und Anschlüsse in Einheiten (M = 10). */
export function valveGeometry(config: DirectionalValveConfig, unit: number) {
  const layout = valveLayout(config);
  const restX = layout.fieldsX + config.rest * layout.fieldWidth;
  const ports: PortDefinition[] = rolesOf(config.ports).map((role) => {
    const { x, top } = portInField(config.ports, role);
    return port(config, role, { x: (restX + x) * unit, y: top ? 0 : HEIGHT * unit });
  });
  // Der Steuerdruck ist nach der Reihenfolge immer das unterste Element.
  if (config.left.includes('pilot')) ports.push(port(config, 'X', { x: 0, y: actuatorRowY(0) * unit }));
  if (config.right.includes('pilot')) ports.push(port(config, 'Y', { x: layout.width * unit, y: actuatorRowY(0) * unit }));
  // Elektrohydraulische Vorsteuerung mit externer Steuerölversorgung (6.1.1.14): Anschluss
  // unter der Grundseite des Steuerdreiecks, 3M vom Feld, an der Symbol-Unterkante.
  if (config.medium === 'hydraulic') {
    const rightEdge = layout.fieldsX + config.positions.length * layout.fieldWidth;
    if (config.left[0] === 'solenoid-pilot') ports.push(port(config, 'X', { x: (layout.fieldsX - 3) * unit, y: HEIGHT * unit }));
    if (config.right[0] === 'solenoid-pilot') ports.push(port(config, 'Y', { x: (rightEdge + 3) * unit, y: HEIGHT * unit }));
  }
  return { size: { width: layout.width * unit, height: layout.height * unit }, ports };
}

function port(config: DirectionalValveConfig, role: ValveRole | PilotRole, offset: { x: number; y: number }): PortDefinition {
  const label = portLabel(config, role);
  return { id: role, kind: ROLE_KIND[role], offset, ...(label !== role ? { label } : {}) };
}

// --- Vorlagen ---------------------------------------------------------------

const flow = (from: ValveRole, to: ValveRole): ValvePath => ({ from, to, kind: 'flow' });
const open = (from: ValveRole, to: ValveRole): ValvePath => ({ from, to, kind: 'open' });

export interface PositionTemplate {
  name: string;
  paths: ValvePath[];
}

/** Übliche Schaltstellungen je Anschlusszahl, zur Auswahl im Konfigurator. */
export function positionTemplates(ports: DirectionalValveConfig['ports']): PositionTemplate[] {
  const closed = { name: 'Alle gesperrt', paths: [] };
  switch (ports) {
    case 2:
      return [{ name: 'Durchfluss P → A', paths: [flow('P', 'A')] }, closed];
    case 3:
      return [
        { name: 'P → A, T gesperrt', paths: [flow('P', 'A')] },
        { name: 'A → T, P gesperrt', paths: [flow('A', 'T')] },
        closed,
      ];
    case 4:
      return [
        { name: 'P → A, B → T', paths: [flow('P', 'A'), flow('B', 'T')] },
        { name: 'P → B, A → T', paths: [flow('P', 'B'), flow('A', 'T')] },
        closed,
        { name: 'Umlauf (P → T, A/B gesperrt)', paths: [open('P', 'T')] },
        { name: 'Schwimmstellung (A, B → T)', paths: [open('A', 'T'), open('B', 'T')] },
        { name: 'Alle verbunden', paths: [open('P', 'T'), open('A', 'T'), open('B', 'T')] },
      ];
    case 5:
      return [
        { name: 'P → A, B → S', paths: [flow('P', 'A'), flow('B', 'S')] },
        { name: 'P → B, A → R', paths: [flow('P', 'B'), flow('A', 'R')] },
        closed,
        { name: 'Entlüftet (A → R, B → S)', paths: [flow('A', 'R'), flow('B', 'S')] },
        { name: 'Belüftet (P → A, P → B)', paths: [flow('P', 'A'), flow('P', 'B')] },
      ];
  }
}

function positionsFor(ports: DirectionalValveConfig['ports'], count: number): ValvePosition[] {
  const t = positionTemplates(ports);
  const closed = t.find((x) => x.paths.length === 0)!;
  const pick = (i: number) => ({ paths: t[i]!.paths.map((p) => ({ ...p })) });
  if (ports === 2 || ports === 3) {
    const active = pick(0);
    const restPos = ports === 2 ? { paths: [] } : pick(1);
    return count === 2 ? [active, restPos] : [active, ...Array.from({ length: count - 2 }, () => ({ paths: [...closed.paths] })), restPos];
  }
  if (count === 2) return [pick(0), pick(1)];
  return [pick(0), ...Array.from({ length: count - 2 }, () => ({ paths: [] })), pick(1)];
}

/** Ruhestellung: bei drei Stellungen die Mitte, sonst die rechte Stellung. */
function defaultRest(count: number): number {
  return count === 3 ? 1 : count - 1;
}

export function defaultValveConfig(
  medium: Domain,
  ports: DirectionalValveConfig['ports'] = 4,
  positions = 2,
): DirectionalValveConfig {
  const three = positions === 3;
  return {
    kind: 'directional-valve',
    medium,
    ports,
    positions: positionsFor(ports, positions),
    rest: defaultRest(positions),
    left: three ? ['solenoid', 'spring'] : ['solenoid'],
    right: three ? ['solenoid', 'spring'] : ['spring'],
  };
}

/**
 * Ändert Anschluss- oder Stellungszahl. Wege, deren Anschlüsse es nicht mehr
 * gibt, entfallen; neue Stellungen kommen als übliche Vorlage hinzu.
 */
export function resizeValve(
  config: DirectionalValveConfig,
  ports: DirectionalValveConfig['ports'],
  positions: number,
): DirectionalValveConfig {
  if (ports !== config.ports) {
    // Bei anderer Anschlusszahl passen die alten Wege selten: übliche Belegung neu setzen.
    const fresh = positionsFor(ports, positions);
    return normalizeValve({ ...config, ports, positions: fresh, rest: defaultRest(positions) });
  }
  if (positions === config.positions.length) return config;
  const fresh = positionsFor(ports, positions);
  const kept = positions > config.positions.length
    ? [...config.positions.slice(0, -1), ...fresh.slice(config.positions.length - 1, -1), config.positions.at(-1)!]
    : [...config.positions.slice(0, positions - 1), config.positions.at(-1)!];
  return normalizeValve({ ...config, positions: kept, rest: defaultRest(positions) });
}

/**
 * Bringt eine Konfiguration in gültige Form: Wege nur zwischen vorhandenen,
 * verschiedenen Anschlüssen, Ruhestellung im Bereich, Betätigungen ohne
 * Doppel in Norm-Reihenfolge und höchstens MAX_ACTUATORS je Seite.
 */
export function normalizeValve(config: DirectionalValveConfig): DirectionalValveConfig {
  const roles = new Set(rolesOf(config.ports));
  const positions = config.positions.map((pos) => ({
    paths: pos.paths.filter((p) => roles.has(p.from) && roles.has(p.to) && p.from !== p.to),
  }));
  const side = (list: Actuator[]) =>
    [...new Set(list)].sort((a, b) => ACTUATOR_ORDER[a] - ACTUATOR_ORDER[b]).slice(0, MAX_ACTUATORS);
  return {
    ...config,
    positions,
    rest: Math.min(Math.max(0, Math.round(config.rest)), positions.length - 1),
    left: side(config.left),
    right: side(config.right),
  };
}

// --- Einlesen aus Dateien -----------------------------------------------------

const ROLES: readonly ValveRole[] = ['P', 'T', 'A', 'B', 'R', 'S'];
const PATH_KINDS: readonly PathKind[] = ['flow', 'both', 'open'];
const DOMAINS: readonly Domain[] = ['hydraulic', 'pneumatic'];


/** Prüft eine Konfiguration aus einer Datei; Fehler landen mit Pfad in `errors`. */
export function readValveConfig(v: unknown, path: string, errors: string[]): DirectionalValveConfig | undefined {
  const before = errors.length;
  const fail = (msg: string) => errors.push(`${path}${msg}`);
  const upgrade = (list: unknown) => (Array.isArray(list) ? list.map(upgradeActuator) : list);
  if (isObject(v)) v = { ...v, left: upgrade(v.left), right: upgrade(v.right) };
  if (!isObject(v)) {
    fail(': Objekt erwartet');
    return undefined;
  }
  if (!DOMAINS.includes(v.medium as Domain)) fail('.medium: "hydraulic" oder "pneumatic" erwartet');
  if (!PORT_COUNTS.includes(v.ports as 2)) fail('.ports: 2, 3, 4 oder 5 erwartet');
  if (!Array.isArray(v.positions) || !POSITION_COUNTS.includes(v.positions.length as 2)) {
    fail('.positions: Liste mit 2 bis 4 Schaltstellungen erwartet');
  } else {
    v.positions.forEach((pos, i) => {
      if (!isObject(pos) || !Array.isArray(pos.paths)) return fail(`.positions[${i}]: Objekt mit "paths" erwartet`);
      pos.paths.forEach((p, j) => {
        if (!isObject(p) || !ROLES.includes(p.from as ValveRole) || !ROLES.includes(p.to as ValveRole) || !PATH_KINDS.includes(p.kind as PathKind)) {
          fail(`.positions[${i}].paths[${j}]: Weg {from, to, kind} erwartet`);
        }
      });
    });
  }
  if (!Number.isInteger(v.rest)) fail('.rest: Ganzzahl erwartet');
  for (const key of ['left', 'right'] as const) {
    const list = v[key];
    if (!Array.isArray(list) || !list.every((a) => ACTUATORS.includes(a as Actuator))) {
      fail(`.${key}: Liste von Betätigungen erwartet`);
    }
  }
  if (errors.length > before) return undefined;
  return normalizeValve({
    kind: 'directional-valve',
    medium: v.medium as Domain,
    ports: v.ports as DirectionalValveConfig['ports'],
    positions: (v.positions as Obj[]).map((pos) => ({
      paths: (pos.paths as Obj[]).map((p) => ({ from: p.from as ValveRole, to: p.to as ValveRole, kind: p.kind as PathKind })),
    })),
    rest: v.rest as number,
    left: [...(v.left as Actuator[])],
    right: [...(v.right as Actuator[])],
  });
}
