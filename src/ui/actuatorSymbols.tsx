import {
  converterTop,
  type ManifoldConfig,
  type PressureConverterConfig,
  type PrimeMoverConfig,
  type SwivelConfig,
} from '../model/actuators.ts';
import { DRAWING_FONT } from '../model/lettering.ts';
import { MotorLetter, RotationArrow } from './rotarySymbol.tsx';
import { ArrowHead, Spring, Triangle, type P } from './symbolParts.tsx';
import { Upright } from './symbolOrientation.tsx';

/**
 * Schwenkantrieb, Druckmittelwandler/Druckübersetzer, Antriebsmotoren,
 * Verteiler und hydraulische Energiequelle (model/actuators.ts). Koordinaten in M.
 */

// --- Schwenkantrieb ---------------------------------------------------------------

/**
 * Schwenkantrieb (6.2.6/6.2.7, 9M × 9M): Halbkreis r = 3M (8.4.5) mit der
 * geraden Seite links bei x = 2, Anschlüsse 1,5M über und unter der Mitte mit
 * gefülltem Dreieck 1M an der geraden Seite, Welle 3M × 1M rechts,
 * gebogener Doppelpfeil über der Welle. Einfachwirkend: unten statt des
 * Anschlusses eine Feder auf die gerade Seite.
 */
export function SwivelSymbol({ config }: { config: SwivelConfig }) {
  const xf = 2;
  const cy = 4.5;
  // Doppelpfeil: Bogen r = 5,2M um (1,4; 4,5), 3,8M hoch, 1,25M rechts vom Halbkreis
  const c: P = [1.41, cy];
  const r = 5.2;
  const at = (a: number): P => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  const a = Math.asin(1.9 / r);
  const [x1, y1] = at(-a);
  const [x2, y2] = at(a);
  return (
    <>
      <path d={`M${xf} ${cy - 3} A3 3 0 0 1 ${xf} ${cy + 3} Z`} />
      <rect x={xf + 3} y={cy - 0.5} width={3} height={1} />
      <line x1={0} y1={cy - 1.5} x2={xf} y2={cy - 1.5} />
      <Triangle tip={[xf + 0.95, cy - 1.5]} dir={[1, 0]} side={1.1} filled />
      {config.action === 'double' ? (
        <>
          <line x1={0} y1={cy + 1.5} x2={xf} y2={cy + 1.5} />
          <Triangle tip={[xf + 0.95, cy + 1.5]} dir={[1, 0]} side={1.1} filled />
        </>
      ) : (
        <Spring from={[0, cy + 1.5]} to={[xf, cy + 1.5]} amp={1.1} peaks={5} />
      )}
      <path d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" />
      <ArrowHead from={at(-a + 0.2)} to={[x1, y1]} length={0.9} />
      <ArrowHead from={at(a - 0.2)} to={[x2, y2]} length={0.9} />
    </>
  );
}

// --- Druckmittelwandler / Druckübersetzer ---------------------------------------------

function Label({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <Upright x={x} y={y - 0.5}>
      <text x={x} y={y} className="fill" stroke="none" fontSize={1.4} fontFamily={DRAWING_FONT} textAnchor="middle">
        {children}
      </text>
    </Upright>
  );
}

/**
 * Druckmittelwandler (6.3.14): Gehäuse 9M × 4M, Kolben 2M breit in der Mitte
 * (3,5M vom linken Ende). Druckübersetzer (6.3.15): großes Gehäuse 4,5M × 4M
 * links, kleines 4,5M × 2M rechts, großer Kolben 2M mit 1M dicker Stange zum
 * kleinen Kolben 2M. Links pneumatisch (hohles Dreieck auf der Unterkante),
 * rechts hydraulisch (gefülltes Dreieck mit der Spitze auf der Unterkante).
 */
