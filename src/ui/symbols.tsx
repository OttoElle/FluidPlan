import type { ReactNode } from 'react';

/**
 * Schaltzeichen nach DIN ISO 1219-1.
 *
 * Alle Symbole sind im Modul M gezeichnet: Koordinaten in M, Ursprung oben
 * links wie bei der Bauteildefinition, ungedreht. Ein Rasterschritt der
 * Zeichenfläche entspricht 1M (= 10 Einheiten). Die Anschlüsse in library.ts
 * liegen genau auf den Leitungsenden der Symbole.
 *
 * Grundmaße aus der Norm: Linienbreite 0,125M, Kreis für Pumpe/Kompressor 6M,
 * Ventilfeld 4M × 4M, Zylinderrahmen 9M × 4M, Wirkrichtungsdreieck 2M,
 * Durchflusspfeil mit 1M langer Spitze und 30° Öffnungswinkel, Welle 3M lang
 * und 1M breit.
 */
export const MODULE = 10;
export const LINE_WIDTH = 0.125;

type P = readonly [number, number];

const pts = (...points: P[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

/** Gleichseitiges Dreieck mit Seitenlänge 2M, Spitze bei `tip`, zeigt nach oben. */
function TriangleUp({ tip: [x, y], filled }: { tip: P; filled: boolean }) {
  const h = Math.sqrt(3);
  return <polygon points={pts([x, y], [x - 1, y + h], [x + 1, y + h])} className={filled ? 'fill' : undefined} />;
}

/** Durchflusspfeil von `from` nach `to`, Spitze 1M lang, 30° Öffnung. */
function FlowArrow({ from, to }: { from: P; to: P }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const half = Math.tan(Math.PI / 12);
  const bx = x2 - ux;
  const by = y2 - uy;
  return (
    <>
      <line x1={x1} y1={y1} x2={bx} y2={by} />
      <polygon points={pts([x2, y2], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half])} className="fill" />
    </>
  );
}

/** Kreis 6M mit Antriebswelle nach links; Mitte bei (6, cy). */
function EnergyConversionUnit({ cy, children }: { cy: number; children: ReactNode }) {
  return (
    <>
      <circle cx={6} cy={cy} r={3} />
      <polyline points={pts([3, cy - 0.5], [0, cy - 0.5])} />
      <polyline points={pts([3, cy + 0.5], [0, cy + 0.5])} />
      {children}
    </>
  );
}

/** Hydropumpe mit konstantem Verdrängungsvolumen, eine Förderrichtung (9M × 9M). */
function Pump() {
  return (
    <EnergyConversionUnit cy={4.5}>
      <line x1={6} y1={0} x2={6} y2={1.5} />
      <line x1={6} y1={7.5} x2={6} y2={9} />
      <TriangleUp tip={[6, 1.5]} filled />
    </EnergyConversionUnit>
  );
}

/** Kompressor: wie die Pumpe, aber mit hohlem Dreieck für Pneumatik (9M × 7M). */
function Compressor() {
  return (
    <EnergyConversionUnit cy={4}>
      <line x1={6} y1={0} x2={6} y2={1} />
      <TriangleUp tip={[6, 1]} filled={false} />
    </EnergyConversionUnit>
  );
}

/**
 * 4/2-Wegeventil mit Magnetbetätigung und Federrückstellung (12M × 6M).
 * Links der Magnet, dann das betätigte Feld (P→A, B→T), rechts daneben das
 * Ruhestellungsfeld (P→B, A→T) mit den Anschlüssen, ganz rechts die Feder.
 */
function Valve42() {
  return (
    <>
      {/* Magnet */}
      <rect x={0} y={2} width={2} height={2} />
      <line x1={0.5} y1={4} x2={1.5} y2={2} />
      {/* Schaltstellungen */}
      <rect x={2} y={1} width={4} height={4} />
      <rect x={6} y={1} width={4} height={4} />
      <FlowArrow from={[3, 5]} to={[3, 1]} />
      <FlowArrow from={[5, 1]} to={[5, 5]} />
      <FlowArrow from={[7, 5]} to={[9, 1]} />
      <FlowArrow from={[7, 1]} to={[9, 5]} />
      {/* Feder */}
      <polyline points={pts([10, 3], [10.25, 2], [10.75, 4], [11.25, 2], [11.75, 4], [12, 3])} />
      {/* Anschlussleitungen am Ruhestellungsfeld */}
      <line x1={7} y1={0} x2={7} y2={1} />
      <line x1={9} y1={0} x2={9} y2={1} />
      <line x1={7} y1={5} x2={7} y2={6} />
      <line x1={9} y1={5} x2={9} y2={6} />
    </>
  );
}

/** Doppeltwirkender Zylinder mit einseitiger Kolbenstange, eingefahren (13M × 5M). */
function CylinderDouble() {
  return (
    <>
      <rect x={0} y={0} width={9} height={4} />
      <rect x={2} y={0} width={0.4} height={4} className="fill" />
      <rect x={2.4} y={1.5} width={10.6} height={1} />
      <line x1={1} y1={4} x2={1} y2={5} />
      <line x1={8} y1={4} x2={8} y2={5} />
    </>
  );
}

const SYMBOLS: Record<string, () => ReactNode> = {
  'supply.pump': Pump,
  'supply.compressor': Compressor,
  'valve.4-2': Valve42,
  'actuator.cylinder-double': CylinderDouble,
};

export function hasSymbol(type: string): boolean {
  return type in SYMBOLS;
}

/** Zeichnet das Symbol in lokalen Bauteilkoordinaten (Einheiten, nicht M). */
export function ComponentSymbol({ type }: { type: string }) {
  const Draw = SYMBOLS[type];
  if (!Draw) return null;
  return (
    <g className="symbol" transform={`scale(${MODULE})`} strokeWidth={LINE_WIDTH}>
      <Draw />
    </g>
  );
}
