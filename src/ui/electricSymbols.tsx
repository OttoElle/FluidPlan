import {
  contactLayout,
  railLayout,
  type ContactTable,
  type ElectricCoilConfig,
  type ElectricContactConfig,
  type ElectricLampConfig,
  type ElectricRailConfig,
  type ElectricSensorConfig,
  type Sensing,
} from '../model/electric.ts';
import { MODULE } from '../model/library.ts';
import type { Point } from '../model/types.ts';
import { GrafcetText } from './grafcetSymbols.tsx';
import { pts } from './symbolParts.tsx';

/**
 * Schaltzeichen für Stromlaufpläne nach DIN EN 60617. Koordinaten in M wie
 * alle Symbole (siehe symbols.tsx); Lagen und Anschlüsse in model/electric.ts.
 */

const LINE_WIDTH = 0.125;
/** Wirkverbindung (02-12-01): gestrichelt. */
const LINK_DASH = '0.5 0.3';
/** y der Kontaktmitte, an der Steller und Verzögerung angreifen. */
const MID = 2;

/** Rhombus „Betätigung durch Annähern“ (02-13-06) mit Zeichen für die Art davor; rechtes Ende bei x = 2.4. */
function Proximity({ sensing, y = MID }: { sensing: Sensing; y?: number }) {
  const cx = 1.8;
  return (
    <>
      {sensing === 'magnetic' && <rect x={0.3} y={y - 0.4} width={0.6} height={0.8} className="fill" />}
      {sensing === 'capacitive' && (
        <>
          <line x1={0.45} y1={y - 0.5} x2={0.45} y2={y + 0.5} />
          <line x1={0.75} y1={y - 0.5} x2={0.75} y2={y + 0.5} />
          <line x1={0.1} y1={y} x2={0.45} y2={y} />
          <line x1={0.75} y1={y} x2={1.2} y2={y} />
        </>
      )}
      {sensing === 'inductive' && (
        <path d={`M 0.1 ${y} a 0.18 0.18 0 0 1 0.36 0 a 0.18 0.18 0 0 1 0.36 0 a 0.18 0.18 0 0 1 0.36 0`} />
      )}
      <polygon points={pts([cx - 0.6, y], [cx, y - 0.6], [cx + 0.6, y], [cx, y + 0.6])} />
      <line x1={cx} y1={y - 0.6} x2={cx} y2={y + 0.6} />
    </>
  );
}

/** Steller links der Wirkverbindung; gibt zurück, wo die Wirkverbindung beginnt. */
function Actuator({ config }: { config: ElectricContactConfig }): { node: React.ReactNode; start: number } {
  const y1 = MID - 0.5;
  const y2 = MID + 0.5;
  switch (config.actuation) {
    case 'manual': // 02-13-01
      return { node: <line x1={1.4} y1={y1} x2={1.4} y2={y2} />, start: 1.4 };
    case 'push': // 02-13-05
      return { node: <polyline points={pts([1.9, y1], [1.4, y1], [1.4, y2], [1.9, y2])} />, start: 1.4 };
    case 'pull': // 02-13-03
      return { node: <polyline points={pts([1.4, y1], [1.9, y1], [1.9, y2], [1.4, y2])} />, start: 1.9 };
    case 'turn': // 02-13-04
      return { node: <polyline points={pts([1.9, y1], [1.4, y1], [1.4, y2], [0.9, y2])} />, start: 1.4 };
    case 'roller': // 02-13-15
      return { node: <circle cx={1.4} cy={MID} r={0.3} />, start: 1.7 };
    case 'proximity':
      return { node: <Proximity sensing={config.sensing} />, start: 2.4 };
    default:
      return { node: null, start: 0 };
  }
}

/**
 * Verzögerte Wirkung (02-12-05/06, Fallschirm) links am Kontakt: verzögert ist
 * die Bewegung vom Bogen zu seinem Mittelpunkt. `dir` = +1 für Bewegung nach
 * rechts, -1 nach links.
 */
function Delay({ x, dir }: { x: number; dir: 1 | -1 }) {
  const arcX = x - 1.6;
  const r = 0.5;
  return (
    <>
      <line x1={arcX} y1={MID - 0.15} x2={x} y2={MID - 0.15} />
      <line x1={arcX} y1={MID + 0.15} x2={x} y2={MID + 0.15} />
      {dir > 0 ? (
        // Bogen offen nach rechts, Linien aus dem Mittelpunkt (Form 1).
        <path d={`M ${arcX} ${MID - r} A ${r} ${r} 0 0 0 ${arcX} ${MID + r}`} />
      ) : (
        // Bogen offen nach links, Linien am Scheitel (Form 2).
        <path d={`M ${arcX - r} ${MID - r} A ${r} ${r} 0 0 1 ${arcX - r} ${MID + r}`} />
      )}
    </>
  );
}

