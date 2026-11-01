import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbarer Kugelhahn: Kugel als Kreis 3M (DIN ISO 1219-1, 8.2.12)
 * mit der Bohrung als Linie, an jedem Anschluss ein Dreieck des
 * Absperrventils (8.7.23). Stellungen wie in FluidDraw. Anschlüsse 4M von der
 * Kugelmitte, auf ganzen M.
 */

export type BallValveWays = 2 | 3 | 4;
export type Side = 'left' | 'right' | 'top' | 'bottom';
/** Anordnung der Anschlüsse: '2' gerade, '2a' Eck-Kugelhahn (links und unten), '3' links/rechts/unten, '4' alle Seiten. */
export type BallValveForm = '2' | '2a' | '3' | '4';

export interface BallValveConfig {
  kind: 'ball-valve';
  ways: BallValveWays;
  /** Nur 2 Wege: Anschlüsse über Eck; fehlt in älteren Dateien (dann gerade). */
  angle?: boolean;
  /** Schaltstellung als Schlüssel aus `BORES[form]`. */
  bore: string;
}

export interface Bore {
  name: string;
  /** Verbundene Anschlussseiten; jede Gruppe ist ein eigener Weg durch die Kugel. */
  paths: Side[][];
}

export const WAYS: readonly BallValveWays[] = [2, 3, 4];
export const FORMS: readonly BallValveForm[] = ['2', '2a', '3', '4'];
export const FORM_NAMES: Record<BallValveForm, string> = {
  '2': '2-Wege-Kugelhahn',
  '2a': '2-Wege-Kugelhahn, Eckform',
  '3': '3-Wege-Kugelhahn',
  '4': '4-Wege-Kugelhahn',
};

export const formOf = (c: Pick<BallValveConfig, 'ways' | 'angle'>): BallValveForm => (c.ways === 2 && c.angle ? '2a' : (String(c.ways) as BallValveForm));

const L = (a: Side, b: Side, name: string): Bore => ({ name, paths: [[a, b]] });
const T = (a: Side, b: Side, c: Side, name: string): Bore => ({ name, paths: [[a, b, c]] });

/**
 * Schaltstellungen wie in FluidDraw: gerade Bohrung, L-Bohrung in jedem
 * Viertel und T-Bohrung in jeder Richtung, soweit es bei der Anordnung Sinn hat.
 */
export const BORES: Record<BallValveForm, Record<string, Bore>> = {
  '2': {
    open: L('left', 'right', 'Offen'),
    closed: L('top', 'bottom', 'Geschlossen'),
  },
  '2a': {
    open: L('left', 'bottom', 'Offen (links – unten)'),
    closed: L('top', 'right', 'Geschlossen (oben – rechts)'),
    'left-top': L('left', 'top', 'Links – oben'),
    'right-bottom': L('right', 'bottom', 'Rechts – unten'),
  },
  '3': {
    'left-bottom': L('left', 'bottom', 'Links – unten (L)'),
    'right-bottom': L('right', 'bottom', 'Rechts – unten (L)'),
    'left-top': L('left', 'top', 'Links – oben (L)'),
    'right-top': L('right', 'top', 'Rechts – oben (L)'),
    all: T('left', 'right', 'bottom', 'Links – rechts – unten (T)'),
    'lr-top': T('left', 'right', 'top', 'Links – rechts – oben (T)'),
    'tb-right': T('top', 'bottom', 'right', 'Oben – unten – rechts (T)'),
    'tb-left': T('top', 'bottom', 'left', 'Oben – unten – links (T)'),
  },
  '4': {
    'left-bottom': L('left', 'bottom', 'Links – unten (L)'),
    'right-bottom': L('right', 'bottom', 'Rechts – unten (L)'),
    'left-top': L('left', 'top', 'Links – oben (L)'),
    'right-top': L('right', 'top', 'Rechts – oben (L)'),
    'left-right': L('left', 'right', 'Links – rechts'),
    'top-bottom': L('top', 'bottom', 'Oben – unten'),
    'lr-bottom': T('left', 'right', 'bottom', 'Links – rechts – unten (T)'),
    'lr-top': T('left', 'right', 'top', 'Links – rechts – oben (T)'),
    'tb-right': T('top', 'bottom', 'right', 'Oben – unten – rechts (T)'),
    'tb-left': T('top', 'bottom', 'left', 'Oben – unten – links (T)'),
  },
};

