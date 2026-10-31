import type { DiagramMeta, Sheet, SheetFormat } from './types.ts';

/**
 * Zeichenblatt nach DIN EN ISO 5457.
 *
 * Maßstab: 1 Schaltplan-Einheit = 0,25 mm auf dem Papier. Damit ist ein
 * Rasterschritt (10 Einheiten = 1 M nach ISO 1219-1) 2,5 mm groß.
 */
export const MM_PER_UNIT = 0.25;
const UNITS_PER_MM = 1 / MM_PER_UNIT;

/** Blattgrößen im Hochformat (Breite × Höhe in mm). */
export const SHEET_FORMATS: Record<SheetFormat, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
};

export const DEFAULT_SHEET: Sheet = { format: 'A4', orientation: 'landscape', frame: true };

/** Rahmenabstände nach ISO 5457: 20 mm Heftrand links, sonst 10 mm. */
const MARGIN_MM = { left: 20, top: 10, right: 10, bottom: 10 };

/** Schriftfeld unten rechts nach DIN EN ISO 7200 (höchstens 180 mm breit), in mm. */
const TITLE_BLOCK_MM = { width: 180, height: 27 };

/** Linienbreiten in mm: Rahmen und Mittenmarken 0,7 (ISO 5457), Feldteilung und Schriftfeldlinien 0,35. */
export const FRAME_LINE_MM = { frame: 0.7, thin: 0.35 } as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Blattgröße in Schaltplan-Einheiten. */
export function sheetSize(sheet: Sheet): { width: number; height: number } {
  const f = SHEET_FORMATS[sheet.format];
  const [w, h] = sheet.orientation === 'portrait' ? [f.width, f.height] : [f.height, f.width];
  return { width: w * UNITS_PER_MM, height: h * UNITS_PER_MM };
}

/** Zeichenfläche innerhalb des Rahmens (ohne Rahmen: das ganze Blatt). */
export function drawingArea(sheet: Sheet): Rect {
  const { width, height } = sheetSize(sheet);
  if (!sheet.frame) return { x: 0, y: 0, width, height };
  const m = {
    left: MARGIN_MM.left * UNITS_PER_MM,
    top: MARGIN_MM.top * UNITS_PER_MM,
    right: MARGIN_MM.right * UNITS_PER_MM,
    bottom: MARGIN_MM.bottom * UNITS_PER_MM,
  };
  return { x: m.left, y: m.top, width: width - m.left - m.right, height: height - m.top - m.bottom };
}

/** Lage des Schriftfelds in der unteren rechten Rahmenecke. */
export function titleBlock(sheet: Sheet): Rect {
  const area = drawingArea(sheet);
  const width = TITLE_BLOCK_MM.width * UNITS_PER_MM;
  const height = TITLE_BLOCK_MM.height * UNITS_PER_MM;
  return { x: area.x + area.width - width, y: area.y + area.height - height, width, height };
}

/** Kleinstes Querformat-Blatt, auf dem der angegebene Bereich (in Einheiten) Platz hat. */
export function smallestSheetFor(right: number, bottom: number): Sheet {
  const formats = Object.keys(SHEET_FORMATS) as SheetFormat[];
  for (const format of formats) {
    const sheet: Sheet = { ...DEFAULT_SHEET, format };
    const area = drawingArea(sheet);
    if (right <= area.x + area.width && bottom <= area.y + area.height) return sheet;
  }
  return { ...DEFAULT_SHEET, format: formats[formats.length - 1]! };
}

/** Feld im Schriftfeld: bearbeitbare Angaben aus `meta` oder automatisch gefüllte. */
export type TitleField = keyof Omit<DiagramMeta, 'created' | 'modified'> | 'date' | 'format' | 'sheet';

export interface TitleCell extends Rect {
  field: TitleField;
  caption: string;
  /** Große Schrift (Titel). */
  big?: boolean;
}

/**
 * Aufteilung des Schriftfelds in mm (180 × 27, Zeilen 11 + 8 + 8). Enthält die
 * Pflichtangaben nach DIN EN ISO 7200, Tabellen 1 bis 3: Gesetzlicher Eigentümer,
 * Sachnummer, Ausgabedatum, Blattnummer, Titel, Genehmigt von, Erstellt durch,
 * Dokumentenart; dazu optional Änderungsindex, Blattanzahl, Papierformat und
 * Geprüft von (5.3.4: Prüfer dürfen im Schriftfeld stehen). „Blatt“ zeigt die Blattbenennung,
 * die Überschrift dazu die Blattnummer („Blatt 2 von 3“).
 */
const TITLE_CELLS_MM: readonly (Omit<TitleCell, 'x' | 'y' | 'width' | 'height'> & { mm: [number, number, number, number] })[] = [
  { field: 'title', caption: 'Titel', big: true, mm: [0, 0, 110, 11] },
  { field: 'drawingNumber', caption: 'Sachnummer', mm: [110, 0, 70, 11] },
  { field: 'organization', caption: 'Gesetzlicher Eigentümer', mm: [0, 11, 45, 8] },
  { field: 'author', caption: 'Erstellt durch', mm: [45, 11, 45, 8] },
  { field: 'checkedBy', caption: 'Geprüft von', mm: [90, 11, 45, 8] },
  { field: 'approvedBy', caption: 'Genehmigt von', mm: [135, 11, 45, 8] },
  { field: 'documentType', caption: 'Dokumentenart', mm: [0, 19, 45, 8] },
  { field: 'date', caption: 'Ausgabedatum', mm: [45, 19, 25, 8] },
  { field: 'format', caption: 'Papierformat', mm: [70, 19, 20, 8] },
  { field: 'revision', caption: 'Änderungsindex', mm: [90, 19, 25, 8] },
  { field: 'sheet', caption: 'Blatt', mm: [115, 19, 65, 8] },
];

