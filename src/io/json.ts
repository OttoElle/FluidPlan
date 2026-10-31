import { defaultConfigFor, definitionOf, getDefinition, isConfigurable, isKnownType, LEGACY_TYPES, readConfig } from '../model/library.ts';
import type {
  Annotation,
  ComponentInstance,
  Connection,
  Diagram,
  DiagramMeta,
  Domain,
  Drawing,
  DrawingSheet,
  Endpoint,
  Group,
  Junction,
  Layer,
  LineKind,
  Orientation,
  Point,
  Rotation,
  Sheet,
  SheetFormat,
  StrokeStyle,
} from '../model/types.ts';
import { SHEET_FORMATS, smallestSheetFor } from '../model/sheet.ts';
import { DEFAULT_DOCUMENT_TYPE } from '../model/diagram.ts';
import { pruneGroups } from '../model/groups.ts';
import { isObject, type Obj } from '../model/configRead.ts';
import { contentOf, drawingOf, sheetView } from '../model/drawing.ts';

/**
 * Dateiformat (.fluidplan.json):
 *
 *   { "format": "fluidplan", "version": 6, "drawing": { "domain", "meta", "sheets": [ ... ] } }
 *
 * Bis Version 5 stand dort ein einzelner Schaltplan unter "diagram".
 * Seit Version 7 kann "drawing" Zeichnungsebenen ("layers") haben, und
 * Bauteile, Leitungen und Grafik können ihre Ebene in "layer" nennen.
 *
 * `version` wird erhöht, sobald sich das Format inkompatibel ändert.
 * Ältere Versionen werden dann beim Laden in `migrate` hochgezogen.
 */
const FILE_FORMAT = 'fluidplan';
export const FILE_VERSION = 7;
export const FILE_EXTENSION = '.fluidplan.json';

interface FileEnvelope {
  format: typeof FILE_FORMAT;
  version: number;
  drawing: Drawing;
}

export function serializeDrawing(drawing: Drawing): string {
  // Gruppen können noch auf Gelöschtes verweisen; das soll nicht in die Datei.
  const sheets = drawing.sheets.map((s) => ({ id: s.id, name: s.name, ...contentOf(pruneGroups(s as unknown as Diagram)) }));
  const envelope: FileEnvelope = { format: FILE_FORMAT, version: FILE_VERSION, drawing: { ...drawing, sheets } };
  return JSON.stringify(envelope, null, 2) + '\n';
}

/** Ein einzelnes Blatt als Datei, z. B. ein kopierter Ausschnitt in der Zwischenablage. */
export function serializeDiagram(diagram: Diagram): string {
  return serializeDrawing(drawingOf(diagram));
}

export type ParseResult = { ok: true; drawing: Drawing } | { ok: false; errors: string[] };

/** Liest eine Datei mit nur einem Blatt bzw. davon das erste Blatt (Zwischenablage). */
export function parseDiagram(text: string): { ok: true; diagram: Diagram } | { ok: false; errors: string[] } {
  const r = parseDrawing(text);
  if (!r.ok) return r;
  const { page: _page, layers: _layers, ...diagram } = sheetView(r.drawing, 0);
  return { ok: true, diagram: r.drawing.layers ? { ...diagram, layers: r.drawing.layers } : diagram };
}

