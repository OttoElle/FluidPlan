import { configReader, type ConfigReader } from './configRead.ts';
import { isJunctionRef } from './diagram.ts';
import { LETTERING, textWidth } from './lettering.ts';
import type { Connection, Diagram, Endpoint, PortDefinition, Point } from './types.ts';

/**
 * GRAFCET nach DIN EN 60848:2014 (IEC 60848:2013).
 *
 * Die Sprachelemente (Abschnitt 5) sind konfigurierbare Bauteile des Katalogs
 * „GRAFCET“: Schritt (Tabelle 1), Transition (Tabelle 2), Aktion und
 * zwangssteuernder Befehl (Tabellen 5, 6 und 9), Synchronisierung (Symbol [9])
 * und Zielhinweis (Symbol [12]). Wirkungslinien (Tabelle 3) sind gewöhnliche
 * Leitungen zwischen ihren Anschlüssen; Verzweigungen bekommen keinen Punkt
 * (siehe grafcetConnections), Wirkungslinien nach oben einen Pfeil
 * (Symbol [11], siehe upwardArrows).
 *
 * Nach Abschnitt 5, Anmerkung 1 ist nur die allgemeine Darstellung
 * verbindlich, Abmessungen sind frei. Hier: Schritt als Quadrat 4M (die Norm
 * empfiehlt das Quadrat), Aktion mit der Höhe des Schritts (Symbol [20]),
 * Schrift 2,5 mm = 1M wie im Schaltplan. Maße in M; Zeichnungen in
 * ui/grafcetSymbols.tsx.
 */

/** Schrifthöhe in M (2,5 mm). */
export const GRAFCET_TEXT = LETTERING.normal / 10;

/** Breite eines Textes in M (Schrifthöhe 1M); `!` für die Negation zählt nicht mit. */
export function grafcetTextWidth(text: string): number {
  return textWidth(text.replace(/!/g, ''), LETTERING.normal) / 10;
}

const even = (n: number) => Math.ceil(n / 2) * 2;
const odd = (n: number) => (Math.ceil(n) % 2 === 1 ? Math.ceil(n) : Math.ceil(n) + 1);

const port = (id: string, x: number, y: number, unit: number): PortDefinition => ({
  id,
  kind: 'work',
  offset: { x: x * unit, y: y * unit },
  // Wirkungslinien haben keine Anschlussbezeichnungen.
  label: '',
});

// --- Schritt (Tabelle 1) ------------------------------------------------------

export type StepVariant = 'step' | 'initial' | 'enclosing' | 'initial-enclosing' | 'macro';

export const STEP_VARIANT_NAMES: Record<StepVariant, string> = {
  step: 'Schritt',
  initial: 'Anfangsschritt',
  enclosing: 'Einschließender Schritt',
  'initial-enclosing': 'Einschließender Anfangsschritt',
  macro: 'Makroschritt',
};

export interface GrafcetStepConfig {
  kind: 'grafcet-step';
  variant: StepVariant;
  /** Bezeichnung des Schritts, z. B. "2" oder "M1" (ersetzt das Sternchen). */
  name: string;
  /** Aktiv-Markierung: Punkt im Schritt (Tabelle 1, Anmerkung zu [1]). */
  active: boolean;
}

export function defaultStepConfig(variant: StepVariant = 'step', name = '1'): GrafcetStepConfig {
  return { kind: 'grafcet-step', variant, name, active: false };
}

export function stepTitle(c: GrafcetStepConfig): string {
  return c.name ? `${STEP_VARIANT_NAMES[c.variant]} ${c.name}` : STEP_VARIANT_NAMES[c.variant];
}

/** Breite in M: Quadrat 4M, für lange Bezeichnungen breiter (gerade, damit die Anschlüsse auf dem Raster liegen). */
export function stepWidth(c: GrafcetStepConfig): number {
  const inset = c.variant === 'step' || c.variant === 'macro' ? 1 : 2;
  return Math.max(4, even(grafcetTextWidth(c.name) + inset));
}

export const STEP_HEIGHT = 4;

/** Eingang oben, Ausgang unten (je in der Mitte), Aktionen rechts. */
export function stepGeometry(c: GrafcetStepConfig, unit: number) {
  const w = stepWidth(c);
  return {
    size: { width: w * unit, height: STEP_HEIGHT * unit },
    ports: [port('in', w / 2, 0, unit), port('out', w / 2, STEP_HEIGHT, unit), port('act', w, STEP_HEIGHT / 2, unit)],
  };
}

