import { configReader, isObject } from './configRead.ts';
import type { PortDefinition } from './types.ts';
import { ACTUATOR_NAMES, ACTUATOR_WIDTH, upgradeActuator, type Actuator } from './valve.ts';

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
 * unten; A = kolbenseitig, B = stangenseitig (beim einfachwirkenden
 * Zylinder nur als Anschluss des Federraums, Beispiel 6.3.1), C = an der ersten
 * Teleskopstufe (doppeltwirkender Teleskopzylinder). Der Rahmen ist so
 * verschoben, dass die Anschlüsse auf dem 2M-Raster liegen.
 */

export type CylinderDesign = 'piston' | 'diaphragm' | 'plunger' | 'telescopic';
export type CylinderAction = 'double' | 'single';
/** rodless = kolbenstangenlos, magnetisch gekoppelt (Beispiel 6.3.11). */
export type CylinderRod = 'single' | 'through' | 'rodless';
/** rod = Feder im Stangenraum (drückend, Rückstellung), piston = im Kolbenraum (ziehend). */
export type CylinderSpring = 'none' | 'rod' | 'piston';
export type Cushion = 'none' | 'fixed' | 'adjustable';
/** Endschalter (8.4.7, Beispiele 6.3.11/6.3.13) über der linken bzw. rechten Ecke des Rahmens. */
export type LimitSwitch = 'none' | 'left' | 'right' | 'both';
/** Raste in den Endlagen (Beispiel 6.3.12). */
export type Detent = 'none' | 'retracted' | 'extended' | 'both';
/** Betätigung am Ende der Kolbenstange (z. B. Pedal am Geberzylinder). */
export type RodActuator = 'none' | Extract<Actuator, 'push' | 'pull' | 'lever' | 'pedal' | 'roller' | 'plunger'>;

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
  /** Betätigung am Stangenende, nur bei Kolbenzylindern; fehlt in älteren Dateien (dann keine). */
  rodActuator: RodActuator;
  /** Federraum mit Anschluss (Beispiel 6.3.1), nur einfachwirkend mit Feder; fehlt in älteren Dateien. */
  springPort: boolean;
  /** Endschalter; fehlt in älteren Dateien (dann keine). */
  limitSwitch: LimitSwitch;
  /** Entlüftung ohne Anschlussmöglichkeit am Raum ohne Anschluss (Beispiel 6.3.5); fehlt in älteren Dateien. */
  vent: boolean;
  /** Hubbegrenzung, voreingestellt (Beispiel 6.3.4), nur Membranzylinder; fehlt in älteren Dateien. */
  strokeLimiter: boolean;
  /** Raste, nur Kolbenzylinder mit einseitiger Stange ohne Betätigung; fehlt in älteren Dateien. */
  detent: Detent;
}

export const DESIGN_NAMES: Record<CylinderDesign, string> = {
  piston: 'Kolbenzylinder',
  diaphragm: 'Membranzylinder',
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
  rodless: 'Kolbenstangenlos, magnetisch gekoppelt',
};
export const DETENT_NAMES: Record<Detent, string> = {
  none: 'Keine',
  retracted: 'Eingefahren',
  extended: 'Ausgefahren',
  both: 'Beide Endlagen',
};
export const LIMIT_SWITCH_NAMES: Record<LimitSwitch, string> = {
  none: 'Keine',
  left: 'Links',
  right: 'Rechts',
  both: 'Beide Seiten',
};
const SPRING_NAMES: Record<CylinderSpring, string> = {
  none: 'Ohne Feder (Rückhub durch Last)',
  rod: 'Federrückstellung',
  piston: 'Feder im Kolbenraum (ziehend)',
};
const CUSHION_NAMES: Record<Cushion, string> = {
  none: 'Keine',
  fixed: 'Fest',
  adjustable: 'Einstellbar',
};

export const ROD_ACTUATORS: readonly Exclude<RodActuator, 'none'>[] = ['push', 'pull', 'lever', 'pedal', 'roller', 'plunger'];
export const ROD_ACTUATOR_NAMES: Record<RodActuator, string> = {
  none: 'Keine',
  ...(Object.fromEntries(ROD_ACTUATORS.map((a) => [a, ACTUATOR_NAMES[a]])) as Record<Exclude<RodActuator, 'none'>, string>),
};

