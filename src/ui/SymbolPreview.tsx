import { definitionOf } from '../model/library.ts';
import type { ComponentInstance } from '../model/types.ts';
import { ComponentSymbol, hasSymbol } from './symbols.tsx';

/** Rand um das Symbol, damit Anschlusslinien und Betätigungen nicht anstoßen (Einheiten). */
const PAD = 6;

/**
 * Verkleinertes ISO-Symbol eines Bauteils, z. B. für die Bauteilliste.
 * Alle Symbole nutzen denselben Maßstab, solange sie in den Rahmen passen,
 * damit Größenverhältnisse erhalten bleiben; größere werden verkleinert.
 */
export function SymbolPreview({
  component,
  width = 92,
  height = 44,
  unitsPerPixel = 1.4,
}: {
  /** Mit `rotation`/`mirrored` wird das Symbol so gezeigt, wie es auf dem Blatt liegt. */
  component: Pick<ComponentInstance, 'type' | 'config'> & Partial<Pick<ComponentInstance, 'rotation' | 'mirrored'>>;
  width?: number;
  height?: number;
  unitsPerPixel?: number;
}) {
  const def = definitionOf(component);
  if (!def || !hasSymbol(def.type)) return <svg className="symbol-preview" width={width} height={height} aria-hidden />;
  const rotation = component.rotation ?? 0;
  const turned = rotation % 180 !== 0;
  const w = (turned ? def.size.height : def.size.width) + 2 * PAD;
  const h = (turned ? def.size.width : def.size.height) + 2 * PAD;
  // Gleicher Maßstab für alle, außer das Symbol ist zu groß.
  const vw = Math.max(w, width * unitsPerPixel, (h * width) / height);
  const vh = (vw * height) / width;
  const cx = def.size.width / 2;
  const cy = def.size.height / 2;
  const vx = cx - vw / 2;
  const vy = cy - vh / 2;
  // Wie auf dem Blatt: erst spiegeln, dann um die Mitte drehen.
  const transform = `rotate(${rotation} ${cx} ${cy}) translate(${cx} 0) scale(${component.mirrored ? -1 : 1} 1) translate(${-cx} 0)`;
  return (
    <svg className="symbol-preview" width={width} height={height} viewBox={`${vx} ${vy} ${vw} ${vh}`} aria-hidden>
      <g transform={transform}>
        <ComponentSymbol component={component} />
      </g>
    </svg>
  );
}
