import { definitionOf, getDefinition, isConfigurable, isKnownType, LEGACY_TYPES, readConfig } from '../model/library.ts';
import type {
  ComponentInstance,
  Connection,
  Diagram,
  DiagramMeta,
  Domain,
  Endpoint,
  Junction,
  LineKind,
  Orientation,
  Point,
  Rotation,
  Sheet,
  SheetFormat,
} from '../model/types.ts';
import { SHEET_FORMATS, smallestSheetFor } from '../model/sheet.ts';

/**
 * Dateiformat (.fluidplan.json):
 *
 *   { "format": "fluidplan", "version": 3, "diagram": { ... } }
 *
 * `version` wird erhöht, sobald sich das Format inkompatibel ändert.
 * Ältere Versionen werden dann beim Laden in `migrate` hochgezogen.
 */
export const FILE_FORMAT = 'fluidplan';
export const FILE_VERSION = 3;
export const FILE_EXTENSION = '.fluidplan.json';

interface FileEnvelope {
  format: typeof FILE_FORMAT;
  version: number;
  diagram: Diagram;
}

export function serializeDiagram(diagram: Diagram): string {
  const envelope: FileEnvelope = { format: FILE_FORMAT, version: FILE_VERSION, diagram };
  return JSON.stringify(envelope, null, 2) + '\n';
}

export type ParseResult = { ok: true; diagram: Diagram } | { ok: false; errors: string[] };

