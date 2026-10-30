import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { endpointPosition, sameEndpoint, transformLocalPoint } from '../model/diagram.ts';
import { definitionOf } from '../model/library.ts';
import {
  LINE_HEIGHT,
  STROKE_DASH,
  annotationBox,
  rectFromCorners,
  textLines,
  type NewAnnotation,
} from '../model/annotations.ts';
import { MM_PER_UNIT, drawingArea, sheetSize, titleBlock, titleCells, type TitleCell, type TitleField } from '../model/sheet.ts';
import {
  componentBox,
  branchDots,
  crossings,
  endpointDirection,
  linePathData,
  moveSegment,
  obstaclesOf,
  orthogonalize,
  route,
  routeAll,
} from '../model/routing.ts';
import { EMPTY_SELECTION, toggle, union, type Selection } from '../model/selection.ts';
import { expandGroups } from '../model/groups.ts';
import { layerState, without } from '../model/layers.ts';
import { DEFAULT_SNAP, FINE, snapPoint as snapToTargets, snapTargets, type SnapKind, type SnapOptions, type SnapTargets } from '../model/snap.ts';
import { sheetLayout, type SheetRect } from '../model/drawing.ts';
import type { Annotation, ComponentInstance, Diagram, Endpoint, LineKind, Point } from '../model/types.ts';
import { ComponentSymbol, hasSymbol } from './symbols.tsx';
import { IconButton } from './IconButton.tsx';
import type { PropertiesTarget } from './properties/PropertiesDialog.tsx';
import { GalleryHorizontal, Grid3x3, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { RULER_SIZE, Rulers, type RulersHandle } from './Rulers.tsx';
import { LABEL_HEIGHT, SheetLabels, type ScreenRect, type SheetAction } from './SheetLabels.tsx';

export type { Selection };

/** Zeichenwerkzeug für freie Grafik; `null` = Auswählen. */
export type AnnotationTool = 'text' | 'line' | 'rect' | 'circle' | 'ellipse' | 'polyline';

/** Werkzeuge, deren Form durch Aufziehen entsteht. */
type DragTool = 'line' | 'rect' | 'circle' | 'ellipse';

/** Was beim Verschieben mitwandert. */
export type MoveTarget = Pick<Selection, 'components' | 'annotations'>;

/**
 * Anfasser einer Linie (Anfang, Ende), eines Rechtecks bzw. einer Ellipse (Ecken des
 * Umrisses), eines Kreises (Radius) oder eines Linienzugs (Nummer des Punkts).
 */
type Handle = 'from' | 'to' | 'nw' | 'ne' | 'sw' | 'se' | 'radius' | number;

/** Größe der Formen, wenn nur geklickt statt gezogen wird. */
const DEFAULT_LINE = 100;
const DEFAULT_RECT = { width: 200, height: 120 };
const DEFAULT_RADIUS = 40;
const DEFAULT_ELLIPSE = { rx: 80, ry: 50 };

/** Fangradius in Bildschirmpixeln. */
const SNAP_RADIUS_PX = 8;

/**
 * Ansichtseinstellungen, die der Browser sich merkt (nicht Teil der Datei).
 * Fangen und Lineale sind immer an; Alt beim Zeichnen schaltet das Fangen kurz ab.
 */
interface ViewSettings {
  grid: boolean;
}
const VIEW_SETTINGS_KEY = 'fluidplan.view';
const DEFAULT_VIEW_SETTINGS: ViewSettings = { grid: true };
/** Fangen beim Zeichnen mit gedrückter Alt-Taste: frei in feinen Schritten. */
const NO_SNAP: SnapOptions = { grid: false, connector: false, endpoint: false };

function loadViewSettings(): ViewSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && typeof raw.grid === 'boolean') return { grid: raw.grid };
  } catch {
    // Kein Speicher (z. B. privates Fenster): Standard verwenden.
  }
  return DEFAULT_VIEW_SETTINGS;
}

const GRID = 10;
/** Datentyp beim Ziehen eines Symbols aus der Bauteilliste; Inhalt ist der Schlüssel des Eintrags. */
export const SYMBOL_DRAG_TYPE = 'application/x-fluidplan-symbol';

/** Strichmuster der Leitungsarten nach ISO 1219-1. */
export const LINE_DASH: Record<LineKind, string | undefined> = { working: undefined, pilot: '6 4', drain: '2 3' };

/** Bildschirmpixel pro Millimeter bei 100 % (CSS: 96 dpi). */
const PX_PER_MM = 96 / 25.4;
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;
/**
 * Freiraum um das Blatt beim Einpassen, in Bildschirmpixeln: Platz für Lineale,
 * Blattname, „+“ und die Leisten unten.
 */
const FIT_PADDING = { left: RULER_SIZE + 24, top: RULER_SIZE + LABEL_HEIGHT + 12, right: 72, bottom: 64 };
/** Raster: jeder fünfte Punkt ist kräftiger. */
const MAJOR_EVERY = 5;

/** Alle Blätter der Zeichnung nebeneinander auf einer Fläche. */
export interface Pages {
  /** Alle Blätter; `diagram` ist das bearbeitbare Blatt `active` davon. */
  all: Diagram[];
  active: number;
  /** Klick auf ein anderes Blatt macht es zum bearbeitbaren. */
  onActivate: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number, name: string) => void;
  onAction: (index: number, action: Exclude<SheetAction, 'rename'>) => void;
}

interface Props {
  diagram: Diagram;
  /** Ohne Angabe (z. B. beim Export) nur `diagram` allein. */
  pages?: Pages;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  /** Verschiebt Bauteile und Grafik um `delta` (seit dem letzten Aufruf, im Raster). */
  onMove: (target: MoveTarget, delta: Point) => void;
  /** Aktives Zeichenwerkzeug; ein Klick bzw. Ziehen auf dem Blatt legt das Objekt an. */
  tool?: AnnotationTool | null;
  onCreateAnnotation?: (annotation: NewAnnotation) => void;
  /** Linie bzw. Rechteck über einen Anfasser verändert. */
  onReshapeAnnotation?: (id: string, changes: Partial<Annotation>) => void;
  /** Doppelklick auf Bauteil, Leitung oder Grafik: Eigenschaften-Fenster öffnen. */
  onOpenProperties?: (target: PropertiesTarget) => void;
  /**
   * Symbol aus der Bauteilliste auf ein Blatt gezogen; `point` ist die Stelle
   * unter der Maus in dessen Koordinaten, `sheet` seine Nummer in `pages.all`.
   */
  onDropSymbol?: (key: string, point: Point, sheet: number) => void;
  /** Klick auf ein Feld im Schriftfeld. */
  onEditTitleField?: (field: TitleField) => void;
  /** Neue Leitung; `waypoints` leer = automatisch führen. */
  onConnect: (from: Endpoint, to: Endpoint, waypoints: Point[]) => void;
  /** Neue Leitung, die auf einer bestehenden Leitung endet: dort entsteht ein Abzweig. */
  onConnectToLine: (from: Endpoint, lineId: string, path: Point[], point: Point, waypoints: Point[]) => void;
  onRouteChange: (id: string, waypoints: Point[]) => void;
  onMoveJunction: (id: string, position: Point) => void;
  /** Ziehen beendet; fasst die Zwischenschritte für Rückgängig zu einem Schritt zusammen. */
  onGestureEnd?: () => void;
}

