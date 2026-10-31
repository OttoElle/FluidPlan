import { DRAWING_FONT } from '../model/lettering.ts';
import { ballValveLayout, BORES, PORT_DISTANCE, SIDE_DIR, SIDES, type BallValveConfig, type Side } from '../model/ballValve.ts';
import type { CouplingConfig } from '../model/coupling.ts';
import { QUANTITY_LETTER, sensorLayout, type SensorConfig } from '../model/sensor.ts';
import { tankLayout, type AccumulatorConfig, type TankConfig } from '../model/storage.ts';
import { CheckElement, FlowArrow, pts, Spring, Triangle, type P } from './symbolParts.tsx';

/**
 * Konfigurierbare Zubehör-Symbole nach DIN ISO 1219-1: Kugelhahn, Speicher,
 * Behälter, Schnelltrennkupplung und Sensoren. Maße und Normabschnitte stehen
 * bei den Modellen (model/ballValve.ts, storage.ts, coupling.ts, sensor.ts).
 */

// --- Kugelhahn ------------------------------------------------------------------

const BALL_R = 1.5;

export function BallValveSymbol({ config }: { config: BallValveConfig }) {
  const { center } = ballValveLayout(config.ways);
  const c: P = [center.x, center.y];
  const at = (side: Side, r: number): P => [c[0] + SIDE_DIR[side][0] * r, c[1] + SIDE_DIR[side][1] * r];
  const bore = BORES[config.ways][config.bore] ?? Object.values(BORES[config.ways])[0]!;
  const separate = bore.paths.length > 1;
  return (
    <>
      <circle cx={c[0]} cy={c[1]} r={BALL_R} />
      {/* Anschlussleitungen direkt an der Kugel (8.2.12), ohne Absperrdreiecke */}
      {SIDES[config.ways].map(({ side }) => (
        <line key={side} x1={at(side, BALL_R)[0]} y1={at(side, BALL_R)[1]} x2={at(side, PORT_DISTANCE)[0]} y2={at(side, PORT_DISTANCE)[1]} />
      ))}
      {bore.paths.map((path, i) => {
        if (separate && path.length === 2) {
          // Zwei getrennte Wege: Viertelbogen um die gemeinsame Ecke, damit sie sich nicht berühren.
          const [a, b] = path as [Side, Side];
          const corner: P = [c[0] + (SIDE_DIR[a][0] + SIDE_DIR[b][0]) * BALL_R, c[1] + (SIDE_DIR[a][1] + SIDE_DIR[b][1]) * BALL_R];
          const [p, q] = [at(a, BALL_R), at(b, BALL_R)];
          const sweep = (p[0] - corner[0]) * (q[1] - corner[1]) - (p[1] - corner[1]) * (q[0] - corner[0]) > 0 ? 1 : 0;
          return <path key={i} d={`M${p[0]} ${p[1]} A${BALL_R} ${BALL_R} 0 0 ${sweep} ${q[0]} ${q[1]}`} />;
        }
        return <polyline key={i} points={pts(...path.flatMap((s, k) => (k === 0 ? [at(s, BALL_R), c] : [c, at(s, BALL_R)])))} />;
      })}
    </>
  );
}

// --- Speicher und Behälter ----------------------------------------------------------

/** Gas als hohles Dreieck 1M, Spitze nach unten bei `tipY`. */
const Gas = ({ x, tipY }: { x: number; tipY: number }) => <Triangle tip={[x, tipY]} dir={[0, 1]} side={1} filled={false} />;