/** Schließer, Öffner, Wechsler mit Steller, Raste, Verzögerung und Kennzeichen „betätigt“. */
export function ContactSymbol({ config }: { config: ElectricContactConfig }) {
  const l = contactLayout(config);
  const ax = l.axis;
  const lines: React.ReactNode[] = [
    <line key="top" x1={ax} y1={0} x2={ax} y2={1.4} />,
    <line key="bottom" x1={ax} y1={3} x2={ax} y2={4} />,
  ];
  let tip: [number, number];
  if (config.function === 'changeover') {
    lines.push(<polyline key="nc" points={pts([l.nc, 0], [l.nc, 1.4], [l.nc - 0.8, 1.4])} />);
    if (config.actuated) {
      lines.push(<line key="stub" x1={ax} y1={1.4} x2={ax + 0.6} y2={1.4} />);
      tip = [ax + 0.75, 1];
    } else tip = [ax + 1.5, 1];
  } else {
    // Geschlossen gezeichnet: Öffner in Ruhe, Schließer betätigt.
    const closed = (config.function === 'nc') !== config.actuated;
    if (closed) {
      lines.push(<line key="stub" x1={ax} y1={1.4} x2={ax + 0.8} y2={1.4} />);
      tip = [ax + 1, 1];
    } else tip = [ax - 1, 1];
  }
  const mid = { x: (ax + tip[0]) / 2, y: MID };
  lines.push(<line key="blade" x1={ax} y1={3} x2={tip[0]} y2={tip[1]} />);

  // Bewegungsrichtung der Kontaktzunge beim Betätigen: Schließer nach rechts, Öffner und Wechsler nach links.
  const onDir: 1 | -1 = config.function === 'no' ? 1 : -1;
  const actuator = Actuator({ config });
  const dashEnd = mid.x;
  const dashCenter = (actuator.start + dashEnd) / 2;
  // Positionsschalter: Dreieck an der Kontaktzunge (Endschalter).
  const blade = { x: tip[0] - ax, y: tip[1] - 3 };
  const len = Math.hypot(blade.x, blade.y);
  const u = { x: blade.x / len, y: blade.y / len };
  const normal = { x: u.y, y: -u.x };
  const side = normal.x < 0 ? 1 : -1;
  return (
    <>
      {lines}
      {actuator.node}
      {actuator.node && <line x1={actuator.start} y1={MID} x2={dashEnd} y2={MID} strokeDasharray={LINK_DASH} />}
      {actuator.node && config.detent && (
        // Raste (02-12-08).
        <polyline points={pts([dashCenter - 0.45, MID], [dashCenter, MID + 0.55], [dashCenter + 0.45, MID])} />
      )}
      {config.actuation === 'position' && (
        <polygon
          points={pts(
            [mid.x - u.x * 0.4, mid.y - u.y * 0.4],
            [mid.x + u.x * 0.4, mid.y + u.y * 0.4],
            [mid.x + normal.x * side * 0.6, mid.y + normal.y * side * 0.6],
          )}
        />
      )}
      {config.delay !== 'none' && <Delay x={mid.x} dir={(config.delay === 'on' ? onDir : -onDir) as 1 | -1} />}
      {config.actuated && (
        // Kennzeichen für „betätigter Zustand“.
        <>
          <line x1={l.arrow} y1={3.2} x2={l.arrow} y2={1} />
          <polyline points={pts([l.arrow - 0.35, 1.6], [l.arrow, 0.9], [l.arrow + 0.35, 1.6])} />
        </>
      )}
    </>
  );
}

/** Relaisspule (allgemein, mit Ansprech-/Rückfallverzögerung) bzw. Magnetspule eines Ventils. */
export function CoilSymbol({ config }: { config: ElectricCoilConfig }) {
  const x = 0.6;
  const y = 1.3;
  const w = 2.8;
  const h = 1.4;
  const s = 0.8;
  const v = config.variant;
  return (
    <>
      <line x1={2} y1={0} x2={2} y2={y} />
      <line x1={2} y1={y + h} x2={2} y2={4} />
      <rect x={x} y={y} width={w} height={h} />
      {(v === 'off-delay' || v === 'on-off-delay') && <rect x={x} y={y} width={s} height={h} className="fill" />}
      {(v === 'on-delay' || v === 'on-off-delay') && (
        <g className={v === 'on-off-delay' ? 'knockout' : undefined}>
          <line x1={x} y1={y} x2={x + s} y2={y + h} />
          <line x1={x} y1={y + h} x2={x + s} y2={y} />
        </g>
      )}
      {v !== 'relay' && v !== 'solenoid' && <line x1={x + s} y1={y} x2={x + s} y2={y + h} />}
      {v === 'solenoid' && <line x1={x} y1={y + h} x2={x + w} y2={y} />}
    </>
  );
}