/** Leitung, die gerade gezeichnet wird. */
interface Draft {
  from: Endpoint;
  /** Per Klick gesetzte Zwischenpunkte. */
  waypoints: Point[];
  cursor: Point;
}

/** Sichtbarer Ausschnitt: Schaltplan-Koordinate der linken oberen Ecke und Pixel pro Einheit. */
interface View {
  x: number;
  y: number;
  scale: number;
}

type Drag =
  | { kind: 'move'; target: MoveTarget; start: Point; moved: Point }
  | { kind: 'create'; tool: DragTool; start: Point; end: Point }
  | {
      kind: 'handle';
      annotation: Annotation;
      handle: Handle;
      /** Lage des Anfassers zu Beginn und Mauszeiger zu Beginn. */
      origin: Point;
      start: Point;
      last: Point;
      targets: SnapTargets;
    }
  | { kind: 'band'; start: Point; end: Point; additive: boolean; moved: boolean }
  | { kind: 'pan'; startX: number; startY: number; origin: View; moved: boolean }
  | { kind: 'segment'; id: string; index: number; path: Point[]; start: Point; offset: number }
  | { kind: 'junction'; id: string; start: Point; origin: Point; last: Point };

const DOUBLE_CLICK_MS = 400;

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Zeichnet den Schaltplan als SVG auf einem Zeichenblatt.
 * Mausrad zoomt um den Mauszeiger, Ziehen auf freier Fläche (oder mit der
 * mittleren Maustaste) verschiebt die Ansicht.
 * Bauteile mit Schaltzeichen (symbols.tsx) erscheinen als ISO-1219-Symbol,
 * alle übrigen vorerst als beschriftete Rahmen mit Anschlusspunkten.
 */
