import { configReader } from './configRead.ts';
import { transformLocalPoint } from './diagram.ts';
import { LETTERING, textWidth } from './lettering.ts';
import type { ComponentInstance, ComponentDefinition, Diagram, PortDefinition, Point } from './types.ts';

/**
 * Kleine Stromlaufpläne für Elektropneumatik und Elektrohydraulik.
 *
 * Schaltzeichen nach DIN EN 60617 (Symbolelemente aus Teil 2: Wirkverbindung
 * 02-12-01, verzögerte Wirkung 02-12-05/06, Raste 02-12-08, Steller 02-13-xx;
 * Kontakte, Spulen und Leuchtmelder wie in Teil 7 und 8), Kennzeichen nach
 * DIN EN IEC 81346-2 (-KF Relais, -SJ Taster, -BG Endschalter und
 * Näherungsschalter, -MB Magnetspule, -PF Leuchtmelder).
 *
 * Kontakte stehen senkrecht im Strompfad, Anschlüsse oben und unten. Ihre
 * Anschlussbezeichnungen folgen der üblichen Kontaktnummerierung: erste Ziffer
 * = Ordnungsziffer, zweite = Funktion (1/2 Öffner, 3/4 Schließer, Wechsler
 * 1/2/4; zeitverzögert 5/6 bzw. 7/8). Relaisspulen haben A1/A2.
 *
 * Maße in M (1 M = 2,5 mm = 1 Rasterschritt); Zeichnungen in ui/electricSymbols.tsx.
 */

export const isElectricType = (type: string) => type.startsWith('electric.');

const port = (id: string, x: number, y: number, unit: number, label: string): PortDefinition => ({
  id,
  kind: 'work',
  offset: { x: x * unit, y: y * unit },
  label,
});

const even = (n: number) => Math.ceil(n / 2) * 2;

// --- Kontakt (Schließer, Öffner, Wechsler) ------------------------------------

export type ContactFunction = 'no' | 'nc' | 'changeover';

export const CONTACT_FUNCTION_NAMES: Record<ContactFunction, string> = {
  no: 'Schließer',
  nc: 'Öffner',
  changeover: 'Wechsler',
};

/** Betätigung (DIN EN 60617-2, Hauptabschnitt 13); `none` = Relaiskontakt. */
export type ContactActuation = 'none' | 'manual' | 'push' | 'pull' | 'turn' | 'roller' | 'position' | 'proximity';

export const ACTUATION_NAMES: Record<ContactActuation, string> = {
  none: 'Relaiskontakt (keine)',
  manual: 'Von Hand, allgemein',
  push: 'Durch Drücken (Taster)',
  pull: 'Durch Ziehen',
  turn: 'Durch Drehen',
  roller: 'Durch Rolle',
  position: 'Positionsschalter (Endschalter)',
  proximity: 'Durch Annähern (Näherungsschalter)',
};

/** Art des Näherungsschalters: Zeichen vor dem Annäherungs-Rhombus. */
export type Sensing = 'general' | 'magnetic' | 'inductive' | 'capacitive';

export const SENSING_NAMES: Record<Sensing, string> = {
  general: 'Allgemein',
  magnetic: 'Magnetisch (Reedkontakt)',
  inductive: 'Induktiv',
  capacitive: 'Kapazitiv',
};

/** Zeitverzögerung des Kontakts (Zeitrelais): beim Ansprechen oder beim Rückfall. */
export type ContactDelay = 'none' | 'on' | 'off';

export const DELAY_NAMES: Record<ContactDelay, string> = {
  none: 'Unverzögert',
  on: 'Ansprechverzögert',
  off: 'Rückfallverzögert',
};

export const CONTACT_INDEXES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface ElectricContactConfig {
  kind: 'electric-contact';
  function: ContactFunction;
  actuation: ContactActuation;
  /** Nur bei `proximity`. */
  sensing: Sensing;
  /** Raste (02-12-08): Stellschalter statt Taster. */
  detent: boolean;
  delay: ContactDelay;
  /** In betätigtem Zustand dargestellt, z. B. ein in Grundstellung betätigter Endschalter. */
  actuated: boolean;
  /** Ordnungsziffer des Kontakts (erste Ziffer der Anschlussbezeichnung). */
  index: number;
}