/** Anschlüsse je Anordnung mit Seite und Bezeichnung. */
export const SIDES: Record<BallValveForm, { side: Side; id: string }[]> = {
  '2': [
    { side: 'left', id: '1' },
    { side: 'right', id: '2' },
  ],
  '2a': [
    { side: 'left', id: '1' },
    { side: 'bottom', id: '2' },
  ],
  '3': [
    { side: 'left', id: '1' },
    { side: 'right', id: '2' },
    { side: 'bottom', id: '3' },
  ],
  '4': [
    { side: 'left', id: '1' },
    { side: 'right', id: '2' },
    { side: 'bottom', id: '3' },
    { side: 'top', id: '4' },
  ],
};

export function defaultBallValveConfig(ways: BallValveWays = 2, angle = false): BallValveConfig {
  const c: BallValveConfig = { kind: 'ball-valve', ways, bore: '' };
  if (ways === 2 && angle) c.angle = true;
  return { ...c, bore: Object.keys(BORES[formOf(c)])[0]! };
}

/** Behält die Schaltstellung, wenn es sie bei der neuen Anordnung auch gibt. */
export function normalizeBallValve(config: BallValveConfig): BallValveConfig {
  const angle = config.ways === 2 && config.angle === true;
  const { angle: _drop, ...rest } = config;
  const c: BallValveConfig = angle ? { ...rest, angle } : rest;
  return c.bore in BORES[formOf(c)] ? c : defaultBallValveConfig(c.ways, angle);
}

export function ballValveTitle(config: BallValveConfig): string {
  return FORM_NAMES[formOf(config)];
}

/** Kugelmitte und Abmessungen in M. */
export function ballValveLayout(form: BallValveForm) {
  const center = { x: 4, y: form === '4' ? 4 : 2 };
  const height = form === '2' ? 4 : form === '4' ? 8 : 6;
  return { center, width: 8, height };
}

/** Richtung einer Seite als Einheitsvektor. */
export const SIDE_DIR: Record<Side, readonly [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
};

/** Abstand der Anschlüsse von der Kugelmitte in M. */
export const PORT_DISTANCE = 4;

export function ballValveGeometry(config: BallValveConfig, unit: number) {
  const form = formOf(config);
  const { center, width, height } = ballValveLayout(form);
  const ports: PortDefinition[] = SIDES[form].map(({ side, id }) => {
    const [dx, dy] = SIDE_DIR[side];
    return { id, kind: 'work', offset: { x: (center.x + dx * PORT_DISTANCE) * unit, y: (center.y + dy * PORT_DISTANCE) * unit } };
  });
  return { size: { width: width * unit, height: height * unit }, ports };
}

export function readBallValveConfig(v: unknown, path: string, errors: string[]): BallValveConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const ways = r.count('ways', WAYS);
  const angle = ways === 2 && r.bool('angle', false);
  if (!r.ok) return undefined;
  const form = formOf({ ways, angle });
  const names = Object.fromEntries(Object.entries(BORES[form]).map(([k, b]) => [k, b.name]));
  // Stellungen, die es in FluidDraw nicht gibt, seit 2026-11 entfernt (Doppel-L, gerade beim 3-Wege): dann erste Stellung.
  const removed = (ways === 4 && (r.v.bore === 'lt-rb' || r.v.bore === 'lb-rt')) || (ways === 3 && r.v.bore === 'left-right');
  const bore = removed ? Object.keys(names)[0]! : r.oneOf('bore', names);
  return r.ok ? normalizeBallValve({ kind: 'ball-valve', ways, angle, bore }) : undefined;
}