const readName = (r: ConfigReader, key: string) => r.text(key, '');

export function readStepConfig(v: unknown, path: string, errors: string[]): GrafcetStepConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: GrafcetStepConfig = {
    kind: 'grafcet-step',
    variant: r.oneOf('variant', STEP_VARIANT_NAMES),
    name: readName(r, 'name'),
    active: r.bool('active', false),
  };
  return r.ok ? config : undefined;
}

// --- Transition (Tabelle 2 und 4) -----------------------------------------------

export interface GrafcetTransitionConfig {
  kind: 'grafcet-transition';
  /**
   * Transitionsbedingung (Symbol [13]), z. B. "a · !b", "↑S1", "3s/X2", "[C1 = 3]" oder "1".
   * `!` vor einem Namen oder einer Klammer wird als Überstrich (Negation) gezeichnet.
   */
  condition: string;
  /** Transitionsname (Symbol [8]), links in Klammern; leer = ohne. */
  name: string;
}

export function defaultTransitionConfig(condition = ''): GrafcetTransitionConfig {
  return { kind: 'grafcet-transition', condition, name: '' };
}

export function transitionTitle(c: GrafcetTransitionConfig): string {
  return c.name ? `Transition (${c.name})` : 'Transition';
}

/** Lage der Transition in M: senkrechte Wirkungslinie bei `axis`, Querstrich 2M breit. */
export function transitionLayout(c: GrafcetTransitionConfig) {
  const nameWidth = c.name ? grafcetTextWidth(`(${c.name})`) + 0.5 : 0;
  const axis = c.name ? Math.max(2, Math.ceil(nameWidth + 1)) : 1;
  const right = c.condition ? axis + 1.5 + grafcetTextWidth(c.condition) + 0.5 : axis + 1;
  return { axis, width: even(right), height: 2 };
}

export function transitionGeometry(c: GrafcetTransitionConfig, unit: number) {
  const l = transitionLayout(c);
  return {
    size: { width: l.width * unit, height: l.height * unit },
    ports: [port('in', l.axis, 0, unit), port('out', l.axis, l.height, unit)],
  };
}

export function readTransitionConfig(v: unknown, path: string, errors: string[]): GrafcetTransitionConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: GrafcetTransitionConfig = { kind: 'grafcet-transition', condition: readName(r, 'condition'), name: readName(r, 'name') };
  return r.ok ? config : undefined;
}

// --- Aktion und zwangssteuernder Befehl (Tabellen 5, 6, 9) ----------------------

export type ActionType = 'continuous' | 'activation' | 'deactivation' | 'event' | 'forcing';

export const ACTION_TYPE_NAMES: Record<ActionType, string> = {
  continuous: 'Kontinuierlich wirkend',
  activation: 'Bei Aktivierung',
  deactivation: 'Bei Deaktivierung',
  event: 'Bei Ereignis',
  forcing: 'Zwangssteuernder Befehl',
};

export interface GrafcetActionConfig {
  kind: 'grafcet-action';
  type: ActionType;
  /** Ausgang bzw. Zuordnung im Rechteck, z. B. "Y1", "A := 1", "G2{INIT}". */
  text: string;
  /**
   * Bei kontinuierlich wirkender Aktion die Zuweisungsbedingung (Symbole [22]
   * bis [25], z. B. "d" oder "3s/X27"), bei Aktion bei Ereignis das Ereignis
   * (Symbol [29], z. B. "↑a"); sonst ohne Bedeutung.
   */
  condition: string;
}

export function defaultActionConfig(type: ActionType = 'continuous', text = 'Y1'): GrafcetActionConfig {
  return { kind: 'grafcet-action', type, text, condition: '' };
}

export function actionTitle(c: GrafcetActionConfig): string {
  if (c.type === 'forcing') return 'Zwangssteuernder Befehl';
  if (c.type === 'continuous') return 'Kontinuierlich wirkende Aktion';
  return `Gespeichert wirkende Aktion (${ACTION_TYPE_NAMES[c.type].toLowerCase()})`;
}

