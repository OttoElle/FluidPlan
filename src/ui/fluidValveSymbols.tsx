import {
  hasDrain,
  pressureSpringX,
  type CheckValveConfig,
  type FlowDividerConfig,
  type PressureValveConfig,
  type ThrottleConfig,
} from '../model/fluidValves.ts';
import { ArrowHead, CheckElement, DASH, FlowArrow, Junction, pts, seatTip, Spring, Throttle, Triangle, type P } from './symbolParts.tsx';

/**
 * Sperr-, Strom- und Druckventile nach DIN ISO 1219-1:2019, gezeichnet aus
 * ihrer Konfiguration (model/fluidValves.ts). Koordinaten in M.
 */

const DOWN: P = [0, 1];
const UP: P = [0, -1];

// --- Rückschlagventile ----------------------------------------------------------

/** Rückschlagventil (6.1.5.1, 2M × 6M) bzw. mit Feder (6.1.5.2, 2M × 8M), frei von 1 (unten) nach 2 (oben). */
function SimpleCheck({ spring }: { spring: boolean }) {
  if (!spring) {
    const ball: P = [1, 2.8];
    return (
      <>
        <line x1={1} y1={0} x2={1} y2={2.3} />
        <CheckElement ball={ball} seat={DOWN} />
        <line x1={1} y1={seatTip(ball, DOWN)[1]} x2={1} y2={6} />
      </>
    );
  }
  const ball: P = [1, 5.25];
  return (
    <>
      {/* Leitung läuft durch die Feder bis zur Kugel (Beispiel 6.1.5.2) */}
      <line x1={1} y1={0} x2={1} y2={4.75} />
      <Spring from={[1, 2.25]} to={[1, 4.75]} amp={0.9} peaks={6} />
      <CheckElement ball={ball} seat={DOWN} />
      <line x1={1} y1={seatTip(ball, DOWN)[1]} x2={1} y2={8} />
    </>
  );
}

/** Entsperrbares Rückschlagventil (6.1.5.3, 6M × 10M), Steueranschluss X unten. */
function PilotedCheck({ spring }: { spring: boolean }) {
  const ball: P = [2, 6.25];
  return (
    <>
      <rect x={0} y={2} width={5} height={6} />
      <line x1={2} y1={0} x2={2} y2={5.75} />
      {spring && <Spring from={[2, 3.25]} to={[2, 5.75]} amp={0.9} peaks={6} />}
      <CheckElement ball={ball} seat={DOWN} />
      <line x1={2} y1={seatTip(ball, DOWN)[1]} x2={2} y2={10} />
      <polyline points={pts([2.6, 6.95], [4, 8], [4, 10])} strokeDasharray={DASH} />
    </>
  );
}

/**
 * Doppelrückschlagventil, entsperrbar (6.1.5.4, 8M × 10M): Rahmen 8M × 6M,
 * zwei Rückschlagventile 4M auseinander, frei von unten nach oben; der Druck
 * in der einen Leitung entsperrt über eine Steuerleitung das jeweils andere
 * Ventil, die Steuerleitungen kreuzen sich in der Mitte.
 */
function DoubleCheck() {
  const balls: P[] = [
    [2, 3.75],
    [6, 3.75],
  ];
  return (
    <>
      <rect x={0} y={2} width={8} height={6} />
      {balls.map(([x, y]) => (
        <g key={x}>
          <line x1={x} y1={0} x2={x} y2={y - 0.5} />
          <CheckElement ball={[x, y]} seat={DOWN} />
          <line x1={x} y1={seatTip([x, y], DOWN)[1]} x2={x} y2={10} />
          <Junction at={[x, 6.5]} />
        </g>
      ))}
      <polyline points={pts([2, 6.5], [3, 6.5], [5.4, 4.3])} strokeDasharray={DASH} />
      <polyline points={pts([6, 6.5], [5, 6.5], [2.6, 4.3])} strokeDasharray={DASH} />
    </>
  );
}

export function CheckValveSymbol({ config }: { config: CheckValveConfig }) {
  if (config.double) return <DoubleCheck />;
  if (config.piloted) return <PilotedCheck spring={config.spring} />;
  return <SimpleCheck spring={config.spring} />;
}

// --- Druckventile ---------------------------------------------------------------

/**
 * Druckventile (6.1.3, 10M × 8M, vorgesteuert 12M × 8M): Ventilfeld 4M von
 * (2, 2) bis (6, 6), Anschlüsse in der Mitte bei x = 4, Leitungen 2M. Die
 * Steuerleitung läuft 2M links am Feld vorbei und mündet 1M über der
 * Unterkante (8.2.5/8.2.6), die Feder sitzt rechts auf derselben Höhe
 * (8.5.23), einstellbar mit Pfeil (8.6.3). Vorgesteuert (6.1.3.5): zwischen
 * Feld und Feder ein Kasten 2M × 2M mit gefülltem Dreieck.
 */