/** Felder des Schriftfelds mit ihrer Lage auf dem Blatt. */
export function titleCells(sheet: Sheet): TitleCell[] {
  const block = titleBlock(sheet);
  return TITLE_CELLS_MM.map(({ mm: [x, y, w, h], ...cell }) => ({
    ...cell,
    x: block.x + x * UNITS_PER_MM,
    y: block.y + y * UNITS_PER_MM,
    width: w * UNITS_PER_MM,
    height: h * UNITS_PER_MM,
  }));
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Rahmenmarken nach ISO 5457, in Einheiten. */
export interface FrameMarks {
  /** Mittenmarken: von der Blattkante bis 10 mm in die Zeichenfläche (ISO 5457, 4.3). */
  centring: Segment[];
  /** Feldteilungsstriche im Rand, 5 mm lang vom Rahmen nach außen. */
  ticks: Segment[];
  /** Feldbezeichnungen: Ziffern oben und unten, Buchstaben links und rechts; bei A4 nur oben und rechts (4.4). */
  labels: { x: number; y: number; text: string }[];
}

/** Feldlänge der Feldeinteilung (ISO 5457). */
const FIELD_MM = 50;
/** Buchstaben für die Felder, ohne I und O (Verwechslung mit 1 und 0). */
const FIELD_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Anzahl der Felder an der langen und kurzen Seite (ISO 5457, Tabelle 2). */
const FIELD_COUNTS: Record<SheetFormat, { long: number; short: number }> = {
  A4: { long: 6, short: 4 },
  A3: { long: 8, short: 6 },
  A2: { long: 12, short: 8 },
  A1: { long: 16, short: 12 },
};

/**
 * Teilt eine Rahmenseite von der Blattmitte aus in `count` Felder zu 50 mm;
 * der Rest fällt den Eckfeldern zu (ISO 5457, 4.4). Liefert die
 * Teilungsstellen (ohne Rahmenecken) und die Feldmitten.
 */
function fieldsAlong(start: number, end: number, middle: number, count: number): { cuts: number[]; centers: number[] } {
  const step = FIELD_MM * UNITS_PER_MM;
  const cuts: number[] = [];
  for (let k = -(count / 2 - 1); k <= count / 2 - 1; k++) cuts.push(middle + k * step);
  const bounds = [start, ...cuts, end];
  return { cuts, centers: bounds.slice(1).map((b, i) => (bounds[i]! + b) / 2) };
}

/** Mittenmarken und Feldeinteilung für ein Blatt mit Rahmen (ohne Rahmen: keine). */
export function frameMarks(sheet: Sheet): FrameMarks {
  if (!sheet.frame) return { centring: [], ticks: [], labels: [] };
  const { width, height } = sheetSize(sheet);
  const a = drawingArea(sheet);
  const right = a.x + a.width;
  const bottom = a.y + a.height;
  const inset = 5 * UNITS_PER_MM;
  const centringInset = 10 * UNITS_PER_MM;
  const allSides = sheet.format !== 'A4';
  const cx = width / 2;
  const cy = height / 2;
  const centring: Segment[] = [
    { x1: cx, y1: 0, x2: cx, y2: a.y + centringInset },
    // Unten nicht ins Schriftfeld hinein.
    { x1: cx, y1: height, x2: cx, y2: titleBlock(sheet).x < cx ? bottom : bottom - centringInset },
    { x1: 0, y1: cy, x2: a.x + centringInset, y2: cy },
    { x1: width, y1: cy, x2: right - centringInset, y2: cy },
  ];
  const counts = FIELD_COUNTS[sheet.format];
  const landscape = width > height;
  const h = fieldsAlong(a.x, right, cx, landscape ? counts.long : counts.short);
  const v = fieldsAlong(a.y, bottom, cy, landscape ? counts.short : counts.long);
  const ticks: Segment[] = [];
  const labels: FrameMarks['labels'] = [];
  for (const x of h.cuts) {
    if (Math.abs(x - cx) < 1e-6) continue;
    ticks.push({ x1: x, y1: a.y, x2: x, y2: a.y - inset });
    if (allSides) ticks.push({ x1: x, y1: bottom, x2: x, y2: bottom + inset });
  }
  for (const y of v.cuts) {
    if (Math.abs(y - cy) < 1e-6) continue;
    ticks.push({ x1: right, y1: y, x2: right + inset, y2: y });
    if (allSides) ticks.push({ x1: a.x, y1: y, x2: a.x - inset, y2: y });
  }
  // Beschriftung mittig im 10-mm-Rand, links ebenfalls 5 mm vor dem Rahmen.
  h.centers.forEach((x, i) => {
    labels.push({ x, y: a.y - inset, text: String(i + 1) });
    if (allSides) labels.push({ x, y: bottom + inset, text: String(i + 1) });
  });
  v.centers.forEach((y, i) => {
    const text = FIELD_LETTERS[i] ?? '?';
    labels.push({ x: right + inset, y, text });
    if (allSides) labels.push({ x: a.x - inset, y, text });
  });
  return { centring, ticks, labels };
}