export function DiagramView({
  diagram,
  pages,
  selection,
  onSelect,
  onMove,
  onConnect,
  onConnectToLine,
  onRouteChange,
  onMoveJunction,
  onGestureEnd,
  tool = null,
  onCreateAnnotation,
  onReshapeAnnotation,
  onOpenProperties,
  onDropSymbol,
  onEditTitleField,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  /** Markiert die Mausposition auf den Linealen, ohne die Zeichnung neu zu zeichnen. */
  const rulersRef = useRef<RulersHandle>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [panning, setPanning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hoverPort, setHoverPort] = useState<Endpoint | null>(null);
  const [band, setBand] = useState<{ start: Point; end: Point } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  /** Alt gedrückt: freie Grafik ohne Fangen zeichnen. */
  const [altDown, setAltDown] = useState(false);
  const [creating, setCreating] = useState<{ tool: DragTool; start: Point; end: Point } | null>(null);
  /** Linienzug, der gerade Punkt für Punkt gezeichnet wird. */
  const [poly, setPoly] = useState<{ points: Point[]; cursor: Point } | null>(null);
  /** Wo der nächste Punkt einrasten würde (Anzeige beim Zeichnen). */
  const [snapMark, setSnapMark] = useState<{ point: Point; kind: SnapKind | null } | null>(null);
  const [settings, setSettings] = useState<ViewSettings>(loadViewSettings);

  const changeSettings = (next: ViewSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Nicht speicherbar: gilt dann nur für diese Sitzung.
    }
  };

  // Werkzeugwechsel verwirft einen angefangenen Linienzug.
  useEffect(() => {
    setPoly(null);
    setSnapMark(null);
  }, [tool]);

  // Leertaste gedrückt halten: Ziehen mit der linken Maustaste verschiebt die Ansicht.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || (e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]')) return;
      e.preventDefault();
      setSpaceDown(e.type === 'keydown');
    };
    const onAlt = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      // Sonst springt der Fokus unter Windows ins Browsermenü.
      e.preventDefault();
      setAltDown(e.type === 'keydown');
    };
    const onBlur = () => {
      setSpaceDown(false);
      setAltDown(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onAlt);
    window.addEventListener('keyup', onAlt);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('keydown', onAlt);
      window.removeEventListener('keyup', onAlt);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  // Esc bricht das Zeichnen einer Leitung ab.
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft]);

  const { sheet } = diagram;
  const paper = sheetSize(sheet);
  const activeIndex = pages?.active ?? 0;
  const layout: SheetRect[] = pages
    ? sheetLayout(pages.all.map((d, i) => (i === activeIndex ? sheet : d.sheet)))
    : [{ x: 0, y: 0, ...paper }];
  /** Lage des bearbeitbaren Blatts auf der Fläche; seine Koordinaten zählen ab hier. */
  const origin = layout[activeIndex]!;

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
  const fitKey = `${sheet.format}-${sheet.orientation}`;
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

  // Doppelklick selbst erkennen: das Ziehen fängt den Zeiger am SVG, dadurch
  // käme das dblclick-Ereignis nicht beim Bauteil an.
  const lastDown = useRef<{ key: string; time: number } | null>(null);
  const isDoubleClick = (key: string, e: React.PointerEvent) => {
    const last = lastDown.current;
    const double = last !== null && last.key === key && e.timeStamp - last.time < DOUBLE_CLICK_MS;
    lastDown.current = double ? null : { key, time: e.timeStamp };
    return double;
  };

  /** Bildschirmpunkt in Koordinaten der ganzen Fläche. */
  const toWorld = (e: { clientX: number; clientY: number }): Point => {
    const ctm = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };
  /** Bildschirmpunkt in Koordinaten des bearbeitbaren Blatts. */
  const toDiagram = (e: { clientX: number; clientY: number }): Point => {
    const p = toWorld(e);
    return { x: p.x - origin.x, y: p.y - origin.y };
  };

  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  const obstacles = obstaclesOf(diagram);
  const paths = useMemo(() => routeAll(diagram), [diagram]);
  const targets = useMemo(() => (tool ? snapTargets(diagram, paths) : null), [tool, diagram, paths]);

  /** Fängt einen Punkt beim Zeichnen bzw. Ändern freier Grafik (siehe model/snap.ts). */
  const snapFree = (p: Point, t: SnapTargets | null = targets) =>
    snapToTargets(p, t ?? { connectors: [], endpoints: [] }, altDown ? NO_SNAP : DEFAULT_SNAP, SNAP_RADIUS_PX / (view?.scale ?? 1));

  /** Fangpunkte beim Zeichnen eines Linienzugs: auch seine eigenen Punkte (zum Schließen). */
  const polyTargets = (points: Point[]): SnapTargets | null =>
    targets && { ...targets, endpoints: [...points, ...targets.endpoints] };

  const finishPoly = (points: Point[], closed: boolean) => {
    // Doppelklick setzt denselben Punkt zweimal.
    const clean = points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
    setPoly(null);
    if (clean.length >= 2) onCreateAnnotation?.({ kind: 'polyline', points: clean, closed: closed && clean.length >= 3, style: 'solid' });
  };

  // Linienzug: Enter beendet, Esc bricht ab, Rücktaste nimmt den letzten Punkt zurück.
  useEffect(() => {
    if (!poly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'Enter') {
        e.stopImmediatePropagation();
        finishPoly(poly.points, false);
      }
      else if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setPoly(null);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopImmediatePropagation();
        setPoly(poly.points.length > 1 ? { ...poly, points: poly.points.slice(0, -1) } : null);
      } else return;
    };
    // Vor dem Fenster-Listener der App, damit Esc nicht auch das Werkzeug abwählt.
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  });
  // Ausgeblendete Ebenen: nicht zeichnen; gesperrte: zeichnen, aber nicht anklickbar (siehe model/layers.ts).
  // Leitungen werden trotzdem mit allen Bauteilen geführt, damit sie beim Ein- und Ausblenden nicht springen.
  const layers = useMemo(() => layerState(diagram), [diagram]);
  const { hidden, locked } = layers;
  const shownPaths = useMemo(
    () => (hidden.connections.size === 0 ? paths : new Map([...paths].filter(([id]) => !hidden.connections.has(id)))),
    [paths, hidden],
  );
  const dots = branchDots(
    diagram.connections.filter((l) => !hidden.connections.has(l.id)),
    shownPaths,
  );
  const jumps = sheet.lineJumps ? crossings(shownPaths) : new Map<string, Point[]>();

  /** Alles, was ganz im Rahmen zwischen a und b liegt. */
  const inBand = (a: Point, b: Point): Selection => {
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    const inside = (p: Point) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    return {
      ...EMPTY_SELECTION,
      components: diagram.components
        .filter((c) => {
          const box = componentBox(c);
          return box && inside({ x: box.minX, y: box.minY }) && inside({ x: box.maxX, y: box.maxY });
        })
        .map((c) => c.id),
      connections: diagram.connections.filter((l) => paths.get(l.id)!.every(inside)).map((l) => l.id),
      junctions: diagram.junctions.filter((j) => inside(j.position)).map((j) => j.id),
      annotations: diagram.annotations
        .filter((a) => {
          const box = annotationBox(a);
          return inside({ x: box.minX, y: box.minY }) && inside({ x: box.maxX, y: box.maxY });
        })
        .map((a) => a.id),
    };
  };

  const samePort = sameEndpoint;

  /** Ein Teil einer Gruppe wählt die ganze Gruppe; Ausgeblendetes und Gesperrtes bleibt außen vor. */
  const pick = (s: Selection) => without(expandGroups(diagram, s), hidden, locked);

  /** Knickpunkte der fertigen Leitung aus den beim Zeichnen geklickten Punkten. */
  const draftWaypoints = (d: Draft, end: Point, endDir?: Point): Point[] => {
    if (!d.waypoints.length) return [];
    const start = endpointPosition(diagram, d.from);
    return orthogonalize([start, ...d.waypoints, end], endpointDirection(diagram, d.from), endDir).slice(1, -1);
  };

  /** Klick bzw. Loslassen auf einem Anschluss: Leitung beginnen oder abschließen. */
  const portClicked = (ref: Endpoint) => {
    if (!draft) {
      setDraft({ from: ref, waypoints: [], cursor: endpointPosition(diagram, ref) });
      onSelect(EMPTY_SELECTION);
    } else if (!samePort(draft.from, ref)) {
      const waypoints = draftWaypoints(draft, endpointPosition(diagram, ref), endpointDirection(diagram, ref));
      setDraft(null);
      onConnect(draft.from, ref, waypoints);
    }
  };

  /** Beim Zeichnen auf eine Leitung geklickt: dort abzweigen. */
  const lineClicked = (lineId: string, a: Point, b: Point, cursor: Point) => {
    if (!draft) return;
    const path = paths.get(lineId)!;
    const clamp = (v: number, s: number, t: number) => Math.min(Math.max(v, Math.min(s, t)), Math.max(s, t));
    const point = a.y === b.y ? { x: clamp(snap(cursor.x), a.x, b.x), y: a.y } : { x: a.x, y: clamp(snap(cursor.y), a.y, b.y) };
    const waypoints = draftWaypoints(draft, point);
    setDraft(null);
    onConnectToLine(draft.from, lineId, path, point, waypoints);
  };

  /** Vorschau der Leitung, die gerade gezeichnet wird. */
  const draftPath = (d: Draft): Point[] => {
    const start = endpointPosition(diagram, d.from);
    const startDir = endpointDirection(diagram, d.from);
    const target = hoverPort && !samePort(hoverPort, d.from) ? hoverPort : null;
    const end = target ? endpointPosition(diagram, target) : snapPoint(d.cursor);
    const endDir = target ? endpointDirection(diagram, target) : undefined;
    if (d.waypoints.length === 0) return route({ start, startDir, end, endDir, obstacles });
    return orthogonalize([start, ...d.waypoints, end], startDir, endDir);
  };

  const zoomCenter = (factor: number) => size && zoomAt(factor, size.width / 2, size.height / 2);
  const percent = view ? Math.round((view.scale / (PX_PER_MM * MM_PER_UNIT)) * 100) : 100;
  // Rasterpunkte sollen auf dem Bildschirm etwa gleich groß bleiben; weit
  // herausgezoomt bleibt nur jeder fünfte Punkt.
  const pxPerUnit = view?.scale ?? 1;
  const grid: GridLook | null = !settings.grid
    ? null
    : pxPerUnit * GRID >= 5
      ? { dot: Math.min(1.5, 1 / pxPerUnit), major: Math.min(2, 1.4 / pxPerUnit), minor: true }
      : pxPerUnit * GRID * MAJOR_EVERY >= 6
        ? { dot: 0, major: Math.min(2.5, 1.2 / pxPerUnit), minor: false }
        : null;

  /** Bildschirmlage eines Bereichs der Fläche (für Blattnamen und „+“). */
  const onScreen = (r: SheetRect): ScreenRect =>
    view
      ? {
          left: (r.x - view.x) * view.scale,
          top: (r.y - view.y) * view.scale,
          width: r.width * view.scale,
          height: r.height * view.scale,
        }
      : { left: 0, top: 0, width: 0, height: 0 };
  /** Nummer des Blatts unter dem Punkt (Flächenkoordinaten), sonst -1. */
  const sheetAt = (p: Point) =>
    layout.findIndex((r) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height);

  return (
    <div className="diagram-wrap">
      {/* Die Lineale messen ab der linken oberen Ecke des bearbeitbaren Blatts. */}
      {view && size && <Rulers ref={rulersRef} view={{ ...view, x: view.x - origin.x, y: view.y - origin.y }} size={size} />}
      <svg
        ref={svgRef}
        className={panning ? 'diagram panning' : spaceDown ? 'diagram pan-ready' : tool ? 'diagram placing' : 'diagram'}
        viewBox={view && size ? `${view.x} ${view.y} ${size.width / view.scale} ${size.height / view.scale}` : undefined}
        onPointerDown={(e) => {
          if (draft && e.button === 0) {
            // Beim Zeichnen setzt ein Klick auf die Fläche einen Knickpunkt.
            const p = snapPoint(toDiagram(e));
            setDraft({ ...draft, waypoints: [...draft.waypoints, p], cursor: p });
            return;
          }
          if (draft && e.button === 2) {
            setDraft(null);
            return;
          }
          if (!view || (e.button !== 0 && e.button !== 1)) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (e.button === 0 && !spaceDown && tool) {
            if (tool === 'polyline') {
              const points = poly?.points ?? [];
              const p = snapFree(toDiagram(e), polyTargets(points)).point;
              const first = points[0];
              // Klick auf den ersten Punkt schließt den Linienzug.
              if (first && points.length >= 3 && p.x === first.x && p.y === first.y) finishPoly(points, true);
              else setPoly({ points: [...points, p], cursor: p });
              return;
            }
            const p = snapFree(toDiagram(e)).point;
            if (tool === 'text') {
              onCreateAnnotation?.({ kind: 'text', position: p, text: 'Text', size: 14 });
              return;
            }
            drag.current = { kind: 'create', tool, start: p, end: p };
            setCreating({ tool, start: p, end: p });
            return;
          }
          if (e.button === 0 && !spaceDown) {
            // Linke Maustaste auf freier Fläche: Auswahlrahmen aufziehen.
            const p = toDiagram(e);
            drag.current = { kind: 'band', start: p, end: p, additive: e.shiftKey || e.ctrlKey || e.metaKey, moved: false };
            return;
          }
          drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origin: view, moved: false };
          setPanning(true);
        }}
        onContextMenu={(e) => {
          if (draft) e.preventDefault();
          // Rechtsklick beendet den Linienzug.
          if (poly) {
            e.preventDefault();
            finishPoly(poly.points, false);
          }
        }}
        onDoubleClick={() => poly && finishPoly(poly.points, false)}
        onPointerLeave={() => {
          setSnapMark(null);
          rulersRef.current?.setCursor(null);
        }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          rulersRef.current?.setCursor({ x: e.clientX - r.left, y: e.clientY - r.top });
          if (draft) setDraft({ ...draft, cursor: toDiagram(e) });
          const d = drag.current;
          if (tool && (!d || d.kind === 'create')) {
            const mark = snapFree(toDiagram(e), poly ? polyTargets(poly.points) : targets);
            setSnapMark(mark);
            if (poly) setPoly({ ...poly, cursor: mark.point });
          }
          if (!d) return;
          if (d.kind === 'segment') {
            const p = toDiagram(e);
            const a = d.path[d.index]!;
            const b = d.path[d.index + 1]!;
            const offset = a.y === b.y ? snap(p.y - d.start.y) : snap(p.x - d.start.x);
            if (offset !== d.offset) {
              d.offset = offset;
              onRouteChange(d.id, moveSegment(d.path, d.index, offset));
            }
          } else if (d.kind === 'junction') {
            const p = toDiagram(e);
            const to = { x: snap(d.origin.x + p.x - d.start.x), y: snap(d.origin.y + p.y - d.start.y) };
            if (to.x !== d.last.x || to.y !== d.last.y) {
              d.last = to;
              onMoveJunction(d.id, to);
            }
          } else if (d.kind === 'move') {
            const p = toDiagram(e);
            // Bauteile bleiben im Raster; reine Grafik mit Alt auch frei.
            const step = d.target.components.length > 0 || !e.altKey ? GRID : FINE;
            const round = (v: number) => Math.round(v / step) * step;
            const total = { x: round(p.x - d.start.x), y: round(p.y - d.start.y) };
            if (total.x !== d.moved.x || total.y !== d.moved.y) {
              onMove(d.target, { x: total.x - d.moved.x, y: total.y - d.moved.y });
              d.moved = total;
            }
          } else if (d.kind === 'create') {
            d.end = snapFree(toDiagram(e)).point;
            setCreating({ tool: d.tool, start: d.start, end: d.end });
          } else if (d.kind === 'handle') {
            const p = toDiagram(e);
            const mark = snapFree({ x: d.origin.x + p.x - d.start.x, y: d.origin.y + p.y - d.start.y }, d.targets);
            setSnapMark(mark);
            const to = mark.point;
            if (to.x !== d.last.x || to.y !== d.last.y) {
              d.last = to;
              onReshapeAnnotation?.(d.annotation.id, reshape(d.annotation, d.handle, to));
            }
          } else if (d.kind === 'band') {
            d.end = toDiagram(e);
            if (Math.abs(d.end.x - d.start.x) + Math.abs(d.end.y - d.start.y) > 2 / (view?.scale ?? 1)) d.moved = true;
            if (d.moved) setBand({ start: d.start, end: d.end });
          } else {
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
            setView({ ...d.origin, x: d.origin.x - dx / d.origin.scale, y: d.origin.y - dy / d.origin.scale });
          }
        }}
        onDragOver={(e) => {
          if (onDropSymbol && e.dataTransfer.types.includes(SYMBOL_DRAG_TYPE)) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={(e) => {
          const key = e.dataTransfer.getData(SYMBOL_DRAG_TYPE);
          if (!key || !onDropSymbol) return;
          e.preventDefault();
          const p = toWorld(e);
          const at = sheetAt(p);
          const target = at >= 0 ? at : activeIndex;
          onDropSymbol(key, { x: p.x - layout[target]!.x, y: p.y - layout[target]!.y }, target);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          setPanning(false);
          if (d?.kind === 'move' || d?.kind === 'segment' || d?.kind === 'junction' || d?.kind === 'handle') {
            onGestureEnd?.();
          }
          setBand(null);
          setCreating(null);
          if (d?.kind === 'handle') setSnapMark(null);
          if (d?.kind === 'create') onCreateAnnotation?.(createdShape(d.tool, d.start, d.end));
          if (d?.kind === 'band') {
            const picked = d.moved ? pick(inBand(d.start, d.end)) : EMPTY_SELECTION;
            // Ein Klick ohne Ziehen auf freie Fläche hebt die Auswahl auf (außer mit Umschalt).
            if (d.additive) onSelect(union(selection, picked));
            else onSelect(picked);
          }
        }}
      >
        {pages?.all.map((d, i) =>
          i === activeIndex ? null : (
            <g
              key={i}
              className="sheet-inactive"
              transform={`translate(${layout[i]!.x} ${layout[i]!.y})`}
              onPointerDown={(e) => {
                // Linke Taste macht das Blatt bearbeitbar; mittlere Taste verschiebt weiter die Ansicht.
                if (e.button !== 0 || draft || spaceDown) return;
                e.stopPropagation();
                pages.onActivate(i);
              }}
            >
              <title>{`${d.page?.name ?? `Blatt ${i + 1}`}: anklicken zum Bearbeiten`}</title>
              <rect className="paper" width={layout[i]!.width} height={layout[i]!.height} />
              {grid && <GridDots id={`grid-${i}`} sheet={d.sheet} look={grid} />}
              <StaticSheet diagram={d} />
            </g>
          ),
        )}

        <g transform={origin.x || origin.y ? `translate(${origin.x} ${origin.y})` : undefined}>
        <rect className="paper" width={paper.width} height={paper.height} />
        {pages && pages.all.length > 1 && <rect className="paper-active" width={paper.width} height={paper.height} />}
        {grid && <GridDots id="grid" sheet={sheet} look={grid} />}
        {sheet.frame && <SheetFrame diagram={diagram} onPick={draft || tool ? undefined : onEditTitleField} />}

        {diagram.annotations.map((a) => {
          if (hidden.annotations.has(a.id)) return null;
          const selected = selection.annotations.includes(a.id);
          return (
            <AnnotationShape
              key={a.id}
              annotation={a}
              selected={selected}
              className={locked.annotations.has(a.id) ? 'layer-locked' : undefined}
              handles={selected && selection.annotations.length === 1}
              onPointerDown={(e) => {
                if (e.button !== 0 || draft || tool) return;
                e.stopPropagation();
                const own = pick({ ...EMPTY_SELECTION, annotations: [a.id] });
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  onSelect(toggle(selection, own));
                  return;
                }
                if (isDoubleClick(`a:${a.id}`, e)) {
                  onSelect({ ...EMPTY_SELECTION, annotations: [a.id] });
                  onOpenProperties?.({ kind: 'annotation', id: a.id });
                  return;
                }
                e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                const target = selected ? selection : own;
                if (!selected) onSelect(own);
                drag.current = { kind: 'move', target, start: toDiagram(e), moved: { x: 0, y: 0 } };
              }}
              onHandlePointerDown={(handle, origin, e) => {
                if (e.button !== 0 || tool) return;
                e.stopPropagation();
                (e.currentTarget as SVGElement).ownerSVGElement?.setPointerCapture(e.pointerId);
                drag.current = {
                  kind: 'handle',
                  annotation: a,
                  handle,
                  origin,
                  start: toDiagram(e),
                  last: origin,
                  targets: snapTargets(diagram, paths, a.id),
                };
              }}
            />
          );
        })}

        {diagram.connections.map((l) => {
          if (hidden.connections.has(l.id)) return null;
          const path = paths.get(l.id)!;
          const selected = selection.connections.includes(l.id);
          return (
            <g
              key={l.id}
              className={`connection${selected ? ' selected' : ''}${locked.connections.has(l.id) ? ' layer-locked' : ''}`}
            >
              <path className="line" d={linePathData(path, jumps.get(l.id))} strokeDasharray={LINE_DASH[l.kind]} />
              {path.slice(1).map((b, i) => {
                  const a = path[i]!;
                  return (
                    <line
                      key={i}
                      className={
                        draft ? 'segment-hit target' : a.y === b.y ? 'segment-hit horizontal' : 'segment-hit vertical'
                      }
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      onPointerUp={(e) => {
                        // Ziehen vom Anschluss auf eine Leitung: Loslassen setzt den Abzweig.
                        if (draft && !drag.current) lineClicked(l.id, a, b, toDiagram(e));
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0 || tool) return;
                        e.stopPropagation();
                        if (draft) {
                          lineClicked(l.id, a, b, toDiagram(e));
                          return;
                        }
                        const own = pick({ ...EMPTY_SELECTION, connections: [l.id] });
                        if (e.shiftKey || e.ctrlKey || e.metaKey) {
                          onSelect(toggle(selection, own));
                          return;
                        }
                        if (isDoubleClick(`l:${l.id}`, e)) {
                          onSelect({ ...EMPTY_SELECTION, connections: [l.id] });
                          onOpenProperties?.({ kind: 'connection', id: l.id });
                          return;
                        }
                        e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                        onSelect(own);
                        drag.current = { kind: 'segment', id: l.id, index: i, path, start: toDiagram(e), offset: 0 };
                      }}
                    />
                  );
                })}
            </g>
          );
        })}
        {dots.map((p) => (
          <circle key={`${p.x},${p.y}`} className="junction" cx={p.x} cy={p.y} r={2} />
        ))}
        {diagram.junctions.map((j) => {
          if (hidden.junctions.has(j.id)) return null;
          const ref = { junctionId: j.id };
          const selected = selection.junctions.includes(j.id);
          return (
            <g
              key={j.id}
              className={`junction-node${selected ? ' selected' : ''}${locked.junctions.has(j.id) ? ' layer-locked' : ''}`}
              onPointerDown={(e) => {
                if (e.button !== 0 || tool) return;
                e.stopPropagation();
                if (draft) {
                  portClicked(ref);
                  return;
                }
                const own = pick({ ...EMPTY_SELECTION, junctions: [j.id] });
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                  onSelect(toggle(selection, own));
                  return;
                }
                e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                onSelect(own);
                drag.current = { kind: 'junction', id: j.id, start: toDiagram(e), origin: j.position, last: j.position };
              }}
              onPointerUp={() => draft && !samePort(draft.from, ref) && portClicked(ref)}
              onPointerEnter={() => setHoverPort(ref)}
              onPointerLeave={() => setHoverPort(null)}
            >
              <title>Abzweig: ziehen zum Verschieben</title>
              <circle cx={j.position.x} cy={j.position.y} r={6} className="hit" />
              <circle cx={j.position.x} cy={j.position.y} r={2} className="junction" />
            </g>
          );
        })}

        {diagram.components.filter((c) => !hidden.components.has(c.id)).map((c) => (
          <ComponentShape
            key={c.id}
            component={c}
            selected={selection.components.includes(c.id)}
            locked={locked.components.has(c.id)}
            drawing={draft !== null}
            onPointerDown={(e) => {
              if (e.button !== 0 || draft || tool) return; // mittlere Taste: Ansicht verschieben
              e.stopPropagation();
              const own = pick({ ...EMPTY_SELECTION, components: [c.id] });
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                onSelect(toggle(selection, own));
                return;
              }
              if (isDoubleClick(`c:${c.id}`, e)) {
                onSelect({ ...EMPTY_SELECTION, components: [c.id] });
                onOpenProperties?.({ kind: 'component', id: c.id });
                return;
              }
              (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
              // Ziehen an einem ausgewählten Bauteil verschiebt die ganze Auswahl (samt Gruppe).
              const target = selection.components.includes(c.id) ? selection : own;
              if (!selection.components.includes(c.id)) onSelect(own);
              drag.current = { kind: 'move', target, start: toDiagram(e), moved: { x: 0, y: 0 } };
            }}
            onPortPointerDown={(portId, e) => {
              // Beim Zeichnen freier Grafik fängt der Klick nur den Anschluss.
              if (e.button !== 0 || tool) return;
              e.stopPropagation();
              portClicked({ componentId: c.id, portId });
            }}
            onPortPointerUp={(portId) => {
              // Ziehen von Anschluss zu Anschluss: Loslassen auf dem Ziel schließt ab.
              if (draft && !samePort(draft.from, { componentId: c.id, portId })) {
                portClicked({ componentId: c.id, portId });
              }
            }}
            onPortHover={(portId) => setHoverPort(portId === null ? null : { componentId: c.id, portId })}
          />
        ))}

        {draft && <polyline className="line draft" points={toPoints(draftPath(draft))} />}
        {creating && (
          <AnnotationShape
            annotation={{ id: 'creating', ...createdShape(creating.tool, creating.start, creating.end, false) } as Annotation}
            className="creating"
          />
        )}
        {poly && (
          <polyline className="note-line creating" points={toPoints([...poly.points, poly.cursor])} />
        )}
        <GroupFrames diagram={diagram} selection={selection} paths={paths} />
        {snapMark && snapMark.kind !== 'grid' && snapMark.kind !== null && (
          <circle
            className={`snap-mark ${snapMark.kind}`}
            cx={snapMark.point.x}
            cy={snapMark.point.y}
            r={5 / (view?.scale ?? 1)}
          >
            <title>{snapMark.kind === 'connector' ? 'Anschluss' : 'Endpunkt'}</title>
          </circle>
        )}
        {band && (
          <rect
            className="band"
            x={Math.min(band.start.x, band.end.x)}
            y={Math.min(band.start.y, band.end.y)}
            width={Math.abs(band.end.x - band.start.x)}
            height={Math.abs(band.end.y - band.start.y)}
          />
        )}
        </g>
      </svg>

      {pages && view && size && (
        <SheetLabels
          names={pages.all.map((d, i) => d.page?.name ?? `Blatt ${i + 1}`)}
          rects={layout.map(onScreen)}
          active={activeIndex}
          onSelect={pages.onActivate}
          onAdd={pages.onAdd}
          onRename={pages.onRename}
          onAction={pages.onAction}
        />
      )}

      <div className="zoom-controls">
        <IconButton
          icon={Grid3x3}
          label="Raster anzeigen"
          tooltip="above"
          aria-pressed={settings.grid}
          onClick={() => changeSettings({ ...settings, grid: !settings.grid })}
        />
        <span className="separator" />
        <IconButton icon={ZoomOut} label="Verkleinern" tooltip="above" onClick={() => zoomCenter(1 / 1.25)} />
        <button
          className="zoom-level"
          title="Originalgröße (100 % = Papiermaß)"
          onClick={() => view && zoomCenter(PX_PER_MM * MM_PER_UNIT / view.scale)}
        >
          {percent} %
        </button>
        <IconButton icon={ZoomIn} label="Vergrößern" tooltip="above" onClick={() => zoomCenter(1.25)} />
        {pages && pages.all.length > 1 && (
          <IconButton icon={GalleryHorizontal} label="Alle Blätter anzeigen" tooltip="left" onClick={fitAll} />
        )}
        <IconButton icon={Maximize} label="Ganzes Blatt anzeigen" tooltip="left" onClick={fit} />
      </div>
    </div>
  );
}

