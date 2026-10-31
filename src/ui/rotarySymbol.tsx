import { MOTOR_OFFSET, type RotaryConfig } from '../model/rotary.ts';
import { ArrowHead, DASH, FlowArrow, pts, Triangle, type P } from './symbolParts.tsx';

/**
 * Pumpen, Kompressoren und Motoren aus ihrer Konfiguration (siehe
 * model/rotary.ts), 10M × 10M: Kreis 6M (8.4.4) mit der Mitte bei (6, 5),
 * Antriebswelle als Rechteck 3M × 1M nach links, Anschlussleitungen 2M lang
 * oben und unten (Beispiele 6.2), Dreieck 2M Seitenlänge.
 */

const CX = 6;
const CY = 5;
/** Sehne der Länge 2M im Kreis r = 3M liegt 2√2 M von der Mitte entfernt. */
const CHORD = 2 * Math.SQRT2;
const TRI_H = Math.sqrt(3);

/** Buchstabe M für Motoren (8.4.51): 2,5M breit und hoch, Mittelspitze 1,25M tief. */
export function MotorLetter({ cx, cy }: { cx: number; cy: number }) {
  const h = 1.25;
  return <polyline points={pts([cx - h, cy + h], [cx - h, cy - h], [cx, cy], [cx + h, cy - h], [cx + h, cy + h])} />;
}

/** Elektromotor (10M × 10M): Kreis 6M mit "M", Welle 3M × 1M nach rechts, auf Höhe der Pumpenwelle. */
export function ElectricMotor() {
  return (
    <>
      <circle cx={3} cy={CY} r={3} />
      <MotorLetter cx={3} cy={CY} />
      <rect x={6} y={CY - 0.5} width={3} height={1} />
    </>
  );
}

/**
 * Elektromotor mit Wellenkupplung (8.4.50) vor der Pumpe: Motorwelle bis
 * x = 9, zwei Kupplungsscheiben 2M hoch im Abstand 1M, die Pumpenwelle
 * beginnt bei MOTOR_OFFSET.
 */
function CoupledMotor() {
  const k = MOTOR_OFFSET;
  return (
    <>
      <circle cx={3} cy={CY} r={3} />
      <MotorLetter cx={3} cy={CY} />
      <polyline points={pts([6, CY - 0.5], [k - 1, CY - 0.5])} />
      <polyline points={pts([6, CY + 0.5], [k - 1, CY + 0.5])} />
      <line x1={k - 1} y1={CY - 1} x2={k - 1} y2={CY + 1} />
      <line x1={k} y1={CY - 1} x2={k} y2={CY + 1} />
    </>
  );
}

/** Drehrichtungspfeil (9.4.4): Bogen um den Kreis auf der Seite gegenüber der Welle. */
function RotationArrow({ rotation }: { rotation: RotaryConfig['rotation'] }) {
  if (!rotation || rotation === 'none') return null;
  const r = 3.9;
  const span = (38 * Math.PI) / 180;
  const at = (a: number): P => [CX + r * Math.cos(a), CY + r * Math.sin(a)];
  // Tangente am Bogenende für die Pfeilspitze
  const head = (a: number, dir: 1 | -1) => {
    const tip = at(a);
    const from: P = [tip[0] + Math.sin(a) * dir, tip[1] - Math.cos(a) * dir];
    return <ArrowHead from={from} to={tip} length={0.9} />;
  };
  const [x1, y1] = at(-span);
  const [x2, y2] = at(span);
  return (
    <>
      <path d={`M${x1} ${y1} A${r} ${r} 0 0 1 ${x2} ${y2}`} fill="none" />
      {(rotation === 'cw' || rotation === 'both') && head(span, 1)}
      {(rotation === 'ccw' || rotation === 'both') && head(-span, -1)}
    </>
  );
}

export function RotarySymbol({ config }: { config: RotaryConfig }) {
  const pump = config.kind === 'pump';
  const filled = config.medium === 'hydraulic';
  const bottom = !(pump && config.medium === 'pneumatic');
  const two = config.directions === 2;
  // Pumpe: Spitze am Kreis, zeigt nach außen; Motor: Grundseite am Kreis, Spitze nach innen.
  const triangles = pump
    ? [<Triangle key="t" tip={[CX, CY - 3]} dir={[0, -1]} filled={filled} />, two && <Triangle key="b" tip={[CX, CY + 3]} dir={[0, 1]} filled={filled} />]
    : [
        <Triangle key="t" tip={[CX, CY - CHORD + TRI_H]} dir={[0, 1]} filled={filled} />,
        two && <Triangle key="b" tip={[CX, CY + CHORD - TRI_H]} dir={[0, -1]} filled={filled} />,
      ];
  const d = 3 * Math.SQRT1_2;
  return (
    <>
      {config.electricMotor && <CoupledMotor />}
      <g transform={config.electricMotor ? `translate(${MOTOR_OFFSET} 0)` : undefined}>
        <circle cx={CX} cy={CY} r={3} />
        <rect x={0} y={CY - 0.5} width={3} height={1} />
        <line x1={CX} y1={0} x2={CX} y2={CY - 3} />
        {bottom && <line x1={CX} y1={CY + 3} x2={CX} y2={10} />}
        {triangles}
        {/* Verstellbarkeit (8.6.8): Pfeil unter 45° über ein 9M-Quadrat */}
        {config.displacement === 'variable' && <FlowArrow from={[CX - 4, CY + 4]} to={[CX + 4, CY - 4]} />}
        {/* Leckanschluss: gestrichelt unter 45° aus dem Kreis zur rechten unteren Ecke */}
        {config.drain && <polyline points={pts([CX + d, CY + d], [10, 9], [10, 10])} strokeDasharray={DASH} />}
        <RotationArrow rotation={config.rotation} />
      </g>
    </>
  );
}
