/**
 * Grundelemente der Schaltzeichen nach DIN ISO 1219-1, im Modul M.
 * Aus ihnen setzen sich die festen Symbole (symbols.tsx) und die
 * konfigurierbaren (valveSymbol.tsx, cylinderSymbol.tsx) zusammen.
 */

export type P = readonly [number, number];

export const pts = (...points: P[]) => points.map(([x, y]) => `${x},${y}`).join(' ');

/** Strichmuster für Steuer- und Leckageleitungen, in M. */
export const DASH = '0.6 0.4';

/** Gleichseitiges Dreieck (Seitenlänge `side`), Spitze bei `tip`, zeigt in Richtung `dir`. */
export function Triangle({ tip, dir, side = 2, filled }: { tip: P; dir: P; side?: number; filled: boolean }) {
  const [x, y] = tip;
  const len = Math.hypot(dir[0], dir[1]);
  const ux = dir[0] / len;
  const uy = dir[1] / len;
  const h = (side * Math.sqrt(3)) / 2;
  const bx = x - ux * h;
  const by = y - uy * h;
  const s = side / 2;
  return (
    <polygon
      points={pts([x, y], [bx - uy * s, by + ux * s], [bx + uy * s, by - ux * s])}
      className={filled ? 'fill' : undefined}
    />
  );
}

/** Pfeilspitze bei `to`, aus Richtung `from`; 30° Öffnungswinkel. */
export function ArrowHead({ from, to, length = 1 }: { from: P; to: P; length?: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const half = Math.tan(Math.PI / 12) * length;
  const bx = x2 - ux * length;
  const by = y2 - uy * length;
  return <polygon points={pts([x2, y2], [bx - uy * half, by + ux * half], [bx + uy * half, by - ux * half])} className="fill" />;
}

/** Durchflusspfeil von `from` nach `to`, Spitze 1M lang. Auch als Verstellpfeil. */
export function FlowArrow({ from, to, length = 1 }: { from: P; to: P; length?: number }) {
  return (
    <>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} />
      <ArrowHead from={from} to={to} length={length} />
    </>
  );
}

/** Feder als Zickzack von `from` nach `to`, Ausschlag `amp` zu beiden Seiten. */
export function Spring({ from, to, amp = 1, peaks = 4 }: { from: P; to: P; amp?: number; peaks?: number }) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ux = (x2 - x1) / len;
  const uy = (y2 - y1) / len;
  const points: P[] = [from];
  for (let i = 0; i < peaks; i++) {
    const t = ((i + 0.5) / peaks) * len;
    const side = i % 2 === 0 ? -amp : amp;
    points.push([x1 + ux * t - uy * side, y1 + uy * t + ux * side]);
  }
  points.push(to);
  return <polyline points={pts(...points)} />;
}

/**
 * Rückschlagelement (8.4.2, 8.4.54): Kugel 1M Durchmesser im 90°-Sitz mit
 * 1M langen Schenkeln. `seat` zeigt von der Kugel zur Spitze des Sitzes;
 * frei durchströmt wird in Richtung vom Sitz zur Kugel.
 */
export function CheckElement({ ball: [x, y], seat: [dx, dy] }: { ball: P; seat: P }) {
  const vx = x + dx * Math.SQRT1_2;
  const vy = y + dy * Math.SQRT1_2;
  // Schenkel unter 45° zurück Richtung Kugel
  const arm = (sign: number): P => [vx - dx - sign * dy, vy - dy + sign * dx];
  return (
    <>
      <circle cx={x} cy={y} r={0.5} />
      <polyline points={pts(arm(1), [vx, vy], arm(-1))} />
    </>
  );
}

/** Spitze des Ventilsitzes, zum Anschließen der Leitung. */
export const seatTip = ([x, y]: P, [dx, dy]: P): P => [x + dx * Math.SQRT1_2, y + dy * Math.SQRT1_2];

/** Drosselstelle in einer senkrechten Leitung bei x: zwei Bögen 3M hoch um cy (Beispiel 6.1.4.1). */
export function Throttle({ x, cy }: { x: number; cy: number }) {
  return (
    <>
      <path d={`M${x - 1.1} ${cy - 1.5} Q${x + 0.2} ${cy} ${x - 1.1} ${cy + 1.5}`} />
      <path d={`M${x + 1.1} ${cy - 1.5} Q${x - 0.2} ${cy} ${x + 1.1} ${cy + 1.5}`} />
    </>
  );
}

/** Verbindungspunkt zweier Leitungen. */
export function Junction({ at: [x, y] }: { at: P }) {
  return <circle cx={x} cy={y} r={0.2} className="fill" />;
}
