import { BODY_HEIGHT, BODY_WIDTH, cylinderLayout, PISTON, ROD_OUT, type CylinderConfig } from '../model/cylinder.ts';
import { FlowArrow, pts } from './symbolParts.tsx';

/**
 * Zylinder aus seiner Konfiguration (siehe model/cylinder.ts), eingefahren,
 * nach DIN ISO 1219-1: Rahmen 9M × 4M, Kolben 2M breit (nicht gefüllt),
 * Kolbenstange 1M dick und 3M herausragend, Feder als Zickzack über die volle
 * Rahmenhöhe, Dämpfung als Zapfen 0,5M × 2M am Kolben, Verstellbarkeit als
 * schräger Pfeil durch den Rahmen.
 */
export function CylinderSymbol({ config }: { config: CylinderConfig }) {
  const l = cylinderLayout(config);
  const { bodyX: bx, pistonX: px } = l;
  const bodyEnd = bx + BODY_WIDTH;
  const rodEnd = bodyEnd + ROD_OUT;
  const zigzag = (from: number, to: number) => {
    const points: [number, number][] = [];
    for (let i = 0; i <= 6; i++) points.push([from + ((to - from) * i) / 6, i % 2 === 0 ? BODY_HEIGHT : 0]);
    return <polyline points={pts(...points)} />;
  };
  return (
    <>
      <rect x={bx} y={0} width={BODY_WIDTH} height={BODY_HEIGHT} />
      <rect x={px} y={0} width={PISTON} height={BODY_HEIGHT} />
      <rect x={px + PISTON} y={1.5} width={rodEnd - px - PISTON} height={1} />
      {config.rod === 'through' && <rect x={bx - ROD_OUT} y={1.5} width={px - bx + ROD_OUT} height={1} />}

      {config.spring === 'rod' && zigzag(px + PISTON, bodyEnd)}
      {config.spring === 'piston' && zigzag(bx, px)}

      {config.cushion.piston !== 'none' && <rect x={px - 0.5} y={1} width={0.5} height={2} />}
      {config.cushion.rod !== 'none' && <rect x={px + PISTON} y={1} width={0.5} height={2} />}
      {config.cushion.piston === 'adjustable' && <FlowArrow from={[px - 1.4, 4.5]} to={[px + 0.4, -0.5]} />}
      {config.cushion.rod === 'adjustable' && <FlowArrow from={[px + 1.6, 4.5]} to={[px + 3.4, -0.5]} />}

      {l.hasA && <line x1={bx + 0.5} y1={BODY_HEIGHT} x2={bx + 0.5} y2={l.height} />}
      {l.hasB && <line x1={bx + 8.5} y1={BODY_HEIGHT} x2={bx + 8.5} y2={l.height} />}
    </>
  );
}
