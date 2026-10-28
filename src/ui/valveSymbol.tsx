import { Fragment } from 'react';
import {
  actuatorRowY,
  FIELD,
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
      <Side list={config.left} edge={layout.fieldsX} reach={layout.leftWidth} mirrored medium={config.medium} />
      <Side list={config.right} edge={rightEdge} reach={layout.rightWidth} mirrored={false} medium={config.medium} />
    </>
  );
}

function Side({
  list,
  edge,
  reach,
  mirrored,
  medium,
}: {
  list: Actuator[];
  edge: number;
  reach: number;
  mirrored: boolean;
  medium: DirectionalValveConfig['medium'];
}) {
  const top = actuatorRowY(list.length - 1);
  return (
    <>
      {/* Verbindungslinie, wenn Elemente über die Feld-Oberkante hinausreichen (9.2.8). */}
      {list.length > 0 && top < FIELD_TOP && <line x1={edge} y1={FIELD_TOP} x2={edge} y2={top} />}
      {list.map((a, row) => (
        <g key={a} transform={`translate(${edge} ${actuatorRowY(row)})${mirrored ? ' scale(-1 1)' : ''}`}>
          <ActuatorElement kind={a} medium={medium} reach={reach} />
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
const SHAFT = 3;

/**
 * Ein Betätigungselement nach DIN ISO 1219-1, Abschnitt 8.5. Gezeichnet für
 * die rechte Seite: x = 0 an der Feldkante, x wächst nach außen, y = 0 auf
 * der Mittellinie des Elements. Die linke Seite wird gespiegelt.
 * `reach` ist die Breite der Seite; bis dorthin läuft die Steuerleitung.
 */
function ActuatorElement({ kind, medium, reach }: { kind: Actuator; medium: DirectionalValveConfig['medium']; reach: number }) {
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
      // Magnet steuert über Steuerdruck: Dreieck am Feld, Magnet dahinter (in Reihe, 9.2.10)
      return (
        <>
          {triangle}
          <rect x={3} y={-1} width={3} height={2} />
          <line x1={5} y1={1} x2={4} y2={-1} />
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
    case 'manual':
      return (
        <>
          {shaft}
          <line x1={SHAFT} y1={-1} x2={SHAFT} y2={1} />
        </>
      );
    case 'pushbutton':
      return (
        <>
          {shaft}
          <path d={`M${SHAFT} -0.75 A0.75 0.75 0 0 1 ${SHAFT} 0.75 Z`} />
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
      // Pedal: Platte 2M × 0,5M schräg am Wellenende (8.5.17)
      return (
        <>
          {shaft}
          <polygon points={pts([3, 0], [3.84, -1.81], [4.29, -1.6], [3.45, 0.21])} />
        </>
      );
    case 'plunger':
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
    case 'detent':
      // Rasten als Kerben auf der Welle (8.5.6, Schenkel 0,75M, 60°)
      return (
        <>
          {shaft}
          {[1, 2].map((u) => (
            <polyline key={u} points={pts([u - 0.375, -1.15], [u, -0.5], [u + 0.375, -1.15])} />
          ))}
        </>
      );
  }
}