/**
 * Das Betätigungselement setzt auf den letzten 3M der Kolbenstange auf (die
 * Stange ist sein Schaft); um so viel ragt es über das Stangenende hinaus.
 */
export const rodActuatorExtra = (a: RodActuator) => (a === 'none' ? 0 : Math.max(0, ACTUATOR_WIDTH[a] - 3));

export function defaultCylinderConfig(action: CylinderAction = 'double', design: CylinderDesign = 'piston'): CylinderConfig {
  return normalizeCylinder({
    kind: 'cylinder',
    design,
    action,
    rod: 'single',
    spring: action === 'single' ? 'rod' : 'none',
    cushion: { piston: 'none', rod: 'none' },
    stroke: 0,
    rodActuator: 'none',
    springPort: false,
    limitSwitch: 'none',
    vent: false,
    strokeLimiter: false,
    detent: 'none',
  });
}

/** Kann der Zylinder eine Raste haben (Raste sitzt auf der einseitigen Kolbenstange)? */
export const canDetent = (c: CylinderConfig) => c.design === 'piston' && c.rod === 'single' && (c.rodActuator ?? 'none') === 'none';

/** Hat der Zylinder den kolbenseitigen (A) bzw. stangenseitigen (B) Anschluss? */
export function cylinderPorts(config: CylinderConfig) {
  if (config.action === 'double') return { a: true, b: true };
  return {
    a: config.spring !== 'piston' || config.springPort,
    b: config.spring === 'piston' || config.springPort,
  };
}

/** Kann der Raum ohne Anschluss eine Entlüftung haben (einfachwirkender Kolben- oder Membranzylinder)? */
export function canVent(config: CylinderConfig) {
  const { a, b } = cylinderPorts(config);
  return (config.design === 'piston' || config.design === 'diaphragm') && !(a && b);
}

/** Hält die Einstellungen zueinander passend (z. B. Plunger immer einfachwirkend). */
export function normalizeCylinder(config: CylinderConfig): CylinderConfig {
  const stroke = Math.round(Math.min(100, Math.max(0, config.stroke)));
  const limitSwitch = config.limitSwitch ?? 'none';
  if (config.design === 'piston' || config.design === 'diaphragm') {
    const diaphragm = config.design === 'diaphragm';
    // Kolbenstangenlos: immer doppeltwirkend, ohne Betätigung am Stangenende
    const rodless = !diaphragm && config.rod === 'rodless';
    const action = rodless ? 'double' : config.action;
    // Einfachwirkender Membranzylinder hat immer eine Feder (Beispiel 6.3.5)
    let spring = action === 'double' ? 'none' : config.spring;
    if (diaphragm && action === 'single' && spring === 'none') spring = 'piston';
    const c: CylinderConfig = {
      ...config,
      action,
      stroke,
      spring,
      rod: diaphragm ? 'single' : config.rod,
      rodActuator: rodless ? 'none' : config.rodActuator,
      springPort: spring !== 'none' && config.springPort === true,
      limitSwitch,
      strokeLimiter: diaphragm && config.strokeLimiter === true,
      vent: false,
      detent: 'none',
    };
    return { ...c, vent: canVent(c) && config.vent === true, detent: canDetent(c) ? (config.detent ?? 'none') : 'none' };
  }
  const none = {
    rod: 'single',
    spring: 'none',
    cushion: { piston: 'none', rod: 'none' },
    rodActuator: 'none',
    springPort: false,
    limitSwitch: 'none',
    vent: false,
    strokeLimiter: false,
    detent: 'none',
  } as const;
  if (config.design === 'plunger') return { ...config, ...none, action: 'single', stroke };
  // Doppeltwirkender Teleskopzylinder: Anschluss C sitzt an der ersten Stufe, daher immer eingefahren.
  return { ...config, ...none, stroke: config.action === 'double' ? 0 : stroke };
}

/** Lässt sich die Kolbenstellung bei dieser Bauart einstellen? */
export const hasStroke = (config: CylinderConfig) => !(config.design === 'telescopic' && config.action === 'double');

