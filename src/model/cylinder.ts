import { configReader } from './configRead.ts';
import type { PortDefinition } from './types.ts';

/**
 * Konfigurierbarer Zylinder nach DIN ISO 1219-1.
 *
 * Kolbenzylinder (8.4.20 ff. und Beispiele 6.3): Rahmen 9M × 4M, Kolben 2M
 * breit, Kolbenstange 1M dick, eingefahren 1M vom Boden und 3M aus dem Rahmen
 * ragend, Dämpfungszapfen 0,5M × 2M.
 *
 * Plunger- und Teleskopzylinder (8.4.19, 8.4.21, 8.4.24–8.4.26, Beispiele
 * 6.3.6–6.3.8): Rahmen 9M × 5M wie in den Beispielen gezeichnet, Plunger 3M
 * dick und 9M lang, Teleskopstufen 3M und 1M dick.
 *
 * Anschlüsse liegen 0,5M innerhalb der Rahmenenden, Leitungen 2M lang nach
 * unten; A = kolbenseitig, B = stangenseitig, C = an der ersten
 * Teleskopstufe (doppeltwirkender Teleskopzylinder). Der Rahmen ist so
 * verschoben, dass die Anschlüsse auf dem 2M-Raster liegen.
 */

export type CylinderDesign = 'piston' | 'plunger' | 'telescopic';
export type CylinderAction = 'double' | 'single';
export type CylinderRod = 'single' | 'through';
/** rod = Feder im Stangenraum (drückend, Rückstellung), piston = im Kolbenraum (ziehend). */
export type CylinderSpring = 'none' | 'rod' | 'piston';
export type Cushion = 'none' | 'fixed' | 'adjustable';

export interface CylinderConfig {
  kind: 'cylinder';
  /** Bauart; fehlt in älteren Dateien (dann Kolbenzylinder). */
  design: CylinderDesign;
  action: CylinderAction;
  /** Nur bei Kolbenzylindern. */
  rod: CylinderRod;
  /** Nur bei einfachwirkenden Kolbenzylindern. */
  spring: CylinderSpring;
  /** Endlagendämpfung kolbenseitig bzw. stangenseitig, nur bei Kolbenzylindern. */
  cushion: { piston: Cushion; rod: Cushion };
  /** Gezeichnete Kolbenstellung in Prozent des Hubs (0 = eingefahren). */
  stroke: number;
}

export const DESIGN_NAMES: Record<CylinderDesign, string> = {
  piston: 'Kolbenzylinder',
  plunger: 'Plungerzylinder',
  telescopic: 'Teleskopzylinder',
};
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

export function defaultCylinderConfig(action: CylinderAction = 'double', design: CylinderDesign = 'piston'): CylinderConfig {
  return normalizeCylinder({
    kind: 'cylinder',
    design,
    action,
    rod: 'single',
    spring: action === 'single' ? 'rod' : 'none',
    cushion: { piston: 'none', rod: 'none' },
    stroke: 0,
  });
}

/** Hält die Einstellungen zueinander passend (z. B. Plunger immer einfachwirkend). */
export function normalizeCylinder(config: CylinderConfig): CylinderConfig {
  const stroke = Math.round(Math.min(100, Math.max(0, config.stroke)));
  if (config.design === 'piston') {
    return { ...config, stroke, spring: config.action === 'double' ? 'none' : config.spring };
  }
  const none = { rod: 'single', spring: 'none', cushion: { piston: 'none', rod: 'none' } } as const;
  if (config.design === 'plunger') return { ...config, ...none, action: 'single', stroke };
  // Doppeltwirkender Teleskopzylinder: Anschluss C sitzt an der ersten Stufe, daher immer eingefahren.
  return { ...config, ...none, stroke: config.action === 'double' ? 0 : stroke };
}

/** Lässt sich die Kolbenstellung bei dieser Bauart einstellen? */
export const hasStroke = (config: CylinderConfig) => !(config.design === 'telescopic' && config.action === 'double');

export function cylinderTitle(config: CylinderConfig): string {
  if (config.design === 'plunger') return 'Plungerzylinder';
  if (config.design === 'telescopic') return `Teleskopzylinder, ${ACTION_NAMES[config.action].toLowerCase()}`;
  const base = config.action === 'double' ? 'Doppeltwirkender Zylinder' : 'Einfachwirkender Zylinder';
  return config.rod === 'through' ? `${base}, durchgehende Stange` : base;
}

export const BODY_WIDTH = 9;
export const BODY_HEIGHT = 4;
/** Rahmenhöhe von Plunger- und Teleskopzylinder. */
export const LARGE_BODY_HEIGHT = 5;
export const PISTON = 2;
export const ROD_OUT = 3;
export const PORT_LINE = 2;
/** Länge der durchgehenden Kolbenstange je Seite: ragt in jeder Kolbenstellung mindestens 1M heraus. */
export const THROUGH_ROD = 7;
/** Länge der einseitigen Kolbenstange ab Kolben: eingefahren 3M aus dem Rahmen. */
export const ROD = BODY_WIDTH - 1 - PISTON + ROD_OUT;
/** Plunger 9M × 3M (8.4.19), eingefahren 2M vom Boden. */
export const PLUNGER = { length: 9, thickness: 3, start: 2, travel: 5 };

