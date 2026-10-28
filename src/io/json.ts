import { getDefinition } from '../model/library.ts';
import type {
  ComponentInstance,
  Connection,
  Diagram,
  DiagramMeta,
  Domain,
  LineKind,
  Point,
  PortRef,
  Rotation,
} from '../model/types.ts';

/**
 * Dateiformat (.fluidplan.json):
 *
 *   { "format": "fluidplan", "version": 1, "diagram": { ... } }
 *
 * `version` wird erhöht, sobald sich das Format inkompatibel ändert.
 * Ältere Versionen werden dann beim Laden in `migrate` hochgezogen.
 */
export const FILE_FORMAT = 'fluidplan';
export const FILE_VERSION = 1;
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
  checkReferences(diagram, errors);
  return errors.length > 0 ? { ok: false, errors } : { ok: true, diagram };
}

/** Hebt ältere Dateiversionen auf FILE_VERSION. Bisher gibt es nur Version 1. */
function migrate(_version: number, diagram: unknown): unknown {
  return diagram;
}

// --- Strukturprüfung -------------------------------------------------------

type Obj = Record<string, unknown>;

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const DOMAINS: readonly Domain[] = ['hydraulic', 'pneumatic'];
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const LINE_KINDS: readonly LineKind[] = ['working', 'pilot', 'drain'];

function readDiagram(v: unknown, errors: string[]): Diagram | undefined {
  if (!isObject(v)) {
    errors.push('diagram: Objekt erwartet');
    return undefined;
  }
  const domain = oneOf(v.domain, DOMAINS, 'diagram.domain', errors);
  const meta = readMeta(v.meta, errors);
  const components = readArray(v.components, 'diagram.components', errors, readComponent);
  const connections = readArray(v.connections, 'diagram.connections', errors, readConnection);
  if (!domain || !meta || !components || !connections) return undefined;
  return { domain, meta, components, connections };
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
  if (
    id === undefined || type === undefined || !position || rotation === undefined ||
    mirrored === undefined || label === undefined || !properties
  ) {
    return undefined;
  }
  return { id, type, position, rotation, mirrored, label, properties };
}

function readConnection(v: unknown, path: string, errors: string[]): Connection | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const from = portRef(v.from, `${path}.from`, errors);
  const to = portRef(v.to, `${path}.to`, errors);
  const kind = oneOf(v.kind, LINE_KINDS, `${path}.kind`, errors);
  const waypoints = readArray(v.waypoints, `${path}.waypoints`, errors, point);
  if (id === undefined || !from || !to || !kind || !waypoints) return undefined;
  return { id, from, to, kind, waypoints };
}

function portRef(v: unknown, path: string, errors: string[]): PortRef | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
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
  const componentTypes = new Map<string, string>();
  for (const c of diagram.components) {
    if (componentTypes.has(c.id)) errors.push(`Bauteil-ID "${c.id}" ist doppelt vergeben`);
    componentTypes.set(c.id, c.type);
    if (!getDefinition(c.type)) errors.push(`Bauteil "${c.id}": unbekannter Typ "${c.type}"`);
  }

  const connectionIds = new Set<string>();
  for (const l of diagram.connections) {
    if (connectionIds.has(l.id)) errors.push(`Leitungs-ID "${l.id}" ist doppelt vergeben`);
    connectionIds.add(l.id);
    for (const end of [l.from, l.to]) {
      const type = componentTypes.get(end.componentId);
      if (type === undefined) {
        errors.push(`Leitung "${l.id}": Bauteil "${end.componentId}" existiert nicht`);
        continue;
      }
      const def = getDefinition(type);
      if (def && !def.ports.some((p) => p.id === end.portId)) {
        errors.push(`Leitung "${l.id}": Bauteil "${end.componentId}" hat keinen Anschluss "${end.portId}"`);
      }
    }
  }
}