/** Zeichnungsrahmen und vereinfachtes Schriftfeld nach DIN EN ISO 5457 / 7200. */
function SheetFrame({ diagram, onPick }: { diagram: Diagram; onPick?: (field: TitleField) => void }) {
  const area = drawingArea(diagram.sheet);
  const block = titleBlock(diagram.sheet);
  const { sheet, meta } = diagram;
  const page = diagram.page ?? { name: '', number: 1, count: 1 };
  const value = (field: TitleField): string =>
    field === 'date'
      ? meta.modified.slice(0, 10)
      : field === 'format'
        ? `${sheet.format} ${ORIENTATION_NAMES[sheet.orientation]}`
        : field === 'sheet'
          ? page.name
          : meta[field];
  const caption = (c: TitleCell) => (c.field === 'sheet' ? `Blatt ${page.number} von ${page.count}` : c.caption);
  const editable = (field: TitleField) => field !== 'date' && field !== 'format';
  return (
    <g className="sheet-frame" pointerEvents="none">
      <rect x={area.x} y={area.y} width={area.width} height={area.height} className="frame" />
      {titleCells(sheet).map((c) => (
        <g key={c.field}>
          <rect x={c.x} y={c.y} width={c.width} height={c.height} className="cell" />
          <text x={c.x + 6} y={c.y + 11} className="caption">
            {caption(c)}
          </text>
          <text x={c.x + 6} y={c.y + c.height - 7} className={c.big ? 'value big' : 'value'}>
            {value(c.field)}
          </text>
          {onPick && editable(c.field) && (
            <rect
              x={c.x}
              y={c.y}
              width={c.width}
              height={c.height}
              className="title-cell"
              pointerEvents="all"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onPick(c.field);
              }}
            >
              <title>{c.field === 'sheet' ? 'Blattbenennung' : c.caption} bearbeiten</title>
            </rect>
          )}
        </g>
      ))}
      <rect x={block.x} y={block.y} width={block.width} height={block.height} className="frame" />
    </g>
  );
}

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

