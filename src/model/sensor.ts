import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbarer Sensor bzw. Schalter nach DIN ISO 1219-1.
 *
 * Elektronisch (6.4.2.2/6.4.2.3, 8.7.2–8.7.9): Signalwandler als Quadrat 4M
 * mit Diagonale, unten links die Messgröße (P, F, T, G nach 8.7.4), oben
 * rechts das Ausgangssignal (schaltend oder analog). Druck wird über eine
 * 2M lange Leitung von links zugeführt, Durchfluss misst ein Messgerät-Kreis
 * 4M in der Leitung (6.4.3.13), Temperatur ein Thermometer (6.4.3.7); der
 * Wandler sitzt jeweils rechts daneben. Der Näherungsschalter (9.6.2.2) hat
 * keinen Fluidanschluss.
 *
 * Elektromechanisch (Druckschalter 6.4.2.1): Kasten 4M mit Schließer und
 * einstellbarer Feder rechts.
 *
 * Einstellbar: senkrechter Strich über der linken oberen Ecke des Wandlers,
 * schräg vom Pfeil gekreuzt (6.4.2.2, 6.4.3.8); dafür ist das Symbol 2M höher.
 */

export type Quantity = 'pressure' | 'flow' | 'temperature' | 'position';
export type SensorOutput = 'switching' | 'analog' | 'mechanical';

export interface SensorConfig {
  kind: 'sensor';
  quantity: Quantity;
  output: SensorOutput;
  adjustable: boolean;
}

export const QUANTITY_NAMES: Record<Quantity, string> = {
  pressure: 'Druck',
  flow: 'Durchfluss',
  temperature: 'Temperatur',
  position: 'Position (Näherung)',
};
/** Kennbuchstabe der Messgröße (8.7.4). */
export const QUANTITY_LETTER: Record<Quantity, string> = { pressure: 'P', flow: 'F', temperature: 'T', position: 'G' };

export const OUTPUT_NAMES: Record<SensorOutput, string> = {
  switching: 'Elektronisch schaltend',
  analog: 'Analog',
  mechanical: 'Elektromechanisch',
};

export function defaultSensorConfig(quantity: Quantity = 'pressure', output: SensorOutput = 'switching'): SensorConfig {
  return normalizeSensor({ kind: 'sensor', quantity, output, adjustable: false });
}

/** Elektromechanisch gibt es nur als Druckschalter, und der ist immer einstellbar. */
export function normalizeSensor(config: SensorConfig): SensorConfig {
  if (config.output === 'mechanical' && config.quantity !== 'pressure') return { ...config, output: 'switching' };
  if (config.output === 'mechanical') return { ...config, adjustable: true };
  return config;
}

export function sensorTitle(config: SensorConfig): string {
  const switching = config.output !== 'analog';
  const base: Record<Quantity, [string, string]> = {
    pressure: ['Druckschalter', 'Drucksensor'],
    flow: ['Durchflussschalter', 'Durchflusssensor'],
    temperature: ['Temperaturschalter', 'Temperatursensor'],
    position: ['Näherungsschalter', 'Wegsensor'],
  };
  const name = base[config.quantity][switching ? 0 : 1];
  if (config.output === 'mechanical') return `${name}, elektromechanisch`;
  return config.adjustable ? `${name}, einstellbar` : name;
}

/** Lage des Signalwandlers (linke obere Ecke, in M) und Größe des Symbols. */
export function sensorLayout(config: SensorConfig) {
  const top = config.adjustable && config.output !== 'mechanical' ? 2 : 0;
  switch (config.quantity) {
    case 'pressure':
      if (config.output === 'mechanical') return { box: { x: 2, y: 1 }, top: 0, width: 10, height: 6, ports: [[0, 3]] };
      return { box: { x: 2, y: top }, top, width: 6, height: 4 + top, ports: [[0, top + 2]] };
    case 'flow':
      return { box: { x: 4, y: top + 2 }, top, width: 8, height: 8 + top, ports: [[2, 0], [2, 8 + top]] };
    case 'temperature':
      return { box: { x: 4, y: top }, top, width: 8, height: 6 + top, ports: [[2, 6 + top]] };
    case 'position':
      return { box: { x: 1, y: top }, top, width: 5, height: 4 + top, ports: [] };
  }
}

export function sensorGeometry(config: SensorConfig, unit: number) {
  const l = sensorLayout(config);
  const ports: PortDefinition[] = l.ports.map(([x, y], i) => ({ id: String(i + 1), kind: 'work', offset: { x: x! * unit, y: y! * unit } }));
  return { size: { width: l.width * unit, height: l.height * unit }, ports };
}

export function readSensorConfig(v: unknown, path: string, errors: string[]): SensorConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: SensorConfig = {
    kind: 'sensor',
    quantity: r.oneOf('quantity', QUANTITY_NAMES),
    output: r.oneOf('output', OUTPUT_NAMES),
    adjustable: r.bool('adjustable'),
  };
  return r.ok ? normalizeSensor(config) : undefined;
}