export function defaultContactConfig(fn: ContactFunction = 'no', actuation: ContactActuation = 'none'): ElectricContactConfig {
  return { kind: 'electric-contact', function: fn, actuation, sensing: 'inductive', detent: false, delay: 'none', actuated: false, index: 1 };
}

export function contactTitle(c: ElectricContactConfig): string {
  const fn = CONTACT_FUNCTION_NAMES[c.function];
  if (c.actuation === 'proximity') return `Näherungsschalter (${fn})`;
  if (c.actuation === 'position' || c.actuation === 'roller') return `Endschalter (${fn})`;
  if (c.actuation !== 'none') return `${c.detent ? 'Stellschalter' : 'Taster'} (${fn})`;
  if (c.delay !== 'none') return `${fn}, ${DELAY_NAMES[c.delay].toLowerCase()}`;
  return `Relaiskontakt (${fn})`;
}

/**
 * Lage in M: `axis` = x des Kontakts (gemeinsamer Anschluss unten), Höhe 4.
 * Links davon Platz für Steller (5M) bzw. Verzögerung (3M), beim Wechsler
 * rechts der Öffneranschluss 2M weiter.
 */
export function contactLayout(c: ElectricContactConfig) {
  const axis = c.actuation !== 'none' && c.actuation !== 'position' ? 5 : c.delay !== 'none' ? 3 : 1;
  const right = axis + (c.function === 'changeover' ? 2 : 0);
  // Pfeil „betätigter Zustand“ rechts neben dem Kontakt.
  const width = right + (c.actuated ? 2 : 1);
  return { axis, width: even(width), height: 4, nc: axis + 2, arrow: right + 1.4 };
}

/** Anschlussbezeichnungen: Ordnungsziffer + Funktionsziffer. */
export function contactTerminals(c: ElectricContactConfig): { top: string; bottom: string; nc?: string } {
  const i = c.index;
  const d = c.delay !== 'none';
  // Ungerade Ziffer oben (zur +24-V-Schiene), gerade unten.
  if (c.function === 'no') return { top: `${i}${d ? 7 : 3}`, bottom: `${i}${d ? 8 : 4}` };
  if (c.function === 'nc') return { top: `${i}${d ? 5 : 1}`, bottom: `${i}${d ? 6 : 2}` };
  // Wechsler: Schließerseite oben über dem gemeinsamen Anschluss, Öffnerseite rechts daneben.
  return { top: `${i}${d ? 8 : 4}`, bottom: `${i}${d ? 5 : 1}`, nc: `${i}${d ? 6 : 2}` };
}

export function contactGeometry(c: ElectricContactConfig, unit: number) {
  const l = contactLayout(c);
  const t = contactTerminals(c);
  const ports = [port('top', l.axis, 0, unit, t.top), port('bottom', l.axis, l.height, unit, t.bottom)];
  if (t.nc) ports.push(port('nc', l.nc, 0, unit, t.nc));
  return { size: { width: l.width * unit, height: l.height * unit }, ports };
}

export function readContactConfig(v: unknown, path: string, errors: string[]): ElectricContactConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ElectricContactConfig = {
    kind: 'electric-contact',
    function: r.oneOf('function', CONTACT_FUNCTION_NAMES),
    actuation: r.oneOf('actuation', ACTUATION_NAMES),
    sensing: r.oneOf('sensing', SENSING_NAMES, 'inductive'),
    detent: r.bool('detent', false),
    delay: r.oneOf('delay', DELAY_NAMES, 'none'),
    actuated: r.bool('actuated', false),
    index: r.count('index', CONTACT_INDEXES, 1),
  };
  return r.ok ? config : undefined;
}

// --- Spule (Relais, Zeitrelais, Magnetventil) ----------------------------------

export type CoilVariant = 'relay' | 'on-delay' | 'off-delay' | 'on-off-delay' | 'solenoid';

