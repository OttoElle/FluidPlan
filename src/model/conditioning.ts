import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbare Aufbereitung nach DIN ISO 1219-1:2019: Filter (6.4.4) und
 * Kühler (6.4.5). Maße in M; Zeichnungen in ui/conditioningSymbols.tsx.
 * Filter und Wärmetauscher sind ein auf die Spitze gestelltes Quadrat 4M
 * (Diagonale 2√2·2M ≈ 5,66M).
 */

/** Halbe Diagonale des auf die Spitze gestellten Quadrats 4M. */
export const DIAMOND = 2 * Math.SQRT2;

const port = (id: string, x: number, y: number, unit: number): PortDefinition => ({
  id,
  kind: 'work',
  offset: { x: x * unit, y: y * unit },
});

// --- Filter -----------------------------------------------------------------------

export type FilterDesign = 'filter' | 'breather';
export type FilterIndicator = 'none' | 'optical' | 'gauge';

export const FILTER_DESIGN_NAMES: Record<FilterDesign, string> = {
  filter: 'Filter',
  breather: 'Tank-Belüftungsfilter',
};
export const FILTER_INDICATOR_NAMES: Record<FilterIndicator, string> = {
  none: 'Ohne',
  optical: 'Optische Verschmutzungsanzeige',
  gauge: 'Druckmessgerät',
};

export interface FilterConfig {
  kind: 'filter';
  design: FilterDesign;
  /** Zusätzliches Magnetelement (6.4.4.3). */
  magnet: boolean;
  /** Anzeige am Eingang: optisch (6.4.4.4) oder Druckmessgerät (6.4.4.5). */
  indicator: FilterIndicator;
  /** Umgehungsventil (6.4.4.7). */
  bypass: boolean;
}

export function defaultFilterConfig(): FilterConfig {
  return { kind: 'filter', design: 'filter', magnet: false, indicator: 'none', bypass: false };
}

export function filterTitle(c: FilterConfig): string {
  if (c.design === 'breather') return FILTER_DESIGN_NAMES.breather;
  const extras: string[] = [];
  if (c.magnet) extras.push('zusätzlichem Magnetelement');
  if (c.indicator === 'optical') extras.push('optischer Verschmutzungsanzeige');
  if (c.indicator === 'gauge') extras.push('Druckmessgerät');
  if (c.bypass) extras.push('Umgehungsventil');
  if (extras.length === 0) return 'Filter';
  const last = extras.pop()!;
  return `Filter mit ${extras.length > 0 ? `${extras.join(', ')} und ${last}` : last}`;
}

/**
 * Lage der Filterteile. Eingang 1 oben, Ausgang 2 unten.
 * - axis: senkrechte Leitung durch den Filter
 * - cy: Mitte des Filterquadrats
 * - top: Oberkante des Bereichs unter der Anzeige (Anzeige 4M hoch, Abzweig bei y = 2)
 * - frame: Rahmen beim Umgehungsventil (6.4.4.7), Umgehung 5M links der Achse
 */
export function filterLayout(c: FilterConfig) {
  if (c.design === 'breather') return { axis: 4, cy: 6, top: 0, width: 8, height: 10, frame: undefined };
  const top = c.indicator === 'none' ? 0 : 4;
  const axis = c.bypass ? 7 : 4;
  const cy = top + (c.bypass ? 8 : 5);
  const height = top + (c.bypass ? 16 : 10);
  const reach = c.indicator === 'optical' ? axis + 7 : c.indicator === 'gauge' ? axis + 6 : 0;
  const width = Math.max(c.bypass ? 10 : 8, Math.ceil(reach / 2) * 2);
  const frame = c.bypass ? { x: 0, y: top + 2, width: 10, height: 12, branch: axis - 5 } : undefined;
  return { axis, cy, top, width, height, frame };
}

export function filterGeometry(c: FilterConfig, unit: number) {
  const l = filterLayout(c);
  const ports = c.design === 'breather' ? [port('1', l.axis, l.height, unit)] : [port('1', l.axis, 0, unit), port('2', l.axis, l.height, unit)];
  return { size: { width: l.width * unit, height: l.height * unit }, ports };
}

export function readFilterConfig(v: unknown, path: string, errors: string[]): FilterConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: FilterConfig = {
    kind: 'filter',
    design: r.oneOf('design', FILTER_DESIGN_NAMES),
    magnet: r.bool('magnet'),
    indicator: r.oneOf('indicator', FILTER_INDICATOR_NAMES),
    bypass: r.bool('bypass'),
  };
  return r.ok ? config : undefined;
}

// --- Kühler -----------------------------------------------------------------------

export type Coolant = 'none' | 'liquid' | 'fan';

export const COOLANT_NAMES: Record<Coolant, string> = {
  none: 'Ohne Angabe',
  liquid: 'Flüssiges Kühlmedium',
  fan: 'Elektrisch angetriebener Lüfter',
};

export interface CoolerConfig {
  kind: 'cooler';
  /** Ohne Kühlmittellinien (6.4.5.1), mit flüssigem Kühlmedium (6.4.5.2) oder mit Lüfter (6.4.5.3). */
  coolant: Coolant;
}

export function defaultCoolerConfig(): CoolerConfig {
  return { kind: 'cooler', coolant: 'none' };
}

export function coolerTitle(c: CoolerConfig): string {
  if (c.coolant === 'liquid') return 'Kühler mit flüssigem Kühlmedium';
  if (c.coolant === 'fan') return 'Kühler mit elektrisch angetriebenem Lüfter';
  return 'Kühler';
}

/**
 * Lage des Wärmetauschers: Achse und Mitte. Mit Lüfter steht links im Rahmen
 * 22M × 10M der Elektromotor (Kreis 6M) mit Welle und Lüfterflügel.
 */
export function coolerLayout(c: CoolerConfig) {
  if (c.coolant === 'fan') return { axis: 18, cy: 7, width: 22, height: 14 };
  return { axis: 4, cy: 5, width: c.coolant === 'liquid' ? 10 : 8, height: 10 };
}

export function coolerGeometry(c: CoolerConfig, unit: number) {
  const l = coolerLayout(c);
  return { size: { width: l.width * unit, height: l.height * unit }, ports: [port('1', l.axis, 0, unit), port('2', l.axis, l.height, unit)] };
}

export function readCoolerConfig(v: unknown, path: string, errors: string[]): CoolerConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: CoolerConfig = { kind: 'cooler', coolant: r.oneOf('coolant', COOLANT_NAMES) };
  return r.ok ? config : undefined;
}
