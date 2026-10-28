import { describe, expect, it } from 'vitest';
import { drawingArea, sheetSize, smallestSheetFor, titleBlock } from './sheet.ts';

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
    expect(block).toEqual({ x: 668, y: 700, width: 480, height: 100 });
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
