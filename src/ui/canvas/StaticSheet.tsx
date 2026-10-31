import { memo, useMemo } from 'react';
import { layerState } from '../../model/layers.ts';
import { branchDots, crossings, linePathData, routeAll } from '../../model/routing.ts';
import type { Diagram, Point } from '../../model/types.ts';
import { AnnotationShape } from './annotationShapes.tsx';
import { ComponentShape } from './ComponentShape.tsx';
import { LINE_DASH } from './lineStyle.ts';
import { SheetFrame } from './SheetFrame.tsx';

const SHEET_KEYS = ['sheet', 'components', 'connections', 'junctions', 'annotations', 'groups', 'meta', 'layers'] as const;

/**
 * Ein nicht bearbeitbares Blatt neben dem aktuellen: gleiche Darstellung, aber
 * ohne Auswahl und Anfasser. Zeichnet nur neu, wenn sich das Blatt ändert.
 */
export const StaticSheet = memo(
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
