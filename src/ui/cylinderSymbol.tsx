import {
  BODY_HEIGHT,
  BODY_WIDTH,
  CARRIAGE_HEIGHT,
  cylinderLayout,
  cylinderPorts,
  DIAPHRAGM_ROD,
  PISTON,
  PLUNGER,
  ROD,
  rodActuatorExtra,
  SWITCH_BOX,
  THROUGH_ROD,
  type CylinderConfig,
  type PistonType,
  type CylinderLayout,
} from '../model/cylinder.ts';
import { DRAWING_FONT } from '../model/lettering.ts';
import { FlowArrow, pts, type P } from './symbolParts.tsx';
import { ActuatorElement, SHAFT } from './valveSymbol.tsx';

/** Oberkante der 1M dicken Kolbenstange. */
const ROD_Y = 1.5;

/**
 * Zylinder aus seiner Konfiguration (siehe model/cylinder.ts) nach
 * DIN ISO 1219-1: Rahmen 9M × 4M, Kolben 2M breit (nicht gefüllt),
 * Kolbenstange 1M dick, Feder als Zickzack über die volle Rahmenhöhe,
 * Dämpfung als Zapfen 0,5M × 2M am Kolben, Verstellbarkeit als schräger
 * Pfeil durch den Rahmen. Plunger- und Teleskopzylinder wie die Beispiele
 * 6.3.6–6.3.8 mit 5M hohem Rahmen.
 */
export function CylinderSymbol({ config }: { config: CylinderConfig }) {
  const l = cylinderLayout(config);
  return (
    <>
      <g transform={l.top ? `translate(0 ${l.top})` : undefined}>
        {config.design === 'piston' ? (
          <PistonCylinder config={config} l={l} />
        ) : config.design === 'diaphragm' ? (
          <DiaphragmCylinder config={config} l={l} />
        ) : config.design === 'plunger' ? (
          <PlungerCylinder l={l} />
        ) : config.action === 'single' ? (
          <TelescopicSingle l={l} />
        ) : (
          <TelescopicDouble l={l} />
        )}
        <Extras config={config} l={l} />
      </g>
      {l.ports.map((p) => (
        <line
          key={p.id}
          x1={p.x}
          // Anschluss C kommt aus der ersten Teleskopstufe (Unterkante 4M), die übrigen aus dem Rahmen.
          y1={l.top + (p.id === 'C' ? 4 : l.bodyHeight)}
          x2={p.x}
          y2={l.height}
        />
      ))}
    </>
  );
}

/**
 * Endschalter (Beispiele 6.3.11 und 6.3.13): Kasten 3M (8.4.7) mit
 * Diagonale, "G" und Schließer, links mit der rechten unteren Ecke an der
 * linken oberen Rahmenecke (gespiegelt), rechts mit der linken unteren Ecke
 * an der rechten oberen Rahmenecke. Entlüftung ohne Anschluss (6.3.5):
 * offenes V 1M breit unter dem Raum ohne Anschluss.
 */
function Extras({ config, l }: { config: CylinderConfig; l: CylinderLayout }) {
  const bodyEnd = l.bodyX + BODY_WIDTH;
  const { a } = cylinderPorts(config);
  const ventX = a ? bodyEnd - 1 : l.bodyX;
  const sw = config.limitSwitch;
  return (
    <>
      {(sw === 'left' || sw === 'both') && <SwitchBox x={l.bodyX - SWITCH_BOX} y={-SWITCH_BOX} mirrored />}
      {(sw === 'right' || sw === 'both') && <SwitchBox x={bodyEnd} y={-SWITCH_BOX} />}
      {config.vent && <polyline points={pts([ventX, BODY_HEIGHT], [ventX + 0.5, BODY_HEIGHT + 1.1], [ventX + 1, BODY_HEIGHT])} />}
    </>
  );
}