export const COIL_VARIANT_NAMES: Record<CoilVariant, string> = {
  relay: 'Relaisspule',
  'on-delay': 'Mit Ansprechverzögerung',
  'off-delay': 'Mit Rückfallverzögerung',
  'on-off-delay': 'Mit Ansprech- und Rückfallverzögerung',
  solenoid: 'Magnetspule eines Ventils',
};

export interface ElectricCoilConfig {
  kind: 'electric-coil';
  variant: CoilVariant;
  /** Kontaktspiegel unter dem Strompfad (Kontakte mit gleichem Kennzeichen). */
  contactTable: boolean;
}

export function defaultCoilConfig(variant: CoilVariant = 'relay'): ElectricCoilConfig {
  return { kind: 'electric-coil', variant, contactTable: variant !== 'solenoid' };
}

export function coilTitle(c: ElectricCoilConfig): string {
  if (c.variant === 'solenoid') return 'Magnetspule';
  if (c.variant === 'relay') return 'Relaisspule';
  return `Relaisspule ${COIL_VARIANT_NAMES[c.variant].toLowerCase()}`;
}

export const COIL_SIZE = { width: 4, height: 4 };

export function coilGeometry(_c: ElectricCoilConfig, unit: number) {
  return {
    size: { width: COIL_SIZE.width * unit, height: COIL_SIZE.height * unit },
    ports: [port('A1', 2, 0, unit, 'A1'), port('A2', 2, 4, unit, 'A2')],
  };
}

export function readCoilConfig(v: unknown, path: string, errors: string[]): ElectricCoilConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ElectricCoilConfig = {
    kind: 'electric-coil',
    variant: r.oneOf('variant', COIL_VARIANT_NAMES),
    contactTable: r.bool('contactTable', true),
  };
  return r.ok ? config : undefined;
}

// --- Leuchtmelder -------------------------------------------------------------

export interface ElectricLampConfig {
  kind: 'electric-lamp';
  /** Farbe als Kennbuchstaben neben der Lampe, z. B. "RD", "GN" (leer = ohne). */
  color: string;
}

export const LAMP_COLORS: Record<string, string> = { '': 'Ohne Angabe', RD: 'Rot', YE: 'Gelb', GN: 'Grün', BU: 'Blau', WH: 'Weiß' };

export function defaultLampConfig(): ElectricLampConfig {
  return { kind: 'electric-lamp', color: '' };
}

export const lampTitle = () => 'Leuchtmelder';

export function lampGeometry(_c: ElectricLampConfig, unit: number) {
  return { size: { width: 4 * unit, height: 4 * unit }, ports: [port('X1', 2, 0, unit, 'X1'), port('X2', 2, 4, unit, 'X2')] };
}

export function readLampConfig(v: unknown, path: string, errors: string[]): ElectricLampConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ElectricLampConfig = { kind: 'electric-lamp', color: r.oneOf('color', LAMP_COLORS, '') };
  return r.ok ? config : undefined;
}

// --- Näherungsschalter, 3-Leiter ------------------------------------------------

export interface ElectricSensorConfig {
  kind: 'electric-sensor';
  sensing: Sensing;
  output: 'no' | 'nc';
}

export function defaultElectricSensorConfig(): ElectricSensorConfig {
  return { kind: 'electric-sensor', sensing: 'inductive', output: 'no' };
}

export const electricSensorTitle = (c: ElectricSensorConfig) => `Näherungsschalter, 3-Leiter (${SENSING_NAMES[c.sensing].replace(/ \(.*\)/, '').toLowerCase()})`;

/** Gehäuse 5M × 4M; BN (+) oben, BU (0 V) unten, Schaltausgang BK rechts. */
export function electricSensorGeometry(_c: ElectricSensorConfig, unit: number) {
  return {
    size: { width: 6 * unit, height: 6 * unit },
    ports: [port('BN', 2, 0, unit, 'BN'), port('BU', 2, 6, unit, 'BU'), port('BK', 6, 3, unit, 'BK')],
  };
}