/** Größe der Rasterpunkte in Einheiten; `minor` = auch die feinen Punkte zeigen. */
interface GridLook {
  dot: number;
  major: number;
  minor: boolean;
}

/** Punktraster im Zeichenfeld; jeder fünfte Punkt ist kräftiger. */
function GridDots({ id, sheet, look }: { id: string; sheet: Diagram['sheet']; look: GridLook }) {
  const area = drawingArea(sheet);
  const cell = GRID * MAJOR_EVERY;
  // Die Kachel ist um eine halbe Kachel versetzt, damit kein Punkt an ihrem Rand abgeschnitten wird.
  const half = cell / 2;
  const steps = Array.from({ length: MAJOR_EVERY }, (_, k) => (k - (MAJOR_EVERY - 1) / 2) * GRID);
  const pad = look.major;
  return (
    <>
      <defs>
        <pattern id={id} x={area.x - half} y={area.y - half} width={cell} height={cell} patternUnits="userSpaceOnUse">
          {steps.flatMap((dx) =>
            steps.map((dy) =>
              dx === 0 && dy === 0 ? (
                <circle key="major" cx={half} cy={half} r={look.major} className="grid-dot major" />
              ) : look.minor ? (
                <circle key={`${dx},${dy}`} cx={half + dx} cy={half + dy} r={look.dot} className="grid-dot" />
              ) : null,
            ),
          )}
        </pattern>
      </defs>
      {/* Rand um die Fläche, damit auch die Punkte auf der letzten Linie ganz zu sehen sind. */}
      <rect
        x={area.x - pad}
        y={area.y - pad}
        width={area.width + 2 * pad}
        height={area.height + 2 * pad}
        fill={`url(#${id})`}
        pointerEvents="none"
      />
    </>
  );
}