export function PressureValveSymbol({ config }: { config: PressureValveConfig }) {
  const reducing = config.function === 'reducing';
  const sx = pressureSpringX(config);
  return (
    <>
      <rect x={2} y={2} width={4} height={4} />
      <line x1={4} y1={0} x2={4} y2={2} />
      <line x1={4} y1={6} x2={4} y2={8} />
      {reducing ? (
        // offen: Pfeil auf der Leitung, Steuerdruck vom Ausgang (oben)
        <>
          <FlowArrow from={[4, 6]} to={[4, 2]} />
          <polyline points={pts([4, 2], [3, 1], [0, 1], [0, 5], [2, 5])} strokeDasharray={DASH} />
        </>
      ) : (
        // geschlossen: Pfeil 1M neben der Leitung, Steuerdruck vom Eingang (unten)
        <>
          <FlowArrow from={[3, 6]} to={[3, 2]} />
          <polyline points={pts([4, 6], [2, 8], [0, 8], [0, 5], [2, 5])} strokeDasharray={DASH} />
        </>
      )}
      {config.piloted && (
        <>
          <rect x={6} y={4} width={2} height={2} />
          <Triangle tip={[8, 5]} dir={[1, 0]} side={1.6} filled />
        </>
      )}
      <Spring from={[sx, 5]} to={[sx + 2.5, 5]} amp={1} peaks={6} />
      {config.adjustable && <FlowArrow from={[sx + 0.8, 6.8]} to={[sx + 1.85, 2.05]} />}
      {hasDrain(config) && <line x1={sx + 2} y1={6.2} x2={sx + 2} y2={8} strokeDasharray={DASH} />}
    </>
  );
}

// --- Stromventile ---------------------------------------------------------------

/** Verstellbarkeit einer Drossel (8.6.6): Pfeil 3,5M breit, 1,5M steigend, mittig (9.2.24). */
const AdjustArrow = ({ x, cy }: { x: number; cy: number }) => <FlowArrow from={[x - 1.4, cy + 0.6]} to={[x + 2.1, cy - 0.9]} />;

/** Blende (8.4.59): zwei scharfkantige Spitzen, 1M auseinander. */
export function Orifice({ x, cy }: { x: number; cy: number }) {
  return (
    <>
      <polyline points={pts([x - 1.5, cy - 1.05], [x - 0.5, cy], [x - 1.5, cy + 1.05])} />
      <polyline points={pts([x + 1.5, cy - 1.05], [x + 0.5, cy], [x + 1.5, cy + 1.05])} />
    </>
  );
}

function Restriction({ config, x, cy }: { config: ThrottleConfig; x: number; cy: number }) {
  return (
    <>
      {config.element === 'throttle' ? <Throttle x={x} cy={cy} /> : <Orifice x={x} cy={cy} />}
      {config.adjustable && <AdjustArrow x={x} cy={cy} />}
    </>
  );
}

/**
 * Drosselventil (6.1.4.1, 4M × 8M) und Drosselrückschlagventil (6.1.4.2,
 * 8M × 12M, Rahmen 8M × 8M): gedrosselt von 1 (unten) nach 2 (oben),
 * Umgehung über das Rückschlagventil frei von 2 nach 1.
 */
export function ThrottleSymbol({ config }: { config: ThrottleConfig }) {
  if (!config.check) {
    return (
      <>
        <line x1={2} y1={0} x2={2} y2={8} />
        <Restriction config={config} x={2} cy={4} />
      </>
    );
  }
  const ball: P = [6, 6.35];
  return (
    <>
      <rect x={0} y={2} width={8} height={8} />
      <line x1={2} y1={0} x2={2} y2={12} />
      <Restriction config={config} x={2} cy={6} />
      <polyline points={pts([2, 3], [6, 3], seatTip(ball, UP))} />
      <CheckElement ball={ball} seat={UP} />
      <polyline points={pts([6, 6.85], [6, 9], [2, 9])} />
      <Junction at={[2, 3]} />
      <Junction at={[2, 9]} />
    </>
  );
}

/**
 * Volumenstromteiler (6.1.4.6) und -summierer (6.1.4.7), 12M × 12M: Rahmen
 * 12M × 8M, zwei Leitungen 4M auseinander mit je einer Blende, Strömung nach
 * oben. Teiler: P unten verzweigt 2M über der Unterkante; Summierer: A und B
 * von unten, oben 2M unter der Oberkante zu P zusammengeführt.
 */
export function FlowDividerSymbol({ config }: { config: FlowDividerConfig }) {
  const divide = config.mode === 'divide';
  const joinY = divide ? 8 : 4;
  return (
    <>
      <rect x={0} y={2} width={12} height={8} />
      {[4, 8].map((x) => (
        <g key={x}>
          <line x1={x} y1={divide ? 0 : joinY} x2={x} y2={divide ? joinY : 12} />
          <Orifice x={x} cy={divide ? 6 : 8} />
          <ArrowHead from={[x, divide ? 5 : 6]} to={[x, divide ? 3 : joinY + 0.1]} />
        </g>
      ))}
      <line x1={4} y1={joinY} x2={8} y2={joinY} />
      <line x1={6} y1={joinY} x2={6} y2={divide ? 12 : 0} />
      <Junction at={[6, joinY]} />
    </>
  );
}