export function readElectricSensorConfig(v: unknown, path: string, errors: string[]): ElectricSensorConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ElectricSensorConfig = {
    kind: 'electric-sensor',
    sensing: r.oneOf('sensing', SENSING_NAMES),
    output: r.oneOf('output', { no: '', nc: '' }),
  };
  return r.ok ? config : undefined;
}

// --- Versorgungsschiene (+24 V / 0 V) mit Strompfaden ---------------------------

export type RailPolarity = 'plus' | 'minus';

export const RAIL_NAMES: Record<RailPolarity, string> = { plus: 'Oben (+24 V, L+)', minus: 'Unten (0 V, L−)' };
export const RAIL_TAPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16] as const;
export const RAIL_SPACINGS = [4, 6, 8, 10, 12, 16] as const;

export interface ElectricRailConfig {
  kind: 'electric-rail';
  polarity: RailPolarity;
  /** Beschriftung am Anfang der Schiene, z. B. "+24 V" oder "L+". */
  text: string;
  /** Anzahl der Strompfade (Abgänge). */
  taps: number;
  /** Abstand der Strompfade in M. */
  spacing: number;
  /** Strompfade über der oberen Schiene nummerieren. */
  numbering: boolean;
  /** Nummer des ersten Strompfads. */
  start: number;
}

export function defaultRailConfig(polarity: RailPolarity = 'plus'): ElectricRailConfig {
  return { kind: 'electric-rail', polarity, text: polarity === 'plus' ? '+24 V' : '0 V', taps: 4, spacing: 10, numbering: polarity === 'plus', start: 1 };
}

export const railTitle = (c: ElectricRailConfig) => (c.polarity === 'plus' ? 'Versorgung +24 V' : 'Versorgung 0 V');

/** Breite eines Textes in M (Schrifthöhe 2,5 mm). */
export const electricTextWidth = (text: string) => textWidth(text, LETTERING.normal) / 10;

/** Lage in M: Schiene bei `lineY`, Abgänge bei `taps` (x), Text links über bzw. unter der Linie. */
export function railLayout(c: ElectricRailConfig) {
  // Erster Abgang 6M (15 mm) nach dem Anfang, damit +24-V- und 0-V-Schiene übereinander passen.
  const first = Math.max(6, even(electricTextWidth(c.text) + 1.5));
  const taps = Array.from({ length: c.taps }, (_, i) => first + i * c.spacing);
  const width = taps[taps.length - 1]!;
  return { taps, width, height: 2, lineY: c.polarity === 'plus' ? 2 : 0 };
}

export function railGeometry(c: ElectricRailConfig, unit: number) {
  const l = railLayout(c);
  return {
    size: { width: l.width * unit, height: l.height * unit },
    ports: l.taps.map((x, i) => port(`t${i + 1}`, x, l.lineY, unit, '')),
  };
}

export function readRailConfig(v: unknown, path: string, errors: string[]): ElectricRailConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: ElectricRailConfig = {
    kind: 'electric-rail',
    polarity: r.oneOf('polarity', RAIL_NAMES),
    text: r.text('text', ''),
    taps: r.count('taps', RAIL_TAPS),
    spacing: r.count('spacing', RAIL_SPACINGS),
    numbering: r.bool('numbering', false),
    start: r.number('start', 0, 999, 1),
  };
  return r.ok ? config : undefined;
}

export type ElectricConfig = ElectricContactConfig | ElectricCoilConfig | ElectricLampConfig | ElectricSensorConfig | ElectricRailConfig;

/**
 * Verbindungspunkte auf Versorgungsschienen: belegte Abgänge, außer am Ende
 * der Schiene (dort knickt die Leitung nur ab).
 */
export function railJunctions(
  diagram: Pick<Diagram, 'components' | 'connections'>,
  definitionOf: (c: Placed) => Pick<ComponentDefinition, 'size' | 'ports'> | undefined,
): Point[] {
  const used = new Set<string>();
  for (const l of diagram.connections)
    for (const e of [l.from, l.to]) if ('componentId' in e) used.add(`${e.componentId}/${e.portId}`);
  const out: Point[] = [];
  for (const c of diagram.components) {
    if (c.config?.kind !== 'electric-rail') continue;
    const def = definitionOf(c);
    if (!def) continue;
    def.ports.slice(0, -1).forEach((p) => {
      if (used.has(`${c.id}/${p.id}`)) out.push(at(c, def, p.offset.x, p.offset.y));
    });
  }
  return out;
}

