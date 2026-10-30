import { Fragment } from 'react';
import {
  ACTUATOR_WIDTH,
  actuatorRowY,
  FIELD,
  fieldWidth,
  FIELD_TOP,
  portInField,
  rolesOf,
  valveLayout,
  type Actuator,
  type DirectionalValveConfig,
  type ValvePath,
  type ValveRole,
} from '../model/valve.ts';
import { ArrowHead, DASH, Junction, pts, Spring, Triangle, type P } from './symbolParts.tsx';

const BOTTOM = FIELD_TOP + FIELD;

/**
 * Wegeventil aus seiner Konfiguration (siehe model/valve.ts):
 * Schaltfelder 4M × 4M nebeneinander, Durchflusswege und gesperrte Anschlüsse
 * je Feld, Anschlussleitungen (2M) an der Ruhestellung, Betätigungen außen
 * in Zeilen ab 1M über der Feld-Unterkante.
 */
export function ValveSymbol({ config }: { config: DirectionalValveConfig }) {
  const layout = valveLayout(config);
  const roles = rolesOf(config.ports);
  const fw = layout.fieldWidth;
  const restX = layout.fieldsX + config.rest * fw;
  const rightEdge = layout.fieldsX + config.positions.length * fw;
  return (
    <>
      {config.positions.map((pos, i) => (
        <Field key={i} x0={layout.fieldsX + i * fw} width={fw} config={config} paths={pos.paths} />
      ))}
      {roles.map((role) => {
        const { x, top } = portInField(config.ports, role);
        const [y1, y2] = top ? [0, FIELD_TOP] : [BOTTOM, layout.height];
        return <line key={role} x1={restX + x} y1={y1} x2={restX + x} y2={y2} />;
      })}
      <Side list={config.left} edge={layout.fieldsX} reach={layout.leftWidth} mirrored medium={config.medium} positions={config.positions.length} />
      <Side list={config.right} edge={rightEdge} reach={layout.rightWidth} mirrored={false} medium={config.medium} positions={config.positions.length} />
    </>
  );
}

function Side({
  list,
  edge,
  reach,
  mirrored,
  medium,
  positions,
}: {
  list: Actuator[];
  edge: number;
  reach: number;
  mirrored: boolean;
  medium: DirectionalValveConfig['medium'];
  positions: number;
}) {
  const top = actuatorRowY(list.length - 1);
  return (
    <>
      {/* Verbindungslinie, wenn Elemente über die Feld-Oberkante hinausreichen (9.2.8). */}
      {list.length > 0 && top < FIELD_TOP && <line x1={edge} y1={FIELD_TOP} x2={edge} y2={top} />}
      {list.map((a, row) => (
        <g key={a} transform={`translate(${edge} ${actuatorRowY(row)})${mirrored ? ' scale(-1 1)' : ''}`}>
          <ActuatorElement kind={a} medium={medium} reach={reach} positions={positions} />
        </g>
      ))}
    </>
  );
}

function Field({ x0, width, config, paths }: { x0: number; width: number; config: DirectionalValveConfig; paths: ValvePath[] }) {
  const at = (role: ValveRole): P => {
    const { x, top } = portInField(config.ports, role);
    return [x0 + x, top ? FIELD_TOP : BOTTOM];
  };
  const used = new Map<ValveRole, number>();
  for (const p of paths) {
    used.set(p.from, (used.get(p.from) ?? 0) + 1);
    used.set(p.to, (used.get(p.to) ?? 0) + 1);
  }
  return (
    <>
      <rect x={x0} y={FIELD_TOP} width={width} height={FIELD} />
      {paths.map((p, i) => {
        const a = at(p.from);
        const b = at(p.to);
        // Beide Anschlüsse auf derselben Seite: Weg als Bogen 1M ins Feld hinein.
        const inward = a[1] === FIELD_TOP ? 1 : -1;
        const route: P[] = a[1] === b[1] ? [a, [a[0], a[1] + inward], [b[0], b[1] + inward], b] : [a, b];
        return (
          <Fragment key={i}>
            <polyline points={pts(...route)} />
            {p.kind !== 'open' && <ArrowHead from={route.at(-2)!} to={b} />}
            {p.kind === 'both' && <ArrowHead from={route[1]!} to={a} />}
          </Fragment>
        );
      })}
      {[...used].filter(([, n]) => n > 1).map(([role]) => (
        <Junction key={role} at={at(role)} />
      ))}
      {rolesOf(config.ports)
        .filter((role) => !used.has(role))
        .map((role) => {
          // Gesperrter Anschluss: Stich 1M ins Feld, Querstrich 1M breit.
          const [x, y] = at(role);
          const end = y === FIELD_TOP ? y + 1 : y - 1;
          return <polyline key={role} points={pts([x, y], [x, end], [x - 0.5, end], [x + 0.5, end])} />;
        })}
    </>
  );
}

/** Welle der mechanischen Betätigungen: 3M lang, zwei Linien 1M auseinander (8.5.3). */
export const SHAFT = 3;

