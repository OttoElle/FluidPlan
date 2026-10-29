import { SHEET_FORMATS, sheetSize } from '../model/sheet.ts';
import type { Diagram } from '../model/types.ts';
import { downloadBlob, fileNameFor } from './browser.ts';

/**
 * Export als SVG, PNG und PDF in echter Papiergröße.
 *
 * Grundlage ist die Zeichnung, wie sie im Editor zu sehen ist: Das SVG der
 * Zeichenfläche wird kopiert, alles nur für die Bearbeitung Nötige (Raster,
 * Anschlusspunkte, Auswahl, Trefferflächen) entfernt und die Darstellung
 * schwarz auf weiß als Attribute eingetragen. So hängt die Datei weder vom
 * Stylesheet der Oberfläche noch vom Dunkelmodus ab.
 */

export type ExportFormat = 'pdf' | 'svg' | 'png';

export interface ExportOptions {
  /** Anschlussbezeichnungen (P, T, A, B, 1, 2, …) mit ausgeben. */
  portLabels: boolean;
  /** Auflösung beim PNG-Export. */
  dpi: number;
  /** Alle Blätter (PDF: eine Seite je Blatt, SVG/PNG: eine Datei je Blatt) oder nur das angezeigte. */
  sheets: 'all' | 'current';
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = { portLabels: true, dpi: 300, sheets: 'all' };

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT = 'Arial, Helvetica, sans-serif';

/** Darstellung für den Druck, in derselben Reihenfolge wie im Stylesheet. */
const PRINT_STYLE: [selector: string, attributes: Record<string, string>][] = [
  ['.paper', { fill: '#ffffff' }],
  ['.line', { fill: 'none', stroke: '#000000', 'stroke-width': '1.5' }],
  ['.junction', { fill: '#000000' }],
  ['.symbol', { fill: 'none', stroke: '#000000', 'stroke-linejoin': 'miter' }],
  ['.symbol .fill', { fill: '#000000' }],
  ['.component .box', { fill: '#ffffff', stroke: '#000000', 'stroke-width': '1' }],
  ['.component .name', { 'font-size': '7', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#000000' }],
  ['.component .label', { 'font-size': '8', 'text-anchor': 'end', 'font-weight': 'bold', fill: '#000000' }],
  ['.component .description', { 'font-size': '7', 'text-anchor': 'end', fill: '#000000' }],
  ['.port text', { 'font-size': '6', fill: '#000000' }],
  ['.sheet-frame .frame', { fill: 'none', stroke: '#000000', 'stroke-width': '2' }],
  ['.sheet-frame line', { stroke: '#000000', 'stroke-width': '1' }],
  ['.sheet-frame .cell', { fill: 'none', stroke: '#000000', 'stroke-width': '1' }],
  ['.sheet-frame text', { fill: '#000000' }],
  ['.sheet-frame .caption', { 'font-size': '8', fill: '#555555' }],
  ['.sheet-frame .value', { 'font-size': '12' }],
  ['.sheet-frame .value.big', { 'font-size': '18', 'font-weight': 'bold' }],
  ['.note-line', { fill: 'none', stroke: '#000000', 'stroke-width': '1' }],
  ['.note', { fill: '#000000' }],
];

/** Nur für die Bearbeitung: wird beim Export entfernt. */
const EDITOR_ONLY = [
  'defs',
  'title',
  'rect[fill="url(#grid)"]',
  '.segment-hit',
  '.hit',
  '.stroke-hit',
  '.handle',
  '.title-cell',
  '.band',
  '.port circle',
  '.draft',
  '.creating',
  '.group-frame',
  '.snap-mark',
];

/** Papiermaß in mm. */
export function paperSizeMm(diagram: Diagram): { width: number; height: number } {
  const f = SHEET_FORMATS[diagram.sheet.format];
  return diagram.sheet.orientation === 'portrait' ? { ...f } : { width: f.height, height: f.width };
}

/** Eigenständige, druckfertige Kopie der Zeichenfläche. */
export function printableSvg(live: SVGSVGElement, diagram: Diagram, options: ExportOptions): SVGSVGElement {
  const svg = live.cloneNode(true) as SVGSVGElement;
  const paper = sheetSize(diagram.sheet);
  const mm = paperSizeMm(diagram);

  for (const selector of EDITOR_ONLY) svg.querySelectorAll(selector).forEach((el) => el.remove());
  if (!options.portLabels) svg.querySelectorAll('.port').forEach((el) => el.remove());
  for (const [selector, attributes] of PRINT_STYLE) {
    svg.querySelectorAll(selector).forEach((el) => {
      for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    });
  }
  // Ohne Klassen greift auch eingehängt kein Stylesheet der Oberfläche.
  svg.querySelectorAll('[class]').forEach((el) => el.removeAttribute('class'));
  // Leere Gruppen (z. B. Anschlüsse ohne Beschriftung) braucht niemand.
  svg.querySelectorAll('g').forEach((g) => {
    if (!g.hasChildNodes()) g.remove();
  });

  for (const name of ['class', 'style']) svg.removeAttribute(name);
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('version', '1.1');
  svg.setAttribute('width', `${mm.width}mm`);
  svg.setAttribute('height', `${mm.height}mm`);
  svg.setAttribute('viewBox', `0 0 ${paper.width} ${paper.height}`);
  svg.setAttribute('font-family', FONT);

  const title = document.createElementNS(SVG_NS, 'title');
  title.textContent = diagram.meta.title;
  svg.prepend(title);
  return svg;
}

export function svgText(svg: SVGSVGElement): string {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(svg);
}

/**
 * Exportiert Blätter; `drawn[i]` ist das gezeichnete SVG zu `diagrams[i]`.
 * PDF ergibt eine Datei mit einer Seite je Blatt, SVG und PNG eine Datei je Blatt.
 */
export async function exportSheets(
  drawn: SVGSVGElement[],
  diagrams: Diagram[],
  format: ExportFormat,
  options: ExportOptions = DEFAULT_EXPORT_OPTIONS,
): Promise<void> {
  const svgs = drawn.map((live, i) => printableSvg(live, diagrams[i]!, options));
  const title = diagrams[0]!.meta.title;
  if (format === 'pdf') {
    downloadBlob(await renderPdf(svgs, diagrams), fileNameFor(title, '.pdf'));
    return;
  }
  for (const [i, svg] of svgs.entries()) {
    const d = diagrams[i]!;
    // Bei mehreren Dateien die Blattnummer anhängen, damit die Namen verschieden sind.
    const name = fileNameFor(svgs.length > 1 ? `${title} - Blatt ${d.page?.number ?? i + 1}` : title, `.${format}`);
    if (format === 'svg') downloadBlob(new Blob([svgText(svg)], { type: 'image/svg+xml' }), name);
    else downloadBlob(await renderPng(svg, d, options.dpi), name);
  }
}

/** Rastert das SVG in der gewünschten Auflösung auf weißem Grund. */
export async function renderPng(svg: SVGSVGElement, diagram: Diagram, dpi: number): Promise<Blob> {
  const mm = paperSizeMm(diagram);
  const width = Math.round((mm.width / 25.4) * dpi);
  const height = Math.round((mm.height / 25.4) * dpi);
  const url = URL.createObjectURL(new Blob([svgText(svg)], { type: 'image/svg+xml' }));
  try {
    const image = new Image(width, height);
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Das Bild ist zu groß für diesen Browser. Bitte eine kleinere Auflösung wählen.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Das PNG konnte nicht erzeugt werden.'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Vektor-PDF mit einer Seite je Blatt, jede im Format ihres Blatts.
 * Die Bibliotheken werden erst hier geladen.
 */
export async function renderPdf(svgs: SVGSVGElement[], diagrams: Diagram[]): Promise<Blob> {
  const [{ jsPDF }, { svg2pdf }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  const pageOf = (d: Diagram) => {
    const mm = paperSizeMm(d);
    return { mm, orientation: mm.width > mm.height ? ('landscape' as const) : ('portrait' as const) };
  };
  const first = pageOf(diagrams[0]!);
  const doc = new jsPDF({ unit: 'mm', format: [first.mm.width, first.mm.height], orientation: first.orientation, compress: true });
  const { meta } = diagrams[0]!;
  doc.setProperties({ title: meta.title, author: meta.author, creator: 'FluidPlan' });
  // svg2pdf liest Maße und Schrift aus dem Dokument; vorübergehend unsichtbar einhängen.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden';
  document.body.append(host);
  try {
    for (const [i, svg] of svgs.entries()) {
      const { mm, orientation } = pageOf(diagrams[i]!);
      if (i > 0) doc.addPage([mm.width, mm.height], orientation);
      host.replaceChildren(svg);
      await svg2pdf(svg, doc, { x: 0, y: 0, width: mm.width, height: mm.height });
    }
  } finally {
    host.remove();
  }
  return doc.output('blob');
}