function SwitchBox({ x, y, mirrored = false }: { x: number; y: number; mirrored?: boolean }) {
  const s = SWITCH_BOX;
  const m = (dx: number) => (mirrored ? x + s - dx : x + dx);
  const p = (dx: number, dy: number): P => [m(dx), y + dy];
  return (
    <>
      <rect x={x} y={y} width={s} height={s} />
      <line x1={m(0)} y1={y} x2={m(s)} y2={y + s} />
      <text x={m(0.85)} y={y + 2.2} className="fill" stroke="none" fontSize={1.5} fontFamily={DRAWING_FONT} textAnchor="middle" dominantBaseline="central">
        G
      </text>
      <polyline points={pts(p(1.2, 0.85), p(1.7, 0.85), p(2.2, 0.5))} />
      <line x1={m(2.25)} y1={y + 0.85} x2={m(2.7)} y2={y + 0.85} />
    </>
  );
}

function PistonCylinder({ config, l }: { config: CylinderConfig; l: CylinderLayout }) {
  const { bodyX: bx, pistonX: px } = l;
  const bodyEnd = bx + BODY_WIDTH;
  const through = config.rod === 'through';
  const rodless = config.rod === 'none';
  const actuator = config.rodActuator ?? 'none';
  const rodEnd = px + PISTON + (through ? THROUGH_ROD : ROD);
  const zigzag = (from: number, to: number) => {
    const points: [number, number][] = [];
    for (let i = 0; i <= 6; i++) points.push([from + ((to - from) * i) / 6, i % 2 === 0 ? BODY_HEIGHT : 0]);
    return <polyline points={pts(...points)} />;
  };
  return (
    <>
      {/* Rahmen; die Wand ist dort offen, wo die Kolbenstange austritt (Beispiele 6.3.1/6.3.2) */}
      {rodless ? (
        <rect x={bx} y={0} width={BODY_WIDTH} height={BODY_HEIGHT} />
      ) : through ? (
        <>
          <polyline points={pts([bodyEnd, ROD_Y], [bodyEnd, 0], [bx, 0], [bx, ROD_Y])} />
          <polyline points={pts([bx, ROD_Y + 1], [bx, BODY_HEIGHT], [bodyEnd, BODY_HEIGHT], [bodyEnd, ROD_Y + 1])} />
        </>
      ) : (
        <polyline points={pts([bodyEnd, ROD_Y], [bodyEnd, 0], [bx, 0], [bx, BODY_HEIGHT], [bodyEnd, BODY_HEIGHT], [bodyEnd, ROD_Y + 1])} />
      )}
      <rect x={px} y={0} width={PISTON} height={BODY_HEIGHT} />
      <PistonParts type={config.pistonType ?? 'plain'} px={px} />
      {rodless ? null : actuator === 'none' ? (
        <RodWithDetent config={config} l={l} from={px + PISTON} to={rodEnd} />
      ) : (
        <>
          {/* Die letzten 3M der Stange sind der Schaft des Betätigungselements (8.5) */}
          <polyline points={pts([rodEnd - SHAFT, ROD_Y], [px + PISTON, ROD_Y], [px + PISTON, ROD_Y + 1], [rodEnd - SHAFT, ROD_Y + 1])} />
          {/* nach unten geklappt, damit Hebel und Pedal nicht über den Rahmen hinausragen */}
          <g transform={`translate(${rodEnd - SHAFT} ${ROD_Y + 0.5}) scale(1 -1)`}>
            <ActuatorElement kind={actuator} medium="hydraulic" reach={SHAFT + rodActuatorExtra(actuator)} />
          </g>
        </>
      )}
      {through && <rect x={px - THROUGH_ROD} y={ROD_Y} width={THROUGH_ROD} height={1} />}

      {config.spring === 'rod' && zigzag(px + PISTON, bodyEnd)}
      {config.spring === 'piston' && zigzag(bx, px)}

      <Cushions config={config} left={px} right={px + PISTON} />
    </>
  );
}

