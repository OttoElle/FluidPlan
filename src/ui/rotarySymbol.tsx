import { MOTOR_OFFSET, type RotaryConfig } from '../model/rotary.ts';
import { DASH, FlowArrow, pts, Triangle } from './symbolParts.tsx';

/**
 * Pumpen, Kompressoren und Motoren aus ihrer Konfiguration (siehe
 * model/rotary.ts), 10M × 10M: Kreis 6M (8.4.4) mit der Mitte bei (6, 5),
 * Antriebswelle als Rechteck 3M × 1M nach links, Anschlussleitungen 2M lang
 * oben und unten (Beispiele 6.2), Dreieck 2M Seitenlänge.
 */

export const CX = 6;
export const CY = 5;
/** Sehne der Länge 2M im Kreis r = 3M liegt 2√2 M von der Mitte entfernt. */
const CHORD = 2 * Math.SQRT2;
const TRI_H = Math.sqrt(3);

/** Elektromotor (10M × 10M): Kreis 6M mit "M", Welle 3M × 1M nach rechts, auf Höhe der Pumpenwelle. */
export function ElectricMotor() {
  return (
    <>
      <circle cx={3} cy={CY} r={3} />
      <text x={3} y={CY} className="fill" stroke="none" fontSize={2.6} textAnchor="middle" dominantBaseline="central">
        M
      </text>
      <rect x={6} y={CY - 0.5} width={3} height={1} />
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
      {config.electricMotor && <ElectricMotor />}
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
      </g>
    </>
  );
}