export function PressureConverterSymbol({ config }: { config: PressureConverterConfig }) {
  const t = converterTop(config);
  const h = t + 6;
  const tri = 1;
  const triH = (tri * Math.sqrt(3)) / 2;
  if (config.type === 'converter') {
    return (
      <>
        <rect x={0.5} y={t} width={9} height={4} />
        <line x1={4} y1={t} x2={4} y2={t + 4} />
        <line x1={6} y1={t} x2={6} y2={t + 4} />
        <line x1={1} y1={t + 4} x2={1} y2={h} />
        <line x1={9} y1={t + 4} x2={9} y2={h} />
        <Triangle tip={[1, t + 4 - triH]} dir={[0, -1]} side={tri} filled={false} />
        <Triangle tip={[9, t + 4]} dir={[0, 1]} side={tri} filled />
      </>
    );
  }
  return (
    <>
      <polygon points={`0.5,${t} 5,${t} 5,${t + 1} 9.5,${t + 1} 9.5,${t + 3} 5,${t + 3} 5,${t + 4} 0.5,${t + 4}`} />
      <line x1={1.5} y1={t} x2={1.5} y2={t + 4} />
      <line x1={3.5} y1={t} x2={3.5} y2={t + 4} />
      <line x1={3.5} y1={t + 1.5} x2={6.5} y2={t + 1.5} />
      <line x1={3.5} y1={t + 2.5} x2={6.5} y2={t + 2.5} />
      <line x1={6.5} y1={t + 1} x2={6.5} y2={t + 3} />
      <line x1={8.5} y1={t + 1} x2={8.5} y2={t + 3} />
      <line x1={1} y1={t + 4} x2={1} y2={h} />
      <line x1={9} y1={t + 3} x2={9} y2={h} />
      <Triangle tip={[1, t + 4 - triH]} dir={[0, -1]} side={tri} filled={false} />
      <Triangle tip={[9, t + 3]} dir={[0, 1]} side={tri} filled />
      <Label x={1.6} y={t - 0.45}>p1</Label>
      <Label x={8.2} y={t + 0.55}>p2</Label>
    </>
  );
}

// --- Antriebsmotoren ------------------------------------------------------------------

/**
 * Elektromotor (Kreis 6M mit "M", 8.4.51) bzw. Antriebseinheit
 * Verbrennungsmotor (Quadrat 6M, 8.4.9), 10M × 10M, Mitte bei (4, 5), Welle
 * 3M × 1M nach rechts auf Höhe der Pumpenwelle, Drehrichtungspfeil links.
 */
export function PrimeMoverSymbol({ config }: { config: PrimeMoverConfig }) {
  return (
    <>
      {config.engine === 'electric' ? <circle cx={4} cy={5} r={3} /> : <rect x={1} y={2} width={6} height={6} />}
      <MotorLetter cx={4} cy={5} />
      <rect x={7} y={4.5} width={3} height={1} />
      <RotationArrow rotation={config.rotation} cx={4} cy={5} side={Math.PI} />
    </>
  );
}

// --- Verteiler ------------------------------------------------------------------------

/** Verteiler: Block 2M hoch, Zulauf links, Abgänge oben im Abstand 2M. */
export function ManifoldSymbol({ config }: { config: ManifoldConfig }) {
  const n = config.outlets;
  return (
    <>
      <rect x={1} y={1} width={2 * n} height={2} />
      <line x1={0} y1={2} x2={1} y2={2} />
      {Array.from({ length: n }, (_, i) => (
        <line key={i} x1={2 * (i + 1)} y1={0} x2={2 * (i + 1)} y2={1} />
      ))}
    </>
  );
}

// --- Hydraulische Energiequelle ------------------------------------------------------

/** Hydraulische Energiequelle (8.7.36, 6M × 2M): gefülltes Dreieck 2M, Leitung 4M zum Anschluss. */
export function HydraulicSource() {
  return (
    <>
      <Triangle tip={[2, 1]} dir={[1, 0]} filled />
      <line x1={2} y1={1} x2={6} y2={1} />
    </>
  );
}