/** Leuchtmelder (Lampe, allgemein), Farbe als Kennbuchstaben daneben. */
export function LampSymbol({ config }: { config: ElectricLampConfig }) {
  const d = 0.707;
  return (
    <>
      <line x1={2} y1={0} x2={2} y2={1} />
      <line x1={2} y1={3} x2={2} y2={4} />
      <circle cx={2} cy={2} r={1} />
      <line x1={2 - d} y1={2 - d} x2={2 + d} y2={2 + d} />
      <line x1={2 - d} y1={2 + d} x2={2 + d} y2={2 - d} />
      {config.color && <GrafcetText x={3.3} y={2.5} text={config.color} />}
    </>
  );
}

/** Näherungsschalter mit drei Leitern: Gehäuse, Annäherung und Schaltausgang. */
export function ElectricSensorSymbol({ config }: { config: ElectricSensorConfig }) {
  const lo = 3.5;
  const hi = 2.5;
  const [a, b] = config.output === 'no' ? [lo, hi] : [hi, lo];
  return (
    <>
      <line x1={2} y1={0} x2={2} y2={1} />
      <line x1={2} y1={5} x2={2} y2={6} />
      <line x1={5} y1={3} x2={6} y2={3} />
      <rect x={0} y={1} width={5} height={4} />
      <Proximity sensing={config.sensing} y={3} />
      <polyline points={pts([2.9, a], [3.3, a], [3.3, b], [4.1, b], [4.1, a], [4.5, a])} />
    </>
  );
}

/** Versorgungsschiene mit Abzweigpunkten, Beschriftung und Strompfadnummern. */
export function RailSymbol({ config }: { config: ElectricRailConfig }) {
  const l = railLayout(config);
  const plus = config.polarity === 'plus';
  const baseline = plus ? 1.4 : 1.6;
  return (
    <>
      <line x1={0} y1={l.lineY} x2={l.width} y2={l.lineY} />
      {config.text && <GrafcetText x={0} y={baseline} text={config.text} />}
      {plus &&
        config.numbering &&
        l.taps.map((x, i) => <GrafcetText key={`n${x}`} x={x} y={baseline} text={String(config.start + i)} anchor="middle" />)}
    </>
  );
}

/**
 * Verbindungspunkte der Schienen und Kontaktspiegel unter dem Strompfad einer Relaisspule: kleine Schaltzeichen
 * Schließer | Öffner, darunter die Strompfade der Kontakte.
 */
export function ContactTables({ tables, dots = [] }: { tables: ContactTable[]; dots?: Point[] }) {
  return (
    <>
      {dots.map((p) => (
        // Verbindungspunkte an belegten Abgängen der Versorgungsschienen.
        <circle key={`${p.x},${p.y}`} className="junction" cx={p.x} cy={p.y} r={2} />
      ))}
      {tables.map((t) => {
        const rows = Math.max(1, t.no.length, t.nc.length);
        const head = 2.4;
        const bottom = head + rows * 1.6 + 0.3;
        return (
          <g
            key={t.coilId}
            className="symbol contact-table"
            transform={`translate(${t.at.x} ${t.at.y}) scale(${MODULE})`}
            strokeWidth={LINE_WIDTH}
          >
            {/* Schließer */}
            <line x1={-1.1} y1={0} x2={-1.1} y2={0.6} />
            <line x1={-1.1} y1={1.4} x2={-1.6} y2={0.5} />
            <line x1={-1.1} y1={1.4} x2={-1.1} y2={2} />
            {/* Öffner */}
            <polyline points={pts([1.1, 0], [1.1, 0.6], [1.5, 0.6])} />
            <line x1={1.1} y1={1.4} x2={1.6} y2={0.5} />
            <line x1={1.1} y1={1.4} x2={1.1} y2={2} />
            <line x1={0} y1={0} x2={0} y2={bottom} />
            <line x1={-2.2} y1={head} x2={2.2} y2={head} />
            {t.no.map((n, i) => (
              <GrafcetText key={`no${i}`} x={-1.1} y={head + 1.4 + i * 1.6} text={n} anchor="middle" />
            ))}
            {t.nc.map((n, i) => (
              <GrafcetText key={`nc${i}`} x={1.1} y={head + 1.4 + i * 1.6} text={n} anchor="middle" />
            ))}
          </g>
        );
      })}
    </>
  );
}
