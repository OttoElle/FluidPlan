import { isJunctionRef } from './diagram.ts';
import { definitionOf } from './library.ts';
import { componentBox } from './routing.ts';
import type { ComponentInstance, Diagram, Endpoint, PortKind } from './types.ts';

/**
 * Automatische Betriebsmittelkennzeichnung nach DIN ISO 1219-2.
 *
 * Ein Kennzeichen besteht aus Schaltkreisnummer, Bauteilkennbuchstabe und
 * laufender Nummer, z. B. "1V2" = zweites Ventil im Schaltkreis 1.
 *
 * Kennbuchstaben: P = Pumpe, Kompressor; M = Antriebsmotor; A = Antrieb
 * (Zylinder, Motor); V = Ventil; Z = alles übrige (Tank, Filter, Speicher,
 * Wartungseinheit, Manometer, …).
 *
 * Schaltkreise: Die Energieversorgung ist Kreis 0. Jeder Antrieb eröffnet
 * einen eigenen Kreis, von links nach rechts nummeriert. Alle übrigen Bauteile
 * gehören zu dem Antrieb, den sie über Leitungen am schnellsten erreichen.
 * Die Suche läuft nicht in die Energieversorgung hinein und verlässt ein
 * Wegeventil nicht über Druck- oder Rücklaufanschluss, damit ein gemeinsames
 * Druckbegrenzungsventil an der Pumpe in Kreis 0 bleibt.
 *
 * Innerhalb eines Kreises wird je Kennbuchstabe von oben nach unten, bei
 * gleicher Höhe von links nach rechts gezählt.
 */

export type ComponentCode = 'P' | 'M' | 'A' | 'V' | 'Z';

/** Bauteile, die kein eigenes Kennzeichen bekommen (reine Anschlusssymbole). */
const UNLABELED = new Set(['supply.silencer']);

export function needsLabel(component: Pick<ComponentInstance, 'type'>): boolean {
  return !UNLABELED.has(component.type);
}

export function componentCode(type: string): ComponentCode {
  if (type === 'supply.pump' || type === 'supply.pump-variable' || type === 'supply.compressor') return 'P';
  if (type === 'supply.electric-motor') return 'M';
  if (type.startsWith('actuator.')) return 'A';
  if (type.startsWith('valve.')) return 'V';
  return 'Z';
}

const isSupply = (c: ComponentInstance) => c.type.startsWith('supply.');

function center(c: ComponentInstance) {
  const box = componentBox(c);
  return box ? { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 } : c.position;
}

interface Edge {
  /** Anschluss am Ausgangsbauteil; fehlt bei Abzweigpunkten. */
  port?: string;
  to: string;
}

/** Knoten im Leitungsnetz: Bauteil-ID oder "j:<id>" für einen Abzweigpunkt. */
const nodeOf = (e: Endpoint) => (isJunctionRef(e) ? `j:${e.junctionId}` : e.componentId);
const portOf = (e: Endpoint) => (isJunctionRef(e) ? undefined : e.portId);

/** Schaltkreisnummer je Bauteil-ID. */
export function circuitsOf(diagram: Diagram): Map<string, number> {
  const byId = new Map(diagram.components.map((c) => [c.id, c]));
  const edges = new Map<string, Edge[]>();
  const link = (from: Endpoint, to: Endpoint) => {
    const key = nodeOf(from);
    edges.set(key, [...(edges.get(key) ?? []), { port: portOf(from), to: nodeOf(to) }]);
  };
  for (const l of diagram.connections) {
    link(l.from, l.to);
    link(l.to, l.from);
  }
  const portKind = (c: ComponentInstance, portId: string): PortKind | undefined =>
    definitionOf(c)?.ports.find((p) => p.id === portId)?.kind;

  // Kreis je Knoten; Abzweigpunkte tragen den Kreis nur weiter.
  const circuit = new Map<string, number>();
  const actuators = diagram.components
    .filter((c) => componentCode(c.type) === 'A')
    .sort((a, b) => center(a).x - center(b).x || center(a).y - center(b).y);

  // Gleichzeitige Breitensuche von allen Antrieben aus: wer zuerst ankommt, gewinnt.
  let frontier: string[] = [];
  actuators.forEach((a, i) => {
    circuit.set(a.id, i + 1);
    frontier.push(a.id);
  });
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      const from = byId.get(id);
      for (const e of edges.get(id) ?? []) {
        const kind = from && e.port !== undefined ? portKind(from, e.port) : undefined;
        if (from?.type === 'valve.directional' && (kind === 'pressure' || kind === 'return')) continue;
        const to = byId.get(e.to);
        if (circuit.has(e.to) || (to && isSupply(to))) continue;
        circuit.set(e.to, circuit.get(id)!);
        next.push(e.to);
      }
    }
    frontier = next;
  }

  // Energieversorgung und alles, was nur an ihr hängt, ist Kreis 0.
  frontier = diagram.components.filter(isSupply).map((c) => c.id);
  for (const id of frontier) circuit.set(id, 0);
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of edges.get(id) ?? []) {
        if (circuit.has(e.to)) continue;
        circuit.set(e.to, 0);
        next.push(e.to);
      }
    }
    frontier = next;
  }

  // Unverbundene Bauteile gehören zum waagerecht nächsten Antrieb.
  for (const c of diagram.components) {
    if (circuit.has(c.id)) continue;
    const x = center(c).x;
    let best = 0;
    actuators.forEach((a, i) => {
      if (Math.abs(center(a).x - x) < Math.abs(center(actuators[best]!).x - x)) best = i;
    });
    circuit.set(c.id, best + 1);
  }
  for (const key of circuit.keys()) if (!byId.has(key)) circuit.delete(key);
  return circuit;
}

/** Vergibt alle Kennzeichen neu. Bauteile ohne Kennzeichenpflicht bleiben unverändert. */
export function autoLabel(diagram: Diagram): Diagram {
  const circuit = circuitsOf(diagram);
  const groups = new Map<string, ComponentInstance[]>();
  for (const c of diagram.components) {
    if (!needsLabel(c)) continue;
    const key = `${circuit.get(c.id)}${componentCode(c.type)}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const labels = new Map<string, string>();
  for (const [key, members] of groups) {
    members
      .map((c) => ({ c, p: center(c) }))
      .sort((a, b) => a.p.y - b.p.y || a.p.x - b.p.x)
      .forEach(({ c }, i) => labels.set(c.id, `${key}${i + 1}`));
  }
  return {
    ...diagram,
    components: diagram.components.map((c) => (labels.has(c.id) ? { ...c, label: labels.get(c.id)! } : c)),
  };
}
