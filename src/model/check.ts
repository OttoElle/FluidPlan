import { connectionsAt } from './diagram.ts';
import { needsLabel } from './labels.ts';
import { definitionOf } from './library.ts';
import { componentBox, routeAll, type Box } from './routing.ts';
import { drawingArea, titleBlock } from './sheet.ts';
import type { ComponentInstance, Diagram } from './types.ts';

/**
 * „Zeichnung prüfen“: findet typische Fehler in einem Schaltplan.
 *
 * Fehler machen die Zeichnung falsch (doppelte Kennzeichen), Hinweise
 * zeigen Stellen, die meist unbeabsichtigt sind (offene Anschlüsse,
 * überlappende Bauteile, Leitungen quer durch ein Symbol).
 */

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  message: string;
  /** Betroffene Bauteile bzw. Leitungen, zum Auswählen in der Zeichnung. */
  components: string[];
  connections: string[];
}

/** Name eines Bauteils in Meldungen: Kennzeichen, sonst Bauteilname. */
export function describe(c: ComponentInstance): string {
  const name = definitionOf(c)?.name ?? c.type;
  return c.label ? `${c.label} ${name}` : name;
}

/** Echte Überlappung zweier Rechtecke; Berühren an der Kante zählt nicht. */
const overlaps = (a: Box, b: Box) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

const inside = (a: Box, b: Box) => a.minX >= b.minX && a.maxX <= b.maxX && a.minY >= b.minY && a.maxY <= b.maxY;

const rectBox = (r: { x: number; y: number; width: number; height: number }): Box => ({
  minX: r.x,
  minY: r.y,
  maxX: r.x + r.width,
  maxY: r.y + r.height,
});

export function checkDiagram(diagram: Diagram): Issue[] {
  const issues: Issue[] = [];
  const issue = (severity: Severity, message: string, components: string[] = [], connections: string[] = []) =>
    issues.push({ severity, message, components, connections });

  // Kennzeichen
  const byLabel = new Map<string, ComponentInstance[]>();
  for (const c of diagram.components) {
    const label = c.label.trim();
    if (label) byLabel.set(label, [...(byLabel.get(label) ?? []), c]);
    else if (needsLabel(c)) issue('warning', `${describe(c)} hat kein Kennzeichen.`, [c.id]);
  }
  for (const [label, members] of byLabel) {
    if (members.length > 1) {
      issue('error', `Kennzeichen ${label} ist ${members.length}-mal vergeben.`, members.map((c) => c.id));
    }
  }

  // Offene Anschlüsse. Entlüftungen pneumatischer Ventile dürfen offen bleiben.
  for (const c of diagram.components) {
    const def = definitionOf(c);
    if (!def) continue;
    const open = def.ports.filter((p) => {
      if (diagram.domain === 'pneumatic' && p.kind === 'return' && c.type.startsWith('valve.')) return false;
      return connectionsAt(diagram, { componentId: c.id, portId: p.id }).length === 0;
    });
    if (open.length) {
      const names = open
        .map((p) => p.label ?? p.id)
        .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
        .join(', ');
      issue('warning', `${describe(c)}: ${open.length === 1 ? 'Anschluss' : 'Anschlüsse'} ${names} offen.`, [c.id]);
    }
  }

  // Lage auf dem Blatt
  const boxes = diagram.components.map((c) => ({ c, box: componentBox(c) })).filter((e) => e.box) as {
    c: ComponentInstance;
    box: Box;
  }[];
  const area = rectBox(drawingArea(diagram.sheet));
  const block = diagram.sheet.frame ? rectBox(titleBlock(diagram.sheet)) : null;
  for (const { c, box } of boxes) {
    if (!inside(box, area)) issue('warning', `${describe(c)} liegt außerhalb der Zeichenfläche.`, [c.id]);
    else if (block && overlaps(box, block)) issue('warning', `${describe(c)} liegt auf dem Schriftfeld.`, [c.id]);
  }
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (overlaps(a.box, b.box)) {
        issue('warning', `${describe(a.c)} und ${describe(b.c)} überlappen sich.`, [a.c.id, b.c.id]);
      }
    }
  }

  // Leitungen, die durch ein Symbol laufen
  const paths = routeAll(diagram);
  for (const l of diagram.connections) {
    const path = paths.get(l.id);
    if (!path) continue;
    const crossed = boxes.filter(({ box }) =>
      path.slice(1).some((b, k) => {
        const a = path[k]!;
        const seg: Box = {
          minX: Math.min(a.x, b.x),
          maxX: Math.max(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxY: Math.max(a.y, b.y),
        };
        // Strecken haben keine Fläche: innen heißt echt zwischen den Kanten.
        return a.x === b.x
          ? seg.minX > box.minX && seg.minX < box.maxX && seg.minY < box.maxY && seg.maxY > box.minY
          : seg.minY > box.minY && seg.minY < box.maxY && seg.minX < box.maxX && seg.maxX > box.minX;
      }),
    );
    for (const { c } of crossed) {
      issue('warning', `Eine Leitung läuft durch ${describe(c)}.`, [c.id], [l.id]);
    }
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