export function parseDrawing(text: string): ParseResult {
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

  const body = raw.version < 6 ? migrateToSheets(migrate(raw.version, raw.diagram)) : raw.drawing;
  const drawing = readDrawing(body, errors);
  if (errors.length > 0 || !drawing) return { ok: false, errors };
  const sheetIds = new Set<string>();
  const sheets = drawing.sheets.map((s, i) => {
    if (sheetIds.has(s.id)) errors.push(`Blatt-ID "${s.id}" ist doppelt vergeben`);
    sheetIds.add(s.id);
    const upgraded = upgradeLegacyTypes(sheetView(drawing, i));
    const sheetErrors: string[] = [];
    checkReferences(upgraded, sheetErrors);
    const prefix = drawing.sheets.length > 1 ? `Blatt ${i + 1} („${s.name}“): ` : '';
    errors.push(...sheetErrors.map((e) => prefix + e));
    return { ...s, ...contentOf(upgraded) };
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, drawing: { ...drawing, sheets } };
}

/**
 * Stellt Bauteiltypen aus früheren Ständen (z. B. "valve.4-2") auf die heutigen
 * konfigurierbaren Typen um und übersetzt die Anschluss-IDs ihrer Leitungen.
 */
function upgradeLegacyTypes(diagram: Diagram): Diagram {
  const renamed = new Map<string, Record<string, string>>();
  const components = diagram.components.map((c) => {
    // Früher feste, heute konfigurierbare Typen (z. B. Pumpe, Tank) bekommen ihre Startkonfiguration.
    if (!c.config && isConfigurable(c.type)) return { ...c, config: defaultConfigFor(c.type, diagram.domain)! };
    const legacy = LEGACY_TYPES[c.type];
    if (!legacy) return c;
    renamed.set(c.id, legacy.ports);
    return { ...c, type: legacy.type, config: structuredClone(legacy.config) };
  });
  if (renamed.size === 0) return { ...diagram, components };
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
 * 3 → 4: Freier Text und Grafik (`annotations`) sowie weitere Schriftfeld-Angaben
 *        in `meta` (Zeichnungsnummer, Firma, Geprüft von, Änderungsstand).
 * 4 → 5: Gruppen (`groups`); neue Grafikarten Kreis, Ellipse und Linienzug.
 * 5 → 6: mehrere Blätter (siehe migrateToSheets).
 */
function migrate(version: number, diagram: unknown): unknown {
  let d = diagram;
  if (version < 2 && isObject(d)) d = { ...d, sheet: sheetForV1(d) };
  if (version < 3 && isObject(d)) d = { ...d, junctions: [] };
  if (version < 4 && isObject(d)) {
    const meta = isObject(d.meta) ? { ...META_DEFAULTS, ...d.meta } : d.meta;
    d = { ...d, meta, annotations: [] };
  }
  if (version < 5 && isObject(d)) d = { ...d, groups: [] };
  return d;
}

/** 5 → 6: Der bisherige Schaltplan wird zum ersten und einzigen Blatt der Zeichnung. */
function migrateToSheets(diagram: unknown): unknown {
  if (!isObject(diagram)) return diagram;
  const { domain, meta, ...content } = diagram;
  return { domain, meta, sheets: [{ id: 's1', name: 'Blatt 1', ...content }] };
}

const META_DEFAULTS = { drawingNumber: '', organization: '', checkedBy: '', revision: '' };
/** Seit Freigabe und Dokumentart im Schriftfeld; fehlen sie, gelten diese Werte. */
const OPTIONAL_META = { approvedBy: '', documentType: DEFAULT_DOCUMENT_TYPE } as const;

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


const DOMAINS: readonly Domain[] = ['hydraulic', 'pneumatic'];
const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const LINE_KINDS: readonly LineKind[] = ['working', 'pilot', 'drain'];
const SHEET_FORMAT_KEYS = Object.keys(SHEET_FORMATS) as SheetFormat[];
const ORIENTATIONS: readonly Orientation[] = ['portrait', 'landscape'];
const STROKE_STYLES: readonly StrokeStyle[] = ['solid', 'dashed', 'dashdot'];
const ANNOTATION_KINDS: readonly Annotation['kind'][] = ['text', 'line', 'rect', 'circle', 'ellipse', 'polyline'];

function readDrawing(v: unknown, errors: string[]): Drawing | undefined {
  if (!isObject(v)) {
    errors.push('drawing: Objekt erwartet');
    return undefined;
  }
  const domain = oneOf(v.domain, DOMAINS, 'drawing.domain', errors);
  const meta = readMeta(v.meta, errors);
  const sheets = readArray(v.sheets, 'drawing.sheets', errors, readDrawingSheet);
  if (sheets && sheets.length === 0) errors.push('drawing.sheets: mindestens ein Blatt erwartet');
  const layers = v.layers === undefined ? undefined : readArray(v.layers, 'drawing.layers', errors, readLayer);
  if (layers) {
    const ids = new Set<string>();
    for (const l of layers) {
      if (ids.has(l.id)) errors.push(`Ebenen-ID "${l.id}" ist doppelt vergeben`);
      ids.add(l.id);
    }
  }
  if (!domain || !meta || !sheets || sheets.length === 0 || (v.layers !== undefined && !layers)) return undefined;
  return layers ? { domain, meta, sheets, layers } : { domain, meta, sheets };
}

function readLayer(v: unknown, path: string, errors: string[]): Layer | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const name = str(v.name, `${path}.name`, errors);
  const visible = bool(v.visible, `${path}.visible`, errors);
  const locked = bool(v.locked, `${path}.locked`, errors);
  if (id === undefined || name === undefined || visible === undefined || locked === undefined) return undefined;
  return { id, name, visible, locked };
}

/**
 * Liest zusätzlich die optionale Ebene eines Teils. Eine unbekannte Ebene ist
 * kein Fehler: das Teil liegt dann auf der Standardebene.
 */
function onLayer<T extends { layer?: string }>(read: (v: unknown, path: string, errors: string[]) => T | undefined) {
  return (v: unknown, path: string, errors: string[]): T | undefined => {
    const item = read(v, path, errors);
    if (!item || !isObject(v) || v.layer === undefined) return item;
    const layer = nonEmpty(v.layer, `${path}.layer`, errors);
    return layer === undefined ? undefined : { ...item, layer };
  };
}

function readDrawingSheet(v: unknown, path: string, errors: string[]): DrawingSheet | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const name = str(v.name, `${path}.name`, errors);
  const sheet = readSheet(v.sheet, `${path}.sheet`, errors);
  const components = readArray(v.components, `${path}.components`, errors, onLayer(readComponent));
  const connections = readArray(v.connections, `${path}.connections`, errors, onLayer(readConnection));
  const junctions = readArray(v.junctions, `${path}.junctions`, errors, readJunction);
  const annotations = readArray(v.annotations, `${path}.annotations`, errors, onLayer(readAnnotation));
  const groups = readArray(v.groups, `${path}.groups`, errors, readGroup);
  if (
    id === undefined || name === undefined || !sheet || !components || !connections || !junctions ||
    !annotations || !groups
  ) {
    return undefined;
  }
  return { id, name, sheet, components, connections, junctions, annotations, groups };
}

