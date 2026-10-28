import { useCallback, useEffect, useRef, useState } from 'react';
import { portPosition, transformLocalPoint } from '../model/diagram.ts';
import { definitionOf } from '../model/library.ts';
import { MM_PER_UNIT, drawingArea, sheetSize, titleBlock } from '../model/sheet.ts';
import {
  junctions,
  moveSegment,
  obstaclesOf,
  orthogonalize,
  portDirection,
  route,
  routeAll,
} from '../model/routing.ts';
import type { ComponentInstance, Diagram, LineKind, Point, PortRef } from '../model/types.ts';
import { ComponentSymbol, hasSymbol } from './symbols.tsx';

/** Was gerade ausgewählt ist: ein Bauteil oder eine Leitung. */
export type Selection = { kind: 'component' | 'connection'; id: string } | null;

const GRID = 10;
const DASH: Record<LineKind, string | undefined> = { working: undefined, pilot: '6 4', drain: '2 3' };

/** Bildschirmpixel pro Millimeter bei 100 % (CSS: 96 dpi). */
const PX_PER_MM = 96 / 25.4;
const MIN_SCALE = 0.1;
const MAX_SCALE = 12;
/** Freiraum um das Blatt beim Einpassen, in Bildschirmpixeln. */
const FIT_PADDING = 24;

interface Props {
  diagram: Diagram;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMove: (id: string, position: Point) => void;
  /** Neue Leitung; `waypoints` leer = automatisch führen. */
  onConnect: (from: PortRef, to: PortRef, waypoints: Point[]) => void;
  onRouteChange: (id: string, waypoints: Point[]) => void;
  /** Ziehen beendet; fasst die Zwischenschritte für Rückgängig zu einem Schritt zusammen. */
  onGestureEnd?: () => void;
}