export function cylinderTitle(config: CylinderConfig): string {
  if (config.design === 'plunger') return 'Plungerzylinder';
  if (config.design === 'telescopic') return `Teleskopzylinder, ${ACTION_NAMES[config.action].toLowerCase()}`;
  const kind = config.design === 'diaphragm' ? 'Membranzylinder' : 'Zylinder';
  const parts = [config.action === 'double' ? `Doppeltwirkender ${kind}` : `Einfachwirkender ${kind}`];
  if (config.rod === 'through') parts.push('durchgehende Stange');
  if (config.rod === 'rodless') parts.push('kolbenstangenlos, magnetisch gekoppelt');
  if (config.springPort) parts.push('Federraum mit Anschluss');
  if (config.strokeLimiter) parts.push('Hubbegrenzung voreingestellt');
  if (config.vent) parts.push('Entlüftung');
  if (config.detent === 'both') parts.push('Raste in beiden Endlagen');
  else if (config.detent && config.detent !== 'none') parts.push(`Raste ${config.detent === 'retracted' ? 'eingefahren' : 'ausgefahren'}`);
  if (config.limitSwitch === 'both') parts.push('Endschalter beidseitig');
  else if (config.limitSwitch !== 'none') parts.push(`Endschalter ${config.limitSwitch === 'left' ? 'links' : 'rechts'}`);
  if (config.rodActuator && config.rodActuator !== 'none') parts.push(ROD_ACTUATOR_NAMES[config.rodActuator]);
  return parts.join(', ');
}

export const BODY_WIDTH = 9;
export const BODY_HEIGHT = 4;
/** Rahmenhöhe von Plunger- und Teleskopzylinder. */
const LARGE_BODY_HEIGHT = 5;
export const PISTON = 2;
const ROD_OUT = 3;
const PORT_LINE = 2;
/** Länge der durchgehenden Kolbenstange je Seite: ragt in jeder Kolbenstellung mindestens 1M heraus. */
export const THROUGH_ROD = 7;
/** Länge der einseitigen Kolbenstange ab Kolben: eingefahren 3M aus dem Rahmen. */
export const ROD = BODY_WIDTH - 1 - PISTON + ROD_OUT;
/** Plunger 9M × 3M (8.4.19), eingefahren 2M vom Boden. */
export const PLUNGER = { length: 9, thickness: 3, start: 2, travel: 5 };

/** Kasten des Endschalters 3M × 3M (8.4.7). */
export const SWITCH_BOX = 3;
/** Membranzylinder: Kolbenstange ab der Membran (Beispiele 6.3.4/6.3.5). */
export const DIAPHRAGM_ROD = 9;
/** Höhe des Schlittens beim kolbenstangenlosen Zylinder (Beispiel 6.3.11). */
export const CARRIAGE_HEIGHT = 2;

export interface CylinderLayout {
  /** Abstand des Rahmens vom oberen Rand (Platz für Endschalter, Schlitten, Hubbegrenzung). */
  top: number;
  /** Linker Rand des Zylinderrahmens. */
  bodyX: number;
  bodyHeight: number;
  /** Kolbenzylinder: linke Kante des Kolbens (Kolben ist 2M breit); Membranzylinder: Lage der Membran. */
  pistonX: number;
  /** Kolbenlage (Abstand vom Rahmenboden) eingefahren und ausgefahren, Kolben- und Membranzylinder. */
  travel: [number, number];
  /** Ausfahrweg in M: Plunger bzw. erste und zweite Teleskopstufe. */
  extension: [number, number];
  width: number;
  height: number;
  /** Anschlüsse als x-Lage (in M); y ist immer die Unterkante (height). */
  ports: { id: 'A' | 'B' | 'C'; x: number }[];
}

/** Kleinste ganze Zahl ≥ x mit derselben Parität wie `like` (Anschlüsse bleiben gedreht im Raster). */
const ceilParity = (x: number, like: number) => {
  const n = Math.ceil(x - 1e-9);
  return (n - like) % 2 === 0 ? n : n + 1;
};