// --- Kennzeichen nach DIN EN IEC 81346-2 ----------------------------------------

/** Kennbuchstaben für ein neu eingefügtes Bauteil; Schienen haben keine. */
export function electricLetters(config: ElectricConfig): string | undefined {
  switch (config.kind) {
    case 'electric-coil':
      return config.variant === 'solenoid' ? 'MB' : 'KF';
    case 'electric-lamp':
      return 'PF';
    case 'electric-sensor':
      return 'BG';
    case 'electric-contact':
      if (config.actuation === 'none') return 'KF';
      return config.actuation === 'roller' || config.actuation === 'position' || config.actuation === 'proximity' ? 'BG' : 'SJ';
    default:
      return undefined;
  }
}

/** Nummer aus einem Kennzeichen wie "-KF3" (sonst NaN). */
function labelNumber(label: string, letters: string): number {
  const m = new RegExp(`^-?${letters}(\\d+)$`).exec(label.trim());
  return m ? Number(m[1]) : NaN;
}

/**
 * Kennzeichen und Ordnungsziffer für ein neues elektrisches Bauteil.
 * Spulen, Leuchtmelder, Taster und Sensoren bekommen die nächste freie Nummer
 * (-KF1, -KF2 …). Ein Relaiskontakt gehört zum zuletzt nummerierten Relais und
 * bekommt dessen nächste freie Ordnungsziffer.
 */
export function electricInsert(
  config: ElectricConfig,
  sheets: Pick<Diagram, 'components'>[],
): { config: ElectricConfig; label: string } {
  const letters = electricLetters(config);
  if (!letters) return { config, label: '' };
  const all = sheets.flatMap((d) => d.components);
  if (config.kind === 'electric-contact' && config.actuation === 'none') {
    const coils = all.filter((c) => c.config?.kind === 'electric-coil' && c.config.variant !== 'solenoid');
    const highest = Math.max(0, ...coils.map((c) => labelNumber(c.label, 'KF')).filter(Number.isFinite));
    const label = `-KF${Math.max(1, highest)}`;
    const used = all
      .filter((c) => c.config?.kind === 'electric-contact' && c.label.trim() === label)
      .map((c) => (c.config as ElectricContactConfig).index);
    const index = CONTACT_INDEXES.find((i) => !used.includes(i)) ?? 1;
    return { config: { ...config, index }, label };
  }
  // Mehrere Kontakte eines Tasters teilen sich ein Kennzeichen; ein neuer Taster ist ein neues Gerät.
  const highest = Math.max(0, ...all.filter((c) => c.label).map((c) => labelNumber(c.label, letters)).filter(Number.isFinite));
  return { config, label: `-${letters}${highest + 1}` };
}

// --- Strompfade und Kontaktspiegel ---------------------------------------------

type Placed = Pick<ComponentInstance, 'id' | 'type' | 'config' | 'position' | 'rotation' | 'mirrored' | 'label'>;

const at = (c: Placed, def: Pick<ComponentDefinition, 'size'>, x: number, y: number) => transformLocalPoint(c, def, { x, y });

/** Strompfad mit x-Lage (Einheiten) auf dem Blatt, aus den nummerierten +24-V-Schienen. */
export function currentPaths(diagram: Pick<Diagram, 'components'>, unit: number): { number: number; x: number; y: number; spacing: number }[] {
  const out: { number: number; x: number; y: number; spacing: number }[] = [];
  for (const c of diagram.components) {
    if (c.config?.kind !== 'electric-rail' || !c.config.numbering) continue;
    const cfg = c.config;
    const l = railLayout(cfg);
    const def = { size: { width: l.width * unit, height: l.height * unit } };
    l.taps.forEach((x, i) => {
      const p = at(c, def, x * unit, l.lineY * unit);
      out.push({ number: cfg.start + i, x: p.x, y: p.y, spacing: cfg.spacing * unit });
    });
  }
  return out;
}

