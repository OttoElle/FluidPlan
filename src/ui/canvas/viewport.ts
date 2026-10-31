import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { SheetRect } from '../../model/drawing.ts';
import type { Point } from '../../model/types.ts';
import { RULER_SIZE } from '../Rulers.tsx';
import { LABEL_HEIGHT } from '../SheetLabels.tsx';

/** Bildschirmpixel pro Millimeter bei 100 % (CSS: 96 dpi). */
export const PX_PER_MM = 96 / 25.4;
/** Kleinster Zoom: 20 % (Papiergröße = 100 %). */
const MIN_SCALE = 0.2 * PX_PER_MM * 0.25;
const MAX_SCALE = 12;
/**
 * Freiraum um das Blatt beim Einpassen, in Bildschirmpixeln: Platz für Lineale,
 * Blattname, „+“ und die Leisten unten.
 */
const FIT_PADDING = { left: RULER_SIZE + 24, top: RULER_SIZE + LABEL_HEIGHT + 12, right: 72, bottom: 64 };

/** Sichtbarer Ausschnitt: Schaltplan-Koordinate der linken oberen Ecke und Pixel pro Einheit. */
export interface View {
  x: number;
  y: number;
  scale: number;
}

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Anteil des Blatts `r` (Größe `paper`), der gerade auf dem Bildschirm zu sehen ist. */
function visibleShare(
  view: View,
  size: { width: number; height: number },
  r: Point,
  paper: { width: number; height: number },
): number {
  const w = Math.min(r.x + paper.width, view.x + size.width / view.scale) - Math.max(r.x, view.x);
  const h = Math.min(r.y + paper.height, view.y + size.height / view.scale) - Math.max(r.y, view.y);
  return w > 0 && h > 0 ? (w * h) / (paper.width * paper.height) : 0;
}

/**
 * Sichtbarer Ausschnitt der Zeichenfläche: verfolgt die Größe des SVG, passt
 * das bearbeitbare Blatt beim ersten Anzeigen bzw. bei neuem Format ein und
 * zoomt mit dem Mausrad um den Mauszeiger.
 */
export function useViewport(
  svgRef: RefObject<SVGSVGElement | null>,
  { layout, activeIndex, paper, fitKey }: {
    /** Lage aller Blätter auf der Fläche. */
    layout: SheetRect[];
    activeIndex: number;
    paper: { width: number; height: number };
    /** Ändert sich mit dem Blattformat; dann wird neu eingepasst. */
    fitKey: string;
  },
) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const origin: Point = layout[activeIndex]!;

  /** Zeigt den Bereich `r` (Flächenkoordinaten) möglichst groß. */
  const fitRect = useCallback(
    (r: SheetRect) => {
      if (!size) return;
      const width = Math.max(1, size.width - FIT_PADDING.left - FIT_PADDING.right);
      const height = Math.max(1, size.height - FIT_PADDING.top - FIT_PADDING.bottom);
      const scale = clampScale(Math.min(width / r.width, height / r.height));
      setView({
        scale,
        x: r.x - (FIT_PADDING.left + (width - r.width * scale) / 2) / scale,
        y: r.y - (FIT_PADDING.top + (height - r.height * scale) / 2) / scale,
      });
    },
    [size],
  );
  const fit = useCallback(
    () => fitRect({ x: origin.x, y: origin.y, width: paper.width, height: paper.height }),
    [fitRect, origin.x, origin.y, paper.width, paper.height],
  );
  const fitAll = () => {
    const last = layout.at(-1)!;
    fitRect({ x: 0, y: 0, width: last.x + last.width, height: Math.max(...layout.map((r) => r.height)) });
  };

  // Größe der Zeichenfläche verfolgen.
  useEffect(() => {
    const svg = svgRef.current!;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect;
      setSize({ width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // Beim ersten Anzeigen und bei neuem Blattformat das ganze Blatt einpassen. Wird ein
  // anderes Blatt bearbeitbar (Strg+Bild ab, Rückgängig, „+“), das kaum zu sehen ist,
  // dorthin springen.
  const fittedFor = useRef<{ active: number; key: string } | null>(null);
  useEffect(() => {
    if (!size) return;
    const before = fittedFor.current;
    fittedFor.current = { active: activeIndex, key: fitKey };
    if (!before || (before.active === activeIndex && before.key !== fitKey)) fit();
    else if (before.active !== activeIndex && view && visibleShare(view, size, origin, paper) < 0.25) fit();
  }, [size, activeIndex, fitKey, fit, view, origin, paper]);

  /** Zoomt um den Bildschirmpunkt (px, py) relativ zur Zeichenfläche. */
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setView((v) => {
      if (!v) return v;
      const scale = clampScale(v.scale * factor);
      return { scale, x: v.x + px / v.scale - px / scale, y: v.y + py / v.scale - py / scale };
    });
  }, []);

  // React registriert onWheel passiv; preventDefault braucht einen eigenen Listener.
  useEffect(() => {
    const svg = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [zoomAt]);


  return { size, view, setView, fit, fitAll, zoomAt };
}
