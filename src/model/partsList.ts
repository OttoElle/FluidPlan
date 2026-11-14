import { needsLabel } from './labels.ts';
import { definitionOf } from './library.ts';
import { LETTERING, textWidth } from './lettering.ts';
import { drawingArea, titleBlock } from './sheet.ts';
import type { Box } from './routing.ts';
import type {
  ComponentInstance,
  Diagram,
  Drawing,
  PartsListAnnotation,
  PartsListRow,
  Point,
  Sheet,
} from './types.ts';

/**
 * Stückliste nach DIN ISO 1219-2:2019, Abschnitt 7 und Anhang E.
 *
 * Die Norm empfiehlt eine Teileliste auf dem Schaltplan oder getrennt davon,
 * damit sich Bezeichnungsschlüssel und Materialangabe zuordnen lassen. Sie soll
 * mindestens Kennzeichnungsschlüssel, Teilenummer und Bauteilbenennung
 * enthalten; Technische Daten und Hersteller sind hier zuschaltbar. Wie im
 * Beispiel in Anhang E steht jedes Bauteil in einer eigenen Zeile, sortiert
 * nach Kennzeichen.
 *
 * Die Tabelle hat die Breite des Schriftfelds (180 mm), damit sie bündig
 * darüber stehen kann. Ihre Lage ist die linke untere Ecke, so wächst sie
 * beim Hinzufügen von Bauteilen nach oben und nicht ins Schriftfeld.
 */

/** Einheiten je mm (1 Einheit = 0,25 mm). */
const U = 4;

/** Breite der Tabelle wie das Schriftfeld nach DIN EN ISO 7200. */
export const PARTS_LIST_WIDTH = 180 * U;
/** Höhe der Kopfzeile und der Zeilen. */
export const PARTS_LIST_HEADER = 8 * U;
export const PARTS_LIST_ROW = 6 * U;
/** Schrifthöhe 2,5 mm wie im ganzen Schaltplan (DIN ISO 1219-1, 5.12). */
export const PARTS_LIST_TEXT = LETTERING.normal;
/** Abstand des Texts vom linken Zellrand. */
const PAD = 1.5 * U;

export type PartsListColumnKey = 'label' | 'name' | 'technicalData' | 'manufacturer' | 'partNumber';

export interface PartsListColumn {
  key: PartsListColumnKey;
  caption: string;
  /** Linker Rand relativ zur Tabelle und Breite, in Einheiten. */
  x: number;
  width: number;
}

/** Spaltenbreiten in mm bei allen Spalten; fehlende Spalten verbreitern die Benennung. */
const COLUMN_MM: Record<PartsListColumnKey, number> = {
  label: 25,
  name: 55,
  technicalData: 35,
  manufacturer: 30,
  partNumber: 35,
};

/** Spaltenüberschriften (Benennungen aus DIN ISO 1219-2, Abschnitt 7). */
export const COLUMN_CAPTIONS: Record<PartsListColumnKey, string> = {
  label: 'Kennzeichen',
  name: 'Bauteilbenennung',
  technicalData: 'Technische Daten',
  manufacturer: 'Hersteller',
  partNumber: 'Teilenummer',
};

/** Neue Stückliste in Standardeinstellung (Lage wird beim Einfügen gesetzt). */
export const DEFAULT_PARTS_LIST: Omit<PartsListAnnotation, 'id' | 'position'> = {
  kind: 'partslist',
  technicalData: true,
  manufacturer: true,
};

export function partsListColumns(a: Pick<PartsListAnnotation, 'technicalData' | 'manufacturer'>): PartsListColumn[] {
  const keys: PartsListColumnKey[] = ['label', 'name'];
  if (a.technicalData) keys.push('technicalData');
  if (a.manufacturer) keys.push('manufacturer');
  keys.push('partNumber');
  const spare = (a.technicalData ? 0 : COLUMN_MM.technicalData) + (a.manufacturer ? 0 : COLUMN_MM.manufacturer);
  let x = 0;
  return keys.map((key) => {
    const width = (COLUMN_MM[key] + (key === 'name' ? spare : 0)) * U;
    const col = { key, caption: COLUMN_CAPTIONS[key], x, width };
    x += width;
    return col;
  });
}

/** Ob ein Bauteil in der Stückliste steht: Einstellung am Bauteil, sonst alle mit Kennzeichen. */
export function inPartsList(c: Pick<ComponentInstance, 'type' | 'inPartsList'>): boolean {
  return c.inPartsList ?? needsLabel(c);
}