export interface CylinderLayout {
  /** Linker Rand des Zylinderrahmens. */
  bodyX: number;
  bodyHeight: number;
  /** Kolbenzylinder: linke Kante des Kolbens (Kolben ist 2M breit). */
  pistonX: number;
  /** Ausfahrweg in M: Plunger bzw. erste und zweite Teleskopstufe. */
  extension: [number, number];
  width: number;
  height: number;
  /** Anschlüsse als x-Lage (in M); y ist immer die Unterkante. */
  ports: { id: 'A' | 'B' | 'C'; x: number }[];
}

/** Kleinste ganze Zahl ≥ x mit derselben Parität wie `like` (Anschlüsse bleiben gedreht im Raster). */
const ceilParity = (x: number, like: number) => {
  const n = Math.ceil(x - 1e-9);
  return (n - like) % 2 === 0 ? n : n + 1;
};

export function cylinderLayout(config: CylinderConfig): CylinderLayout {
  const s = config.stroke / 100;
  if (config.design === 'piston') {
    const through = config.rod === 'through';
    const min = config.spring === 'piston' ? 4 : 1;
    const max = config.spring === 'rod' ? 3 : 6;
    const offset = min + (max - min) * s;
    // Durchgehende Stange: Rahmen so weit nach rechts, dass die Stange links nicht übersteht.
    let bodyX = 1.5;
    while (through && bodyX + offset - THROUGH_ROD < 0) bodyX += 2;
    const pistonX = bodyX + offset;
    const rodEnd = pistonX + PISTON + (through ? THROUGH_ROD : ROD);
    const height = BODY_HEIGHT + PORT_LINE;
    const hasA = config.action === 'double' || config.spring !== 'piston';
    const hasB = config.action === 'double' || config.spring === 'piston';
    return {
      bodyX,
      bodyHeight: BODY_HEIGHT,
      pistonX,
      extension: [0, 0],
      width: ceilParity(Math.max(rodEnd, bodyX + BODY_WIDTH), height),
      height,
      ports: [...(hasA ? [{ id: 'A' as const, x: bodyX + 0.5 }] : []), ...(hasB ? [{ id: 'B' as const, x: bodyX + 8.5 }] : [])],
    };
  }

  const bodyX = 1.5;
  const height = LARGE_BODY_HEIGHT + PORT_LINE;
  const A = { id: 'A' as const, x: bodyX + 0.5 };
  if (config.design === 'plunger') {
    const e = PLUNGER.travel * s;
    return {
      bodyX,
      bodyHeight: LARGE_BODY_HEIGHT,
      pistonX: bodyX,
      extension: [e, e],
      width: ceilParity(bodyX + PLUNGER.start + PLUNGER.length + e, height),
      height,
      ports: [A],
    };
  }
  if (config.action === 'single') {
    // Stufe 1 (3M) von 5M bis 14M, Stufe 2 (1M) von 9,5M bis 18,5M ab Rahmen; je Stufe 3M Hub.
    const e1 = 3 * s;
    const e2 = 6 * s;
    return {
      bodyX,
      bodyHeight: LARGE_BODY_HEIGHT,
      pistonX: bodyX,
      extension: [e1, e2],
      width: ceilParity(bodyX + 18.5 + e2, height),
      height,
      ports: [A],
    };
  }
  // Doppeltwirkend: Stufe 1 von 4M bis 13M mit Bund, Stufe 2 von 7M bis 16M mit Bund.
  return {
    bodyX,
    bodyHeight: LARGE_BODY_HEIGHT,
    pistonX: bodyX,
    extension: [0, 0],
    width: ceilParity(bodyX + 16, height),
    height,
    ports: [A, { id: 'B', x: bodyX + 8.5 }, { id: 'C', x: bodyX + 12.5 }],
  };
}

/** Abmessungen und Anschlüsse in Einheiten (M = 10). */
export function cylinderGeometry(config: CylinderConfig, unit: number) {
  const l = cylinderLayout(config);
  const ports: PortDefinition[] = l.ports.map((p) => ({ id: p.id, kind: 'work', offset: { x: p.x * unit, y: l.height * unit } }));
  return { size: { width: l.width * unit, height: l.height * unit }, ports };
}

// --- Einlesen aus Dateien -----------------------------------------------------

export function readCylinderConfig(v: unknown, path: string, errors: string[]): CylinderConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const design = r.oneOf('design', DESIGN_NAMES, 'piston');
  const action = r.oneOf('action', ACTION_NAMES);
  const rod = r.oneOf('rod', ROD_NAMES);
  const spring = r.oneOf('spring', SPRING_NAMES);
  const cushion = configReader(r.v.cushion ?? {}, `${path}.cushion`, errors);
  const piston = cushion?.oneOf('piston', CUSHION_NAMES);
  const rodCushion = cushion?.oneOf('rod', CUSHION_NAMES);
  const stroke = r.number('stroke', 0, 100, 0);
  if (!r.ok || !piston || !rodCushion) return undefined;
  return normalizeCylinder({ kind: 'cylinder', design, action, rod, spring, cushion: { piston, rod: rodCushion }, stroke });
}
