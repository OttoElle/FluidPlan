import { createDiagram, nextId } from './diagram.ts';
import { layersOf } from './layers.ts';
import { sheetSize } from './sheet.ts';
import type { Diagram, Domain, Drawing, DrawingSheet, Sheet, SheetContent } from './types.ts';

/**
 * Zeichnung mit mehreren Blättern.
 *
 * Die Bearbeitungsfunktionen (diagram.ts, arrange.ts, …) kennen nur ein Blatt
 * (`Diagram`). `sheetView` macht aus einem Blatt der Zeichnung ein solches
 * Diagram mit Medium und Schriftfeld der Zeichnung, `withSheet` schreibt ein
 * bearbeitetes Diagram zurück. Änderungen an `meta` gelten so für alle Blätter.
 */

const CONTENT_KEYS = ['sheet', 'components', 'connections', 'junctions', 'annotations', 'groups'] as const;

export function contentOf(diagram: SheetContent): SheetContent {
  const { sheet, components, connections, junctions, annotations, groups } = diagram;
  return { sheet, components, connections, junctions, annotations, groups };
}

/** Zeichnung mit einem einzigen Blatt, z. B. für „Neu“ oder ältere Dateien. */
export function drawingOf(diagram: Diagram, name = 'Blatt 1'): Drawing {
  const drawing: Drawing = { domain: diagram.domain, meta: diagram.meta, sheets: [{ id: 's1', name, ...contentOf(diagram) }] };
  return diagram.layers ? { ...drawing, layers: diagram.layers } : drawing;
}

export function createDrawing(domain: Domain, title?: string, now?: Date, sheet?: Sheet): Drawing {
  return drawingOf(createDiagram(domain, title, now, sheet));
}

/** Blatt mit dieser ID, sonst das erste. */
export function sheetIndex(drawing: Drawing, id: string | null | undefined): number {
  return Math.max(
    0,
    drawing.sheets.findIndex((s) => s.id === id),
  );
}

/** Ein Blatt als bearbeitbarer Schaltplan. */
export function sheetView(drawing: Drawing, index: number): Diagram {
  const s = drawing.sheets[index]!;
  return {
    domain: drawing.domain,
    meta: drawing.meta,
    ...contentOf(s),
    page: { name: s.name, number: index + 1, count: drawing.sheets.length },
    layers: layersOf(drawing),
  };
}

/** Schreibt ein bearbeitetes Blatt zurück; ohne Änderung bleibt die Zeichnung derselbe Wert. */
export function withSheet(drawing: Drawing, index: number, diagram: Diagram): Drawing {
  const s = drawing.sheets[index]!;
  const sheetChanged = CONTENT_KEYS.some((k) => s[k] !== diagram[k]);
  if (!sheetChanged && drawing.meta === diagram.meta && drawing.domain === diagram.domain) return drawing;
  const sheets = sheetChanged
    ? drawing.sheets.map((x, i) => (i === index ? { ...x, ...contentOf(diagram) } : x))
    : drawing.sheets;
  return { ...drawing, domain: diagram.domain, meta: diagram.meta, sheets };
}

/** Alle Blätter als Schaltpläne, z. B. für Export und Prüfung. */
export function allSheetViews(drawing: Drawing): Diagram[] {
  return drawing.sheets.map((_, i) => sheetView(drawing, i));
}

/** Freier Name „Blatt n“. */
function freshName(drawing: Drawing): string {
  const names = new Set(drawing.sheets.map((s) => s.name));
  let n = drawing.sheets.length + 1;
  while (names.has(`Blatt ${n}`)) n++;
  return `Blatt ${n}`;
}

/** Fügt hinter `after` ein leeres Blatt im selben Format ein. */
export function addSheet(drawing: Drawing, after: number): { drawing: Drawing; sheet: DrawingSheet } {
  const template = drawing.sheets[after]!;
  const sheet: DrawingSheet = {
    id: nextId('s', drawing.sheets),
    name: freshName(drawing),
    sheet: { ...template.sheet },
    components: [],
    connections: [],
    junctions: [],
    annotations: [],
    groups: [],
  };
  const sheets = [...drawing.sheets];
  sheets.splice(after + 1, 0, sheet);
  return { drawing: { ...drawing, sheets }, sheet };
}

/** Kopie eines Blatts mit allem Inhalt direkt dahinter. IDs der Teile gelten je Blatt und bleiben gleich. */
export function duplicateSheet(drawing: Drawing, index: number): { drawing: Drawing; sheet: DrawingSheet } {
  const source = drawing.sheets[index]!;
  const sheet: DrawingSheet = {
    ...structuredClone(source),
    id: nextId('s', drawing.sheets),
    name: `${source.name} (Kopie)`,
  };
  const sheets = [...drawing.sheets];
  sheets.splice(index + 1, 0, sheet);
  return { drawing: { ...drawing, sheets }, sheet };
}

export function renameSheet(drawing: Drawing, index: number, name: string): Drawing {
  const s = drawing.sheets[index]!;
  if (s.name === name) return drawing;
  return { ...drawing, sheets: drawing.sheets.map((x, i) => (i === index ? { ...x, name } : x)) };
}

/** Verschiebt ein Blatt an die Stelle `to`. */
export function moveSheet(drawing: Drawing, from: number, to: number): Drawing {
  const target = Math.max(0, Math.min(drawing.sheets.length - 1, to));
  if (target === from) return drawing;
  const sheets = [...drawing.sheets];
  const [s] = sheets.splice(from, 1);
  sheets.splice(target, 0, s!);
  return { ...drawing, sheets };
}

/** Löscht ein Blatt; das letzte verbleibende Blatt bleibt stehen. */
export function deleteSheet(drawing: Drawing, index: number): Drawing {
  if (drawing.sheets.length <= 1) return drawing;
  return { ...drawing, sheets: drawing.sheets.filter((_, i) => i !== index) };
}

export function isEmptySheet(s: SheetContent): boolean {
  return s.components.length === 0 && s.annotations.length === 0 && s.connections.length === 0;
}

/** Abstand der Blätter auf der Zeichenfläche: 20 mm. */
export const SHEET_GAP = 80;

export interface SheetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Lage der Blätter auf der gemeinsamen Zeichenfläche: nebeneinander von links
 * nach rechts, oben bündig. Jedes Blatt rechnet in eigenen Koordinaten ab
 * seiner linken oberen Ecke; die Lage ist nur eine Verschiebung für die Anzeige.
 */
export function sheetLayout(sheets: readonly Sheet[]): SheetRect[] {
  let x = 0;
  return sheets.map((s) => {
    const { width, height } = sheetSize(s);
    const rect = { x, y: 0, width, height };
    x += width + SHEET_GAP;
    return rect;
  });
}
