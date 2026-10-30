import { annotationBox } from '../../model/annotations.ts';
import { componentBox } from '../../model/routing.ts';
import type { Selection } from '../../model/selection.ts';
import type { Diagram, Point } from '../../model/types.ts';

/** Gestrichelter Rahmen um ausgewählte Gruppen. */
export function GroupFrames({
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
