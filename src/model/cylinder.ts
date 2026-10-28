import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbarer Zylinder nach DIN ISO 1219-1.
 *
 * Maße nach DIN ISO 1219-1 (8.4.20 ff. und Beispiele 6.3): Zylinderrahmen
 * 9M × 4M, Kolben 2M breit und 1M vom Boden entfernt, Kolbenstange 1M dick
 * und 3M aus dem Rahmen ragend, Dämpfungszapfen 0,5M × 2M. Anschlüsse
 * 0,5M innerhalb der Rahmenenden, Leitungen 2M lang nach unten;
 * A = kolbenseitig, B = stangenseitig. Der Rahmen ist so verschoben, dass die
 * Anschlüsse auf dem 2M-Raster liegen.
 */

export type CylinderAction = 'double' | 'single';
export type CylinderRod = 'single' | 'through';
/** rod = Feder im Stangenraum (drückend, Rückstellung), piston = im Kolbenraum (ziehend). */
export type CylinderSpring = 'none' | 'rod' | 'piston';
export type Cushion = 'none' | 'fixed' | 'adjustable';

export interface CylinderConfig {
  kind: 'cylinder';
  action: CylinderAction;
  rod: CylinderRod;
  /** Nur bei einfachwirkenden Zylindern. */
  spring: CylinderSpring;
  /** Endlagendämpfung kolbenseitig bzw. stangenseitig. */
  cushion: { piston: Cushion; rod: Cushion };
}

export const ACTION_NAMES: Record<CylinderAction, string> = {
  double: 'Doppeltwirkend',
  single: 'Einfachwirkend',
};
export const ROD_NAMES: Record<CylinderRod, string> = {
  single: 'Einseitige Kolbenstange',
  through: 'Durchgehende Kolbenstange',
};
export const SPRING_NAMES: Record<CylinderSpring, string> = {
  none: 'Ohne Feder (Rückhub durch Last)',
  rod: 'Federrückstellung',
  piston: 'Feder im Kolbenraum (ziehend)',
};
export const CUSHION_NAMES: Record<Cushion, string> = {
  none: 'Keine',
  fixed: 'Fest',
  adjustable: 'Einstellbar',
};

export function defaultCylinderConfig(action: CylinderAction = 'double'): CylinderConfig {
  return {
    kind: 'cylinder',
    action,
    rod: 'single',
    spring: action === 'single' ? 'rod' : 'none',
    cushion: { piston: 'none', rod: 'none' },
  };
}

export function normalizeCylinder(config: CylinderConfig): CylinderConfig {
  return { ...config, spring: config.action === 'double' ? 'none' : config.spring };
}

export function cylinderTitle(config: CylinderConfig): string {
  const base = config.action === 'double' ? 'Doppeltwirkender Zylinder' : 'Einfachwirkender Zylinder';
  return config.rod === 'through' ? `${base}, durchgehende Stange` : base;
}

export interface CylinderLayout {
  /** Linker Rand des Zylinderrahmens. */
  bodyX: number;
  /** Linke Kante des Kolbens (Kolben ist 2M breit). */
  pistonX: number;
  width: number;
  height: number;
  /** Welche Anschlüsse es gibt. */
  hasA: boolean;
  hasB: boolean;
}

export const BODY_WIDTH = 9;
export const BODY_HEIGHT = 4;
export const PISTON = 2;
export const ROD_OUT = 3;
export const PORT_LINE = 2;

export function cylinderLayout(config: CylinderConfig): CylinderLayout {
  const through = config.rod === 'through';
  const bodyX = through ? 3.5 : 1.5;
  // Kolben eingefahren; bei durchgehender Stange in der Mitte, bei Feder im Kolbenraum weiter rechts.
  const pistonX = bodyX + (through ? 3.5 : config.spring === 'piston' ? 4 : 1);
  return {
    bodyX,
    pistonX,
    width: Math.ceil(bodyX + BODY_WIDTH + ROD_OUT),
    height: BODY_HEIGHT + PORT_LINE,
    hasA: config.action === 'double' || config.spring !== 'piston',
    hasB: config.action === 'double' || config.spring === 'piston',
  };
}

/** Abmessungen und Anschlüsse in Einheiten (M = 10). */
export function cylinderGeometry(config: CylinderConfig, unit: number) {
  const l = cylinderLayout(config);
  const ports: PortDefinition[] = [];
  if (l.hasA) ports.push({ id: 'A', kind: 'work', offset: { x: (l.bodyX + 0.5) * unit, y: l.height * unit } });
  if (l.hasB) ports.push({ id: 'B', kind: 'work', offset: { x: (l.bodyX + 8.5) * unit, y: l.height * unit } });
  return { size: { width: l.width * unit, height: l.height * unit }, ports };
}

// --- Einlesen aus Dateien -----------------------------------------------------

type Obj = Record<string, unknown>;
const isObject = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const keysOf = <T extends string>(r: Record<T, string>) => Object.keys(r) as T[];

export function readCylinderConfig(v: unknown, path: string, errors: string[]): CylinderConfig | undefined {
  const before = errors.length;
  const check = <T extends string>(value: unknown, names: Record<T, string>, key: string): T => {
    if (!keysOf(names).includes(value as T)) {
      errors.push(`${path}.${key}: einer von ${keysOf(names).map((k) => JSON.stringify(k)).join(', ')} erwartet`);
    }
    return value as T;
  };
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const action = check(v.action, ACTION_NAMES, 'action');
  const rod = check(v.rod, ROD_NAMES, 'rod');
  const spring = check(v.spring, SPRING_NAMES, 'spring');
  const cushion = isObject(v.cushion) ? v.cushion : {};
  const piston = check(cushion.piston, CUSHION_NAMES, 'cushion.piston');
  const rodCushion = check(cushion.rod, CUSHION_NAMES, 'cushion.rod');
  if (errors.length > before) return undefined;
  return normalizeCylinder({ kind: 'cylinder', action, rod, spring, cushion: { piston, rod: rodCushion } });
}