export function AccumulatorSymbol({ config }: { config: AccumulatorConfig }) {
  if (config.type === 'piston-bottle') return <PistonWithBottle />;
  if (config.type === 'air-reservoir') {
    return (
      <>
        <rect x={2} y={0} width={8} height={4} rx={2} />
        <line x1={0} y1={2} x2={2} y2={2} />
        <line x1={10} y1={2} x2={12} y2={2} />
      </>
    );
  }
  return (
    <>
      <rect x={0} y={0} width={4} height={8} rx={2} />
      <line x1={2} y1={8} x2={2} y2={10} />
      {config.type === 'diaphragm' && (
        <>
          <line x1={0} y1={4} x2={4} y2={4} />
          <Gas x={2} tipY={4} />
        </>
      )}
      {config.type === 'bladder' && (
        <>
          {/* Blase als Bogen r = 2,5M (8.2.8) */}
          <path d="M0 3.5 A2.5 2.5 0 0 0 4 3.5" />
          <Gas x={2} tipY={4.4} />
        </>
      )}
      {config.type === 'piston' && (
        <>
          <line x1={0} y1={2.5} x2={4} y2={2.5} />
          <line x1={0} y1={4.5} x2={4} y2={4.5} />
          <Gas x={2} tipY={2.4} />
        </>
      )}
      {config.type === 'gas-bottle' && <Gas x={2} tipY={4.4} />}
    </>
  );
}

/**
 * Kolbenspeicher mit nachgeschalteter Gasflasche (Beispiel 6.4.6.5): Kapseln
 * 4M × 8M im Abstand 8M, oben 2M darüber verbunden; in der Gasflasche zeigt
 * das Gasdreieck nach oben.
 */
function PistonWithBottle() {
  return (
    <>
      <rect x={0} y={2} width={4} height={8} rx={2} />
      <rect x={8} y={2} width={4} height={8} rx={2} />
      <polyline points={pts([2, 2], [2, 0], [10, 0], [10, 2])} />
      <line x1={2} y1={10} x2={2} y2={12} />
      <line x1={0} y1={4.5} x2={4} y2={4.5} />
      <line x1={0} y1={6.5} x2={4} y2={6.5} />
      <Gas x={2} tipY={4.4} />
      <Triangle tip={[10, 5.4]} dir={[0, -1]} side={1} filled={false} />
    </>
  );
}

export function TankSymbol({ config }: { config: TankConfig }) {
  const { width: w, line, depth, margin, end } = tankLayout(config);
  const bottom = line + depth;
  return (
    <>
      {config.size === 'small' ? (
        // Behälterrückführung (8.7.33): offenes U
        <polyline points={pts([0, line], [0, bottom], [w, bottom], [w, line])} />
      ) : config.closed ? (
        // Druckbeaufschlagter Behälter (8.7.34): Kapsel
        <rect x={0} y={line} width={w} height={depth} rx={depth / 2} />
      ) : (
        // Behälter (8.7.32): Rechteck, Seitenwände 1M über den Deckel hinaus
        <>
          <polyline points={pts([0, line - 1], [0, bottom], [w, bottom], [w, line - 1])} />
          <line x1={0} y1={line} x2={w} y2={line} />
        </>
      )}
      {Array.from({ length: config.lines }, (_, i) => (
        <line key={i} x1={margin + 2 * i} y1={0} x2={margin + 2 * i} y2={end} />
      ))}
    </>
  );
}

// --- Schnelltrennkupplung -------------------------------------------------------

export function CouplingSymbol({ config }: { config: CouplingConfig }) {
  const [upper, lower] = config.coupled ? [4.25, 5.75] : [3.75, 6.25];
  const bars = config.coupled ? [5] : [4.5, 5.5];
  const half = (tip: number, dir: 1 | -1, check: boolean) => {
    // dir = -1: Hälfte oben (Sitz öffnet nach oben), +1: unten
    const ball: P = [1, tip + dir * Math.SQRT1_2];
    const outer = check ? ball[1] + dir * 0.5 : tip;
    const port = dir < 0 ? 0 : 10;
    return (
      <>
        <line x1={1} y1={port} x2={1} y2={outer} />
        {check ? (
          <CheckElement ball={ball} seat={[0, -dir]} />
        ) : (
          <polyline points={pts([0, tip + dir], [1, tip], [2, tip + dir])} />
        )}
      </>
    );
  };
  return (
    <>
      {half(upper, -1, config.checks === 2 || (config.checks === 1 && config.checkSide !== 'bottom'))}
      {half(lower, 1, config.checks === 2 || (config.checks === 1 && config.checkSide === 'bottom'))}
      {config.coupled ? (
        <line x1={1} y1={upper} x2={1} y2={lower} />
      ) : (
        <>
          <line x1={1} y1={upper} x2={1} y2={bars[0]} />
          <line x1={1} y1={bars[1]} x2={1} y2={lower} />
        </>
      )}
      {bars.map((y) => (
        <line key={y} x1={0.5} y1={y} x2={1.5} y2={y} />
      ))}
    </>
  );
}