/** Hat die Aktion einen Zusatz über dem Rechteck (Bedingung, Ereignis)? */
export function actionHasCondition(c: GrafcetActionConfig): boolean {
  return (c.type === 'continuous' && c.condition !== '') || c.type === 'event';
}

/**
 * Lage der Aktion in M: kurze Wirkungslinie (1M) zum Anschluss links, darüber
 * bzw. darunter Platz für Bedingung oder Pfeil.
 * - top: Oberkante des Rechtecks
 * - box: Breite des Rechtecks (ungerade, damit die Gesamtbreite gerade bleibt)
 * - line: x der senkrechten Linie für Bedingung bzw. Ereignis
 */
export function actionLayout(c: GrafcetActionConfig) {
  const top = actionHasCondition(c) || c.type === 'activation' ? 2 : 0;
  const bottom = c.type === 'deactivation' ? 2 : 0;
  const box = Math.max(5, odd(grafcetTextWidth(c.text) + 2));
  const line = 1 + Math.min(2, Math.floor(box / 3));
  const conditionEnd = actionHasCondition(c) ? line + 0.5 + grafcetTextWidth(c.type === 'event' ? c.condition || '↑' : c.condition) : 0;
  // Gesamtbreite gerade wie die Höhe; Bedingungstext darf über das Rechteck hinausragen.
  const width = Math.max(1 + box, even(conditionEnd));
  return { top, bottom, box, line, width, height: top + STEP_HEIGHT + bottom, portY: top + STEP_HEIGHT / 2 };
}

export function actionGeometry(c: GrafcetActionConfig, unit: number) {
  const l = actionLayout(c);
  return { size: { width: l.width * unit, height: l.height * unit }, ports: [port('in', 0, l.portY, unit)] };
}

export function readActionConfig(v: unknown, path: string, errors: string[]): GrafcetActionConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: GrafcetActionConfig = {
    kind: 'grafcet-action',
    type: r.oneOf('type', ACTION_TYPE_NAMES),
    text: readName(r, 'text'),
    condition: readName(r, 'condition'),
  };
  return r.ok ? config : undefined;
}

// --- Synchronisierung (Symbol [9]) ----------------------------------------------

export const SYNC_COUNTS = [1, 2, 3, 4, 5, 6] as const;
export const SYNC_SPACINGS = [6, 8, 10, 12, 14, 16, 20, 24] as const;

/**
 * Doppelte waagerechte Linie für das Zusammenführen bzw. Aufteilen paralleler
 * Ablaufketten; oben `above`, unten `below` Wirkungslinien im Abstand `spacing` (M).
 */
export interface GrafcetSyncConfig {
  kind: 'grafcet-sync';
  above: number;
  below: number;
  spacing: number;
}

export function defaultSyncConfig(above = 1, below = 2): GrafcetSyncConfig {
  return { kind: 'grafcet-sync', above, below, spacing: 10 };
}

export function syncTitle(c: GrafcetSyncConfig): string {
  if (c.above > 1 && c.below > 1) return 'Synchronisierung und Aktivierung paralleler Ablaufketten';
  if (c.above > 1) return 'Synchronisierung paralleler Ablaufketten';
  return 'Aktivierung paralleler Ablaufketten';
}

/** Anschlusslagen in M: oben i1…, unten o1…, jeweils mittig zueinander. */
export function syncLayout(c: GrafcetSyncConfig) {
  const n = Math.max(c.above, c.below);
  const width = (n - 1) * c.spacing + 2;
  const xs = (count: number) => Array.from({ length: count }, (_, i) => 1 + ((n - count) * c.spacing) / 2 + i * c.spacing);
  return { width, height: 2, top: xs(c.above), bottom: xs(c.below) };
}

export function syncGeometry(c: GrafcetSyncConfig, unit: number) {
  const l = syncLayout(c);
  return {
    size: { width: l.width * unit, height: l.height * unit },
    ports: [...l.top.map((x, i) => port(`i${i + 1}`, x, 0, unit)), ...l.bottom.map((x, i) => port(`o${i + 1}`, x, l.height, unit))],
  };
}

export function readSyncConfig(v: unknown, path: string, errors: string[]): GrafcetSyncConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: GrafcetSyncConfig = {
    kind: 'grafcet-sync',
    above: r.count('above', SYNC_COUNTS),
    below: r.count('below', SYNC_COUNTS),
    spacing: r.count('spacing', SYNC_SPACINGS),
  };
  return r.ok ? config : undefined;
}