function readGroup(v: unknown, path: string, errors: string[]): Group | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const ids = (key: 'components' | 'connections' | 'junctions' | 'annotations') =>
    readArray(v[key], `${path}.${key}`, errors, nonEmpty);
  const components = ids('components');
  const connections = ids('connections');
  const junctions = ids('junctions');
  const annotations = ids('annotations');
  if (id === undefined || !components || !connections || !junctions || !annotations) return undefined;
  return { id, components, connections, junctions, annotations };
}

function readAnnotation(v: unknown, path: string, errors: string[]): Annotation | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const id = nonEmpty(v.id, `${path}.id`, errors);
  const kind = oneOf(v.kind, ANNOTATION_KINDS, `${path}.kind`, errors);
  if (id === undefined || kind === undefined) return undefined;
  if (kind === 'text') {
    const position = point(v.position, `${path}.position`, errors);
    const text = str(v.text, `${path}.text`, errors);
    const size = positive(v.size, `${path}.size`, errors);
    if (!position || text === undefined || size === undefined) return undefined;
    return { id, kind, position, text, size };
  }
  const style = oneOf(v.style, STROKE_STYLES, `${path}.style`, errors);
  if (kind === 'line') {
    const from = point(v.from, `${path}.from`, errors);
    const to = point(v.to, `${path}.to`, errors);
    if (!from || !to || !style) return undefined;
    return { id, kind, from, to, style };
  }
  if (kind === 'circle') {
    const center = point(v.center, `${path}.center`, errors);
    const radius = positive(v.radius, `${path}.radius`, errors);
    if (!center || radius === undefined || !style) return undefined;
    return { id, kind, center, radius, style };
  }
  if (kind === 'ellipse') {
    const center = point(v.center, `${path}.center`, errors);
    const rx = positive(v.rx, `${path}.rx`, errors);
    const ry = positive(v.ry, `${path}.ry`, errors);
    if (!center || rx === undefined || ry === undefined || !style) return undefined;
    return { id, kind, center, rx, ry, style };
  }
  if (kind === 'polyline') {
    const points = readArray(v.points, `${path}.points`, errors, point);
    const closed = bool(v.closed, `${path}.closed`, errors);
    if (points && points.length < 2) errors.push(`${path}.points: mindestens zwei Punkte erwartet`);
    if (!points || points.length < 2 || closed === undefined || !style) return undefined;
    return { id, kind, points, closed, style };
  }
  const position = point(v.position, `${path}.position`, errors);
  const width = positive(v.width, `${path}.width`, errors);
  const height = positive(v.height, `${path}.height`, errors);
  if (!position || width === undefined || height === undefined || !style) return undefined;
  return { id, kind, position, width, height, style };
}