/** Nummer des Strompfads, in dem ein Punkt liegt (unterhalb der Schiene, waagerecht am nächsten). */
export function pathAt(paths: ReturnType<typeof currentPaths>, p: Point): number | undefined {
  let best: { n: number; d: number } | undefined;
  for (const path of paths) {
    const d = Math.abs(path.x - p.x);
    if (p.y < path.y || d > path.spacing / 2) continue;
    if (!best || d < best.d) best = { n: path.number, d };
  }
  return best?.n;
}

export interface ContactTable {
  coilId: string;
  /** Oben in der Mitte der Tabelle (Einheiten). */
  at: Point;
  /** Strompfade der Schließer (inkl. Wechsler) und Öffner (inkl. Wechsler); "?" = nicht in einem nummerierten Strompfad. */
  no: string[];
  nc: string[];
}

/**
 * Kontaktspiegel: unter jeder Relaisspule mit Kennzeichen eine Tabelle der
 * Strompfade, in denen ihre Kontakte (gleiches Kennzeichen) liegen; links
 * Schließer, rechts Öffner. Sie steht unter der 0-V-Schiene des Strompfads,
 * sonst direkt unter der Spule.
 */
export function contactTables(
  diagram: Pick<Diagram, 'components'>,
  definitionOf: (c: Placed) => Pick<ComponentDefinition, 'size' | 'ports'> | undefined,
  unit: number,
): ContactTable[] {
  const paths = currentPaths(diagram, unit);
  const tables: ContactTable[] = [];
  const portAt = (c: Placed, id: string) => {
    const def = definitionOf(c);
    const p = def?.ports.find((q) => q.id === id);
    return def && p ? at(c, def, p.offset.x, p.offset.y) : undefined;
  };
  for (const coil of diagram.components) {
    if (coil.config?.kind !== 'electric-coil' || !coil.config.contactTable || coil.config.variant === 'solenoid') continue;
    const label = coil.label.trim();
    const bottom = portAt(coil, 'A2');
    const top = portAt(coil, 'A1');
    if (!label || !bottom || !top) continue;
    const low = top.y > bottom.y ? top : bottom;
    const no: number[] = [];
    const nc: number[] = [];
    const unknown = { no: 0, nc: 0 };
    for (const c of diagram.components) {
      if (c.config?.kind !== 'electric-contact' || c.config.actuation !== 'none' || c.label.trim() !== label) continue;
      const p = portAt(c, 'bottom');
      const n = p ? pathAt(paths, p) : undefined;
      const fn = c.config.function;
      if (n === undefined) {
        if (fn !== 'nc') unknown.no++;
        if (fn !== 'no') unknown.nc++;
        continue;
      }
      if (fn !== 'nc') no.push(n);
      if (fn !== 'no') nc.push(n);
    }
    if (no.length + nc.length + unknown.no + unknown.nc === 0) continue;
    // Nächste 0-V-Schiene unter der Spule, die über ihre x-Lage reicht.
    let railY: number | undefined;
    for (const r of diagram.components) {
      if (r.config?.kind !== 'electric-rail' || r.config.polarity !== 'minus') continue;
      const def = definitionOf(r);
      const l = railLayout(r.config);
      if (!def) continue;
      const a = at(r, def, 0, l.lineY * unit);
      const b = at(r, def, def.size.width, l.lineY * unit);
      if (low.x < Math.min(a.x, b.x) || low.x > Math.max(a.x, b.x) || a.y < low.y) continue;
      if (railY === undefined || a.y < railY) railY = a.y;
    }
    const y = (railY ?? low.y) + unit;
    const list = (ns: number[], extra: number) => [...ns.sort((a, b) => a - b).map(String), ...Array<string>(extra).fill('?')];
    tables.push({ coilId: coil.id, at: { x: low.x, y }, no: list(no, unknown.no), nc: list(nc, unknown.nc) });
  }
  return tables;
}

export function isElectricConfig(config: { kind: string } | undefined): config is ElectricConfig {
  return config?.kind.startsWith('electric-') === true;
}
