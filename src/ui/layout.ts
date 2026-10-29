import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'fluidplan.theme';
const PALETTE_KEY = 'fluidplan.paletteWidth';

/** localStorage kann fehlen oder gesperrt sein; dann gilt der Standard. */
function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ohne Speicher gilt die Einstellung nur bis zum Neuladen
  }
}

/**
 * Helle oder dunkle Darstellung. Ohne gespeicherte Wahl gilt die
 * Einstellung des Betriebssystems. Wirkt über `data-theme` am <html>.
 */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = load(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      store(THEME_KEY, next);
      return next;
    });
  }, []);
  return [theme, toggle];
}

export const PALETTE_WIDTH = { min: 180, default: 260, max: 600 };
const clampWidth = (w: number) => Math.round(Math.min(PALETTE_WIDTH.max, Math.max(PALETTE_WIDTH.min, w)));

/**
 * Breite der Bauteilliste in Pixeln, per Ziehen am rechten Rand veränderbar
 * und gespeichert. Liefert Breite, pointerdown-Handler für den Griff und Zurücksetzen.
 */
export function usePaletteWidth(): [number, (e: PointerEvent<HTMLElement>) => void, () => void] {
  const [width, setWidth] = useState(() => clampWidth(Number(load(PALETTE_KEY)) || PALETTE_WIDTH.default));
  const current = useRef(width);
  current.current = width;

  const start = useCallback((e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = current.current;
    let last = startWidth;
    const move = (ev: globalThis.PointerEvent) => {
      last = clampWidth(startWidth + ev.clientX - startX);
      setWidth(last);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      store(PALETTE_KEY, String(last));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }, []);

  const reset = useCallback(() => {
    setWidth(PALETTE_WIDTH.default);
    store(PALETTE_KEY, String(PALETTE_WIDTH.default));
  }, []);

  return [width, start, reset];
}
