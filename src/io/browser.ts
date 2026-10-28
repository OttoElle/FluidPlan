import type { Diagram } from '../model/types.ts';
import { FILE_EXTENSION, parseDiagram, serializeDiagram, type ParseResult } from './json.ts';

/** Bietet den Schaltplan als Datei zum Herunterladen an. */
export function downloadDiagram(diagram: Diagram): void {
  downloadBlob(new Blob([serializeDiagram(diagram)], { type: 'application/json' }), fileNameFor(diagram.meta.title));
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // Manche Browser lesen die Adresse erst nach dem Klick; kurz warten.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Liest eine vom Nutzer gewählte Datei ein. */
export async function readDiagramFile(file: File): Promise<ParseResult> {
  return parseDiagram(await file.text());
}

export function fileNameFor(title: string, extension = FILE_EXTENSION): string {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'schaltplan';
  return base + extension;
}
