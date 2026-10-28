import { defaultConfigFor, definitionOf, isConfigurable, isKnownType } from './library.ts';
import type {
  ComponentConfig,
  ComponentDefinition,
  ComponentInstance,
  Connection,
  Diagram,
  Domain,
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
    meta: { title, author: '', created: stamp, modified: stamp },
    sheet: { ...sheet },
    components: [],
    connections: [],
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
  const dangling = (ref: PortRef) => ref.componentId === id && !ports.has(ref.portId);
  return {
    ...diagram,
    components: diagram.components.map((c) => (c.id === id ? updated : c)),
    connections: diagram.connections.filter((l) => !dangling(l.from) && !dangling(l.to)),
  };
}

/** Entfernt ein Bauteil samt aller daran angeschlossenen Leitungen. */
export function removeComponent(diagram: Diagram, id: string): Diagram {
  return {
    ...diagram,
    components: diagram.components.filter((c) => c.id !== id),
    connections: diagram.connections.filter(
      (l) => l.from.componentId !== id && l.to.componentId !== id,
    ),
  };
}

function samePort(a: PortRef, b: PortRef): boolean {
  return a.componentId === b.componentId && a.portId === b.portId;
}

function requirePort(diagram: Diagram, ref: PortRef): void {
  const component = diagram.components.find((c) => c.id === ref.componentId);
  if (!component) throw new DiagramError(`Bauteil "${ref.componentId}" existiert nicht`);
  const def = requireDefinition(component);
  if (!def.ports.some((p) => p.id === ref.portId)) {
    throw new DiagramError(`Bauteil "${ref.componentId}" hat keinen Anschluss "${ref.portId}"`);
  }
}

export function connect(
  diagram: Diagram,
  from: PortRef,
  to: PortRef,
  kind: LineKind = 'working',
  waypoints: Point[] = [],
): { diagram: Diagram; connection: Connection } {
  requirePort(diagram, from);
  requirePort(diagram, to);
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
export function lineKindFor(diagram: Diagram, a: PortRef, b: PortRef): LineKind {
  const kinds = [a, b].map((ref) => {
    const component = diagram.components.find((c) => c.id === ref.componentId);
    return component && definitionOf(component)?.ports.find((p) => p.id === ref.portId)?.kind;
  });
  if (kinds.includes('pilot')) return 'pilot';
  if (kinds.includes('drain')) return 'drain';
  return 'working';
}

export function removeConnection(diagram: Diagram, id: string): Diagram {
  return { ...diagram, connections: diagram.connections.filter((l) => l.id !== id) };
}

/** Alle Leitungen, die an einem Anschluss hängen. */
export function connectionsAt(diagram: Diagram, ref: PortRef): Connection[] {
  return diagram.connections.filter((l) => samePort(l.from, ref) || samePort(l.to, ref));
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

/** Setzt den Änderungszeitstempel, z. B. direkt vor dem Speichern. */
export function touch(diagram: Diagram, now = new Date()): Diagram {
  return { ...diagram, meta: { ...diagram.meta, modified: now.toISOString() } };
}
