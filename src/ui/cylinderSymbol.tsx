import {
  BODY_HEIGHT,
  BODY_WIDTH,
  cylinderLayout,
  PISTON,
  PLUNGER,
  ROD,
  THROUGH_ROD,
  type CylinderConfig,
  type CylinderLayout,
} from '../model/cylinder.ts';
import { FlowArrow, pts } from './symbolParts.tsx';

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
      {config.design === 'piston' ? (
        <PistonCylinder config={config} l={l} />
      ) : config.design === 'plunger' ? (
        <PlungerCylinder l={l} />
      ) : config.action === 'single' ? (
        <TelescopicSingle l={l} />
      ) : (
        <TelescopicDouble l={l} />
      )}
      {l.ports.map((p) => (
        <line
          key={p.id}
          x1={p.x}
          // Anschluss C kommt aus der ersten Teleskopstufe (Unterkante 4M), die übrigen aus dem Rahmen.
          y1={p.id === 'C' ? 4 : l.bodyHeight}
          x2={p.x}
          y2={l.height}
        />
      ))}
    </>
  );
}

function PistonCylinder({ config, l }: { config: CylinderConfig; l: CylinderLayout }) {
  const { bodyX: bx, pistonX: px } = l;
  const bodyEnd = bx + BODY_WIDTH;
  const through = config.rod === 'through';
  const rodEnd = px + PISTON + (through ? THROUGH_ROD : ROD);
  const zigzag = (from: number, to: number) => {
    const points: [number, number][] = [];
    for (let i = 0; i <= 6; i++) points.push([from + ((to - from) * i) / 6, i % 2 === 0 ? BODY_HEIGHT : 0]);
    return <polyline points={pts(...points)} />;
  };
  return (
    <>
      {/* Rahmen; die Wand ist dort offen, wo die Kolbenstange austritt (Beispiele 6.3.1/6.3.2) */}
      {through ? (
        <>
          <polyline points={pts([bodyEnd, ROD_Y], [bodyEnd, 0], [bx, 0], [bx, ROD_Y])} />
          <polyline points={pts([bx, ROD_Y + 1], [bx, BODY_HEIGHT], [bodyEnd, BODY_HEIGHT], [bodyEnd, ROD_Y + 1])} />
        </>
      ) : (
        <polyline points={pts([bodyEnd, ROD_Y], [bodyEnd, 0], [bx, 0], [bx, BODY_HEIGHT], [bodyEnd, BODY_HEIGHT], [bodyEnd, ROD_Y + 1])} />
      )}
      <rect x={px} y={0} width={PISTON} height={BODY_HEIGHT} />
      <rect x={px + PISTON} y={ROD_Y} width={rodEnd - px - PISTON} height={1} />
      {through && <rect x={px - THROUGH_ROD} y={ROD_Y} width={THROUGH_ROD} height={1} />}

      {config.spring === 'rod' && zigzag(px + PISTON, bodyEnd)}
      {config.spring === 'piston' && zigzag(bx, px)}

      {config.cushion.piston !== 'none' && <rect x={px - 0.5} y={1} width={0.5} height={2} />}
      {config.cushion.rod !== 'none' && <rect x={px + PISTON} y={1} width={0.5} height={2} />}
      {config.cushion.piston === 'adjustable' && <FlowArrow from={[px - 1.4, 4.5]} to={[px + 0.4, -0.5]} />}
      {config.cushion.rod === 'adjustable' && <FlowArrow from={[px + 1.6, 4.5]} to={[px + 3.4, -0.5]} />}
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
