import { configReader } from './configRead.ts';
import type { PortDefinition, PortKind } from './types.ts';

/**
 * Konfigurierbare Sperr-, Strom- und Druckventile nach DIN ISO 1219-1:2019.
 * Maße in M; die Zeichnungen stehen in ui/valveSymbols.tsx.
 */

type PortSpec = [id: string, kind: PortKind, x: number, y: number, label?: string];

function geometry(width: number, height: number, ports: PortSpec[], unit: number) {
  return {
    size: { width: width * unit, height: height * unit },
    ports: ports.map(([id, kind, x, y, label]): PortDefinition => ({
      id,
      kind,
      offset: { x: x * unit, y: y * unit },
      ...(label ? { label } : {}),
    })),
  };
}

// --- Rückschlagventil (6.1.5.1–6.1.5.4) ----------------------------------------------

export interface CheckValveConfig {
  kind: 'check-valve';
  /** Doppelrückschlagventil, entsperrbar (6.1.5.4); dann gelten Feder und Entsperrung nicht. */
  double: boolean;
  /** Mit Feder (6.1.5.2). */
  spring: boolean;
  /** Entsperrbar über Steueranschluss X (6.1.5.3). */
  piloted: boolean;
}

export function defaultCheckValveConfig(): CheckValveConfig {
  return { kind: 'check-valve', double: false, spring: false, piloted: false };
}

export function checkValveTitle(c: CheckValveConfig): string {
  if (c.double) return 'Doppelrückschlagventil, entsperrbar';
  const parts = ['Rückschlagventil'];
  if (c.spring) parts.push('mit Feder');
  if (c.piloted) parts.push('entsperrbar');
  return parts.join(', ');
}

export function checkValveGeometry(c: CheckValveConfig, unit: number) {
  if (c.double) {
    return geometry(8, 10, [
      ['A1', 'work', 2, 10],
      ['A2', 'work', 2, 0],
      ['B1', 'work', 6, 10],
      ['B2', 'work', 6, 0],
    ], unit);
  }
  if (c.piloted) return geometry(6, 10, [['1', 'work', 2, 10], ['2', 'work', 2, 0], ['X', 'pilot', 4, 10]], unit);
  return geometry(2, c.spring ? 8 : 6, [['1', 'work', 1, c.spring ? 8 : 6], ['2', 'work', 1, 0]], unit);
}

export function readCheckValveConfig(v: unknown, path: string, errors: string[]): CheckValveConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: CheckValveConfig = { kind: 'check-valve', double: r.bool('double'), spring: r.bool('spring'), piloted: r.bool('piloted') };
  return r.ok ? config : undefined;
}

// --- Druckventile (6.1.3) ---------------------------------------------------------

export type PressureFunction = 'relief' | 'reducing' | 'sequence';

export const PRESSURE_FUNCTION_NAMES: Record<PressureFunction, string> = {
  relief: 'Druckbegrenzungsventil',
  reducing: 'Druckreduzierventil',
  sequence: 'Folgeventil',
};

export interface PressureValveConfig {
  kind: 'pressure-valve';
  function: PressureFunction;
  /** Feder mit Verstellpfeil (einstellbar) oder ohne (fest eingestellt). */
  adjustable: boolean;
  /** Vorgesteuert (6.1.3.5): hydraulische Vorsteuerstufe vor der Feder. */
  piloted: boolean;
}

export function defaultPressureValveConfig(fn: PressureFunction = 'relief'): PressureValveConfig {
  return { kind: 'pressure-valve', function: fn, adjustable: true, piloted: false };
}

export function pressureValveTitle(c: PressureValveConfig): string {
  return [
    PRESSURE_FUNCTION_NAMES[c.function],
    c.piloted ? 'vorgesteuert' : 'direktgesteuert',
    c.adjustable ? 'einstellbar' : 'fest eingestellt',
  ].join(', ');
}

/**
 * Lage der Feder: Ventilfeld 4M von (2, 2) bis (6, 6); bei Vorsteuerung sitzt
 * zwischen Feld und Feder die Vorsteuerstufe, ein Kasten 2M × 2M mit gefülltem
 * Dreieck (6.1.3.5). Leckölanschluss L 2M rechts vom Federanfang.
 */
export const pressureSpringX = (c: Pick<PressureValveConfig, 'piloted'>) => (c.piloted ? 8 : 6);
export const hasDrain = (c: Pick<PressureValveConfig, 'function'>) => c.function !== 'relief';

