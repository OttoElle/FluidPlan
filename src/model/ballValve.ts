import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbarer Kugelhahn nach DIN ISO 1219-1: Kugel als Kreis 3M (8.2.12,
 * Drei-Wege-Kugelhahn) mit der Bohrung als Linie, an jedem Anschluss ein
 * Absperrdreieck 2M lang und 1,5M breit (8.7.23, Absperrventil) mit der
 * Spitze an der Kugel. Anschlüsse 4M von der Kugelmitte, auf ganzen M.
 */

export type BallValveWays = 2 | 3 | 4;
export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface BallValveConfig {
  kind: 'ball-valve';
  ways: BallValveWays;
  /** Schaltstellung als Schlüssel aus `BORES[ways]`. */
  bore: string;
}

export interface Bore {
  name: string;
  /** Verbundene Anschlussseiten; jede Gruppe ist ein eigener Weg durch die Kugel. */
  paths: Side[][];
}

export const WAYS: readonly BallValveWays[] = [2, 3, 4];

export const BORES: Record<BallValveWays, Record<string, Bore>> = {
  2: {
    open: { name: 'Offen', paths: [['left', 'right']] },
    closed: { name: 'Geschlossen', paths: [['top', 'bottom']] },
  },
  3: {
    'left-bottom': { name: 'Links – unten (L)', paths: [['left', 'bottom']] },
    'right-bottom': { name: 'Rechts – unten (L)', paths: [['right', 'bottom']] },
    'left-right': { name: 'Links – rechts', paths: [['left', 'right']] },
    all: { name: 'Alle verbunden (T)', paths: [['left', 'right', 'bottom']] },
  },
  4: {
    'lt-rb': { name: 'Links – oben, rechts – unten', paths: [['left', 'top'], ['right', 'bottom']] },
    'lb-rt': { name: 'Links – unten, rechts – oben', paths: [['left', 'bottom'], ['right', 'top']] },
    'left-right': { name: 'Links – rechts', paths: [['left', 'right']] },
    'top-bottom': { name: 'Oben – unten', paths: [['top', 'bottom']] },
  },
};

/** Anschlüsse je Wegezahl mit Seite und Bezeichnung. */
export const SIDES: Record<BallValveWays, { side: Side; id: string }[]> = {
  2: [
    { side: 'left', id: '1' },
    { side: 'right', id: '2' },
  ],
  3: [
    { side: 'left', id: '1' },
    { side: 'right', id: '2' },
    { side: 'bottom', id: '3' },
  ],
  4: [
    { side: 'left', id: '1' },
    { side: 'right', id: '2' },
    { side: 'bottom', id: '3' },
    { side: 'top', id: '4' },
  ],
};

export function defaultBallValveConfig(ways: BallValveWays = 2): BallValveConfig {
  return { kind: 'ball-valve', ways, bore: Object.keys(BORES[ways])[0]! };
}

/** Behält die Schaltstellung, wenn es sie bei der neuen Wegezahl auch gibt. */
export function normalizeBallValve(config: BallValveConfig): BallValveConfig {
  return config.bore in BORES[config.ways] ? config : defaultBallValveConfig(config.ways);
}

export function ballValveTitle(config: BallValveConfig): string {
  return `${config.ways}-Wege-Kugelhahn`;
}

/** Kugelmitte und Abmessungen in M. */
export function ballValveLayout(ways: BallValveWays) {
  const center = { x: 4, y: ways === 4 ? 4 : 2 };
  const height = ways === 2 ? 4 : ways === 3 ? 6 : 8;
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
  const { center, width, height } = ballValveLayout(config.ways);
  const ports: PortDefinition[] = SIDES[config.ways].map(({ side, id }) => {
    const [dx, dy] = SIDE_DIR[side];
    return { id, kind: 'work', offset: { x: (center.x + dx * PORT_DISTANCE) * unit, y: (center.y + dy * PORT_DISTANCE) * unit } };
  });
  return { size: { width: width * unit, height: height * unit }, ports };
}

export function readBallValveConfig(v: unknown, path: string, errors: string[]): BallValveConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const ways = r.count('ways', WAYS);
  if (!r.ok) return undefined;
  const names = Object.fromEntries(Object.entries(BORES[ways]).map(([k, b]) => [k, b.name]));
  const bore = r.oneOf('bore', names);
  return r.ok ? { kind: 'ball-valve', ways, bore } : undefined;
}
