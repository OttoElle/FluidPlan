import { coolerLayout, DIAMOND, filterLayout, type CoolerConfig, type FilterConfig } from '../model/conditioning.ts';
import { GaugeFace, IndicatorFace } from './instrumentSymbols.tsx';
import { MotorLetter } from './rotarySymbol.tsx';
import { ArrowHead, CheckElement, DASH, Junction, pts, seatTip, Spring, Triangle, type P } from './symbolParts.tsx';

/**
 * Filter, Abscheider und Wärmetauscher nach DIN ISO 1219-1:2019 (6.4.4,
 * 6.4.5): auf die Spitze gestelltes Quadrat 4M (8.7.24, 8.7.31). Koordinaten in M.
 */

/** Auf die Spitze gestelltes Quadrat 4M um (x, cy). */
export function Diamond({ x, cy }: { x: number; cy: number }) {
  return <polygon points={pts([x, cy - DIAMOND], [x + DIAMOND, cy], [x, cy + DIAMOND], [x - DIAMOND, cy])} />;
}

/** Zusätzliches Magnetelement (6.4.4.3): gefülltes Hufeisen 2,7M breit auf dem Filtereinsatz. */
function Magnet({ x, cy }: { x: number; cy: number }) {
  const outline: P[] = [
    [-1.35, -0.45],
    [-0.85, -0.45],
    [-0.85, -0.1],
    [0.85, -0.1],
    [0.85, -0.45],
    [1.35, -0.45],
    [1.35, 0.45],
    [-1.35, 0.45],
  ];
  return <polygon points={pts(...outline.map(([dx, dy]): P => [x + dx, cy + dy]))} className="fill" />;
}

export function FilterSymbol({ config }: { config: FilterConfig }) {
  const l = filterLayout(config);
  const { axis: x, cy } = l;
  if (config.design === 'breather') {
    // Tank-Belüftungsfilter (6.4.4.2): oben offener Luftanschluss aus zwei Dreiecken
    const top = cy - DIAMOND;
    return (
      <>
        <Diamond x={x} cy={cy} />
        <line x1={x - DIAMOND} y1={cy} x2={x + DIAMOND} y2={cy} strokeDasharray={DASH} />
        <line x1={x} y1={cy + DIAMOND} x2={x} y2={l.height} />
        <Triangle tip={[x, top]} dir={[0, 1]} side={1} filled={false} />
        <line x1={x} y1={top - 0.87} x2={x} y2={top - 1.87} />
        <Triangle tip={[x, top - 2.74]} dir={[0, -1]} side={1} filled={false} />
      </>
    );
  }
  const frame = l.frame;
  return (
    <>
      <Diamond x={x} cy={cy} />
      <line x1={x - DIAMOND} y1={cy} x2={x + DIAMOND} y2={cy} strokeDasharray={DASH} />
      {config.magnet && <Magnet x={x} cy={cy} />}
      <line x1={x} y1={0} x2={x} y2={cy - DIAMOND} />
      <line x1={x} y1={cy + DIAMOND} x2={x} y2={l.height} />
      {config.indicator !== 'none' && (
        <>
          {/* Anzeige am Eingang, Abzweig 2M unter dem Anschluss (6.4.4.4, 6.4.4.5) */}
          <Junction at={[x, 2]} />
          <line x1={x} y1={2} x2={x + 2} y2={2} />
          {config.indicator === 'optical' ? <IndicatorFace x={x + 2} y={0.5} type="optical" /> : <GaugeFace cx={x + 4} cy={2} />}
        </>
      )}
      {frame && <Bypass frame={frame} axis={x} />}
    </>
  );
}

/**
 * Umgehungsventil (6.4.4.7): Rahmen 10M × 12M, die Umgehung zweigt 1M unter
 * der Oberkante ab und läuft 5M links der Filterachse über ein federbelastetes
 * Rückschlagventil, das zum Ausgang hin öffnet.
 */