// --- Zielhinweis (Symbol [12]) --------------------------------------------------

export type ConnectorDirection = 'out' | 'in';

export const CONNECTOR_DIRECTION_NAMES: Record<ConnectorDirection, string> = {
  out: 'Ablauf weiter bei …',
  in: 'Ablauf kommt von …',
};

export interface GrafcetConnectorConfig {
  kind: 'grafcet-connector';
  direction: ConnectorDirection;
  /** Zielschritt und Seite, mehrzeilig mit "\n", z. B. "Schritt 83\nSeite 13". */
  target: string;
}

export function defaultConnectorConfig(direction: ConnectorDirection = 'out'): GrafcetConnectorConfig {
  return { kind: 'grafcet-connector', direction, target: 'Schritt 1\nSeite 1' };
}

export function connectorTitle(c: GrafcetConnectorConfig): string {
  return c.direction === 'out' ? 'Zielhinweis (Ablauf weiter)' : 'Zielhinweis (Ablauf kommt)';
}

export const CONNECTOR_LINE = 2;
export const CONNECTOR_PITCH = 1.6;

export function connectorLayout(c: GrafcetConnectorConfig) {
  const lines = c.target.split('\n');
  const textWidthM = Math.max(0, ...lines.map(grafcetTextWidth));
  const width = Math.max(2, even(textWidthM + 1));
  const height = even(CONNECTOR_LINE + 0.6 + lines.length * CONNECTOR_PITCH);
  return { lines, width, height, axis: width / 2 };
}

export function connectorGeometry(c: GrafcetConnectorConfig, unit: number) {
  const l = connectorLayout(c);
  return {
    size: { width: l.width * unit, height: l.height * unit },
    ports: [port(c.direction === 'out' ? 'in' : 'out', l.axis, c.direction === 'out' ? 0 : l.height, unit)],
  };
}

export function readConnectorConfig(v: unknown, path: string, errors: string[]): GrafcetConnectorConfig | undefined {
  const r = configReader(v, path, errors);
  if (!r) return undefined;
  const config: GrafcetConnectorConfig = {
    kind: 'grafcet-connector',
    direction: r.oneOf('direction', CONNECTOR_DIRECTION_NAMES),
    target: readName(r, 'target'),
  };
  return r.ok ? config : undefined;
}

// --- Hilfen für Plan und Darstellung ----------------------------------------------

export type GrafcetConfig =
  | GrafcetStepConfig
  | GrafcetTransitionConfig
  | GrafcetActionConfig
  | GrafcetSyncConfig
  | GrafcetConnectorConfig;

export const isGrafcetType = (type: string) => type.startsWith('grafcet.');

/**
 * Bedingungstext in Abschnitte zerlegen: `!` vor einem Namen (Buchstaben,
 * Ziffern, _) oder vor einer Klammer überstreicht diesen (Negation), z. B.
 * "!b1 · b0" oder "!(a + b)".
 */
export function negationParts(text: string): { text: string; over: boolean }[] {
  const parts: { text: string; over: boolean }[] = [];
  const push = (t: string, over: boolean) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && last.over === over && !over) last.text += t;
    else parts.push({ text: t, over });
  };
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '!' && i + 1 < text.length) {
      let j = i + 1;
      if (text[j] === '(') {
        let depth = 0;
        for (; j < text.length; j++) {
          if (text[j] === '(') depth++;
          else if (text[j] === ')' && --depth === 0) break;
        }
        j = Math.min(j + 1, text.length);
      } else {
        while (j < text.length && /[\p{L}\p{N}_]/u.test(text[j]!)) j++;
      }
      if (j > i + 1) {
        push(text.slice(i + 1, j), true);
        i = j;
        continue;
      }
    }
    push(ch, false);
    i++;
  }
  return parts;
}