/** Bauteilbenennung: die eingetragene Bezeichnung, sonst der Name des Symbols. */
export function componentDesignation(c: ComponentInstance): string {
  return c.description?.trim() || definitionOf(c)?.name || c.type;
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/**
 * Zeilen der Stückliste für alle Blätter: ein Bauteil je Zeile, nach
 * Kennzeichen sortiert (0.1, 0.2, …, 0.10, 1.1); Bauteile ohne Kennzeichen
 * stehen am Ende in der Reihenfolge der Blätter.
 */
export function partsListRows(drawing: Pick<Drawing, 'sheets'>): PartsListRow[] {
  const rows: PartsListRow[] = [];
  drawing.sheets.forEach((s, i) => {
    for (const c of s.components) {
      if (!inPartsList(c)) continue;
      rows.push({
        label: c.label.trim(),
        name: componentDesignation(c),
        technicalData: c.technicalData?.trim() ?? '',
        manufacturer: c.manufacturer?.trim() ?? '',
        partNumber: c.partNumber?.trim() ?? '',
        sheet: i + 1,
      });
    }
  });
  return rows
    .map((row, order) => ({ row, order }))
    .sort((a, b) => {
      if (!a.row.label !== !b.row.label) return a.row.label ? -1 : 1;
      return collator.compare(a.row.label, b.row.label) || a.order - b.order;
    })
    .map((x) => x.row);
}

/** Die Zeilen, die eine Stückliste auf ihrem Blatt zeigt. */
export function rowsOf(a: PartsListAnnotation, view: Pick<Diagram, 'partsList' | 'page'> | undefined): PartsListRow[] {
  const rows = view?.partsList ?? [];
  if (!a.onlyThisSheet) return rows;
  const sheet = view?.page?.number ?? 1;
  return rows.filter((r) => r.sheet === sheet);
}

/** Höhe der Tabelle bei `rows` Zeilen (mindestens eine leere Zeile). */
export function partsListHeight(rows: number): number {
  return PARTS_LIST_HEADER + Math.max(1, rows) * PARTS_LIST_ROW;
}

export function partsListBox(a: PartsListAnnotation, rows: number): Box {
  const { x, y } = a.position;
  return { minX: x, minY: y - partsListHeight(rows), maxX: x + PARTS_LIST_WIDTH, maxY: y };
}

/** Kürzt einen Text mit „…“, bis er in `width` passt. */
export function fitText(text: string, width: number, h = PARTS_LIST_TEXT): string {
  if (textWidth(text, h) <= width) return text;
  let s = text;
  while (s.length > 0 && textWidth(s + '…', h) > width) s = s.slice(0, -1);
  return s.trimEnd() + '…';
}

export interface PartsListCell {
  x: number;
  /** Grundlinie. */
  y: number;
  text: string;
  /** Vollständiger Text, wenn gekürzt (Tooltip). */
  full?: string;
}

export interface PartsListLayout {
  box: Box;
  /** Waagerechte Trennlinien (ohne Außenrand); `heavy` trennt die Kopfzeile ab. */
  rules: { y: number; heavy: boolean }[];
  /** Senkrechte Spaltentrenner (ohne Außenrand). */
  dividers: number[];
  header: PartsListCell[];
  cells: PartsListCell[];
}

/** Lage aller Linien und Texte einer Stückliste. */
export function partsListLayout(a: PartsListAnnotation, rows: readonly PartsListRow[]): PartsListLayout {
  const box = partsListBox(a, rows.length);
  const columns = partsListColumns(a);
  const below = a.headerBelow ?? false;
  const headerTop = below ? box.maxY - PARTS_LIST_HEADER : box.minY;
  const bodyTop = below ? box.minY : box.minY + PARTS_LIST_HEADER;
  const count = Math.max(1, rows.length);
  // Kopfzeile unten: erste Zeile direkt darüber, weitere nach oben (wie über dem Schriftfeld üblich).
  const rowTop = (i: number) => (below ? headerTop - (i + 1) * PARTS_LIST_ROW : bodyTop + i * PARTS_LIST_ROW);
  const baseline = (top: number, height: number) => top + (height + PARTS_LIST_TEXT) / 2;
  const rules: PartsListLayout['rules'] = [{ y: below ? headerTop : headerTop + PARTS_LIST_HEADER, heavy: true }];
  for (let i = 1; i < count; i++) rules.push({ y: below ? rowTop(i) + PARTS_LIST_ROW : rowTop(i), heavy: false });
  const cell = (col: PartsListColumn, top: number, height: number, text: string): PartsListCell => {
    const fitted = fitText(text, col.width - 2 * PAD);
    return { x: box.minX + col.x + PAD, y: baseline(top, height), text: fitted, ...(fitted !== text ? { full: text } : {}) };
  };
  return {
    box,
    rules,
    dividers: columns.slice(1).map((c) => box.minX + c.x),
    header: columns.map((c) => cell(c, headerTop, PARTS_LIST_HEADER, c.caption)),
    cells: rows.flatMap((r, i) => columns.map((c) => cell(c, rowTop(i), PARTS_LIST_ROW, r[c.key]))).filter((c) => c.text),
  };
}

/**
 * Lage einer neuen Stückliste: bündig über dem Schriftfeld; ohne Rahmen
 * unten rechts in der Zeichenfläche.
 */
export function defaultPartsListPosition(sheet: Sheet): Point {
  if (sheet.frame) {
    const block = titleBlock(sheet);
    return { x: block.x + block.width - PARTS_LIST_WIDTH, y: block.y };
  }
  const area = drawingArea(sheet);
  return { x: area.x + area.width - PARTS_LIST_WIDTH - 40, y: area.y + area.height - 40 };
}

/** Die Stückliste als CSV für Tabellenkalkulationen (Semikolon, UTF-8 mit BOM, wie Excel sie erwartet). */
export function partsListCsv(rows: readonly PartsListRow[], withSheet: boolean): string {
  const keys: PartsListColumnKey[] = ['label', 'name', 'technicalData', 'manufacturer', 'partNumber'];
  const quote = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = [...keys.map((k) => COLUMN_CAPTIONS[k]), ...(withSheet ? ['Blatt'] : [])];
  const lines = [head, ...rows.map((r) => [...keys.map((k) => r[k]), ...(withSheet ? [String(r.sheet)] : [])])];
  return '﻿' + lines.map((l) => l.map(quote).join(';')).join('\r\n') + '\r\n';
}

/** Gleiche Zeilen (damit unveränderte Blätter nicht neu zeichnen). */
export function sameRows(a: readonly PartsListRow[] | undefined, b: readonly PartsListRow[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((r, i) => {
    const s = b[i]!;
    return (
      r.label === s.label && r.name === s.name && r.technicalData === s.technicalData &&
      r.manufacturer === s.manufacturer && r.partNumber === s.partNumber && r.sheet === s.sheet
    );
  });
}
