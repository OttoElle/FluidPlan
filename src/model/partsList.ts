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
 * Stückliste nach DIN ISO 1219-2:2019 (Abschnitt 7, Anhang E) und ISO 7573:2008.
 *
 * DIN ISO 1219-2 empfiehlt eine Teileliste auf dem Schaltplan oder getrennt
 * davon, mindestens mit Kennzeichnungsschlüssel, Teilenummer und
 * Bauteilbenennung; wie in Anhang E steht jedes Bauteil in einer eigenen Zeile,
 * sortiert nach Kennzeichen. Das Kennzeichen ist das Betriebsmittelkennzeichen
 * („reference designation“) nach ISO 7573, 5.2.5: je Vorkommen eindeutig.
 *
 * ISO 7573: Spalten mit Volllinien (5.2.1), Reihenfolge frei, firmeneigene
 * Spalten erlaubt (hier: Hersteller). Steht die Liste am Schriftfeld, schließt
 * ihre Kopfzeile direkt daran an (5.1, Bild A.1), die Zeilen stehen darüber.
 * Wahlweise werden gleiche Teile zusammengefasst, dann mit Positionsnummer
 * (5.2.2: gleiche Teile, gleiche Position) und Menge (5.2.3).
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

export type PartsListColumnKey = 'position' | 'quantity' | 'label' | 'name' | 'technicalData' | 'manufacturer' | 'partNumber';

export interface PartsListColumn {
  key: PartsListColumnKey;
  caption: string;
  /** Linker Rand relativ zur Tabelle und Breite, in Einheiten. */
  x: number;
  width: number;
}

/** Spaltenbreiten in mm bei allen Spalten; fehlende Spalten verbreitern die Benennung. */
const COLUMN_MM: Record<PartsListColumnKey, number> = {
  position: 10,
  quantity: 12,
  label: 25,
  name: 55,
  technicalData: 35,
  manufacturer: 30,
  partNumber: 35,
};

/** Spaltenüberschriften (Benennungen aus DIN ISO 1219-2, Abschnitt 7, und ISO 7573, 5.2). */
export const COLUMN_CAPTIONS: Record<PartsListColumnKey, string> = {
  position: 'Pos.',
  quantity: 'Menge',
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
  headerBelow: true,
};

export function partsListColumns(
  a: Pick<PartsListAnnotation, 'technicalData' | 'manufacturer' | 'merge'>,
): PartsListColumn[] {
  const keys: PartsListColumnKey[] = a.merge ? ['position', 'quantity', 'label', 'name'] : ['label', 'name'];
  if (a.technicalData) keys.push('technicalData');
  if (a.manufacturer) keys.push('manufacturer');
  keys.push('partNumber');
  // Die Benennung bekommt, was die übrigen Spalten frei lassen.
  const others = keys.filter((k) => k !== 'name').reduce((sum, k) => sum + COLUMN_MM[k], 0);
  let x = 0;
  return keys.map((key) => {
    const width = (key === 'name' ? PARTS_LIST_WIDTH / U - others : COLUMN_MM[key]) * U;
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
        quantity: 1,
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

/**
 * Fasst gleiche Teile (gleiche Benennung, technische Daten, Hersteller und
 * Teilenummer) zu einer Zeile zusammen: Kennzeichen gesammelt, Menge gezählt,
 * Reihenfolge nach dem ersten Kennzeichen.
 */
export function mergeRows(rows: readonly PartsListRow[]): PartsListRow[] {
  const byKey = new Map<string, PartsListRow & { labels: string[] }>();
  for (const r of rows) {
    const key = [r.name, r.technicalData, r.manufacturer, r.partNumber].join('\u0000');
    const found = byKey.get(key);
    if (found) {
      found.quantity += r.quantity;
      if (r.label) found.labels.push(r.label);
    } else {
      byKey.set(key, { ...r, labels: r.label ? [r.label] : [] });
    }
  }
  return [...byKey.values()].map(({ labels, ...r }) => ({ ...r, label: labels.join(', ') }));
}

/** Die Zeilen, die eine Stückliste auf ihrem Blatt zeigt. */
export function rowsOf(a: PartsListAnnotation, view: Pick<Diagram, 'partsList' | 'page'> | undefined): PartsListRow[] {
  let rows = view?.partsList ?? [];
  if (a.onlyThisSheet) {
    const sheet = view?.page?.number ?? 1;
    rows = rows.filter((r) => r.sheet === sheet);
  }
  return a.merge ? mergeRows(rows) : rows;
}

/** Text einer Zelle; Positionen werden fortlaufend ab 1 gezählt. */
export function cellText(row: PartsListRow, key: PartsListColumnKey, index: number): string {
  if (key === 'position') return String(index + 1);
  if (key === 'quantity') return String(row.quantity);
  return row[key];
}

/** Ob die Stückliste mit ihrer Unterkante auf dem Schriftfeld steht. */
export function onTitleBlock(a: PartsListAnnotation, sheet: Sheet): boolean {
  if (!sheet.frame) return false;
  const block = titleBlock(sheet);
  return a.position.y === block.y && a.position.x < block.x + block.width && a.position.x + PARTS_LIST_WIDTH > block.x;
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
    cells: rows.flatMap((r, i) => columns.map((c) => cell(c, rowTop(i), PARTS_LIST_ROW, cellText(r, c.key, i)))).filter((c) => c.text),
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

/**
 * Die Stückliste als CSV für Tabellenkalkulationen (Semikolon, UTF-8 mit BOM,
 * wie Excel sie erwartet). Zusammengefasst mit Pos. und Menge.
 */
export function partsListCsv(rows: readonly PartsListRow[], options: { sheet: boolean; merged: boolean }): string {
  const keys: PartsListColumnKey[] = [
    ...(options.merged ? (['position', 'quantity'] as const) : []),
    'label', 'name', 'technicalData', 'manufacturer', 'partNumber',
  ];
  const quote = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const head = [...keys.map((k) => COLUMN_CAPTIONS[k]), ...(options.sheet ? ['Blatt'] : [])];
  const lines = [head, ...rows.map((r, i) => [...keys.map((k) => cellText(r, k, i)), ...(options.sheet ? [String(r.sheet)] : [])])];
  return '\uFEFF' + lines.map((l) => l.map(quote).join(';')).join('\r\n') + '\r\n';
}

/** Gleiche Zeilen (damit unveränderte Blätter nicht neu zeichnen). */
export function sameRows(a: readonly PartsListRow[] | undefined, b: readonly PartsListRow[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((r, i) => {
    const s = b[i]!;
    return (
      r.label === s.label && r.name === s.name && r.technicalData === s.technicalData &&
      r.manufacturer === s.manufacturer && r.partNumber === s.partNumber && r.sheet === s.sheet && r.quantity === s.quantity
    );
  });
}
