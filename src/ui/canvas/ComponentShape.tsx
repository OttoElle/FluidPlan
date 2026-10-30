import { transformLocalPoint } from '../../model/diagram.ts';
import { definitionOf } from '../../model/library.ts';
import type { ComponentInstance } from '../../model/types.ts';
import { ComponentSymbol, hasSymbol } from '../symbols.tsx';

export function ComponentShape({
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