const SHEET_KEYS = ['sheet', 'components', 'connections', 'junctions', 'annotations', 'groups', 'meta', 'domain', 'layers'] as const;

/**
 * Ein nicht bearbeitbares Blatt neben dem aktuellen: gleiche Darstellung, aber
 * ohne Auswahl und Anfasser. Zeichnet nur neu, wenn sich das Blatt ändert.
 */
const StaticSheet = memo(
  function StaticSheet({ diagram }: { diagram: Diagram }) {
    const paths = useMemo(() => routeAll(diagram), [diagram]);
    const { hidden } = useMemo(() => layerState(diagram), [diagram]);
    const connections = diagram.connections.filter((l) => !hidden.connections.has(l.id));
    const shownPaths = new Map(connections.map((l) => [l.id, paths.get(l.id)!]));
    const dots = branchDots(connections, shownPaths);
    const jumps = diagram.sheet.lineJumps ? crossings(shownPaths) : new Map<string, Point[]>();
    return (
      <>
        {diagram.sheet.frame && <SheetFrame diagram={diagram} />}
        {diagram.annotations.filter((a) => !hidden.annotations.has(a.id)).map((a) => (
          <AnnotationShape key={a.id} annotation={a} />
        ))}
        {connections.map((l) => (
          <g key={l.id} className="connection">
            <path className="line" d={linePathData(paths.get(l.id)!, jumps.get(l.id))} strokeDasharray={LINE_DASH[l.kind]} />
          </g>
        ))}
        {dots.map((p) => (
          <circle key={`${p.x},${p.y}`} className="junction" cx={p.x} cy={p.y} r={2} />
        ))}
        {diagram.junctions.filter((j) => !hidden.junctions.has(j.id)).map((j) => (
          <circle key={j.id} className="junction" cx={j.position.x} cy={j.position.y} r={2} />
        ))}
        {diagram.components.filter((c) => !hidden.components.has(c.id)).map((c) => (
          <ComponentShape
            key={c.id}
            component={c}
            selected={false}
            drawing={false}
            onPointerDown={noop}
            onPortPointerDown={noop}
            onPortPointerUp={noop}
            onPortHover={noop}
          />
        ))}
      </>
    );
  },
  (a, b) =>
    SHEET_KEYS.every((k) => a.diagram[k] === b.diagram[k]) &&
    a.diagram.page?.name === b.diagram.page?.name &&
    a.diagram.page?.number === b.diagram.page?.number &&
    a.diagram.page?.count === b.diagram.page?.count,
);