export function cylinderLayout(config: CylinderConfig): CylinderLayout {
  const s = config.stroke / 100;
  if (config.design === 'piston' || config.design === 'diaphragm') {
    const diaphragm = config.design === 'diaphragm';
    const through = config.rod === 'through';
    const rodless = config.rod === 'rodless';
    const left = config.limitSwitch === 'left' || config.limitSwitch === 'both';
    const right = config.limitSwitch === 'right' || config.limitSwitch === 'both';
    // Membran: Sehne 3,5M vom Boden (6.3.4), mit Feder im Kolbenraum weiter rechts (6.3.5)
    const min = diaphragm ? (config.spring === 'piston' ? 5.5 : 3.5) : config.spring === 'piston' ? 4 : 1;
    const max = diaphragm ? (config.spring === 'rod' ? 4.5 : 6.5) : config.spring === 'rod' ? 3 : 6;
    const offset = min + (max - min) * s;
    // Links Platz für den Endschalter bzw. die Hubbegrenzung (reicht 4,25M nach links)
    let bodyX = config.strokeLimiter ? 5.5 : left ? 3.5 : 1.5;
    // Durchgehende Stange: Rahmen so weit nach rechts, dass die Stange links nicht übersteht.
    while (through && bodyX + offset - THROUGH_ROD < 0) bodyX += 2;
    const top = config.limitSwitch !== 'none' ? SWITCH_BOX : rodless ? CARRIAGE_HEIGHT : config.strokeLimiter ? 1 : 0;
    const pistonX = bodyX + offset;
    const bodyEnd = bodyX + BODY_WIDTH;
    const extra = rodActuatorExtra(config.rodActuator ?? 'none');
    const rodEnd = rodless ? bodyEnd : diaphragm ? pistonX + DIAPHRAGM_ROD + extra : pistonX + PISTON + (through ? THROUGH_ROD : ROD) + extra;
    const height = top + BODY_HEIGHT + PORT_LINE;
    const { a, b } = cylinderPorts(config);
    return {
      top,
      bodyX,
      bodyHeight: BODY_HEIGHT,
      pistonX,
      travel: [min, max],
      extension: [0, 0],
      width: ceilParity(Math.max(rodEnd, bodyEnd + (right ? SWITCH_BOX : 0)), height),
      height,
      ports: [...(a ? [{ id: 'A' as const, x: bodyX + 0.5 }] : []), ...(b ? [{ id: 'B' as const, x: bodyX + 8.5 }] : [])],
    };
  }

  const bodyX = 1.5;
  const height = LARGE_BODY_HEIGHT + PORT_LINE;
  const A = { id: 'A' as const, x: bodyX + 0.5 };
  if (config.design === 'plunger') {
    const e = PLUNGER.travel * s;
    return {
      top: 0,
      bodyX,
      bodyHeight: LARGE_BODY_HEIGHT,
      pistonX: bodyX,
      travel: [0, 0],
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
      top: 0,
      bodyX,
      bodyHeight: LARGE_BODY_HEIGHT,
      pistonX: bodyX,
      travel: [0, 0],
      extension: [e1, e2],
      width: ceilParity(bodyX + 18.5 + e2, height),
      height,
      ports: [A],
    };
  }
  // Doppeltwirkend: Stufe 1 von 4M bis 13M mit Bund, Stufe 2 von 7M bis 16M mit Bund.
  return {
    top: 0,
    bodyX,
    bodyHeight: LARGE_BODY_HEIGHT,
    pistonX: bodyX,
    travel: [0, 0],
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
  if (isObject(v) && v.rodActuator !== undefined) v = { ...v, rodActuator: upgradeActuator(v.rodActuator) };
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
  const rodActuator = r.oneOf('rodActuator', ROD_ACTUATOR_NAMES, 'none');
  const springPort = r.bool('springPort', false);
  const limitSwitch = r.oneOf('limitSwitch', LIMIT_SWITCH_NAMES, 'none');
  const vent = r.bool('vent', false);
  const strokeLimiter = r.bool('strokeLimiter', false);
  const detent = r.oneOf('detent', DETENT_NAMES, 'none');
  if (!r.ok || !piston || !rodCushion) return undefined;
  return normalizeCylinder({
    kind: 'cylinder',
    design,
    action,
    rod,
    spring,
    cushion: { piston, rod: rodCushion },
    stroke,
    rodActuator,
    springPort,
    limitSwitch,
    vent,
    strokeLimiter,
    detent,
  });
}
