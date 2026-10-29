import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbare Schnelltrennkupplung nach DIN ISO 1219-1 (Beispiele
 * 6.4.1.3–6.4.1.8): senkrecht, 2M × 10M, Anschluss 1 oben, 2 unten.
 * Jede Kupplungshälfte ist ein offener 90°-Sitz mit 1M langen Schenkeln
 * (8.4.54), auf Wunsch mit Rückschlagkugel 1M, und ein Querstrich 1M breit.
 * Getrennt liegen die Querstriche 1M auseinander, gekuppelt fallen sie in
 * der Mitte zusammen.
 */

export type CouplingChecks = 0 | 1 | 2;

export interface CouplingConfig {
  kind: 'coupling';
  /** Anzahl der Rückschlagventile: 0, 1 (obere Hälfte) oder 2. */
  checks: CouplingChecks;
  coupled: boolean;
}

export const CHECK_COUNTS: readonly CouplingChecks[] = [0, 1, 2];
export const CHECK_NAMES: Record<CouplingChecks, string> = {
  0: 'Ohne Rückschlagventil',
  1: 'Mit einem Rückschlagventil',
  2: 'Mit zwei Rückschlagventilen',
};

export function defaultCouplingConfig(): CouplingConfig {
  return { kind: 'coupling', checks: 0, coupled: true };
}

export function couplingTitle(config: CouplingConfig): string {
  return `Schnelltrennkupplung ${CHECK_NAMES[config.checks].toLowerCase()}, ${config.coupled ? 'gekuppelt' : 'entkuppelt'}`;
}

export function couplingGeometry(_config: CouplingConfig, unit: number) {
  const ports: PortDefinition[] = [
    { id: '1', kind: 'work', offset: { x: unit, y: 0 } },
    { id: '2', kind: 'work', offset: { x: unit, y: 10 * unit } },
  ];
  return { size: { width: 2 * unit, height: 10 * unit }, ports };
}

export function readCouplingConfig(v: unknown, path: string, errors: string[]): CouplingConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: CouplingConfig = { kind: 'coupling', checks: r.count('checks', CHECK_COUNTS), coupled: r.bool('coupled') };
  return r.ok ? config : undefined;
}