const noop = () => {};

const rectProps = (r: { position: Point; width: number; height: number }) => ({
  x: r.position.x,
  y: r.position.y,
  width: r.width,
  height: r.height,
});

/**
 * Neue Form aus dem aufgezogenen Bereich. Linie und Rechteck bzw. Ellipse gehen
 * von Ecke zu Ecke, der Kreis vom Mittelpunkt bis zum Rand. Ein bloßer Klick
 * ergibt beim Anlegen (`final`) eine Standardgröße.
 */
function createdShape(tool: DragTool, start: Point, end: Point, final = true): NewAnnotation {
  const clicked = final && start.x === end.x && start.y === end.y;
  switch (tool) {
    case 'line':
      return { kind: 'line', from: start, to: clicked ? { x: start.x + DEFAULT_LINE, y: start.y } : end, style: 'solid' };
    case 'circle': {
      const radius = clicked ? DEFAULT_RADIUS : Math.round(Math.hypot(end.x - start.x, end.y - start.y));
      return { kind: 'circle', center: start, radius, style: 'solid' };
    }
    case 'ellipse': {
      if (clicked) return { kind: 'ellipse', center: start, ...DEFAULT_ELLIPSE, style: 'solid' };
      return { kind: 'ellipse', ...ellipseFromCorners(start, end), style: 'solid' };
    }
    case 'rect': {
      const corner = clicked ? { x: start.x + DEFAULT_RECT.width, y: start.y + DEFAULT_RECT.height } : end;
      return { kind: 'rect', ...rectFromCorners(start, corner), style: 'dashdot' };
    }
  }
}

function ellipseFromCorners(a: Point, b: Point): { center: Point; rx: number; ry: number } {
  return {
    center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    rx: Math.abs(b.x - a.x) / 2,
    ry: Math.abs(b.y - a.y) / 2,
  };
}

/** Umriss als zwei gegenüberliegende Ecken (Rechteck, Ellipse). */
function outline(a: Annotation): [Point, Point] | null {
  if (a.kind === 'rect') return [a.position, { x: a.position.x + a.width, y: a.position.y + a.height }];
  if (a.kind === 'ellipse') {
    return [
      { x: a.center.x - a.rx, y: a.center.y - a.ry },
      { x: a.center.x + a.rx, y: a.center.y + a.ry },
    ];
  }
  return null;
}

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;

function corner([p, q]: [Point, Point], h: (typeof CORNERS)[number]): Point {
  return { x: h === 'nw' || h === 'sw' ? p.x : q.x, y: h === 'nw' || h === 'ne' ? p.y : q.y };
}

/** Lage der Anfasser einer Grafik. */
function handlesOf(a: Annotation): [Handle, Point][] {
  if (a.kind === 'line') return [['from', a.from], ['to', a.to]];
  if (a.kind === 'circle') return [['radius', { x: a.center.x + a.radius, y: a.center.y }]];
  if (a.kind === 'polyline') return a.points.map((p, i) => [i, p]);
  const box = outline(a);
  return box ? CORNERS.map((h) => [h, corner(box, h)]) : [];
}

