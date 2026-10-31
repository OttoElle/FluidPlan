import { flowsThrough, instrumentCenter, type IndicatorConfig, type IndicatorType, type InstrumentConfig } from '../model/instruments.ts';
import { ArrowHead, FlowArrow, pts } from './symbolParts.tsx';

/**
 * Mess- und Anzeigegeräte nach DIN ISO 1219-1:2019, 6.4.3. Koordinaten in M.
 */

/** Messgerät-Zeiger (8.3.20) in einem Kreis 4M um (cx, cy). */
export function GaugeFace({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={2} />
      <FlowArrow from={[cx + 0.9, cy + 0.9]} to={[cx - 1.05, cy - 1.05]} />
    </>
  );
}

/**
 * Anzeige (6.4.3.1–6.4.3.3): Kasten 5M × 3M mit Anzeigepfeil links und
 * rechts dem Zeichen für optisch (Kreis mit Kreuz), digital (#) oder akustisch
 * (Lautsprecher). (x, y) ist die linke obere Ecke.
 */
export function IndicatorFace({ x, y, type }: { x: number; y: number; type: IndicatorType }) {
  const [cx, cy] = [x + 3.6, y + 1.5];
  const d = 0.75 * Math.SQRT1_2;
  return (
    <>
      <rect x={x} y={y} width={5} height={3} />
      <FlowArrow from={[x + 2.1, y + 2.4]} to={[x + 0.5, y + 0.6]} />
      {type === 'optical' && (
        <>
          <circle cx={cx} cy={cy} r={0.75} />
          <line x1={cx - d} y1={cy - d} x2={cx + d} y2={cy + d} />
          <line x1={cx - d} y1={cy + d} x2={cx + d} y2={cy - d} />
        </>
      )}
      {type === 'digital' && (
        <>
          <line x1={cx - 0.25} y1={cy - 0.6} x2={cx - 0.25} y2={cy + 0.6} />
          <line x1={cx + 0.25} y1={cy - 0.6} x2={cx + 0.25} y2={cy + 0.6} />
          <line x1={cx - 0.6} y1={cy - 0.25} x2={cx + 0.6} y2={cy - 0.25} />
          <line x1={cx - 0.6} y1={cy + 0.25} x2={cx + 0.6} y2={cy + 0.25} />
        </>
      )}
      {type === 'acoustic' && (
        <>
          <rect x={cx - 0.7} y={cy - 0.5} width={0.5} height={1} />
          <polygon points={pts([cx - 0.2, cy - 0.5], [cx + 0.6, cy - 1.1], [cx + 0.6, cy + 1.1], [cx - 0.2, cy + 0.5])} />
        </>
      )}
    </>
  );
}

export function IndicatorSymbol({ config }: { config: IndicatorConfig }) {
  return <IndicatorFace x={0} y={0} type={config.type} />;
}

/**
 * Messgeräte, Kreis 4M:
 * - Druckmessgerät (6.4.3.4) und Differenzdruckmessgerät (6.4.3.5, Leitung durchgehend): Zeiger
 * - Thermometer (6.4.3.7): Fühler senkrecht von oben mit Kugel
 * - Volumenstromanzeige (6.4.3.12) und -messgerät (6.4.3.13, Leitung durchgehend): zwei Bögen
 * - Niveauanzeige (6.4.3.9): Flüssigkeitsspiegel mit Schauglas
 * - Drehzahlmessgerät (6.4.3.15): innerer Kreis mit Drehpfeil, Welle links
 */
export function InstrumentSymbol({ config }: { config: InstrumentConfig }) {
  const [cx, cy] = instrumentCenter(config);
  const q = config.quantity;
  const ports = q === 'speed' ? null : flowsThrough(q) ? (
    <>
      <line x1={cx} y1={0} x2={cx} y2={cy - 2} />
      <line x1={cx} y1={cy + 2} x2={cx} y2={cy + 4} />
    </>
  ) : (
    <line x1={cx} y1={cy + 2} x2={cx} y2={cy + 4} />
  );
  let face;
  switch (q) {
    case 'pressure':
    case 'differential':
      face = <GaugeFace cx={cx} cy={cy} />;
      break;
    case 'temperature':
      face = (
        <>
          <circle cx={cx} cy={cy} r={2} />
          <line x1={cx} y1={cy - 1.5} x2={cx} y2={cy + 1.25} />
          <circle cx={cx} cy={cy + 1.25} r={0.3} className="fill" />
        </>
      );
      break;
    case 'flow-indicator':
    case 'flow-meter':
      face = (
        <>
          <circle cx={cx} cy={cy} r={2} />
          <path d={`M${cx - 1.2} ${cy - 1.6} Q${cx - 0.1} ${cy} ${cx - 1.2} ${cy + 1.6}`} />
          <path d={`M${cx + 1.2} ${cy - 1.6} Q${cx + 0.1} ${cy} ${cx + 1.2} ${cy + 1.6}`} />
        </>
      );
      break;
    case 'level':
      face = (
        <>
          <circle cx={cx} cy={cy} r={2} />
          <line x1={cx - 2} y1={cy} x2={cx + 2} y2={cy} />
          <path d={`M${cx - 0.7} ${cy - 0.3} Q${cx} ${cy - 1.05} ${cx + 0.7} ${cy - 0.3} Q${cx} ${cy + 0.15} ${cx - 0.7} ${cy - 0.3}`} />
          <line x1={cx} y1={cy - 0.68} x2={cx} y2={cy - 1.35} />
        </>
      );
      break;
    case 'speed':
      face = (
        <>
          <circle cx={cx} cy={cy} r={2} />
          <circle cx={cx} cy={cy} r={1.2} />
          <ArrowHead from={[cx - 0.6, cy - 1.2]} to={[cx + 0.75, cy - 0.95]} />
          <line x1={0} y1={cy - 0.5} x2={cx - 2} y2={cy - 0.5} />
          <line x1={0} y1={cy + 0.5} x2={cx - 2} y2={cy + 0.5} />
        </>
      );
      break;
  }
  return (
    <>
      {face}
      {ports}
    </>
  );
}