function positive(v: unknown, path: string, errors: string[]): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    errors.push(`${path}: positive Zahl erwartet`);
    return undefined;
  }
  return v;
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

function readSheet(v: unknown, path: string, errors: string[]): Sheet | undefined {
  if (!isObject(v)) {
    errors.push(`${path}: Objekt erwartet`);
    return undefined;
  }
  const format = oneOf(v.format, SHEET_FORMAT_KEYS, `${path}.format`, errors);
  const orientation = oneOf(v.orientation, ORIENTATIONS, `${path}.orientation`, errors);
  const frame = bool(v.frame, `${path}.frame`, errors);
  const lineJumps = v.lineJumps === undefined ? undefined : bool(v.lineJumps, `${path}.lineJumps`, errors);
  if (!format || !orientation || frame === undefined || (v.lineJumps !== undefined && lineJumps === undefined)) {
    return undefined;
  }
  return { format, orientation, frame, ...(lineJumps !== undefined ? { lineJumps } : {}) };
}

function readMeta(v: unknown, errors: string[]): DiagramMeta | undefined {
  if (!isObject(v)) {
    errors.push('drawing.meta: Objekt erwartet');
    return undefined;
  }
  const keys = [
    'title', 'author', 'drawingNumber', 'organization', 'checkedBy', 'revision', 'created', 'modified',
  ] as const satisfies readonly (keyof DiagramMeta)[];
  const before = errors.length;
  const meta = Object.fromEntries(keys.map((k) => [k, str(v[k], `drawing.meta.${k}`, errors)]));
  for (const [k, fallback] of Object.entries(OPTIONAL_META)) {
    meta[k] = v[k] === undefined ? fallback : str(v[k], `drawing.meta.${k}`, errors);
  }
  return errors.length === before ? (meta as unknown as DiagramMeta) : undefined;
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
  // Optionale Angaben (Bezeichnung, Anzeige am Symbol); fehlen in älteren Dateien.
  const extra: Partial<ComponentInstance> = {};
  if (v.description !== undefined) {
    if (typeof v.description === 'string') extra.description = v.description;
    else errors.push(`${path}.description: Text erwartet`);
  }
  for (const key of ['showLabel', 'showDescription'] as const) {
    if (v[key] === undefined) continue;
    if (typeof v[key] === 'boolean') extra[key] = v[key];
    else errors.push(`${path}.${key}: true oder false erwartet`);
  }
  if (v.labelOffset !== undefined) {
    const p = point(v.labelOffset, `${path}.labelOffset`, errors);
    if (p) extra.labelOffset = p;
  }
  if (v.portLabelOffsets !== undefined) {
    if (!isObject(v.portLabelOffsets)) errors.push(`${path}.portLabelOffsets: Objekt erwartet`);
    else {
      const offsets: Record<string, Point> = {};
      for (const [port, value] of Object.entries(v.portLabelOffsets)) {
        const p = point(value, `${path}.portLabelOffsets.${port}`, errors);
        if (p) offsets[port] = p;
      }
      extra.portLabelOffsets = offsets;
    }
  }
  return { id, type, position, rotation, mirrored, label, properties, ...extra, ...(config ? { config } : {}) };
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

  const annotationIds = new Set<string>();
  for (const a of diagram.annotations) {
    if (annotationIds.has(a.id)) errors.push(`Grafik-ID "${a.id}" ist doppelt vergeben`);
    annotationIds.add(a.id);
  }

  // Jedes Teil gehört zu höchstens einer Gruppe, und es muss existieren.
  const existing = {
    components: new Set(components.keys()),
    connections: connectionIds,
    junctions: new Set(junctionLines.keys()),
    annotations: annotationIds,
  };
  const grouped = new Set<string>();
  const groupIds = new Set<string>();
  for (const g of diagram.groups) {
    if (groupIds.has(g.id)) errors.push(`Gruppen-ID "${g.id}" ist doppelt vergeben`);
    groupIds.add(g.id);
    for (const key of ['components', 'connections', 'junctions', 'annotations'] as const) {
      for (const id of g[key]) {
        if (!existing[key].has(id)) errors.push(`Gruppe "${g.id}": "${id}" existiert nicht`);
        if (grouped.has(`${key}:${id}`)) errors.push(`Gruppe "${g.id}": "${id}" gehört schon zu einer anderen Gruppe`);
        grouped.add(`${key}:${id}`);
      }
    }
  }
}
