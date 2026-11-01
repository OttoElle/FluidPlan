import { createContext, useContext, type ReactNode } from 'react';

/**
 * Lage des Symbols auf dem Blatt (Drehung in 90°-Schritten, Spiegelung).
 * Symbole dürfen gedreht und gespiegelt werden (DIN ISO 1219-1, 5.8);
 * Buchstaben im Symbol bleiben dabei aufrecht lesbar.
 */
export const SymbolOrientation = createContext<{ rotation: number; mirrored: boolean }>({ rotation: 0, mirrored: false });

/**
 * Hebt Drehung und Spiegelung des Symbols um den Punkt (x, y) wieder auf:
 * der Inhalt (Buchstabe, Kennbuchstabe) bleibt an seinem Platz im Symbol,
 * steht aber immer aufrecht.
 */
export function Upright({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const { rotation, mirrored } = useContext(SymbolOrientation);
  const r = ((rotation % 360) + 360) % 360;
  if (r === 0 && !mirrored) return <>{children}</>;
  return <g transform={`translate(${x} ${y}) scale(${mirrored ? -1 : 1} 1) rotate(${-r}) translate(${-x} ${-y})`}>{children}</g>;
}
