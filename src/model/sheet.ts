import type { Sheet, SheetFormat } from './types.ts';

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

/** Schriftfeld unten rechts (vereinfacht), in mm. */
const TITLE_BLOCK_MM = { width: 120, height: 25 };

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
