import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbare Mess- und Anzeigegeräte nach DIN ISO 1219-1:2019, 6.4.3.
 * Messgeräte sind ein Kreis 4M (8.3.20); Anzeigen ein Kasten 5M × 3M.
 * Zeichnungen in ui/instrumentSymbols.tsx.
 */

export type InstrumentQuantity = 'pressure' | 'differential' | 'temperature' | 'flow-indicator' | 'flow-meter' | 'level' | 'speed';

export const INSTRUMENT_NAMES: Record<InstrumentQuantity, string> = {
  pressure: 'Druckmessgerät (Manometer)',
  differential: 'Differenzdruckmessgerät',
  temperature: 'Thermometer',
  'flow-indicator': 'Volumenstromanzeige',
  'flow-meter': 'Volumenstrommessgerät',
  level: 'Flüssigkeits-Niveauanzeige (Schauglas)',
  speed: 'Drehzahlmessgerät',
};

export interface InstrumentConfig {
  kind: 'instrument';
  quantity: InstrumentQuantity;
}

export function defaultInstrumentConfig(quantity: InstrumentQuantity = 'pressure'): InstrumentConfig {
  return { kind: 'instrument', quantity };
}

export const instrumentTitle = (c: InstrumentConfig) => INSTRUMENT_NAMES[c.quantity];

/** Durchgehende Leitung oben und unten (6.4.3.5, 6.4.3.13). */
export const flowsThrough = (q: InstrumentQuantity) => q === 'differential' || q === 'flow-meter';

/** Mitte des Messkreises in M. */
export function instrumentCenter(c: InstrumentConfig): [number, number] {
  if (c.quantity === 'speed') return [4, 2];
  return [2, flowsThrough(c.quantity) ? 4 : 2];
}

export function instrumentGeometry(c: InstrumentConfig, unit: number) {
  const p = (id: string, y: number): PortDefinition => ({ id, kind: 'work', offset: { x: 2 * unit, y: y * unit } });
  // Drehzahlmessgerät: Welle links, kein Fluidanschluss (6.4.3.15)
  if (c.quantity === 'speed') return { size: { width: 6 * unit, height: 4 * unit }, ports: [] };
  if (flowsThrough(c.quantity)) return { size: { width: 4 * unit, height: 8 * unit }, ports: [p('1', 0), p('2', 8)] };
  return { size: { width: 4 * unit, height: 6 * unit }, ports: [p('1', 6)] };
}

export function readInstrumentConfig(v: unknown, path: string, errors: string[]): InstrumentConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: InstrumentConfig = { kind: 'instrument', quantity: r.oneOf('quantity', INSTRUMENT_NAMES) };
  return r.ok ? config : undefined;
}

// --- Anzeigen (6.4.3.1–6.4.3.3) ---------------------------------------------------

export type IndicatorType = 'optical' | 'digital' | 'acoustic';

export const INDICATOR_NAMES: Record<IndicatorType, string> = {
  optical: 'Optische Anzeige',
  digital: 'Digital-Anzeige',
  acoustic: 'Akustischer Signalgeber',
};

export interface IndicatorConfig {
  kind: 'indicator';
  type: IndicatorType;
}

export function defaultIndicatorConfig(): IndicatorConfig {
  return { kind: 'indicator', type: 'optical' };
}

export const indicatorTitle = (c: IndicatorConfig) => INDICATOR_NAMES[c.type];

export function indicatorGeometry(_c: IndicatorConfig, unit: number) {
  return { size: { width: 5 * unit, height: 3 * unit }, ports: [] as PortDefinition[] };
}

export function readIndicatorConfig(v: unknown, path: string, errors: string[]): IndicatorConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: IndicatorConfig = { kind: 'indicator', type: r.oneOf('type', INDICATOR_NAMES) };
  return r.ok ? config : undefined;
}