/** Raste (6.3.12): Abstand des Rastbolzens hinter dem Rahmen. */
const LATCH = 2.25;

/**
 * Kolbenstange, mit Raste (Beispiel 6.3.12): je Endlage eine V-Kerbe 0,75M
 * breit und 0,7M tief in der Oberkante der Stange, die in dieser Endlage
 * genau unter dem Rastbolzen (1M langer Strich über der Stange, 2,25M hinter
 * dem Rahmen) liegt.
 */
function RodWithDetent({ config, l, from, to }: { config: CylinderConfig; l: CylinderLayout; from: number; to: number }) {
  const detent = config.detent ?? 'none';
  // Hohlkolbenstange (wie FluidDraw): nur die beiden Längskanten, Stangenende offen
  if (config.hollowRod)
    return (
      <>
        <line x1={from} y1={ROD_Y} x2={to} y2={ROD_Y} />
        <line x1={from} y1={ROD_Y + 1} x2={to} y2={ROD_Y + 1} />
      </>
    );
  if (detent === 'none') return <rect x={from} y={ROD_Y} width={to - from} height={1} />;
  const latch = l.bodyX + BODY_WIDTH + LATCH;
  const [min, max] = l.travel;
  // Kerben in Stangenkoordinaten (ab Rahmenboden in der jeweiligen Endlage), dann in der gezeichneten Lage
  const offsets = [
    ...(detent === 'retracted' || detent === 'both' ? [latch - (l.bodyX + min)] : []),
    ...(detent === 'extended' || detent === 'both' ? [latch - (l.bodyX + max)] : []),
  ].sort((a, b) => a - b);
  const top: P[] = [[from, ROD_Y]];
  for (const o of offsets) {
    const x = l.pistonX + o;
    top.push([x - 0.375, ROD_Y], [x, ROD_Y + 0.7], [x + 0.375, ROD_Y]);
  }
  top.push([to, ROD_Y]);
  return (
    <>
      <polygon points={pts(...top, [to, ROD_Y + 1], [from, ROD_Y + 1])} />
      <line x1={latch} y1={ROD_Y - 1.5} x2={latch} y2={ROD_Y - 0.45} />
    </>
  );
}

/** Dämpfungszapfen 0,5M × 2M links bzw. rechts am Kolben, einstellbar mit schrägem Pfeil. */
function Cushions({ config, left, right }: { config: CylinderConfig; left: number; right: number }) {
  return (
    <>
      {config.cushion.piston !== 'none' && <rect x={left - 0.5} y={1} width={0.5} height={2} />}
      {config.cushion.rod !== 'none' && <rect x={right} y={1} width={0.5} height={2} />}
      {config.cushion.piston === 'adjustable' && <FlowArrow from={[left - 1.4, 4.5]} to={[left + 0.4, -0.5]} />}
      {config.cushion.rod === 'adjustable' && <FlowArrow from={[right - 0.4, 4.5]} to={[right + 1.4, -0.5]} />}
    </>
  );
}

/** Gefüllter Magnet "[" im Kolben (Beispiel 6.3.11). */
const pistonMagnet = (px: number, y0 = 0.7, y1 = 3.3) =>
  pts([px + 0.45, y0], [px + 1.6, y0], [px + 1.6, y0 + 0.5], [px + 1, y0 + 0.5], [px + 1, y1 - 0.5], [px + 1.6, y1 - 0.5], [px + 1.6, y1], [px + 0.45, y1]);

/**
 * Kolbenarten (wie in FluidDraw): Magnet zur Positionserfassung "[" im Kolben
 * (6.3.11); magnetische Kraftübertragung mit zusätzlichen Magneten oben und
 * unten; Schlitten als Steg 4M × 0,75M über dem Rahmen, mit dem Kolben
 * verbunden (bandgeführt, 6.3.9); magnetisch gekoppelter Schlitten 4M × 2M
 * mit gefülltem Magnet "⊓" (6.3.11).
 */
