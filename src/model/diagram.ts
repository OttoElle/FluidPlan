import { defaultConfigFor, definitionOf, isConfigurable, isKnownType } from './library.ts';
import type {
  ComponentConfig,
  ComponentDefinition,
  ComponentInstance,
  Connection,
  Diagram,
  Domain,
  Endpoint,
  Junction,
  JunctionRef,
  LineKind,
  Point,
  PortRef,
  Rotation,
  Sheet,
} from './types.ts';
import { DEFAULT_SHEET } from './sheet.ts';

/**
 * Reine Funktionen zum Bearbeiten eines Schaltplans.
 * Jede Funktion gibt einen neuen Diagram-Wert zurück und lässt den alten
 * unverändert. Das hält React-Updates einfach und macht Undo/Redo später
 * zu einer Liste von Zuständen.
 */

/** Vorgabe für die Dokumentart im Schriftfeld (DIN EN ISO 7200). */
export const DEFAULT_DOCUMENT_TYPE = 'Schaltplan';

export class DiagramError extends Error {}

export function createDiagram(
  domain: Domain,
  title = 'Neuer Schaltplan',
  now = new Date(),
  sheet: Sheet = DEFAULT_SHEET,
): Diagram {
  const stamp = now.toISOString();
  return {
    domain,
    meta: { title, author: '', drawingNumber: '', organization: '', checkedBy: '', approvedBy: '', documentType: DEFAULT_DOCUMENT_TYPE, revision: '', created: stamp, modified: stamp },
    sheet: { ...sheet },
    components: [],
    connections: [],
    junctions: [],
    annotations: [],
    groups: [],
  };
}