/** Neue Lage, wenn der Anfasser `handle` nach `to` gezogen wird. */
function reshape(a: Annotation, handle: Handle, to: Point): Partial<Annotation> {
  if (a.kind === 'line') return handle === 'from' ? { from: to } : { to };
  if (a.kind === 'circle') {
    const radius = Math.round(Math.hypot(to.x - a.center.x, to.y - a.center.y));
    return radius > 0 ? { radius } : {};
  }
  if (a.kind === 'polyline' && typeof handle === 'number') {
    return { points: a.points.map((p, i) => (i === handle ? to : p)) };
  }
  const box = outline(a);
  if (!box || typeof handle !== 'string' || !CORNERS.includes(handle as (typeof CORNERS)[number])) return {};
  // Gezogene Ecke bewegen, die gegenüberliegende bleibt stehen.
  const opposite = { nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' } as const;
  const fixed = corner(box, opposite[handle as (typeof CORNERS)[number]]);
  // Eine Form ohne Fläche wäre nicht mehr anzufassen.
  if (to.x === fixed.x || to.y === fixed.y) return {};
  return a.kind === 'rect' ? rectFromCorners(to, fixed) : ellipseFromCorners(to, fixed);
}

function AnnotationShape({
  annotation: a,
  selected = false,
  handles = false,
  className,
  onPointerDown,
  onHandlePointerDown,
}: {
  annotation: Annotation;
  selected?: boolean;
  handles?: boolean;
  /** Zusätzliche Klasse, z. B. "creating" für die Vorschau beim Aufziehen. */
  className?: string;
  onPointerDown?: (e: React.PointerEvent<SVGGElement>) => void;
  onHandlePointerDown?: (handle: Handle, origin: Point, e: React.PointerEvent) => void;
}) {
  const dash = 'style' in a ? STROKE_DASH[a.style] : undefined;
  /** Unsichtbare breite Kontur zum Anklicken und die sichtbare Linie. */
  const stroke = (el: (props: { className: string; strokeDasharray?: string }) => React.ReactNode) => (
    <>
      {el({ className: 'stroke-hit' })}
      {el({ className: 'note-line', strokeDasharray: dash })}
    </>
  );
  let shape: React.ReactNode;
  if (a.kind === 'text') {
    const box = annotationBox(a);
    shape = (
      <>
        <rect x={box.minX} y={box.minY} width={box.maxX - box.minX} height={box.maxY - box.minY} className="hit" />
        <text className="note" x={a.position.x} y={a.position.y} fontSize={a.size}>
          {textLines(a).map((line, i) => (
            <tspan key={i} x={a.position.x} dy={i === 0 ? 0 : a.size * LINE_HEIGHT}>
              {/* Leere Zeilen brauchen Inhalt, sonst zählt dy nicht. */}
              {line || ' '}
            </tspan>
          ))}
        </text>
      </>
    );
  } else if (a.kind === 'line') {
    shape = stroke((p) => <line {...p} x1={a.from.x} y1={a.from.y} x2={a.to.x} y2={a.to.y} />);
  } else if (a.kind === 'rect') {
    shape = stroke((p) => <rect {...p} {...rectProps(a)} />);
  } else if (a.kind === 'circle') {
    shape = stroke((p) => <circle {...p} cx={a.center.x} cy={a.center.y} r={a.radius} />);
  } else if (a.kind === 'ellipse') {
    shape = stroke((p) => <ellipse {...p} cx={a.center.x} cy={a.center.y} rx={a.rx} ry={a.ry} />);
  } else {
    const points = toPoints(a.points);
    shape = stroke((p) => (a.closed ? <polygon {...p} points={points} /> : <polyline {...p} points={points} />));
  }
  const grips = handles
    ? handlesOf(a).map(([h, p]) => (
        <rect
          key={h}
          className={`handle ${typeof h === 'number' ? 'point' : h}`}
          x={p.x - 3}
          y={p.y - 3}
          width={6}
          height={6}
          onPointerDown={(e) => onHandlePointerDown?.(h, p, e)}
        />
      ))
    : null;
  return (
    <g
      className={`annotation ${a.kind}${selected ? ' selected' : ''}${className ? ' ' + className : ''}`}
      onPointerDown={onPointerDown}
    >
      {shape}
      {grips}
    </g>
  );
}

/** Gestrichelter Rahmen um ausgewählte Gruppen. */
function GroupFrames({
  diagram,
  selection,
  paths,
}: {
  diagram: Diagram;
  selection: Selection;
  paths: ReadonlyMap<string, Point[]>;
}) {
  const frames = diagram.groups.filter((g) => g.components.some((id) => selection.components.includes(id)) ||
    g.annotations.some((id) => selection.annotations.includes(id)) ||
    g.connections.some((id) => selection.connections.includes(id)) ||
    g.junctions.some((id) => selection.junctions.includes(id)));
  return (
    <>
      {frames.map((g) => {
        const points: Point[] = [];
        for (const c of diagram.components) {
          if (!g.components.includes(c.id)) continue;
          const box = componentBox(c);
          if (box) points.push({ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY });
        }
        for (const a of diagram.annotations) {
          if (!g.annotations.includes(a.id)) continue;
          const box = annotationBox(a);
          points.push({ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY });
        }
        for (const id of g.connections) points.push(...(paths.get(id) ?? []));
        for (const j of diagram.junctions) if (g.junctions.includes(j.id)) points.push(j.position);
        if (points.length === 0) return null;
        const pad = 6;
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const x = Math.min(...xs) - pad;
        const y = Math.min(...ys) - pad;
        return (
          <rect
            key={g.id}
            className="group-frame"
            x={x}
            y={y}
            width={Math.max(...xs) + pad - x}
            height={Math.max(...ys) + pad - y}
          />
        );
      })}
    </>
  );
}

const ORIENTATION_NAMES = { portrait: 'hoch', landscape: 'quer' } as const;

const toPoints = (path: Point[]) => path.map((p) => `${p.x},${p.y}`).join(' ');

function ComponentShape({
  component,
  selected,
  locked = false,
  drawing,
  onPointerDown,
  onPortPointerDown,
  onPortPointerUp,
  onPortHover,
}: {
  component: ComponentInstance;
  selected: boolean;
  /** Auf einer gesperrten Ebene: nicht anklickbar, nur die Anschlüsse nehmen Leitungen an. */
  locked?: boolean;
  drawing: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
  onPortPointerDown: (portId: string, e: React.PointerEvent) => void;
  onPortPointerUp: (portId: string) => void;
  onPortHover: (portId: string | null) => void;
}) {
  const def = definitionOf(component);
  if (!def) return null;
  const corners = [
    { x: 0, y: 0 },
    { x: def.size.width, y: def.size.height },
  ].map((p) => transformLocalPoint(component, def, p));
  const x = Math.min(corners[0]!.x, corners[1]!.x);
  const y = Math.min(corners[0]!.y, corners[1]!.y);
  const w = Math.abs(corners[0]!.x - corners[1]!.x);
  const h = Math.abs(corners[0]!.y - corners[1]!.y);

  const cx = def.size.width / 2;
  const cy = def.size.height / 2;
  // Gleiche Reihenfolge wie transformLocalPoint: spiegeln, drehen, verschieben.
  const transform =
    `translate(${component.position.x + cx} ${component.position.y + cy}) rotate(${component.rotation}) ` +
    `scale(${component.mirrored ? -1 : 1} 1) translate(${-cx} ${-cy})`;

  return (
    <g
      className={`component${selected ? ' selected' : ''}${drawing ? ' drawing' : ''}${locked ? ' layer-locked' : ''}`}
      onPointerDown={onPointerDown}
    >
      {hasSymbol(def.type) ? (
        <>
          <rect x={x} y={y} width={w} height={h} className="hit" />
          <g transform={transform}>
            <ComponentSymbol component={component} />
          </g>
        </>
      ) : (
        <>
          <rect x={x} y={y} width={w} height={h} className="box" />
          <text x={x + w / 2} y={y + h / 2} className="name">
            {def.name}
          </text>
        </>
      )}
      {component.label && component.showLabel !== false && (
        <text x={x - 4} y={y + 4} className="label">
          {component.label}
        </text>
      )}
      {component.description && component.showDescription && (
        <text x={x - 4} y={y + (component.label && component.showLabel !== false ? 13 : 4)} className="description">
          {component.description}
        </text>
      )}
      {def.ports.map((port) => {
        const p = transformLocalPoint(component, def, port.offset);
        return (
          <g
            key={port.id}
            className="port"
            onPointerDown={(e) => onPortPointerDown(port.id, e)}
            onPointerUp={() => onPortPointerUp(port.id)}
            onPointerEnter={() => onPortHover(port.id)}
            onPointerLeave={() => onPortHover(null)}
          >
            <title>Anschluss {port.id}: Leitung ziehen oder anklicken</title>
            <circle cx={p.x} cy={p.y} r={6} className="port-hit" />
            <circle cx={p.x} cy={p.y} r={2.5} />
            <text x={p.x + 4} y={p.y - 3}>
              {port.label ?? port.id}
            </text>
          </g>
        );
      })}
    </g>
  );
}
