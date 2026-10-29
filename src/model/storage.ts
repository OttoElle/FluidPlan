import { configReader } from './configRead.ts';
import type { Domain, PortDefinition } from './types.ts';

/**
 * Konfigurierbare Speicher und Behälter nach DIN ISO 1219-1.
 *
 * Speicher (8.7.34, Beispiele 6.4.6): Behälter 4M × 8M mit Halbkreisen oben
 * und unten, Anschluss unten mit 2M langer Leitung. Membran als waagerechte
 * Linie, Blase als Bogen r = 2,5M (8.2.8), Kolben als zwei Linien 2M
 * auseinander; das Gas zeigt ein hohles Dreieck. Der Luftbehälter (7.4.5.1)
 * liegt waagerecht mit Anschlüssen links und rechts.
 *
 * Behälter (8.7.32/33): offen 2M hoch, Rückführungen 2M voneinander und von
 * der Wand, also immer mittig. Endet die Leitung unter dem Flüssigkeitsspiegel,
 * reicht sie bis 1M über den Boden, sonst endet sie am Behälterrand. Die
 * kleine Form (wie in Schaltplänen üblich, wenn mehrere Tanksymbole an
 * verschiedenen Stellen stehen) ist 1M hoch mit Leitungen 1M von der Wand.
 */

export type AccumulatorType = 'bladder' | 'diaphragm' | 'piston' | 'gas-bottle' | 'air-reservoir';

export interface AccumulatorConfig {
  kind: 'accumulator';
  type: AccumulatorType;
}

export const ACCUMULATOR_NAMES: Record<AccumulatorType, string> = {
  bladder: 'Blasenspeicher',
  diaphragm: 'Membranspeicher',
  piston: 'Kolbenspeicher',
  'gas-bottle': 'Gasflasche',
  'air-reservoir': 'Luftbehälter',
};

/** Welche Speicherarten es je Medium gibt. */
export const ACCUMULATOR_TYPES: Record<Domain, readonly AccumulatorType[]> = {
  hydraulic: ['bladder', 'diaphragm', 'piston', 'gas-bottle'],
  pneumatic: ['air-reservoir', 'gas-bottle'],
};

export function defaultAccumulatorConfig(domain: Domain): AccumulatorConfig {
  return { kind: 'accumulator', type: ACCUMULATOR_TYPES[domain][0]! };
}

export const accumulatorTitle = (config: AccumulatorConfig) => ACCUMULATOR_NAMES[config.type];

export function accumulatorGeometry(config: AccumulatorConfig, unit: number) {
  if (config.type === 'air-reservoir') {
    const ports: PortDefinition[] = [
      { id: '1', kind: 'work', offset: { x: 0, y: 2 * unit } },
      { id: '2', kind: 'work', offset: { x: 12 * unit, y: 2 * unit } },
    ];
    return { size: { width: 12 * unit, height: 4 * unit }, ports };
  }
  const ports: PortDefinition[] = [{ id: 'P', kind: 'work', offset: { x: 2 * unit, y: 10 * unit } }];
  return { size: { width: 4 * unit, height: 10 * unit }, ports };
}

export function readAccumulatorConfig(v: unknown, path: string, errors: string[]): AccumulatorConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const type = r.oneOf('type', ACCUMULATOR_NAMES);
  return r.ok ? { kind: 'accumulator', type } : undefined;
}

// --- Behälter -------------------------------------------------------------------

export type LineEnd = 'below' | 'above';
export type TankLines = 1 | 2 | 3;
export type TankSize = 'normal' | 'small';

export interface TankConfig {
  kind: 'tank';
  /** Geschlossener Behälter (mit Deckel). */
  closed: boolean;
  /** Anzahl der Rückführungen. */
  lines: TankLines;
  /** Leitung endet unter oder über dem Flüssigkeitsspiegel. */
  lineEnd: LineEnd;
  /** Größe; fehlt in älteren Dateien (dann normal). */
  size: TankSize;
}

export const TANK_SIZE_NAMES: Record<TankSize, string> = { normal: 'Normal', small: 'Klein' };

export const LINE_END_NAMES: Record<LineEnd, string> = {
  below: 'Unter dem Flüssigkeitsspiegel',
  above: 'Über dem Flüssigkeitsspiegel',
};
export const TANK_LINES: readonly TankLines[] = [1, 2, 3];

export function defaultTankConfig(): TankConfig {
  return { kind: 'tank', closed: false, lines: 1, lineEnd: 'below', size: 'normal' };
}

export function tankTitle(config: TankConfig): string {
  return config.closed ? 'Behälter, geschlossen' : 'Tank';
}

/** Maße in M: Wandabstand der ersten Leitung, Behälterhöhe, Leitungslänge über dem Behälter. */
export function tankLayout(config: TankConfig) {
  const small = config.size === 'small';
  const margin = small ? 1 : 2;
  const depth = small ? 1 : 2;
  const line = small ? 1 : 2;
  return {
    margin,
    depth,
    line,
    width: 2 * margin + 2 * (config.lines - 1),
    height: depth + line,
    /** Ende der Rückführung: unter dem Spiegel bis zur halben Tiefe, sonst am Rand. */
    end: config.lineEnd === 'below' ? line + depth / 2 : line,
  };
}

export function tankGeometry(config: TankConfig, unit: number) {
  const l = tankLayout(config);
  const ports: PortDefinition[] = [];
  for (let i = 0; i < config.lines; i++) {
    ports.push({ id: i === 0 ? 'T' : `T${i + 1}`, kind: 'return', offset: { x: (l.margin + 2 * i) * unit, y: 0 } });
  }
  return { size: { width: l.width * unit, height: l.height * unit }, ports };
}

export function readTankConfig(v: unknown, path: string, errors: string[]): TankConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: TankConfig = {
    kind: 'tank',
    closed: r.bool('closed'),
    lines: r.count('lines', TANK_LINES),
    lineEnd: r.oneOf('lineEnd', LINE_END_NAMES),
    size: r.oneOf('size', TANK_SIZE_NAMES, 'normal'),
  };
  return r.ok ? config : undefined;
}