// --- Schlauchleitung --------------------------------------------------------------

/** Schlauchleitung (8.2.8, Beispiel 6.4.1.1): Bogen r = 2,5M über 4M, 6M × 2M. */
export function HoseSymbol() {
  return (
    <>
      <line x1={0} y1={1} x2={1} y2={1} />
      <path d="M1 1 A2.5 2.5 0 0 0 5 1" />
      <line x1={5} y1={1} x2={6} y2={1} />
      <circle cx={1} cy={1} r={0.2} className="fill" />
      <circle cx={5} cy={1} r={0.2} className="fill" />
    </>
  );
}

// --- Sensoren ---------------------------------------------------------------------

/** Signalwandler 4M (8.7.2) mit Messgröße unten links und Ausgangssignal oben rechts. */
function Converter({ x, y, letter, output }: { x: number; y: number; letter: string; output: 'switching' | 'analog' }) {
  return (
    <>
      <rect x={x} y={y} width={4} height={4} />
      <line x1={x} y1={y} x2={x + 4} y2={y + 4} />
      <text x={x + 1.1} y={y + 2.9} className="fill" stroke="none" fontSize={1.8} fontFamily={DRAWING_FONT} textAnchor="middle" dominantBaseline="central">
        {letter}
      </text>
      {output === 'switching' ? (
        // schaltend (8.7.7): Schließer
        <>
          <polyline points={pts([x + 2.1, y + 1.4], [x + 2.6, y + 1.4], [x + 3.4, y + 0.8])} />
          <line x1={x + 3.2} y1={y + 1.4} x2={x + 3.7} y2={y + 1.4} />
        </>
      ) : (
        // analog (8.7.8)
        <path d={`M${x + 2.5} ${y + 1.6} v-0.5 a0.5 0.5 0 0 1 1 0 v0.5`} />
      )}
    </>
  );
}

export function SensorSymbol({ config }: { config: SensorConfig }) {
  const l = sensorLayout(config);
  const { x: bx, y: by } = l.box;
  if (config.output === 'mechanical') {
    // Druckschalter elektromechanisch (6.4.2.1): Kasten mit Schließer, einstellbare Feder rechts
    return (
      <>
        <line x1={0} y1={3} x2={bx} y2={3} />
        <rect x={bx} y={by} width={4} height={4} />
        <polyline points={pts([bx + 0.6, 3.3], [bx + 1.6, 3.3], [bx + 2.9, 2.5])} />
        <line x1={bx + 2.7} y1={3.3} x2={bx + 3.4} y2={3.3} />
        <Spring from={[bx + 4, 3]} to={[bx + 6.6, 3]} amp={1} peaks={6} />
        <FlowArrow from={[bx + 4.3, 5.6]} to={[bx + 6.8, 0.4]} />
      </>
    );
  }
  const output = config.output;
  return (
    <>
      {config.quantity === 'pressure' && <line x1={0} y1={by + 2} x2={bx} y2={by + 2} />}
      {config.quantity === 'flow' && (
        // Durchgehende Leitung, Wandler über eine Abzweigung angeschlossen (8.2.1)
        <>
          <line x1={2} y1={0} x2={2} y2={l.height} />
          <line x1={2} y1={by + 2} x2={bx} y2={by + 2} />
          <circle cx={2} cy={by + 2} r={0.25} className="fill" />
        </>
      )}
      {config.quantity === 'temperature' && <polyline points={pts([2, l.height], [2, by + 2], [bx, by + 2])} />}
      <Converter x={bx} y={by} letter={QUANTITY_LETTER[config.quantity]} output={output} />
      {config.adjustable && (
        // Einstellbar (6.4.2.2): Strich über der linken oberen Ecke, schräg vom Pfeil gekreuzt
        <>
          <line x1={bx} y1={by} x2={bx} y2={by - 1.8} />
          <FlowArrow from={[bx - 1, by - 0.4]} to={[bx + 2.6, by - 1.8]} />
        </>
      )}
    </>
  );
}
