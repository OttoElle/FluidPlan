import type { Drawing } from '../model/types.ts';
import { FILE_EXTENSION, parseDrawing, serializeDrawing, type ParseResult } from './json.ts';

/** Bietet die Zeichnung mit allen Blättern als Datei zum Herunterladen an. */
export function downloadDrawing(drawing: Drawing): void {
  downloadBlob(new Blob([serializeDrawing(drawing)], { type: 'application/json' }), fileNameFor(drawing.meta.title));
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
export async function readDrawingFile(file: File): Promise<ParseResult> {
  return parseDrawing(await file.text());
}

export function fileNameFor(title: string, extension = FILE_EXTENSION): string {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'schaltplan';
  return base + extension;
}
