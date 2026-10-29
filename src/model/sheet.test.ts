import { describe, expect, it } from 'vitest';
import { drawingArea, sheetSize, smallestSheetFor, titleBlock, titleCells } from './sheet.ts';

describe('Zeichenblatt', () => {
  it('rechnet Blattgrößen in Einheiten à 0,25 mm um', () => {
    expect(sheetSize({ format: 'A4', orientation: 'portrait', frame: false })).toEqual({ width: 840, height: 1188 });
    expect(sheetSize({ format: 'A3', orientation: 'landscape', frame: true })).toEqual({ width: 1680, height: 1188 });
  });

  it('legt die linke obere Rahmenecke (mit Heftrand) aufs Raster', () => {
    const area = drawingArea({ format: 'A4', orientation: 'landscape', frame: true });
    expect(area).toEqual({ x: 80, y: 40, width: 1068, height: 760 });
  });

  it('setzt das Schriftfeld in die untere rechte Rahmenecke', () => {
    const block = titleBlock({ format: 'A4', orientation: 'landscape', frame: true });
    expect(block).toEqual({ x: 588, y: 692, width: 560, height: 108 });
  });

  it('teilt das Schriftfeld lückenlos in Felder auf', () => {
    const sheet = { format: 'A4', orientation: 'landscape', frame: true } as const;
    const block = titleBlock(sheet);
    const cells = titleCells(sheet);
    expect(cells.map((c) => c.field)).toEqual([
      'title', 'drawingNumber', 'organization', 'author', 'checkedBy', 'date', 'format', 'revision', 'sheet',
    ]);
    expect(cells.reduce((sum, c) => sum + c.width * c.height, 0)).toBe(block.width * block.height);
    for (const c of cells) {
      expect(c.x + c.width).toBeLessThanOrEqual(block.x + block.width);
      expect(c.y + c.height).toBeLessThanOrEqual(block.y + block.height);
    }
  });

  it('nimmt ohne Rahmen das ganze Blatt', () => {
    expect(drawingArea({ format: 'A4', orientation: 'landscape', frame: false })).toEqual({
      x: 0, y: 0, width: 1188, height: 840,
    });
  });

  it('findet das kleinste passende Blatt', () => {
    expect(smallestSheetFor(500, 400).format).toBe('A4');
    expect(smallestSheetFor(1500, 900).format).toBe('A3');
    expect(smallestSheetFor(99999, 99999).format).toBe('A1');
  });
});