function PistonParts({ type, px }: { type: PistonType; px: number }) {
  const magnet = type !== 'plain' && type !== 'slide';
  const cx = px - 1;
  const ch = CARRIAGE_HEIGHT;
  return (
    <>
      {magnet && <polygon className="fill" points={type === 'magnetic-transmission' ? pistonMagnet(px, 1.05, 2.95) : pistonMagnet(px)} />}
      {type === 'magnetic-transmission' &&
        [0.25, 3.25].map((y) => (
          <g key={y}>
            <polygon className="fill" points={pts([px + 0.3, y], [px + 0.85, y], [px + 0.85, y + 0.15], [px + 0.5, y + 0.15], [px + 0.5, y + 0.35], [px + 0.85, y + 0.35], [px + 0.85, y + 0.5], [px + 0.3, y + 0.5])} />
            <polygon className="fill" points={pts([px + 1.7, y], [px + 1.15, y], [px + 1.15, y + 0.15], [px + 1.5, y + 0.15], [px + 1.5, y + 0.35], [px + 1.15, y + 0.35], [px + 1.15, y + 0.5], [px + 1.7, y + 0.5])} />
          </g>
        ))}
      {(type === 'slide' || type === 'slide-magnet') && (
        <>
          <polyline points={pts([px, 0], [px, -1], [px + PISTON, -1], [px + PISTON, 0])} />
          <rect x={cx} y={-1.75} width={4} height={0.75} />
        </>
      )}
      {type === 'coupled-slide' && (
        <>
          <rect x={cx} y={-ch} width={4} height={ch} />
          <polygon
            className="fill"
            points={pts([cx + 0.7, -ch + 1.6], [cx + 0.7, -ch + 0.45], [cx + 3.3, -ch + 0.45], [cx + 3.3, -ch + 1.6], [cx + 2.75, -ch + 1.6], [cx + 2.75, -ch + 1], [cx + 1.25, -ch + 1], [cx + 1.25, -ch + 1.6])}
          />
        </>
      )}
    </>
  );
}

/**
 * Membranzylinder (Beispiele 6.3.4/6.3.5): Rahmen 9M × 4M, Membran als
 * senkrechte Sehne mit 1M nach links gewölbtem Bogen, Kolbenstange 1M dick ab
 * der Membran. Hubbegrenzung voreingestellt links vor dem Boden.
 */
function DiaphragmCylinder({ config, l }: { config: CylinderConfig; l: CylinderLayout }) {
  const { bodyX: bx, pistonX: px } = l;
  const bodyEnd = bx + BODY_WIDTH;
  const actuator = config.rodActuator ?? 'none';
  const rodStart = px + (config.cushion.rod !== 'none' ? 0.5 : 0);
  const rodEnd = px + DIAPHRAGM_ROD;
  const zigzag = (from: number, to: number) => {
    const points: [number, number][] = [];
    for (let i = 0; i <= 6; i++) points.push([from + ((to - from) * i) / 6, i % 2 === 0 ? BODY_HEIGHT : 0]);
    return <polyline points={pts(...points)} />;
  };
  return (
    <>
      <polyline points={pts([bodyEnd, ROD_Y], [bodyEnd, 0], [bx, 0], [bx, BODY_HEIGHT], [bodyEnd, BODY_HEIGHT], [bodyEnd, ROD_Y + 1])} />
      {/* Membran: Sehne und Bogen r = 2,5M (Pfeilhöhe 1M) */}
      <line x1={px} y1={0} x2={px} y2={BODY_HEIGHT} />
      <path d={`M${px} 0 A2.5 2.5 0 0 0 ${px} ${BODY_HEIGHT}`} />
      {actuator === 'none' ? (
        <rect x={rodStart} y={ROD_Y} width={rodEnd - rodStart} height={1} />
      ) : (
        <>
          <polyline points={pts([rodEnd - SHAFT, ROD_Y], [rodStart, ROD_Y], [rodStart, ROD_Y + 1], [rodEnd - SHAFT, ROD_Y + 1])} />
          <g transform={`translate(${rodEnd - SHAFT} ${ROD_Y + 0.5}) scale(1 -1)`}>
            <ActuatorElement kind={actuator} medium="hydraulic" reach={SHAFT + rodActuatorExtra(actuator)} />
          </g>
        </>
      )}
      {config.spring === 'piston' && zigzag(bx, px - 0.6)}
      {config.spring === 'rod' && zigzag(px + 0.6, bodyEnd)}
      <Cushions config={config} left={px - 1} right={px} />
      {config.strokeLimiter && (
        // Hubbegrenzung, voreingestellt (6.3.4): Anschlag mit Stange vor dem Boden und Einstellhebel
        <>
          <line x1={bx - 2.5} y1={0} x2={bx - 2.5} y2={2.5} />
          <line x1={bx - 2.5} y1={1.5} x2={bx} y2={1.5} />
          <line x1={bx - 2.5} y1={2} x2={bx} y2={2} />
          <line x1={bx - 0.95} y1={1.27} x2={bx - 3.85} y2={0.5} />
          <line x1={bx - 3.86} y1={-0.47} x2={bx - 4.24} y2={0.95} />
        </>
      )}
    </>
  );
}