/**
 * Ein Betätigungselement nach DIN ISO 1219-1, Abschnitt 8.5. Gezeichnet für
 * die rechte Seite: x = 0 an der Feldkante, x wächst nach außen, y = 0 auf
 * der Mittellinie des Elements. Die linke Seite wird gespiegelt.
 * `reach` ist die Breite der Seite; bis dorthin läuft die Steuerleitung.
 */
export function ActuatorElement({
  kind,
  medium,
  reach,
  positions = 2,
}: {
  kind: Actuator;
  medium: DirectionalValveConfig['medium'];
  reach: number;
  /** Anzahl der Schaltstellungen, für die Kerben der Raste. */
  positions?: number;
}) {
  const shaft = (
    <>
      <line x1={0} y1={-0.5} x2={SHAFT} y2={-0.5} />
      <line x1={0} y1={0.5} x2={SHAFT} y2={0.5} />
    </>
  );
  const triangle = (
    <Triangle tip={[SHAFT - Math.sqrt(3), 0]} dir={[-1, 0]} filled={medium === 'hydraulic'} />
  );
  switch (kind) {
    case 'spring':
      // 2,5M breit, 2M hoch (8.5.23)
      return <Spring from={[0, 0]} to={[2.5, 0]} amp={1} peaks={6} />;
    case 'solenoid':
      // Wicklung: Rechteck 3M × 2M, Schräge 1M breit (8.5.30)
      return (
        <>
          <rect x={0} y={-1} width={3} height={2} />
          <line x1={2} y1={1} x2={1} y2={-1} />
        </>
      );
    case 'solenoid-pilot':
      // Elektrisch betätigte Vorsteuerung (6.1.1.14, 7.1.1.17): Magnet und Steuerdreieck in
      // einem gemeinsamen Rahmen 6M × 2M; hydraulisch mit externer Steuerölzufuhr nach unten.
      return (
        <>
          <rect x={0} y={-1} width={6} height={2} />
          {triangle}
          <line x1={5} y1={1} x2={4} y2={-1} />
          {medium === 'hydraulic' && <line x1={SHAFT} y1={1} x2={SHAFT} y2={3} strokeDasharray={DASH} />}
        </>
      );
    case 'pilot':
      // Direkte Druckbetätigung: Dreieck mit Grundseite 3M vor dem Feld (8.5.28/29)
      return (
        <>
          {triangle}
          <line x1={SHAFT} y1={0} x2={reach} y2={0} strokeDasharray={DASH} />
        </>
      );
    case 'push':
      // Drücken (8.5.10): Bügel 2M hoch am Wellenende, Schenkel 0,75M zum Ventil hin
      return (
        <>
          {shaft}
          <polyline points={pts([SHAFT - 0.75, -1], [SHAFT, -1], [SHAFT, 1], [SHAFT - 0.75, 1])} />
        </>
      );
    case 'pull':
      // Ziehen (8.5.11): Bügel 2M hoch, Schenkel 0,75M nach außen
      return (
        <>
          {shaft}
          <polyline points={pts([SHAFT + 0.75, -1], [SHAFT, -1], [SHAFT, 1], [SHAFT + 0.75, 1])} />
        </>
      );
    case 'push-pull':
      // Drücken und Ziehen (8.5.12): Steg 2M hoch, Querstriche 1,5M breit
      return (
        <>
          {shaft}
          <line x1={SHAFT} y1={-1} x2={SHAFT} y2={1} />
          <line x1={SHAFT - 0.75} y1={-1} x2={SHAFT + 0.75} y2={-1} />
          <line x1={SHAFT - 0.75} y1={1} x2={SHAFT + 0.75} y2={1} />
        </>
      );
    case 'override':
      // Handhilfsbetätigung (8.5.9): Querstrich 1,5M am Wellenende
      return (
        <>
          {shaft}
          <line x1={SHAFT} y1={-0.75} x2={SHAFT} y2={0.75} />
        </>
      );
    case 'lever':
      // Hebel mit Drehpunkt, 4M hoch (8.5.16)
      return (
        <>
          {shaft}
          <line x1={2.8} y1={0.5} x2={3.4} y2={-3} />
          <circle cx={3.47} cy={-3.4} r={0.4} />
        </>
      );
    case 'pedal':
    case 'treadle': {
      // Pedal (8.5.17): Trittplatte 2M lang, 15° gegen die Senkrechte geneigt, am unteren
      // Ende ein Fuß 0,5M nach außen. Die Wippe (8.5.18) hat den Fuß an beiden Enden.
      const top: P = [SHAFT - 0.27, -1];
      const bottom: P = [SHAFT + 0.27, 1];
      const foot = (at: P): P => [at[0] + 0.48, at[1] - 0.13];
      return (
        <>
          {shaft}
          <polyline points={pts(...(kind === 'treadle' ? [foot(top)] : []), top, bottom, foot(bottom))} />
        </>
      );
    }
    case 'plunger':
      // Stößel (8.5.20): Welle mit gerundetem Ende
      return (
        <>
          {shaft}
          <path d={`M${SHAFT} -0.5 A0.5 0.5 0 0 1 ${SHAFT} 0.5`} />
        </>
      );
    case 'roller':
      // Rolle 1,5M Durchmesser am Wellenende (8.5.22)
      return (
        <>
          <line x1={0} y1={-0.5} x2={SHAFT - 0.56} y2={-0.5} />
          <line x1={0} y1={0.5} x2={SHAFT - 0.56} y2={0.5} />
          <circle cx={SHAFT} cy={0} r={0.75} />
          <circle cx={SHAFT} cy={0} r={0.12} className="fill" />
        </>
      );
    case 'roller-lever': {
      // Rollenhebel (6.1.1.6): Welle bis zum Gelenk (8.5.21, Kreis 1M), Hebel unter 45°
      // nach außen oben, zwei Linien 0,5M auseinander, Rolle 1,5M (8.5.22) am Ende.
      const joint: P = [SHAFT + 0.5, 0];
      const roller: P = [joint[0] + 2.5, -2.5];
      const n = 0.25 / Math.SQRT2;
      const side = (s: number) => (
        <line
          x1={joint[0] + s * n + 0.5 / Math.SQRT2}
          y1={joint[1] + s * n - 0.5 / Math.SQRT2}
          x2={roller[0] + s * n - 0.75 / Math.SQRT2}
          y2={roller[1] + s * n + 0.75 / Math.SQRT2}
        />
      );
      return (
        <>
          <line x1={0} y1={-0.5} x2={SHAFT + 0.07} y2={-0.5} />
          <line x1={0} y1={0.5} x2={SHAFT + 0.07} y2={0.5} />
          <circle cx={joint[0]} cy={joint[1]} r={0.5} />
          {side(1)}
          {side(-1)}
          <circle cx={roller[0]} cy={roller[1]} r={0.75} />
          <circle cx={roller[0]} cy={roller[1]} r={0.12} className="fill" />
        </>
      );
    }
    case 'detent': {
      // Raste (8.5.6) in einem Betätigungsrahmen 3M × 2M (8.4.11): je Schaltstellung eine
      // Kerbe in der Oberkante (60°, Schenkel 0,75M), darüber die Arretierung (8.5.7).
      const notch = 0.75;
      const depth = notch * Math.cos(Math.PI / 6);
      const gap = 3 / positions;
      const xs = Array.from({ length: positions }, (_, i) => gap * (i + 0.5));
      const edge: P[] = [[0, -1]];
      for (const x of xs) edge.push([x - notch / 2, -1], [x, -1 + depth], [x + notch / 2, -1]);
      edge.push([3, -1], [3, 1], [0, 1], [0, -1]);
      const lock = xs.at(-1)!;
      return (
        <>
          <polyline points={pts(...edge)} />
          <line x1={lock} y1={-1.5} x2={lock} y2={-2.5} />
        </>
      );
    }
  }
}