export function parseDiagram(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Keine gültige JSON-Datei: ${(e as Error).message}`] };
  }

  const errors: string[] = [];
  if (!isObject(raw) || raw.format !== FILE_FORMAT) {
    return { ok: false, errors: ['Keine FluidPlan-Datei (Feld "format" fehlt oder ist falsch)'] };
  }
  if (typeof raw.version !== 'number' || !Number.isInteger(raw.version) || raw.version < 1) {
    return { ok: false, errors: ['Ungültige Dateiversion'] };
  }
  if (raw.version > FILE_VERSION) {
    return {
      ok: false,
      errors: [`Die Datei hat Version ${raw.version}, dieses Programm kann nur bis Version ${FILE_VERSION} lesen`],
    };
  }

  const diagram = readDiagram(migrate(raw.version, raw.diagram), errors);
  if (errors.length > 0 || !diagram) return { ok: false, errors };
  const upgraded = upgradeLegacyTypes(diagram);
  checkReferences(upgraded, errors);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, diagram: upgraded };
}

/**
 * Stellt Bauteiltypen aus früheren Ständen (z. B. "valve.4-2") auf die heutigen
 * konfigurierbaren Typen um und übersetzt die Anschluss-IDs ihrer Leitungen.
 */
function upgradeLegacyTypes(diagram: Diagram): Diagram {
  const renamed = new Map<string, Record<string, string>>();
  const components = diagram.components.map((c) => {
    const legacy = LEGACY_TYPES[c.type];
    if (!legacy) return c;
    renamed.set(c.id, legacy.ports);
    return { ...c, type: legacy.type, config: structuredClone(legacy.config) };
  });
  if (renamed.size === 0) return diagram;
  const fix = (ref: Endpoint): Endpoint => {
    if ('junctionId' in ref) return ref;
    const map = renamed.get(ref.componentId);
    return map?.[ref.portId] ? { ...ref, portId: map[ref.portId]! } : ref;
  };
  return {
    ...diagram,
    components,
    connections: diagram.connections.map((l) => ({ ...l, from: fix(l.from), to: fix(l.to) })),
  };
}

/**
 * Hebt ältere Dateiversionen schrittweise auf FILE_VERSION.
 * 1 → 2: Zeichenblatt (`sheet`) eingeführt. Alte Pläne bekommen das kleinste
 *        Querformat-Blatt mit Rahmen, auf das ihre Bauteile passen.
 * 2 → 3: Abzweigpunkte (`junctions`); Leitungsenden können auf sie verweisen.
 */
function migrate(version: number, diagram: unknown): unknown {
  let d = diagram;
  if (version < 2 && isObject(d)) d = { ...d, sheet: sheetForV1(d) };
  if (version < 3 && isObject(d)) d = { ...d, junctions: [] };
  return d;
}

function sheetForV1(d: Obj): Sheet {
  let right = 0;
  let bottom = 0;
  for (const c of Array.isArray(d.components) ? d.components : []) {
    if (!isObject(c) || !isObject(c.position)) continue;
    const def = typeof c.type === 'string' ? getDefinition(c.type) : undefined;
    const extent = def ? Math.max(def.size.width, def.size.height) : 0;
    right = Math.max(right, Number(c.position.x) + extent || 0);
    bottom = Math.max(bottom, Number(c.position.y) + extent || 0);
  }
  return smallestSheetFor(right, bottom);
}

// --- Strukturprüfung -------------------------------------------------------

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const DOMAINS: readonly Domain[] = ['hydraulic', 'pneumatic'];
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const LINE_KINDS: readonly LineKind[] = ['working', 'pilot', 'drain'];
const SHEET_FORMAT_KEYS = Object.keys(SHEET_FORMATS) as SheetFormat[];
const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];

function readDiagram(v: unknown, errors: string[]): Diagram | undefined {
  if (!isObject(v)) {
    errors.push('diagram: Objekt erwartet');
    return undefined;
  }
  const domain = oneOf(v.domain, DOMAINS, 'diagram.domain', errors);
  const meta = readMeta(v.meta, errors);
  const sheet = readSheet(v.sheet, errors);
  const components = readArray(v.components, 'diagram.components', errors, readComponent);
  const connections = readArray(v.connections, 'diagram.connections', errors, readConnection);
  const junctions = readArray(v.junctions, 'diagram.junctions', errors, readJunction);
  if (!domain || !meta || !sheet || !components || !connections || !junctions) return undefined;
  return { domain, meta, sheet, components, connections, junctions };
}

function readJunction(v: unknown, path: string, errors: string[]): Junction | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const position = point(v.position, `${path}.position`, errors);
  if (id === undefined || !position) return undefined;
  return { id, position };
}

function readSheet(v: unknown, errors: string[]): Sheet | undefined {
  if (!isObject(v)) {
    errors.push('diagram.sheet: Objekt erwartet');
    return undefined;
  }
  const format = oneOf(v.format, SHEET_FORMAT_KEYS, 'diagram.sheet.format', errors);
  const orientation = oneOf(v.orientation, ORIENTATIONS, 'diagram.sheet.orientation', errors);
  const frame = bool(v.frame, 'diagram.sheet.frame', errors);
  const lineJumps = v.lineJumps === undefined ? undefined : bool(v.lineJumps, 'diagram.sheet.lineJumps', errors);
  if (!format || !orientation || frame === undefined || (v.lineJumps !== undefined && lineJumps === undefined)) {
    return undefined;
  }
  return { format, orientation, frame, ...(lineJumps !== undefined ? { lineJumps } : {}) };
}

function readMeta(v: unknown, errors: string[]): DiagramMeta | undefined {
  if (!isObject(v)) {
    errors.push('diagram.meta: Objekt erwartet');
    return undefined;
  }
  const title = str(v.title, 'diagram.meta.title', errors);
  const author = str(v.author, 'diagram.meta.author', errors);
  const created = str(v.created, 'diagram.meta.created', errors);
  const modified = str(v.modified, 'diagram.meta.modified', errors);
  if (title === undefined || author === undefined || created === undefined || modified === undefined) {
    return undefined;
  }
  return { title, author, created, modified };
}

function readComponent(v: unknown, path: string, errors: string[]): ComponentInstance | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const type = nonEmpty(v.type, `${path}.type`, errors);
  const position = point(v.position, `${path}.position`, errors);
  const rotation = oneOf(v.rotation, ROTATIONS, `${path}.rotation`, errors);
  const mirrored = bool(v.mirrored, `${path}.mirrored`, errors);
  const label = str(v.label, `${path}.label`, errors);
  const properties = stringRecord(v.properties, `${path}.properties`, errors);
  // Konfiguration nur prüfen, wenn der Typ bekannt und konfigurierbar ist;
  // unbekannte Typen meldet checkReferences.
  const config =
    v.config === undefined || type === undefined || !isConfigurable(type)
      ? undefined
      : readConfig(type, v.config, `${path}.config`, errors);
  if (
    id === undefined || type === undefined || !position || rotation === undefined ||
    mirrored === undefined || label === undefined || !properties ||
    (v.config !== undefined && type !== undefined && isConfigurable(type) && !config)
  ) {
    return undefined;
  }
  return { id, type, position, rotation, mirrored, label, properties, ...(config ? { config } : {}) };
}

function readConnection(v: unknown, path: string, errors: string[]): Connection | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const from = endpoint(v.from, `${path}.from`, errors);
  const to = endpoint(v.to, `${path}.to`, errors);
  const kind = oneOf(v.kind, LINE_KINDS, `${path}.kind`, errors);
  const waypoints = readArray(v.waypoints, `${path}.waypoints`, errors, point);
  if (id === undefined || !from || !to || !kind || !waypoints) return undefined;
  return { id, from, to, kind, waypoints };
}

function endpoint(v: unknown, path: string, errors: string[]): Endpoint | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  if ('junctionId' in v) {
    const junctionId = nonEmpty(v.junctionId, `${path}.junctionId`, errors);
    return junctionId === undefined ? undefined : { junctionId };
  }
  const componentId = nonEmpty(v.componentId, `${path}.componentId`, errors);
  const portId = nonEmpty(v.portId, `${path}.portId`, errors);
  if (componentId === undefined || portId === undefined) return undefined;
  return { componentId, portId };
}

function point(v: unknown, path: string, errors: string[]): Point | undefined {
  if (!isObject(v) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    errors.push(`${path}: Punkt {x, y} mit Zahlen erwartet`);
    return undefined;
  }
  return { x: v.x as number, y: v.y as number };
}

function readArray<T>(
  v: unknown,
  path: string,
  errors: string[],
  readItem: (item: unknown, path: string, errors: string[]) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(v)) {
    errors.push(`${path}: Liste erwartet`);
    return undefined;
  }
  const before = errors.length;
  const items = v.map((item, i) => readItem(item, `${path}[${i}]`, errors));
  return errors.length === before ? (items as T[]) : undefined;
}

function str(v: unknown, path: string, errors: string[]): string | undefined {
  if (typeof v !== 'string') {
    errors.push(`${path}: Text erwartet`);
    return undefined;
  }
  return v;
}

function nonEmpty(v: unknown, path: string, errors: string[]): string | undefined {
  if (typeof v !== 'string' || v === '') {
    errors.push(`${path}: nicht-leerer Text erwartet`);
    return undefined;
  }
  return v;
}

function bool(v: unknown, path: string, errors: string[]): boolean | undefined {
  if (typeof v !== 'boolean') {
    errors.push(`${path}: true/false erwartet`);
    return undefined;
  }
  return v;
}

function oneOf<T>(v: unknown, allowed: readonly T[], path: string, errors: string[]): T | undefined {
  if (!allowed.includes(v as T)) {
    errors.push(`${path}: einer von ${allowed.map((a) => JSON.stringify(a)).join(', ')} erwartet`);
    return undefined;
  }
  return v as T;
}

function stringRecord(v: unknown, path: string, errors: string[]): Record<string, string> | undefined {
  if (!isObject(v) || !Object.values(v).every((x) => typeof x === 'string')) {
    errors.push(`${path}: Objekt mit Text-Werten erwartet`);
    return undefined;
  }
  return { ...(v as Record<string, string>) };
}

// --- Inhaltliche Prüfung ---------------------------------------------------

function checkReferences(diagram: Diagram, errors: string[]): void {
  const components = new Map<string, ComponentInstance>();
  for (const c of diagram.components) {
    if (components.has(c.id)) errors.push(`Bauteil-ID "${c.id}" ist doppelt vergeben`);
    components.set(c.id, c);
    if (!isKnownType(c.type)) errors.push(`Bauteil "${c.id}": unbekannter Typ "${c.type}"`);
  }

  const junctionLines = new Map<string, number>();
  for (const j of diagram.junctions) {
    if (junctionLines.has(j.id)) errors.push(`Abzweig-ID "${j.id}" ist doppelt vergeben`);
    junctionLines.set(j.id, 0);
  }

  const connectionIds = new Set<string>();
  for (const l of diagram.connections) {
    if (connectionIds.has(l.id)) errors.push(`Leitungs-ID "${l.id}" ist doppelt vergeben`);
    connectionIds.add(l.id);
    for (const end of [l.from, l.to]) {
      if ('junctionId' in end) {
        const n = junctionLines.get(end.junctionId);
        if (n === undefined) errors.push(`Leitung "${l.id}": Abzweigpunkt "${end.junctionId}" existiert nicht`);
        else junctionLines.set(end.junctionId, n + 1);
        continue;
      }
      const component = components.get(end.componentId);
      if (component === undefined) {
        errors.push(`Leitung "${l.id}": Bauteil "${end.componentId}" existiert nicht`);
        continue;
      }
      const def = definitionOf(component);
      if (def && !def.ports.some((p) => p.id === end.portId)) {
        errors.push(`Leitung "${l.id}": Bauteil "${end.componentId}" hat keinen Anschluss "${end.portId}"`);
      }
    }
  }
  for (const [id, n] of junctionLines) {
    if (n > 4) errors.push(`Abzweigpunkt "${id}": mehr als 4 Leitungen`);
  }
}