/** Nächste freie Schrittnummer der Zeichnung (größte Zahl + 1, ab 1). */
export function nextStepName(diagrams: Pick<Diagram, 'components'>[]): string {
  let max = 0;
  for (const d of diagrams) {
    for (const c of d.components) {
      if (c.config?.kind !== 'grafcet-step') continue;
      const n = /^\d+$/.test(c.config.name) ? Number(c.config.name) : NaN;
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  return String(max + 1);
}

/** Nächster freier Name für einen Teil-GRAFCET-Rahmen (G1, G2, …). */
export function nextFrameName(diagrams: Pick<Diagram, 'annotations'>[]): string {
  let max = 0;
  for (const d of diagrams)
    for (const a of d.annotations) {
      const m = a.kind === 'rect' ? /^G(\d+)$/.exec(a.grafcet?.name.trim() ?? '') : null;
      if (m) max = Math.max(max, Number(m[1]));
    }
  return `G${max + 1}`;
}

/**
 * Wirkungslinien: Leitungen, die (auch über Abzweige) an GRAFCET-Elementen
 * hängen. Ihre Verzweigungen bekommen keinen Punkt (Tabelle 3, Symbol [10]).
 */
export function grafcetConnections(diagram: Pick<Diagram, 'components' | 'connections'>): Set<string> {
  const grafcet = new Set(diagram.components.filter((c) => isGrafcetType(c.type)).map((c) => c.id));
  const result = new Set<string>();
  if (grafcet.size === 0) return result;
  const touches = (e: Endpoint) => !isJunctionRef(e) && grafcet.has(e.componentId);
  const junctions = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of diagram.connections) {
      if (result.has(l.id)) continue;
      const hit = [l.from, l.to].some((e) => touches(e) || (isJunctionRef(e) && junctions.has(e.junctionId)));
      if (!hit) continue;
      result.add(l.id);
      for (const e of [l.from, l.to]) if (isJunctionRef(e)) junctions.add(e.junctionId);
      changed = true;
    }
  }
  return result;
}

/** Abzweige im Netz der Wirkungslinien (ohne Punkt gezeichnet). */
export function grafcetJunctions(diagram: Pick<Diagram, 'components' | 'connections'>, links: Set<string>): Set<string> {
  const out = new Set<string>();
  for (const l of diagram.connections) {
    if (!links.has(l.id)) continue;
    for (const e of [l.from, l.to]) if (isJunctionRef(e)) out.add(e.junctionId);
  }
  return out;
}

/** Anschlüsse, an denen der Ablauf ein Element verlässt. */
const OUTGOING = /^(out|o\d+|act)$/;

/**
 * Richtung des Ablaufs auf einer Wirkungslinie: +1 = von `from` nach `to`,
 * -1 = umgekehrt, 0 = unbekannt (z. B. zwischen zwei Abzweigen).
 */
function flowSign(l: Connection): number {
  const out = (e: Endpoint) => !isJunctionRef(e) && OUTGOING.test(e.portId);
  const into = (e: Endpoint) => !isJunctionRef(e) && !OUTGOING.test(e.portId);
  if (out(l.from) || into(l.to)) return 1;
  if (out(l.to) || into(l.from)) return -1;
  return 0;
}

/**
 * Pfeile auf Wirkungslinien, die von unten nach oben laufen (Symbol [11]):
 * je Leitung einer auf ihrem längsten aufwärts gerichteten Teilstück, in dessen
 * Mitte. `at` ist die Pfeilspitze.
 */
export function upwardArrows(
  diagram: Pick<Diagram, 'components' | 'connections'>,
  paths: Map<string, Point[]>,
  links: Set<string> = grafcetConnections(diagram),
): { id: string; at: Point }[] {
  const arrows: { id: string; at: Point }[] = [];
  for (const l of diagram.connections) {
    if (!links.has(l.id) || [l.from, l.to].some((e) => !isJunctionRef(e) && e.portId === 'act')) continue;
    const sign = flowSign(l);
    const path = paths.get(l.id);
    if (!sign || !path) continue;
    const pts = sign > 0 ? path : [...path].reverse();
    let best: { a: Point; b: Point } | undefined;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (a.x !== b.x || b.y >= a.y) continue;
      if (!best || a.y - b.y > best.a.y - best.b.y) best = { a, b };
    }
    // Erst ab 2 Rasterschritten: kurze Stücke sind Teil einer Umgehung, kein Rücksprung.
    if (best && best.a.y - best.b.y >= 20) {
      arrows.push({ id: l.id, at: { x: best.a.x, y: Math.round((best.a.y + best.b.y) / 2) - 3 } });
    }
  }
  return arrows;
}
