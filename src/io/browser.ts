import type { Diagram } from '../model/types.ts';
import { FILE_EXTENSION, parseDiagram, serializeDiagram, type ParseResult } from './json.ts';

/** Bietet den Schaltplan als Datei zum Herunterladen an. */
export function downloadDiagram(diagram: Diagram): void {
  const blob = new Blob([serializeDiagram(diagram)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileNameFor(diagram.meta.title);
  a.click();
  URL.revokeObjectURL(url);
}

/** Liest eine vom Nutzer gewählte Datei ein. */
export async function readDiagramFile(file: File): Promise<ParseResult> {
  return parseDiagram(await file.text());
}

export function fileNameFor(title: string): string {
  const base = title.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'schaltplan';
  return base + FILE_EXTENSION;
}