/** Rahmen 9M × 5M, rechts offen zwischen `gapTop` und `gapBottom` für die austretende Stufe. */
function OpenFrame({ bx, gapTop = 1, gapBottom = 4 }: { bx: number; gapTop?: number; gapBottom?: number }) {
  const end = bx + BODY_WIDTH;
  return <polyline points={pts([end, gapTop], [end, 0], [bx, 0], [bx, 5], [end, 5], [end, gapBottom])} />;
}

/** Plungerzylinder (Beispiel 6.3.6): Plunger 9M × 3M, 1M Abstand zum Rahmen. */
function PlungerCylinder({ l }: { l: CylinderLayout }) {
  const x = l.bodyX + PLUNGER.start + l.extension[0];
  return (
    <>
      <OpenFrame bx={l.bodyX} />
      <rect x={x} y={1} width={PLUNGER.length} height={PLUNGER.thickness} />
    </>
  );
}

/** Teleskopzylinder einfachwirkend (Beispiel 6.3.7): Hülse 3M, innere Stange 1M, je 9M lang. */
function TelescopicSingle({ l }: { l: CylinderLayout }) {
  const bx = l.bodyX;
  const [e1, e2] = l.extension;
  const s1 = bx + 5 + e1;
  const end1 = s1 + 9;
  const s2 = bx + 9.5 + e2;
  return (
    <>
      <OpenFrame bx={bx} />
      <polyline points={pts([s1, 1], [end1, 1], [end1, 2])} />
      <polyline points={pts([s1, 4], [end1, 4], [end1, 3])} />
      <rect x={s2} y={2} width={9} height={1} />
    </>
  );
}

/** Teleskopzylinder doppeltwirkend (Beispiel 6.3.8): beide Stufen mit Kolbenbund. */
function TelescopicDouble({ l }: { l: CylinderLayout }) {
  const bx = l.bodyX;
  const [a, b, c, d] = [bx + 4, bx + 13, bx + 7, bx + 16];
  return (
    <>
      <OpenFrame bx={bx} />
      {/* Stufe 1 mit Bund am Rahmen */}
      <polyline points={pts([a, 0], [a, 1], [b, 1], [b, 2])} />
      <polyline points={pts([a, 5], [a, 4], [b, 4], [b, 3])} />
      {/* Stufe 2 mit Bund an Stufe 1 */}
      <polyline points={pts([c, 1], [c, 2], [d, 2], [d, 3], [c, 3], [c, 4])} />
    </>
  );
}