/** Leitung, die gerade gezeichnet wird. */
interface Draft {
  from: PortRef;
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
  | { kind: 'move'; id: string; start: Point; origin: Point; last: Point }
  | { kind: 'pan'; startX: number; startY: number; origin: View; moved: boolean }
  | { kind: 'segment'; id: string; index: number; path: Point[]; start: Point; offset: number };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Zeichnet den Schaltplan als SVG auf einem Zeichenblatt.
 * Mausrad zoomt um den Mauszeiger, Ziehen auf freier Fläche (oder mit der
 * mittleren Maustaste) verschiebt die Ansicht.
 * Bauteile mit Schaltzeichen (symbols.tsx) erscheinen als ISO-1219-Symbol,
 * alle übrigen vorerst als beschriftete Rahmen mit Anschlusspunkten.
 */
export function DiagramView({ diagram, selection, onSelect, onMove, onConnect, onRouteChange, onGestureEnd }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [panning, setPanning] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [hoverPort, setHoverPort] = useState<PortRef | null>(null);

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
  const area = drawingArea(sheet);

  const fit = useCallback(() => {
    if (!size) return;
    const scale = clampScale(
      Math.min((size.width - 2 * FIT_PADDING) / paper.width, (size.height - 2 * FIT_PADDING) / paper.height),
    );
    setView({
      scale,
      x: paper.width / 2 - size.width / scale / 2,
      y: paper.height / 2 - size.height / scale / 2,
    });
  }, [size, paper.width, paper.height]);

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

  // Beim ersten Anzeigen und bei neuem Blattformat das ganze Blatt einpassen.
  const fitKey = `${sheet.format}-${sheet.orientation}`;
  const fittedFor = useRef<string | null>(null);
  useEffect(() => {
    if (size && fittedFor.current !== fitKey) {
      fittedFor.current = fitKey;
      fit();
    }
  }, [size, fitKey, fit]);

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

  const toDiagram = (e: React.PointerEvent): Point => {
    const ctm = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };

  const snap = (v: number) => Math.round(v / GRID) * GRID;
  const snapPoint = (p: Point): Point => ({ x: snap(p.x), y: snap(p.y) });

  const obstacles = obstaclesOf(diagram);
  const paths = routeAll(diagram);
  const dots = junctions(diagram.connections, paths);

  const samePort = (a: PortRef, b: PortRef) => a.componentId === b.componentId && a.portId === b.portId;

  /** Klick bzw. Loslassen auf einem Anschluss: Leitung beginnen oder abschließen. */
  const portClicked = (ref: PortRef) => {
    if (!draft) {
      setDraft({ from: ref, waypoints: [], cursor: portPosition(diagram, ref) });
      onSelect(null);
    } else if (!samePort(draft.from, ref)) {
      const start = portPosition(diagram, draft.from);
      const end = portPosition(diagram, ref);
      const waypoints = draft.waypoints.length
        ? orthogonalize([start, ...draft.waypoints, end], portDirection(diagram, draft.from), portDirection(diagram, ref)).slice(1, -1)
        : [];
      setDraft(null);
      onConnect(draft.from, ref, waypoints);
    }
  };

  /** Vorschau der Leitung, die gerade gezeichnet wird. */
  const draftPath = (d: Draft): Point[] => {
    const start = portPosition(diagram, d.from);
    const startDir = portDirection(diagram, d.from);
    const target = hoverPort && !samePort(hoverPort, d.from) ? hoverPort : null;
    const end = target ? portPosition(diagram, target) : snapPoint(d.cursor);
    const endDir = target ? portDirection(diagram, target) : undefined;
    if (d.waypoints.length === 0) return route({ start, startDir, end, endDir, obstacles });
    return orthogonalize([start, ...d.waypoints, end], startDir, endDir);
  };

  const zoomCenter = (factor: number) => size && zoomAt(factor, size.width / 2, size.height / 2);
  const percent = view ? Math.round((view.scale / (PX_PER_MM * MM_PER_UNIT)) * 100) : 100;
  // Rasterpunkte sollen auf dem Bildschirm etwa 1 px groß bleiben.
  const dot = view ? Math.min(1.5, 1 / view.scale) : 0.5;
  const showGrid = !view || view.scale * GRID >= 4;

  return (
    <div className="diagram-wrap">
      <svg
        ref={svgRef}
        className={panning ? 'diagram panning' : 'diagram'}
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
          drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origin: view, moved: false };
          setPanning(true);
        }}
        onContextMenu={(e) => draft && e.preventDefault()}
        onPointerMove={(e) => {
          if (draft) setDraft({ ...draft, cursor: toDiagram(e) });
          const d = drag.current;
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
          } else if (d.kind === 'move') {
            const p = toDiagram(e);
            const to = { x: snap(d.origin.x + p.x - d.start.x), y: snap(d.origin.y + p.y - d.start.y) };
            if (to.x !== d.last.x || to.y !== d.last.y) {
              d.last = to;
              onMove(d.id, to);
            }
          } else {
            const dx = e.clientX - d.startX;
            const dy = e.clientY - d.startY;
            if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
            setView({ ...d.origin, x: d.origin.x - dx / d.origin.scale, y: d.origin.y - dy / d.origin.scale });
          }
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          setPanning(false);
          if (d?.kind === 'move' || d?.kind === 'segment') onGestureEnd?.();
          // Ein Klick ohne Verschieben auf freie Fläche hebt die Auswahl auf.
          if (d?.kind === 'pan' && !d.moved) onSelect(null);
        }}
      >
        <defs>
          <pattern id="grid" x={area.x} y={area.y} width={GRID} height={GRID} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={dot} className="grid-dot" />
          </pattern>
        </defs>

        <rect className="paper" width={paper.width} height={paper.height} />
        {showGrid && (
          <rect
            x={area.x - dot}
            y={area.y - dot}
            width={area.width + 2 * dot}
            height={area.height + 2 * dot}
            fill="url(#grid)"
            pointerEvents="none"
          />
        )}
        {sheet.frame && <SheetFrame diagram={diagram} />}

        {diagram.connections.map((l) => {
          const path = paths.get(l.id)!;
          const selected = selection?.kind === 'connection' && selection.id === l.id;
          return (
            <g key={l.id} className={selected ? 'connection selected' : 'connection'}>
              <polyline className="line" points={toPoints(path)} strokeDasharray={DASH[l.kind]} />
              {!draft &&
                path.slice(1).map((b, i) => {
                  const a = path[i]!;
                  return (
                    <line
                      key={i}
                      className={a.y === b.y ? 'segment-hit horizontal' : 'segment-hit vertical'}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.stopPropagation();
                        e.currentTarget.ownerSVGElement?.setPointerCapture(e.pointerId);
                        onSelect({ kind: 'connection', id: l.id });
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

        {diagram.components.map((c) => (
          <ComponentShape
            key={c.id}
            component={c}
            selected={selection?.kind === 'component' && selection.id === c.id}
            drawing={draft !== null}
            onPointerDown={(e) => {
              if (e.button !== 0 || draft) return; // mittlere Taste: Ansicht verschieben
              e.stopPropagation();
              (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
              onSelect({ kind: 'component', id: c.id });
              drag.current = { kind: 'move', id: c.id, start: toDiagram(e), origin: c.position, last: c.position };
            }}
            onPortPointerDown={(portId, e) => {
              if (e.button !== 0) return;
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
      </svg>

      <div className="zoom-controls">
        <button onClick={() => zoomCenter(1 / 1.25)} title="Verkleinern">−</button>
        <button
          className="zoom-level"
          title="Originalgröße (100 % = Papiermaß)"
          onClick={() => view && zoomCenter(PX_PER_MM * MM_PER_UNIT / view.scale)}
        >
          {percent} %
        </button>
        <button onClick={() => zoomCenter(1.25)} title="Vergrößern">+</button>
        <button onClick={fit} title="Ganzes Blatt anzeigen">Einpassen</button>
      </div>
    </div>
  );
}

/** Zeichnungsrahmen und vereinfachtes Schriftfeld nach DIN EN ISO 5457 / 7200. */
function SheetFrame({ diagram }: { diagram: Diagram }) {
  const area = drawingArea(diagram.sheet);
  const block = titleBlock(diagram.sheet);
  const { sheet, meta } = diagram;
  const row = block.height / 2;
  const col = block.width / 3;
  const date = meta.modified.slice(0, 10);
  const cell = (x: number, y: number, caption: string, value: string, big = false) => (
    <>
      <text x={x + 6} y={y + 12} className="caption">
        {caption}
      </text>
      <text x={x + 6} y={y + row - 8} className={big ? 'value big' : 'value'}>
        {value}
      </text>
    </>
  );
  return (
    <g className="sheet-frame" pointerEvents="none">
      <rect x={area.x} y={area.y} width={area.width} height={area.height} className="frame" />
      <rect x={block.x} y={block.y} width={block.width} height={block.height} className="frame" />
      <line x1={block.x} y1={block.y + row} x2={block.x + block.width} y2={block.y + row} />
      <line x1={block.x + col} y1={block.y + row} x2={block.x + col} y2={block.y + block.height} />
      <line x1={block.x + 2 * col} y1={block.y + row} x2={block.x + 2 * col} y2={block.y + block.height} />
      {cell(block.x, block.y, 'Titel', meta.title, true)}
      {cell(block.x, block.y + row, 'Erstellt von', meta.author)}
      {cell(block.x + col, block.y + row, 'Datum', date)}
      {cell(block.x + 2 * col, block.y + row, 'Format', `${sheet.format} ${ORIENTATION_NAMES[sheet.orientation]}`)}
    </g>
  );
}

const ORIENTATION_NAMES = { portrait: 'hoch', landscape: 'quer' } as const;

const toPoints = (path: Point[]) => path.map((p) => `${p.x},${p.y}`).join(' ');

function ComponentShape({
  component,
  selected,
  drawing,
  onPointerDown,
  onPortPointerDown,
  onPortPointerUp,
  onPortHover,
}: {
  component: ComponentInstance;
  selected: boolean;
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
    <g className={`component${selected ? ' selected' : ''}${drawing ? ' drawing' : ''}`} onPointerDown={onPointerDown}>
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
      {component.label && (
        <text x={x - 4} y={y + 4} className="label">
          {component.label}
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
