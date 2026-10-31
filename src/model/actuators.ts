import { configReader } from './configRead.ts';
import { ROTATION_NAMES, type Rotation } from './rotary.ts';
import type { PortDefinition } from './types.ts';

/**
 * Weitere konfigurierbare Antriebe und Verbinder nach DIN ISO 1219-1:2019:
 * Schwenkantrieb (6.2.6/6.2.7), Druckmittelwandler und Druckübersetzer
 * (6.3.14/6.3.15), Antriebsmotoren (Elektromotor, Antriebseinheit
 * Verbrennungsmotor 8.4.9) und Verteiler. Maße in M; Zeichnungen in
 * ui/actuatorSymbols.tsx.
 */

const port = (id: string, x: number, y: number, unit: number, kind: PortDefinition['kind'] = 'work'): PortDefinition => ({
  id,
  kind,
  offset: { x: x * unit, y: y * unit },
});

// --- Schwenkantrieb ---------------------------------------------------------------

export type SwivelAction = 'double' | 'single';

export const SWIVEL_ACTION_NAMES: Record<SwivelAction, string> = {
  double: 'Doppeltwirkend (zwei Volumenstromrichtungen)',
  single: 'Einfachwirkend (Federrückstellung)',
};

export interface SwivelConfig {
  kind: 'swivel';
  action: SwivelAction;
}

export function defaultSwivelConfig(): SwivelConfig {
  return { kind: 'swivel', action: 'double' };
}

export const swivelTitle = (c: SwivelConfig) =>
  c.action === 'double' ? 'Schwenkantrieb mit begrenztem Schwenkwinkel, zwei Volumenstromrichtungen' : 'Schwenkantrieb, einfachwirkend';

/**
 * 9M × 9M: Halbkreis r = 3M (8.4.5) mit der geraden Seite bei x = 2 und der
 * Mitte bei y = 4,5; Anschlüsse 1,5M über und unter der Mitte, 2M lange
 * Leitungen nach links.
 */
export function swivelGeometry(c: SwivelConfig, unit: number) {
  const ports = [port('A', 0, 3, unit)];
  if (c.action === 'double') ports.push(port('B', 0, 6, unit));
  return { size: { width: 9 * unit, height: 9 * unit }, ports };
}

export function readSwivelConfig(v: unknown, path: string, errors: string[]): SwivelConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: SwivelConfig = { kind: 'swivel', action: r.oneOf('action', SWIVEL_ACTION_NAMES) };
  return r.ok ? config : undefined;
}

// --- Druckmittelwandler / Druckübersetzer ---------------------------------------------

export type ConverterType = 'converter' | 'intensifier';

export const CONVERTER_NAMES: Record<ConverterType, string> = {
  converter: 'Druckmittelwandler',
  intensifier: 'Druckübersetzer',
};

export interface PressureConverterConfig {
  kind: 'pressure-converter';
  type: ConverterType;
}

export function defaultPressureConverterConfig(): PressureConverterConfig {
  return { kind: 'pressure-converter', type: 'intensifier' };
}

export const pressureConverterTitle = (c: PressureConverterConfig) =>
  c.type === 'converter'
    ? 'Druckmittelwandler, einfachwirkend (pneumatisch in hydraulisch, gleicher Druck)'
    : 'Druckübersetzer, einfachwirkend (pneumatischer Druck p1 in höheren hydraulischen Druck p2)';

/** Oberkante des Gehäuses: der Druckübersetzer hat darüber Platz für p1 und p2. */
export const converterTop = (c: PressureConverterConfig) => (c.type === 'intensifier' ? 2 : 0);

/**
 * 10M breit: Gehäuse 9M ab x = 0,5, Anschlüsse 0,5M innerhalb der Enden
 * (1 pneumatisch links, 2 hydraulisch rechts), 2M lange Leitungen nach unten.
 */
export function pressureConverterGeometry(c: PressureConverterConfig, unit: number) {
  const h = converterTop(c) + 6;
  return { size: { width: 10 * unit, height: h * unit }, ports: [port('1', 1, h, unit), port('2', 9, h, unit)] };
}

export function readPressureConverterConfig(v: unknown, path: string, errors: string[]): PressureConverterConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: PressureConverterConfig = { kind: 'pressure-converter', type: r.oneOf('type', CONVERTER_NAMES) };
  return r.ok ? config : undefined;
}

// --- Antriebsmotoren ------------------------------------------------------------------

export type Engine = 'electric' | 'combustion';

export const ENGINE_NAMES: Record<Engine, string> = {
  electric: 'Elektromotor',
  combustion: 'Antriebseinheit (Verbrennungsmotor)',
};

export interface PrimeMoverConfig {
  kind: 'prime-mover';
  engine: Engine;
  /** Drehrichtungspfeil (9.4.4) auf der der Welle gegenüberliegenden Seite. */
  rotation: Rotation;
}

export function defaultPrimeMoverConfig(engine: Engine = 'electric'): PrimeMoverConfig {
  return { kind: 'prime-mover', engine, rotation: 'none' };
}

export function primeMoverTitle(c: PrimeMoverConfig): string {
  const name = ENGINE_NAMES[c.engine];
  return c.rotation === 'none' ? name : `${name}, ${ROTATION_NAMES[c.rotation].toLowerCase()}`;
}

/** 10M × 10M ohne Fluidanschlüsse; Welle rechts auf derselben Höhe wie die Pumpenwelle. */
export function primeMoverGeometry(_c: PrimeMoverConfig, unit: number) {
  return { size: { width: 10 * unit, height: 10 * unit }, ports: [] as PortDefinition[] };
}

export function readPrimeMoverConfig(v: unknown, path: string, errors: string[]): PrimeMoverConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: PrimeMoverConfig = {
    kind: 'prime-mover',
    engine: r.oneOf('engine', ENGINE_NAMES),
    rotation: r.oneOf('rotation', ROTATION_NAMES, 'none'),
  };
  return r.ok ? config : undefined;
}

// --- Verteiler ------------------------------------------------------------------------

/** Anzahl der Abgänge. */
export const MANIFOLD_OUTLETS = [2, 3, 4, 5, 6] as const;
export type ManifoldOutlets = (typeof MANIFOLD_OUTLETS)[number];

export interface ManifoldConfig {
  kind: 'manifold';
  outlets: ManifoldOutlets;
}

export function defaultManifoldConfig(): ManifoldConfig {
  return { kind: 'manifold', outlets: 3 };
}

export const manifoldTitle = (c: ManifoldConfig) => `Verteiler, ${c.outlets} Abgänge`;

/**
 * Verteiler (nicht in DIN ISO 1219-1): Block 2M hoch, Zulauf P links,
 * Abgänge 1 bis n oben im Abstand 2M, je 1M lange Leitungen.
 */
export function manifoldGeometry(c: ManifoldConfig, unit: number) {
  const ports = [port('P', 0, 2, unit)];
  for (let i = 1; i <= c.outlets; i++) ports.push(port(String(i), 2 * i, 0, unit));
  return { size: { width: (2 * c.outlets + 2) * unit, height: 4 * unit }, ports };
}

export function readManifoldConfig(v: unknown, path: string, errors: string[]): ManifoldConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ManifoldConfig = { kind: 'manifold', outlets: r.count('outlets', MANIFOLD_OUTLETS) };
  return r.ok ? config : undefined;
}