// --- Symbole für den Konfigurator ---------------------------------------------

/** Einzelne Betätigung als kleines Symbol, an einer Feldkante rechts angesetzt. */
export function ActuatorIcon({ kind, medium, size = 34 }: { kind: Actuator; medium: DirectionalValveConfig['medium']; size?: number }) {
  return (
    <svg className="symbol-preview" width={size} height={size * 0.75} viewBox={ACTUATOR_WIDTH[kind] > 5 ? '-1.5 -4 10.67 8' : '-1.5 -3 8 6'} aria-hidden>
      <g className="symbol" strokeWidth={0.125}>
        <polyline points={pts([-1.5, -2], [0, -2], [0, 2], [-1.5, 2])} />
        <ActuatorElement kind={kind} medium={medium} reach={oddReach(kind)} />
      </g>
    </svg>
  );
}

const oddReach = (kind: Actuator) => {
  const n = Math.ceil(ACTUATOR_WIDTH[kind] - 1e-9);
  return n % 2 === 1 ? n : n + 1;
};

/** Ein Schaltfeld mit seinen Wegen und Anschlussleitungen als kleines Symbol. */
export function FieldIcon({ config, paths, size = 40 }: { config: DirectionalValveConfig; paths: ValvePath[]; size?: number }) {
  const fw = fieldWidth(config.ports);
  return (
    <svg className="symbol-preview" width={(size * (fw + 1)) / 9} height={size} viewBox={`-0.5 -0.5 ${fw + 1} 9`} aria-hidden>
      <g className="symbol" strokeWidth={0.125}>
        <Field x0={0} width={fw} config={config} paths={paths} />
        {rolesOf(config.ports).map((role) => {
          const { x, top } = portInField(config.ports, role);
          const [y1, y2] = top ? [0, FIELD_TOP] : [BOTTOM, 8];
          return <line key={role} x1={x} y1={y1} x2={x} y2={y2} />;
        })}
      </g>
    </svg>
  );
}
