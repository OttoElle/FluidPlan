import { useEffect, useRef } from 'react';
import { copySelection, pasteFragment } from '../model/clipboard.ts';
import type { Selection } from '../model/selection.ts';
import type { Diagram } from '../model/types.ts';
import { parseDiagram, serializeDiagram } from '../io/json.ts';
import { DOMAIN_NAMES } from './SheetSettings.tsx';

/** Versatz beim wiederholten Einfügen (2 Rasterschritte). */
const PASTE_STEP = 20;

/**
 * Kopieren, Ausschneiden und Einfügen der Auswahl `current` im Blatt `diagram`;
 * Strg+C/X/V außerhalb von Eingabefeldern laufen ebenfalls hierüber.
 */
export function useClipboard({
  diagram,
  current,
  edit,
  setSelection,
  setMessage,
  deleteSelection,
}: {
  diagram: Diagram;
  current: Selection;
  edit: (next: Diagram) => void;
  setSelection: (s: Selection) => void;
  setMessage: (message: string) => void;
  deleteSelection: () => void;
}) {
  /**
   * Zuletzt kopierter Ausschnitt als Datei-Text (siehe model/clipboard.ts) und
   * wie oft er schon eingefügt wurde; jedes Einfügen rückt zwei Raster weiter.
   * Strg+C/X/V gehen zusätzlich über die Zwischenablage des Systems, so lässt
   * sich auch zwischen zwei Fenstern kopieren.
   */
  const clipboard = useRef<{ text: string; pasted: number } | null>(null);

  const copy = (): string | null => {
    const fragment = copySelection(diagram, current);
    if (!fragment) return null;
    const text = serializeDiagram(fragment);
    clipboard.current = { text, pasted: 1 };
    return text;
  };

  const cut = (): string | null => {
    const text = copy();
    if (text === null) return null;
    // Ausgeschnittenes kommt beim ersten Einfügen an dieselbe Stelle.
    clipboard.current = { text, pasted: 0 };
    deleteSelection();
    return text;
  };

  /** Fügt `text` (aus der System-Zwischenablage) oder den zuletzt kopierten Ausschnitt ein. */
  const paste = (text?: string) => {
    const known = clipboard.current;
    const source = text === undefined || text === known?.text ? known : { text, pasted: 1 };
    if (!source) return;
    const parsed = parseDiagram(source.text);
    // Fremder Text in der Zwischenablage: nichts einfügen.
    if (!parsed.ok) return;
    if (parsed.diagram.domain !== diagram.domain && parsed.diagram.components.length > 0) {
      setMessage(`Bauteile aus einem ${DOMAIN_NAMES[parsed.diagram.domain]}-Plan lassen sich hier nicht einfügen.`);
      return;
    }
    const step = source.pasted * PASTE_STEP;
    const r = pasteFragment(diagram, parsed.diagram, { x: step, y: step });
    edit(r.diagram);
    setSelection(r.selection);
    clipboard.current = { ...source, pasted: source.pasted + 1 };
  };

  /** Schaltflächen: zusätzlich in die System-Zwischenablage schreiben, wenn der Browser es erlaubt. */
  const toSystemClipboard = (text: string | null) => {
    if (text !== null) navigator.clipboard?.writeText(text).catch(() => {});
  };

  // Strg+C/X/V außerhalb von Eingabefeldern: Ausschnitt statt Text kopieren.
  useEffect(() => {
    const outsideFields = (e: ClipboardEvent) =>
      !(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
    const onCopy = (e: ClipboardEvent) => {
      if (!outsideFields(e)) return;
      const text = e.type === 'cut' ? cut() : copy();
      if (text === null) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!outsideFields(e)) return;
      e.preventDefault();
      paste(e.clipboardData?.getData('text/plain') || undefined);
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  });

  return { copy, cut, paste, toSystemClipboard };
}
