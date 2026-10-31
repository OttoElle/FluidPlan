import { configReader } from './configRead.ts';
import type { Domain, PortDefinition } from './types.ts';

/**
 * Konfigurierbare Pumpe (Kompressor) und konfigurierbarer Motor nach
 * DIN ISO 1219-1 (Beispiele 6.2, Grundelemente 8.4.4, 8.6.8).
 *
 * Grundsymbol 10M × 10M: Kreis 6M mit der Mitte bei (6, 5), Welle 3M × 1M
 * nach links, Anschlüsse oben und unten mit 2M langen Leitungen. Pumpen
 * zeigen das Dreieck nach außen, Motoren nach innen; Hydraulik gefüllt,
 * Pneumatik hohl. Der Leckanschluss L führt gestrichelt unter 45° vom Kreis
 * zur rechten unteren Ecke. Der Drehrichtungspfeil (9.4.4) steht als Bogen
 * auf der der Welle gegenüberliegenden Seite. Als Motor-Pumpe-Einheit steht
 * links ein Elektromotor (Kreis 6M mit "M", 8.4.51), über eine
 * Wellenkupplung (8.4.50) verbunden; das Symbol wird dadurch 10M breiter.
 */

export type Displacement = 'fixed' | 'variable';
export type FlowDirections = 1 | 2;
/** Drehrichtung der Welle, gesehen auf das Wellenende (cw = im Uhrzeigersinn). */
export type Rotation = 'none' | 'cw' | 'ccw' | 'both';

export interface RotaryConfig<K extends 'pump' | 'motor' = 'pump' | 'motor'> {
  kind: K;
  medium: Domain;
  displacement: Displacement;
  /** Pumpe: Förderrichtungen, Motor: Drehrichtungen. */
  directions: FlowDirections;
  /** Leckanschluss L. */
  drain: boolean;
  /** Mit angebautem Elektromotor (Motor-Pumpe-Einheit); nur bei Pumpen. */
  electricMotor: boolean;
  /** Drehrichtungspfeil; fehlt in älteren Dateien (dann keiner). */
  rotation: Rotation;
  /** Pumpe/Motor (6.2.3/6.2.4), nur hydraulische Pumpen; fehlt in älteren Dateien. */
  pumpMotor: boolean;
}

export type PumpConfig = RotaryConfig<'pump'>;
export type MotorConfig = RotaryConfig<'motor'>;

export const DISPLACEMENT_NAMES: Record<Displacement, string> = {
  fixed: 'Konstant',
  variable: 'Verstellbar',
};
export const ROTATION_NAMES: Record<Rotation, string> = {
  none: 'Ohne Angabe',
  cw: 'Im Uhrzeigersinn',
  ccw: 'Gegen den Uhrzeigersinn',
  both: 'Beide Drehrichtungen',
};
export const DIRECTION_COUNTS: readonly FlowDirections[] = [1, 2];

export function defaultPumpConfig(medium: Domain): PumpConfig {
  return { kind: 'pump', medium, displacement: 'fixed', directions: 1, drain: false, electricMotor: false, rotation: 'none', pumpMotor: false };
}

export function defaultMotorConfig(medium: Domain): MotorConfig {
  return { kind: 'motor', medium, displacement: 'fixed', directions: 1, drain: false, electricMotor: false, rotation: 'none', pumpMotor: false };
}

/**
 * Kompressoren fördern nur in eine Richtung und haben keinen Leckanschluss;
 * Motoren keinen angebauten E-Motor. Beim Motor folgt der Drehrichtungspfeil
 * den Drehrichtungen: zwei Richtungen zeigen beide Pfeilspitzen.
 */
export function normalizeRotary<C extends RotaryConfig>(config: C): C {
  const compressor = config.kind === 'pump' && config.medium === 'pneumatic';
  let rotation = config.rotation;
  if (config.kind === 'motor' && rotation !== 'none') {
    if (config.directions === 2) rotation = 'both';
    else if (rotation === 'both') rotation = 'cw';
  }
  return {
    ...config,
    rotation,
    directions: compressor ? 1 : config.directions,
    drain: config.medium === 'pneumatic' ? false : config.drain,
    electricMotor: config.kind === 'pump' ? config.electricMotor : false,
    pumpMotor: config.kind === 'pump' && config.medium === 'hydraulic' && config.pumpMotor === true,
  };
}

export function rotaryTitle(config: RotaryConfig): string {
  const pneumatic = config.medium === 'pneumatic';
  let base: string;
  if (config.kind === 'pump') base = pneumatic ? 'Kompressor' : config.pumpMotor ? 'Pumpe/Motor' : 'Pumpe';
  else base = pneumatic ? 'Druckluftmotor' : 'Hydromotor';
  const details = [
    config.displacement === 'variable' ? 'verstellbar' : pneumatic ? '' : 'konstant',
    config.directions === 2 ? (config.kind === 'pump' ? (config.pumpMotor ? 'reversierbar' : 'zwei Förderrichtungen') : 'zwei Drehrichtungen') : '',
    config.drain ? 'mit Leckölanschluss' : '',
  ].filter(Boolean);
  const name = details.length ? `${base} (${details.join(', ')})` : base;
  return config.electricMotor ? `Motor-Pumpe-Einheit: ${name}` : name;
}

/** Breite des vorgesetzten Elektromotors in M. */
export const MOTOR_OFFSET = 10;

/** Abmessungen und Anschlüsse in Einheiten (M = 10). */
export function rotaryGeometry(config: RotaryConfig, unit: number) {
  const dx = config.electricMotor ? MOTOR_OFFSET : 0;
  const port = (id: string, kind: PortDefinition['kind'], x: number, y: number, label?: string): PortDefinition => ({
    id,
    kind,
    offset: { x: (x + dx) * unit, y: y * unit },
    ...(label ? { label } : {}),
  });
  const ports: PortDefinition[] = [];
  if (config.kind === 'pump') {
    if (config.medium === 'pneumatic') ports.push(port('P', 'pressure', 6, 0, '1'));
    else ports.push(port('P', 'pressure', 6, 0), port('S', 'return', 6, 10));
  } else {
    ports.push(port('A', 'work', 6, 0), port('B', config.medium === 'pneumatic' ? 'return' : 'work', 6, 10));
  }
  if (config.drain) ports.push(port('L', 'drain', 10, 10));
  return { size: { width: (10 + dx) * unit, height: 10 * unit }, ports };
}

// --- Einlesen aus Dateien -----------------------------------------------------

const MEDIA: Record<Domain, string> = { hydraulic: 'Hydraulik', pneumatic: 'Pneumatik' };

function readRotary<K extends 'pump' | 'motor'>(kind: K, v: unknown, path: string, errors: string[]): RotaryConfig<K> | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: RotaryConfig<K> = {
    kind,
    medium: r.oneOf('medium', MEDIA),
    displacement: r.oneOf('displacement', DISPLACEMENT_NAMES),
    directions: r.count('directions', DIRECTION_COUNTS),
    drain: r.bool('drain'),
    electricMotor: r.bool('electricMotor', false),
    rotation: r.oneOf('rotation', ROTATION_NAMES, 'none'),
    pumpMotor: r.bool('pumpMotor', false),
  };
  return r.ok ? normalizeRotary(config) : undefined;
}

export const readPumpConfig = (v: unknown, path: string, errors: string[]) => readRotary('pump', v, path, errors);
export const readMotorConfig = (v: unknown, path: string, errors: string[]) => readRotary('motor', v, path, errors);
