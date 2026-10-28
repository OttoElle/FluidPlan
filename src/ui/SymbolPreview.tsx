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
  component: Pick<ComponentInstance, 'type' | 'config'>;
  width?: number;
  height?: number;
  unitsPerPixel?: number;
}) {
  const def = definitionOf(component);
  if (!def || !hasSymbol(def.type)) return <svg className="symbol-preview" width={width} height={height} aria-hidden />;
  const w = def.size.width + 2 * PAD;
  const h = def.size.height + 2 * PAD;
  // Gleicher Maßstab für alle, außer das Symbol ist zu groß.
  const vw = Math.max(w, width * unitsPerPixel, (h * width) / height);
  const vh = (vw * height) / width;
  const vx = def.size.width / 2 - vw / 2;
  const vy = def.size.height / 2 - vh / 2;
  return (
    <svg className="symbol-preview" width={width} height={height} viewBox={`${vx} ${vy} ${vw} ${vh}`} aria-hidden>
      <ComponentSymbol component={component} />
    </svg>
  );
}
