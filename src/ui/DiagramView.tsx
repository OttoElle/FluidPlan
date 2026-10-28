import { useRef } from 'react';
import { portPosition, transformLocalPoint } from '../model/diagram.ts';
import { getDefinition } from '../model/library.ts';
import type { ComponentInstance, Diagram, LineKind, Point } from '../model/types.ts';

const GRID = 10;
const DASH: Record<LineKind, string | undefined> = { working: undefined, pilot: '6 4', drain: '2 3' };

interface Props {
  diagram: Diagram;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: Point) => void;
}

/**
 * Zeichnet den Schaltplan als SVG.
 * Bauteile erscheinen vorerst als beschriftete Rahmen mit Anschlusspunkten;
 * die genormten Symbole nach ISO 1219 folgen in einem eigenen Schritt.
 */
export function DiagramView({ diagram, selectedId, onSelect, onMove }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; start: Point; origin: Point } | null>(null);

  const toDiagram = (e: React.PointerEvent): Point => {
    const ctm = svgRef.current!.getScreenCTM()!.inverse();
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };

  const snap = (v: number) => Math.round(v / GRID) * GRID;

  return (
    <svg
      ref={svgRef}
      className="diagram"
      viewBox="0 0 800 500"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const p = toDiagram(e);
        onMove(d.id, { x: snap(d.origin.x + p.x - d.start.x), y: snap(d.origin.y + p.y - d.start.y) });
      }}
      onPointerUp={() => (drag.current = null)}
    >
      <defs>
        <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
          <circle cx={0.5} cy={0.5} r={0.5} className="grid-dot" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />

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
            e.stopPropagation();
            (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(e.pointerId);
            onSelect(c.id);
            drag.current = { id: c.id, start: toDiagram(e), origin: c.position };
          }}
        />
      ))}
    </svg>
  );
}

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

  return (
    <g className={selected ? 'component selected' : 'component'} onPointerDown={onPointerDown}>
      <rect x={x} y={y} width={w} height={h} />
      <text x={x + w / 2} y={y + h / 2} className="name">
        {def.name}
      </text>
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
