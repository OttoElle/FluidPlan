import type { Point } from '../../model/types.ts';

/** Pfeilspitzen auf GRAFCET-Wirkungslinien von unten nach oben (DIN EN 60848, Symbol [11]). */
export function LinkArrows({ arrows }: { arrows: { id: string; at: Point }[] }) {
  return (
    <>
      {arrows.map(({ id, at }) => (
        <polygon key={id} className="link-arrow" points={`${at.x},${at.y} ${at.x - 3},${at.y + 8} ${at.x + 3},${at.y + 8}`} />
      ))}
    </>
  );
}
