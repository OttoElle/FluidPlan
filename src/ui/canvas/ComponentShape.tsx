import { transformLocalPoint } from '../../model/diagram.ts';
import { LETTERING, fontSizeFor, textWidth } from '../../model/lettering.ts';
import { definitionOf, portName } from '../../model/library.ts';
import type { ComponentInstance, Domain } from '../../model/types.ts';
import { ComponentSymbol, hasSymbol } from '../symbols.tsx';

/** Schriftgröße für 2,5 mm Versalhöhe (DIN ISO 1219-1, 5.12). */
const FONT = fontSizeFor(LETTERING.normal);
/** Innenabstand im Kasten um das Kennzeichen. */
const PAD = 3;
const BOX_HEIGHT = LETTERING.normal + 2 * PAD;

export function ComponentShape({
  component,
  domain,
  selected,
  locked = false,
  drawing,
  onPointerDown,
  onPortPointerDown,
  onPortPointerUp,
  onPortHover,
}: {
  component: ComponentInstance;
  /** Medium der Zeichnung; bestimmt die angezeigten Anschlussnamen. */
  domain: Domain;
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

  const showLabel = Boolean(component.label) && component.showLabel !== false;
  const labelWidth = textWidth(component.label, LETTERING.normal) + 2 * PAD;

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
          <text x={x + w / 2} y={y + h / 2} className="name" fontSize={FONT}>
            {def.name}
          </text>
        </>
      )}
      {showLabel && (
        // Bezeichnungsschlüssel im rechteckigen Kasten (DIN ISO 1219-2, 5.1.1.2).
        <g>
          <rect x={x - 4 - labelWidth} y={y} width={labelWidth} height={BOX_HEIGHT} className="label-box" />
          <text x={x - 4 - labelWidth / 2} y={y + PAD + LETTERING.normal} className="label" fontSize={FONT}>
            {component.label}
          </text>
        </g>
      )}
      {component.description && component.showDescription && (
        <text
          x={x - 4}
          y={y + (showLabel ? BOX_HEIGHT + 4 : 0) + LETTERING.normal}
          className="description"
          fontSize={FONT}
        >
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
            <text x={p.x + 3} y={p.y - 3} fontSize={FONT}>
              {portName(component, port, domain)}
            </text>
          </g>
        );
      })}
    </g>
  );
}
