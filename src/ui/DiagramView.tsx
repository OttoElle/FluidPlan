import { useEffect, useMemo, useRef, useState } from 'react';
import { endpointPosition, sameEndpoint } from '../model/diagram.ts';
import { annotationBox, type NewAnnotation } from '../model/annotations.ts';
import { MM_PER_UNIT, sheetSize, type TitleField } from '../model/sheet.ts';
import {
  GRID,
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
import type { Annotation, Diagram, Endpoint, Point } from '../model/types.ts';
import { IconButton } from './IconButton.tsx';
import type { PropertiesTarget } from './properties/PropertiesDialog.tsx';
import { GalleryHorizontal, Grid3x3, Maximize, ZoomIn, ZoomOut } from 'lucide-react';
import { Rulers, type RulersHandle } from './Rulers.tsx';
import { SheetLabels, type ScreenRect, type SheetAction } from './SheetLabels.tsx';
import { AnnotationShape, createdShape, reshape, toPoints, type DragTool, type Handle } from './canvas/annotationShapes.tsx';
import { ComponentShape } from './canvas/ComponentShape.tsx';
import { GroupFrames } from './canvas/GroupFrames.tsx';
import { LINE_DASH } from './canvas/lineStyle.ts';
import { useModifierKeys } from './canvas/modifierKeys.ts';
import { GridDots, MAJOR_EVERY, SheetFrame, type GridLook } from './canvas/SheetFrame.tsx';
import { StaticSheet } from './canvas/StaticSheet.tsx';
import { PX_PER_MM, useViewport, type View } from './canvas/viewport.ts';
import { useViewSettings } from './canvas/viewSettings.ts';

export type { Selection };

/** Zeichenwerkzeug für freie Grafik; `null` = Auswählen. */
export type AnnotationTool = 'text' | 'line' | 'rect' | 'circle' | 'ellipse' | 'polyline';

/** Was beim Verschieben mitwandert. */
export type MoveTarget = Pick<Selection, 'components' | 'annotations'>;

/** Fangradius in Bildschirmpixeln. */
const SNAP_RADIUS_PX = 8;

/** Fangen beim Zeichnen mit gedrückter Alt-Taste: frei in feinen Schritten. */
const NO_SNAP: SnapOptions = { grid: false, connector: false, endpoint: false };

/** Datentyp beim Ziehen eines Symbols aus der Bauteilliste; Inhalt ist der Schlüssel des Eintrags. */
export const SYMBOL_DRAG_TYPE = 'application/x-fluidplan-symbol';

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
  /** Kennzeichen (port = null) oder Anschlussbezeichnung verschieben; offset gegenüber der Standardlage. */
  onMoveLabel?: (componentId: string, port: string | null, offset: Point) => void;
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
  | { kind: 'junction'; id: string; start: Point; origin: Point; last: Point }
  | { kind: 'label'; id: string; port: string | null; start: Point; origin: Point; last: Point };

const DOUBLE_CLICK_MS = 400;

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
  onMoveLabel,
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
  const [panning, setPanning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hoverPort, setHoverPort] = useState<Endpoint | null>(null);
  const [band, setBand] = useState<{ start: Point; end: Point } | null>(null);
  /** Leertaste: Ziehen verschiebt die Ansicht; Alt: freie Grafik ohne Fangen zeichnen. */
  const { spaceDown, altDown } = useModifierKeys();
  const [creating, setCreating] = useState<{ tool: DragTool; start: Point; end: Point } | null>(null);
  /** Linienzug, der gerade Punkt für Punkt gezeichnet wird. */
  const [poly, setPoly] = useState<{ points: Point[]; cursor: Point } | null>(null);
  /** Wo der nächste Punkt einrasten würde (Anzeige beim Zeichnen). */
  const [snapMark, setSnapMark] = useState<{ point: Point; kind: SnapKind | null } | null>(null);
  const [settings, changeSettings] = useViewSettings();

  // Werkzeugwechsel verwirft einen angefangenen Linienzug.
  useEffect(() => {
    setPoly(null);
    setSnapMark(null);
  }, [tool]);

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
  const fitKey = `${sheet.format}-${sheet.orientation}`;
  const { size, view, setView, fit, fitAll, zoomAt } = useViewport(svgRef, { layout, activeIndex, paper, fitKey });

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
          } else if (d.kind === 'label') {
            const p = toDiagram(e);
            const fine = (v: number) => Math.round(v / FINE) * FINE;
            const to = { x: fine(d.origin.x + p.x - d.start.x), y: fine(d.origin.y + p.y - d.start.y) };
            if (to.x !== d.last.x || to.y !== d.last.y) {
              d.last = to;
              onMoveLabel?.(d.id, d.port, to);
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
          if (d?.kind === 'move' || d?.kind === 'segment' || d?.kind === 'junction' || d?.kind === 'handle' || d?.kind === 'label') {
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
            domain={diagram.domain}
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
            onLabelPointerDown={
              onMoveLabel
                ? (port, e) => {
                    if (e.button !== 0 || draft || tool) return;
                    if (isDoubleClick(`l:${c.id}:${port ?? ''}`, e)) {
                      onMoveLabel(c.id, port, { x: 0, y: 0 });
                      onGestureEnd?.();
                      return;
                    }
                    (e.currentTarget as Element).closest('svg')?.setPointerCapture(e.pointerId);
                    const origin = (port === null ? c.labelOffset : c.portLabelOffsets?.[port]) ?? { x: 0, y: 0 };
                    drag.current = { kind: 'label', id: c.id, port, start: toDiagram(e), origin, last: origin };
                  }
                : undefined
            }
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