/** Nächste freie ID der Form `<prefix><n>`, z. B. "c3". */
export function nextId(prefix: string, existing: Iterable<{ id: string }>): string {
  let max = 0;
  for (const { id } of existing) {
    if (id.startsWith(prefix)) {
      const n = Number(id.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
  }
  return `${prefix}${max + 1}`;
}

function requireDefinition(component: Pick<ComponentInstance, 'type' | 'config'>): ComponentDefinition {
  const def = definitionOf(component);
  if (!def) throw new DiagramError(`Unbekannter Bauteiltyp "${component.type}"`);
  return def;
}

export interface AddComponentOptions {
  rotation?: Rotation;
  mirrored?: boolean;
  label?: string;
  properties?: Record<string, string>;
  /** Nur für konfigurierbare Typen; fehlt sie, gilt die Startkonfiguration. */
  config?: ComponentConfig;
}

export function addComponent(
  diagram: Diagram,
  type: string,
  position: Point,
  options: AddComponentOptions = {},
): { diagram: Diagram; component: ComponentInstance } {
  if (!isKnownType(type)) throw new DiagramError(`Unbekannter Bauteiltyp "${type}"`);
  const config = isConfigurable(type) ? structuredClone(options.config ?? defaultConfigFor(type, diagram.domain)) : undefined;
  const component: ComponentInstance = {
    id: nextId('c', diagram.components),
    type,
    position: { ...position },
    rotation: options.rotation ?? 0,
    mirrored: options.mirrored ?? false,
    label: options.label ?? '',
    properties: { ...options.properties },
    ...(config ? { config } : {}),
  };
  return { diagram: { ...diagram, components: [...diagram.components, component] }, component };
}

/**
 * Wie weit Beschriftungen von ihrer Standardlage weg dürfen, in Einheiten je Achse.
 * DIN ISO 1219-2: Kennzeichen „neben dem Symbol“ (5.1.1.1), Anschlussbezeichnungen
 * „am oder nahe dem Bauteil“ (5.2); beide dürfen Geräte und Leitungen nicht
 * überdecken (4.3.3) und deshalb verschoben werden.
 */
export const LABEL_RANGE = 120;
export const PORT_LABEL_RANGE = 40;

/** Verschiebt das Kennzeichen (port = null) oder eine Anschlussbezeichnung; (0, 0) setzt zurück. */
export function moveLabel(diagram: Diagram, id: string, port: string | null, offset: Point): Diagram {
  const range = port === null ? LABEL_RANGE : PORT_LABEL_RANGE;
  const clamp = (v: number) => Math.max(-range, Math.min(range, v));
  const o = { x: clamp(offset.x), y: clamp(offset.y) };
  const zero = o.x === 0 && o.y === 0;
  return {
    ...diagram,
    components: diagram.components.map((c) => {
      if (c.id !== id) return c;
      if (port === null) {
        const { labelOffset: _, ...rest } = c;
        return zero ? rest : { ...rest, labelOffset: o };
      }
      const { [port]: _, ...others } = c.portLabelOffsets ?? {};
      const next = zero ? others : { ...others, [port]: o };
      const { portLabelOffsets: __, ...rest } = c;
      return Object.keys(next).length ? { ...rest, portLabelOffsets: next } : rest;
    }),
  };
}

export function updateComponent(
  diagram: Diagram,
  id: string,
  changes: Partial<Omit<ComponentInstance, 'id' | 'type' | 'config'>>,
): Diagram {
  if (!diagram.components.some((c) => c.id === id)) {
    throw new DiagramError(`Bauteil "${id}" existiert nicht`);
  }
  return {
    ...diagram,
    components: diagram.components.map((c) => (c.id === id ? { ...c, ...changes } : c)),
  };
}

/**
 * Setzt die Konfiguration eines konfigurierbaren Bauteils. Leitungen an
 * Anschlüssen, die es danach nicht mehr gibt, werden entfernt.
 */
export function configureComponent(diagram: Diagram, id: string, config: ComponentConfig): Diagram {
  const component = diagram.components.find((c) => c.id === id);
  if (!component) throw new DiagramError(`Bauteil "${id}" existiert nicht`);
  if (!isConfigurable(component.type)) throw new DiagramError(`Bauteil "${id}" ist nicht konfigurierbar`);
  const updated = { ...component, config };
  const ports = new Set(requireDefinition(updated).ports.map((p) => p.id));
  const dangling = (ref: Endpoint) => !isJunctionRef(ref) && ref.componentId === id && !ports.has(ref.portId);
  return normalizeJunctions({
    ...diagram,
    components: diagram.components.map((c) => (c.id === id ? updated : c)),
    connections: diagram.connections.filter((l) => !dangling(l.from) && !dangling(l.to)),
  });
}

/** Entfernt ein Bauteil samt aller daran angeschlossenen Leitungen. */
export function removeComponent(diagram: Diagram, id: string): Diagram {
  const at = (e: Endpoint) => !isJunctionRef(e) && e.componentId === id;
  return normalizeJunctions({
    ...diagram,
    components: diagram.components.filter((c) => c.id !== id),
    connections: diagram.connections.filter((l) => !at(l.from) && !at(l.to)),
  });
}

export function isJunctionRef(e: Endpoint): e is JunctionRef {
  return 'junctionId' in e;
}

/** Gleicher Anschluss bzw. gleicher Abzweigpunkt. */
export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  if (isJunctionRef(a) || isJunctionRef(b)) {
    return isJunctionRef(a) && isJunctionRef(b) && a.junctionId === b.junctionId;
  }
  return a.componentId === b.componentId && a.portId === b.portId;
}

/** Eindeutiger Schlüssel eines Leitungsendes, z. B. "c1/P" oder "j:j2". */
export function endpointKey(e: Endpoint): string {
  return isJunctionRef(e) ? `j:${e.junctionId}` : `${e.componentId}/${e.portId}`;
}

const samePort = sameEndpoint;

function requirePort(diagram: Diagram, ref: PortRef): void {
  const component = diagram.components.find((c) => c.id === ref.componentId);
  if (!component) throw new DiagramError(`Bauteil "${ref.componentId}" existiert nicht`);
  const def = requireDefinition(component);
  if (!def.ports.some((p) => p.id === ref.portId)) {
    throw new DiagramError(`Bauteil "${ref.componentId}" hat keinen Anschluss "${ref.portId}"`);
  }
}

/** Höchstzahl Leitungen an einem Abzweigpunkt (je Richtung eine). */
const MAX_LINES_PER_JUNCTION = 4;

function requireEndpoint(diagram: Diagram, ref: Endpoint): void {
  if (!isJunctionRef(ref)) return requirePort(diagram, ref);
  if (!diagram.junctions.some((j) => j.id === ref.junctionId)) {
    throw new DiagramError(`Abzweigpunkt "${ref.junctionId}" existiert nicht`);
  }
  if (connectionsAt(diagram, ref).length >= MAX_LINES_PER_JUNCTION) {
    throw new DiagramError(`An einem Abzweigpunkt treffen höchstens ${MAX_LINES_PER_JUNCTION} Leitungen zusammen`);
  }
}

export function connect(
  diagram: Diagram,
  from: Endpoint,
  to: Endpoint,
  kind: LineKind = 'working',
  waypoints: Point[] = [],
): { diagram: Diagram; connection: Connection } {
  requireEndpoint(diagram, from);
  requireEndpoint(diagram, to);
  if (samePort(from, to)) throw new DiagramError('Ein Anschluss kann nicht mit sich selbst verbunden werden');
  const duplicate = diagram.connections.some(
    (l) => (samePort(l.from, from) && samePort(l.to, to)) || (samePort(l.from, to) && samePort(l.to, from)),
  );
  if (duplicate) throw new DiagramError('Diese Verbindung existiert bereits');

  const connection: Connection = {
    id: nextId('l', diagram.connections),
    from: { ...from },
    to: { ...to },
    kind,
    waypoints: waypoints.map((p) => ({ ...p })),
  };
  return { diagram: { ...diagram, connections: [...diagram.connections, connection] }, connection };
}

export function updateConnection(
  diagram: Diagram,
  id: string,
  changes: Partial<Pick<Connection, 'kind' | 'waypoints'>>,
): Diagram {
  if (!diagram.connections.some((l) => l.id === id)) {
    throw new DiagramError(`Leitung "${id}" existiert nicht`);
  }
  return {
    ...diagram,
    connections: diagram.connections.map((l) => (l.id === id ? { ...l, ...changes } : l)),
  };
}

/** Passende Linienart für eine neue Leitung zwischen zwei Anschlüssen. */
export function lineKindFor(diagram: Diagram, a: Endpoint, b: Endpoint): LineKind {
  // Am Abzweig übernimmt die neue Leitung die Art der vorhandenen.
  for (const ref of [a, b]) {
    if (isJunctionRef(ref)) {
      const existing = connectionsAt(diagram, ref)[0];
      if (existing) return existing.kind;
    }
  }
  const kinds = [a, b].map((ref) => {
    if (isJunctionRef(ref)) return undefined;
    const component = diagram.components.find((c) => c.id === ref.componentId);
    return component && definitionOf(component)?.ports.find((p) => p.id === ref.portId)?.kind;
  });
  if (kinds.includes('pilot')) return 'pilot';
  if (kinds.includes('drain')) return 'drain';
  return 'working';
}

export function removeConnection(diagram: Diagram, id: string): Diagram {
  return normalizeJunctions({ ...diagram, connections: diagram.connections.filter((l) => l.id !== id) });
}

/** Alle Leitungen, die an einem Anschluss bzw. Abzweigpunkt hängen. */
export function connectionsAt(diagram: Pick<Diagram, 'connections'>, ref: Endpoint): Connection[] {
  return diagram.connections.filter((l) => samePort(l.from, ref) || samePort(l.to, ref));
}

// --- Abzweigpunkte ----------------------------------------------------------

/**
 * Teilt eine Leitung an `point` und setzt dort einen Abzweigpunkt.
 * `path` ist der gezeichnete Verlauf der Leitung (routing.ts), `point` muss
 * darauf liegen. Selbst geführte Leitungen behalten ihren Verlauf, automatisch
 * geführte bleiben automatisch.
 */
export function splitConnection(
  diagram: Diagram,
  id: string,
  path: Point[],
  point: Point,
): { diagram: Diagram; junction: Junction } {
  const line = diagram.connections.find((l) => l.id === id);
  if (!line) throw new DiagramError(`Leitung "${id}" existiert nicht`);
  const index = path.findIndex((a, i) => i + 1 < path.length && onSegment(point, a, path[i + 1]!));
  if (index < 0) throw new DiagramError('Der Punkt liegt nicht auf der Leitung');
  const ends = [path[0]!, path[path.length - 1]!];
  if (ends.some((e) => e.x === point.x && e.y === point.y)) {
    throw new DiagramError('Ein Abzweig am Leitungsende ist nicht möglich');
  }

  const junction: Junction = { id: nextId('j', diagram.junctions), position: { ...point } };
  const ref: JunctionRef = { junctionId: junction.id };
  const auto = line.waypoints.length === 0;
  const first: Connection = {
    ...line,
    to: ref,
    waypoints: auto ? [] : path.slice(1, index + 1).map((p) => ({ ...p })),
  };
  const second: Connection = {
    ...line,
    id: nextId('l', diagram.connections),
    from: ref,
    waypoints: auto ? [] : path.slice(index + 1, -1).map((p) => ({ ...p })),
  };
  return {
    diagram: {
      ...diagram,
      junctions: [...diagram.junctions, junction],
      connections: [...diagram.connections.map((l) => (l.id === id ? first : l)), second],
    },
    junction,
  };
}

function onSegment(p: Point, a: Point, b: Point): boolean {
  const within = (v: number, s: number, t: number) => v >= Math.min(s, t) && v <= Math.max(s, t);
  return (a.x === b.x && p.x === a.x && within(p.y, a.y, b.y)) || (a.y === b.y && p.y === a.y && within(p.x, a.x, b.x));
}

export function moveJunction(diagram: Diagram, id: string, position: Point): Diagram {
  return { ...diagram, junctions: diagram.junctions.map((j) => (j.id === id ? { ...j, position: { ...position } } : j)) };
}

/** Entfernt einen Abzweigpunkt samt aller daran hängenden Leitungen. */
export function removeJunction(diagram: Diagram, id: string): Diagram {
  const ref: JunctionRef = { junctionId: id };
  return normalizeJunctions({
    ...diagram,
    connections: diagram.connections.filter((l) => !samePort(l.from, ref) && !samePort(l.to, ref)),
  });
}

/**
 * Räumt Abzweigpunkte auf, nachdem Leitungen weggefallen sind:
 * Mit zwei Leitungen ist es kein Abzweig mehr, sie werden zu einer verschmolzen.
 * Mit einer Leitung endet diese im Nichts und entfällt mit dem Punkt.
 */
export function normalizeJunctions(diagram: Diagram): Diagram {
  let d = diagram;
  for (let changed = true; changed; ) {
    changed = false;
    for (const j of d.junctions) {
      const ref: JunctionRef = { junctionId: j.id };
      const lines = connectionsAt(d, ref);
      if (lines.length >= 3) continue;
      changed = true;
      const rest = d.junctions.filter((k) => k.id !== j.id);
      const others = d.connections.filter((l) => !lines.includes(l));
      if (lines.length === 2) {
        // Erste Leitung so drehen, dass sie am Abzweig endet, die zweite so, dass sie dort beginnt.
        const [a, b] = lines as [Connection, Connection];
        const into = samePort(a.to, ref) ? a : reverse(a);
        const out = samePort(b.from, ref) ? b : reverse(b);
        const auto = into.waypoints.length === 0 && out.waypoints.length === 0;
        const merged: Connection = {
          ...a,
          from: into.from,
          to: out.to,
          waypoints: auto ? [] : [...into.waypoints, { ...j.position }, ...out.waypoints],
        };
        // Schleife auf denselben Anschluss ergibt keine sinnvolle Leitung.
        const loop = samePort(merged.from, merged.to);
        d = { ...d, junctions: rest, connections: loop ? others : [...others, merged] };
      } else {
        d = { ...d, junctions: rest, connections: others };
      }
      break;
    }
  }
  return d;
}

function reverse(l: Connection): Connection {
  return { ...l, from: l.to, to: l.from, waypoints: [...l.waypoints].reverse() };
}

/** Position eines Leitungsendes. */
export function endpointPosition(diagram: Diagram, ref: Endpoint): Point {
  if (!isJunctionRef(ref)) return portPosition(diagram, ref);
  const j = diagram.junctions.find((k) => k.id === ref.junctionId);
  if (!j) throw new DiagramError(`Abzweigpunkt "${ref.junctionId}" existiert nicht`);
  return j.position;
}

/**
 * Absolute Position eines Anschlusses im Schaltplan.
 * Spiegelung und Drehung wirken um die Mitte des Bauteils.
 */
export function portPosition(diagram: Diagram, ref: PortRef): Point {
  requirePort(diagram, ref);
  const component = diagram.components.find((c) => c.id === ref.componentId)!;
  const def = requireDefinition(component);
  const port = def.ports.find((p) => p.id === ref.portId)!;
  return transformLocalPoint(component, def, port.offset);
}

export function transformLocalPoint(
  component: Pick<ComponentInstance, 'position' | 'rotation' | 'mirrored'>,
  def: Pick<ComponentDefinition, 'size'>,
  local: Point,
): Point {
  const cx = def.size.width / 2;
  const cy = def.size.height / 2;
  let dx = (component.mirrored ? def.size.width - local.x : local.x) - cx;
  let dy = local.y - cy;
  for (let r = 0; r < component.rotation; r += 90) {
    // 90° im Uhrzeigersinn (y zeigt nach unten): (x, y) -> (-y, x)
    [dx, dy] = [-dy, dx];
  }
  // `+ 0` normalisiert -0 zu 0, damit Vergleiche und JSON sauber bleiben.
  return { x: component.position.x + cx + dx + 0, y: component.position.y + cy + dy + 0 };
}