export function pressureValveGeometry(c: PressureValveConfig, unit: number) {
  const sx = pressureSpringX(c);
  const width = c.piloted ? 12 : 10;
  const ports: PortSpec[] =
    c.function === 'relief'
      ? [['P', 'pressure', 4, 8], ['T', 'return', 4, 0]]
      : [['P', 'pressure', 4, 8], ['A', 'work', 4, 0], ['L', 'drain', sx + 2, 8]];
  return geometry(width, 8, ports, unit);
}

export function readPressureValveConfig(v: unknown, path: string, errors: string[]): PressureValveConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: PressureValveConfig = {
    kind: 'pressure-valve',
    function: r.oneOf('function', PRESSURE_FUNCTION_NAMES),
    adjustable: r.bool('adjustable'),
    piloted: r.bool('piloted'),
  };
  return r.ok ? config : undefined;
}

// --- Drosselventil (6.1.4.1, 6.1.4.2) -----------------------------------------------

export type ThrottleElement = 'throttle' | 'orifice';

export const THROTTLE_ELEMENT_NAMES: Record<ThrottleElement, string> = {
  throttle: 'Drossel',
  orifice: 'Blende',
};

export interface ThrottleConfig {
  kind: 'throttle';
  /** Drossel (8.4.57, viskositätsabhängig) oder Blende (8.4.59, scharfkantig). */
  element: ThrottleElement;
  adjustable: boolean;
  /** Mit Umgehungs-Rückschlagventil (Drosselrückschlagventil, 6.1.4.2). */
  check: boolean;
}

export function defaultThrottleConfig(): ThrottleConfig {
  return { kind: 'throttle', element: 'throttle', adjustable: true, check: false };
}

export function throttleTitle(c: ThrottleConfig): string {
  const base = c.element === 'throttle' ? (c.check ? 'Drosselrückschlagventil' : 'Drosselventil') : c.check ? 'Blende mit Rückschlagventil' : 'Blende';
  return `${base}, ${c.adjustable ? 'einstellbar' : 'fest'}`;
}

export function throttleGeometry(c: ThrottleConfig, unit: number) {
  return c.check
    ? geometry(8, 12, [['1', 'work', 2, 12], ['2', 'work', 2, 0]], unit)
    : geometry(4, 8, [['1', 'work', 2, 8], ['2', 'work', 2, 0]], unit);
}

export function readThrottleConfig(v: unknown, path: string, errors: string[]): ThrottleConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ThrottleConfig = {
    kind: 'throttle',
    element: r.oneOf('element', THROTTLE_ELEMENT_NAMES),
    adjustable: r.bool('adjustable'),
    check: r.bool('check'),
  };
  return r.ok ? config : undefined;
}

// --- Stromteilerventil (6.1.4.6, 6.1.4.7) -------------------------------------------

export type FlowDividerMode = 'divide' | 'combine';

export const FLOW_DIVIDER_NAMES: Record<FlowDividerMode, string> = {
  divide: 'Volumenstromteiler',
  combine: 'Volumenstromsummierer',
};

export interface FlowDividerConfig {
  kind: 'flow-divider';
  mode: FlowDividerMode;
}

export function defaultFlowDividerConfig(): FlowDividerConfig {
  return { kind: 'flow-divider', mode: 'divide' };
}

export const flowDividerTitle = (c: FlowDividerConfig) => FLOW_DIVIDER_NAMES[c.mode];

/**
 * Rahmen 12M × 8M von y = 2 bis 10; A und B 4M auseinander bei x = 4 und 8,
 * P in der Mitte, damit alle Anschlüsse auf dem 2M-Raster liegen (9.2.12).
 */
export function flowDividerGeometry(c: FlowDividerConfig, unit: number) {
  return c.mode === 'divide'
    ? geometry(12, 12, [['P', 'work', 6, 12], ['A', 'work', 4, 0], ['B', 'work', 8, 0]], unit)
    : geometry(12, 12, [['P', 'work', 6, 0], ['A', 'work', 4, 12], ['B', 'work', 8, 12]], unit);
}

export function readFlowDividerConfig(v: unknown, path: string, errors: string[]): FlowDividerConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: FlowDividerConfig = { kind: 'flow-divider', mode: r.oneOf('mode', FLOW_DIVIDER_NAMES) };
  return r.ok ? config : undefined;
}