function Bypass({ frame, axis }: { frame: { x: number; y: number; width: number; height: number; branch: number }; axis: number }) {
  const { y, branch: bx } = frame;
  const top = y + 1;
  const bottom = y + frame.height - 1;
  const ball: P = [bx, top + 3];
  return (
    <>
      <rect x={frame.x} y={y} width={frame.width} height={frame.height} />
      <polyline points={pts([axis, top], [bx, top], seatTip(ball, [0, -1]))} />
      <CheckElement ball={ball} seat={[0, -1]} />
      <Spring from={[bx, ball[1] + 0.5]} to={[bx, ball[1] + 3]} amp={0.9} peaks={5} />
      <polyline points={pts([bx, ball[1] + 3], [bx, bottom], [axis, bottom])} />
      <Junction at={[axis, top]} />
      <Junction at={[axis, bottom]} />
    </>
  );
}

/** Zentrifugalabscheider (6.4.4.12, 10M × 8M): Anschlüsse links und rechts, Bogen im Quadrat. */
export function Separator() {
  const [x, cy] = [5, 4];
  return (
    <>
      <Diamond x={x} cy={cy} />
      <path d={`M${x - DIAMOND} ${cy} Q${x} ${cy + 2} ${x + DIAMOND} ${cy}`} />
      <line x1={0} y1={cy} x2={x - DIAMOND} y2={cy} />
      <line x1={x + DIAMOND} y1={cy} x2={10} y2={cy} />
    </>
  );
}

/** Wärmetauscher-Grundform: Quadrat mit senkrechter Leitung 1 (oben) nach 2 (unten). */
function Exchanger({ x, cy, height }: { x: number; cy: number; height: number }) {
  return (
    <>
      <Diamond x={x} cy={cy} />
      <line x1={x} y1={0} x2={x} y2={height} />
    </>
  );
}

/** Heizung (6.4.5.4, 8M × 10M): zwei Pfeile von den Ecken zur Mitte (Wärme wird zugeführt). */
export function Heater() {
  const [x, cy] = [4, 5];
  return (
    <>
      <Exchanger x={x} cy={cy} height={10} />
      <line x1={x - DIAMOND} y1={cy} x2={x + DIAMOND} y2={cy} />
      <ArrowHead from={[x - DIAMOND, cy]} to={[x, cy]} />
      <ArrowHead from={[x + DIAMOND, cy]} to={[x, cy]} />
    </>
  );
}

/**
 * Kühler (6.4.5.1–6.4.5.3): Pfeile von der Mitte zu den Ecken (Wärme wird
 * abgeführt). Flüssiges Kühlmedium: zwei Leitungen 1M über und unter der
 * Mitte nach rechts, oben hinein, unten heraus. Lüfter: Rahmen 22M × 10M,
 * links Elektromotor (Kreis 6M) mit Welle und Lüfterflügel.
 */
export function CoolerSymbol({ config }: { config: CoolerConfig }) {
  const { axis: x, cy, height } = coolerLayout(config);
  return (
    <>
      <Exchanger x={x} cy={cy} height={height} />
      <line x1={x - DIAMOND} y1={cy} x2={x + DIAMOND} y2={cy} />
      <ArrowHead from={[x, cy]} to={[x - DIAMOND, cy]} />
      <ArrowHead from={[x, cy]} to={[x + DIAMOND, cy]} />
      {config.coolant === 'liquid' && (
        <>
          <line x1={x + DIAMOND - 1} y1={cy - 1} x2={10} y2={cy - 1} />
          <line x1={x + DIAMOND - 1} y1={cy + 1} x2={10} y2={cy + 1} />
          <ArrowHead from={[10, cy - 1]} to={[x + DIAMOND + 0.6, cy - 1]} />
          <ArrowHead from={[x + DIAMOND, cy + 1]} to={[x + DIAMOND + 1.8, cy + 1]} />
        </>
      )}
      {config.coolant === 'fan' && (
        <>
          <rect x={0} y={2} width={22} height={10} />
          <circle cx={5} cy={cy} r={3} />
          <MotorLetter cx={5} cy={cy} />
          <line x1={8} y1={cy - 0.5} x2={10.5} y2={cy - 0.5} />
          <line x1={8} y1={cy + 0.5} x2={10.5} y2={cy + 0.5} />
          {/* Lüfterflügel: zwei schmale Blätter über und unter der Welle */}
          <ellipse cx={11} cy={cy - 1.1} rx={0.45} ry={1.1} />
          <ellipse cx={11} cy={cy + 1.1} rx={0.45} ry={1.1} />
        </>
      )}
    </>
  );
}
