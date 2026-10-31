import { describe, expect, it } from 'vitest';
import { drawingArea, frameMarks, sheetSize, smallestSheetFor, titleBlock, titleCells } from './sheet.ts';

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
    // 180 × 27 mm nach DIN EN ISO 7200.
    expect(block).toEqual({ x: 428, y: 692, width: 720, height: 108 });
  });

  it('teilt das Schriftfeld lückenlos in Felder auf', () => {
    const sheet = { format: 'A4', orientation: 'landscape', frame: true } as const;
    const block = titleBlock(sheet);
    const cells = titleCells(sheet);
    expect(cells.map((c) => c.field)).toEqual([
      'title', 'drawingNumber', 'organization', 'author', 'checkedBy', 'approvedBy', 'documentType',
      'date', 'format', 'revision', 'sheet',
    ]);
    expect(cells.reduce((sum, c) => sum + c.width * c.height, 0)).toBe(block.width * block.height);
    for (const c of cells) {
      expect(c.x + c.width).toBeLessThanOrEqual(block.x + block.width);
      expect(c.y + c.height).toBeLessThanOrEqual(block.y + block.height);
    }
  });

  it('passt auch auf A4 hoch in den Rahmen', () => {
    const sheet = { format: 'A4', orientation: 'portrait', frame: true } as const;
    expect(titleBlock(sheet).x).toBeGreaterThanOrEqual(drawingArea(sheet).x);
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

describe('Rahmenmarken nach ISO 5457', () => {
  it('teilt A4 quer in 6 × 4 Felder und setzt vier Mittenmarken', () => {
    const marks = frameMarks({ format: 'A4', orientation: 'landscape', frame: true });
    expect(marks.centring).toHaveLength(4);
    const top = marks.labels.filter((l) => /\d/.test(l.text) && l.y < 40);
    const right = marks.labels.filter((l) => /[A-Z]/.test(l.text) && l.x > 1100);
    expect(top.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(right.map((l) => l.text)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('lässt I und O aus und zeichnet ohne Rahmen nichts', () => {
    const big = frameMarks({ format: 'A1', orientation: 'portrait', frame: true });
    const letters = big.labels.filter((l) => /[A-Z]/.test(l.text)).map((l) => l.text);
    expect(letters).not.toContain('I');
    expect(letters).not.toContain('O');
    expect(frameMarks({ format: 'A4', orientation: 'landscape', frame: false }).labels).toEqual([]);
  });
});

describe('Feldanzahl nach ISO 5457, Tabelle 2', () => {
  const count = (format: 'A1' | 'A2' | 'A3', axis: 'digits' | 'letters') => {
    const marks = frameMarks({ format, orientation: 'landscape', frame: true });
    const texts = marks.labels.filter((l) => (axis === 'digits' ? /\d/ : /[A-Z]/).test(l.text)).map((l) => l.text);
    return new Set(texts).size;
  };
  it.each([
    ['A1', 16, 12],
    ['A2', 12, 8],
    ['A3', 8, 6],
  ] as const)('%s: %i × %i Felder', (format, long, short) => {
    expect(count(format, 'digits')).toBe(long);
    expect(count(format, 'letters')).toBe(short);
  });

  it('beschriftet A4 nur oben und rechts', () => {
    const marks = frameMarks({ format: 'A4', orientation: 'landscape', frame: true });
    expect(marks.labels.filter((l) => l.text === '1')).toHaveLength(1);
    expect(marks.labels.filter((l) => l.text === 'A')).toHaveLength(1);
  });
});
