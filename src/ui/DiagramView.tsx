import { useCallback, useEffect, useRef, useState } from 'react';
import { portPosition, transformLocalPoint } from '../model/diagram.ts';
import { getDefinition } from '../model/library.ts';
import { MM_PER_UNIT, drawingArea, sheetSize, titleBlock } from '../model/sheet.ts';
import type { ComponentInstance, Diagram, LineKind, Point } from '../model/types.ts';
import { ComponentSymbol, hasSymbol } from './symbols.tsx';

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
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: Point) => void;
}

/** Sichtbarer Ausschnitt: Schaltplan-Koordinate der linken oberen Ecke und Pixel pro Einheit. */
interface View {
  x: number;
  y: number;
  scale: number;
}

type Drag =
  | { kind: 'move'; id: string; start: Point; origin: Point }
  | { kind: 'pan'; startX: number; startY: number; origin: View; moved: boolean };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/**
 * Zeichnet den Schaltplan als SVG auf einem Zeichenblatt.
 * Mausrad zoomt um den Mauszeiger, Ziehen auf freier Fläche (oder mit der
 * mittleren Maustaste) verschiebt die Ansicht.
 * Bauteile mit Schaltzeichen (symbols.tsx) erscheinen als ISO-1219-Symbol,
 * alle übrigen vorerst als beschriftete Rahmen mit Anschlusspunkten.
 */
export function DiagramView({ diagram, selectedId, onSelect, onMove }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [panning, setPanning] = useState(false);

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
          if (!view || (e.button !== 0 && e.button !== 1)) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, origin: view, moved: false };
          setPanning(true);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          if (d.kind === 'move') {
            const p = toDiagram(e);
            onMove(d.id, { x: snap(d.origin.x + p.x - d.start.x), y: snap(d.origin.y + p.y - d.start.y) });
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
          const points = [portPosition(diagram, l.from), ...l.waypoints, portPosition(diagram, l.to)];
          return (
            <polyline
              key={l.id}
              className="line"
              points={points.map((p) => `${p.x},${p.y}`).join(' ')}
              strokeDasharray={DASH[l.kind]}
            />
          );
        })}

        {diagram.components.map((c) => (
          <ComponentShape
            key={c.id}
            component={c}
            selected={c.id === selectedId}
            onPointerDown={(e) => {
              if (e.button !== 0) return; // mittlere Taste: Ansicht verschieben
              e.stopPropagation();
              (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
              onSelect(c.id);
              drag.current = { kind: 'move', id: c.id, start: toDiagram(e), origin: c.position };
            }}
          />
        ))}
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

function ComponentShape({
  component,
  selected,
  onPointerDown,
}: {
  component: ComponentInstance;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent<SVGGElement>) => void;
}) {
  const def = getDefinition(component.type);
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
    <g className={selected ? 'component selected' : 'component'} onPointerDown={onPointerDown}>
      {hasSymbol(def.type) ? (
        <>
          <rect x={x} y={y} width={w} height={h} className="hit" />
          <g transform={transform}>
            <ComponentSymbol type={def.type} />
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
          <g key={port.id} className="port">
            <circle cx={p.x} cy={p.y} r={2.5} />
            <text x={p.x + 4} y={p.y - 3}>
              {port.id}
            </text>
          </g>
        );
      })}
    </g>
  );
}
