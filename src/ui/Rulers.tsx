import { MM_PER_UNIT } from '../model/sheet.ts';

/** Breite der Lineale in Bildschirmpixeln. */
export const RULER_SIZE = 20;

/** Schrittweiten der Beschriftung in mm; die kleinste mit genug Platz gewinnt. */
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];
const MIN_LABEL_GAP_PX = 50;

interface Tick {
  px: number;
  mm: number;
  major: boolean;
}

/** Striche für eine Achse: `origin` = Schaltplan-Koordinate am Bildschirmrand. */
function ticks(origin: number, scale: number, length: number): Tick[] {
  const pxPerMm = scale / MM_PER_UNIT;
  const major = STEPS.find((s) => s * pxPerMm >= MIN_LABEL_GAP_PX) ?? STEPS.at(-1)!;
  const minor = major / (major % 5 === 0 ? 5 : 2);
  const startMm = origin * MM_PER_UNIT;
  const endMm = startMm + length / pxPerMm;
  const out: Tick[] = [];
  for (let mm = Math.ceil(startMm / minor) * minor; mm <= endMm; mm += minor) {
    const rounded = Math.round(mm * 1000) / 1000;
    out.push({ px: (rounded - startMm) * pxPerMm, mm: rounded, major: Math.abs(rounded / major - Math.round(rounded / major)) < 1e-6 });
  }
  return out;
}

/**
 * Lineale oben und links in Millimetern, gemessen ab der linken oberen
 * Blattecke. Sie liegen über der Zeichenfläche und gehören nicht zur Zeichnung.
 */
export function Rulers({
  view,
  size,
}: {
  view: { x: number; y: number; scale: number };
  size: { width: number; height: number };
}) {
  const horizontal = ticks(view.x, view.scale, size.width);
  const vertical = ticks(view.y, view.scale, size.height);
  return (
    <>
      <svg className="ruler horizontal" width={size.width} height={RULER_SIZE} aria-hidden>
        {horizontal.map((t) => (
          <g key={t.mm}>
            <line x1={t.px} x2={t.px} y1={t.major ? 6 : 14} y2={RULER_SIZE} />
            {t.major && (
              <text x={t.px + 2} y={10}>
                {t.mm}
              </text>
            )}
          </g>
        ))}
      </svg>
      <svg className="ruler vertical" width={RULER_SIZE} height={size.height} aria-hidden>
        {vertical.map((t) => (
          <g key={t.mm}>
            <line y1={t.px} y2={t.px} x1={t.major ? 6 : 14} x2={RULER_SIZE} />
            {t.major && (
              <text x={10} y={t.px + 2} transform={`rotate(-90 10 ${t.px + 2})`} textAnchor="end">
                {t.mm}
              </text>
            )}
          </g>
        ))}
      </svg>
      <div className="ruler corner" />
    </>
  );
}
