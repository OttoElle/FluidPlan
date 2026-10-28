import type { ReactNode } from 'react';
import type { ComponentInstance } from '../model/types.ts';
import { CylinderSymbol } from './cylinderSymbol.tsx';
import { CheckElement, DASH, FlowArrow, Junction, pts, Spring, Throttle, Triangle } from './symbolParts.tsx';
import { ValveSymbol } from './valveSymbol.tsx';

/**
 * Schaltzeichen nach DIN ISO 1219-1.
 *
 * Alle Symbole sind im Modul M gezeichnet: Koordinaten in M, Ursprung oben
 * links wie bei der Bauteildefinition, ungedreht. Ein Rasterschritt der
 * Zeichenfläche entspricht 1M (= 10 Einheiten). Die Anschlüsse in library.ts
 * liegen genau auf den Leitungsenden der Symbole.
 *
 * Grundmaße aus der Norm: Linienbreite 0,125M, Kreis für Pumpe/Motor 6M,
 * Ventilfeld 4M × 4M, Zylinderrahmen 9M × 4M, Wirkrichtungsdreieck 2M,
 * Durchflusspfeil mit 1M langer Spitze und 30° Öffnungswinkel, Welle 3M lang
 * und 1M breit.
 *
 * Wegeventile und Zylinder sind konfigurierbar und werden aus ihrer
 * Konfiguration gezeichnet (valveSymbol.tsx, cylinderSymbol.tsx).
 */
export const MODULE = 10;
export const LINE_WIDTH = 0.125;

// --- Energieversorgung und Antriebe -----------------------------------------

/** Kreis 6M mit Antriebswelle nach links; Mitte bei (6, cy). */
function EnergyConversionUnit({ cy, children }: { cy: number; children?: ReactNode }) {
  return (
    <>
      <circle cx={6} cy={cy} r={3} />
      <polyline points={pts([3, cy - 0.5], [0, cy - 0.5])} />
      <polyline points={pts([3, cy + 0.5], [0, cy + 0.5])} />
      {children}
    </>
  );
}

/** Hydropumpe, eine Förderrichtung (9M × 9M): Dreieck mit Spitze am Kreis, zeigt nach außen. */
function Pump({ variable = false }: { variable?: boolean }) {
  return (
    <EnergyConversionUnit cy={4.5}>
      <line x1={6} y1={0} x2={6} y2={1.5} />
      <line x1={6} y1={7.5} x2={6} y2={9} />
      <Triangle tip={[6, 1.5]} dir={[0, -1]} filled />
      {variable && <FlowArrow from={[3.9, 6.6]} to={[8.4, 2.1]} />}
    </EnergyConversionUnit>
  );
}

/** Kompressor: wie die Pumpe, aber mit hohlem Dreieck für Pneumatik (9M × 7M). */
function Compressor() {
  return (
    <EnergyConversionUnit cy={4}>
      <line x1={6} y1={0} x2={6} y2={1} />
      <Triangle tip={[6, 1]} dir={[0, -1]} filled={false} />
    </EnergyConversionUnit>
  );
}

/** Motor (9M × 9M): Dreieck mit der Grundseite am Kreis, Spitze zeigt nach innen. */
function Motor({ reversible = false, filled = true }: { reversible?: boolean; filled?: boolean }) {
  // Sehne der Länge 2M im Kreis mit r = 3M liegt 2√2 M von der Mitte entfernt.
  const chord = 4.5 - 2 * Math.SQRT2;
  const h = Math.sqrt(3);
  return (
    <EnergyConversionUnit cy={4.5}>
      <line x1={6} y1={0} x2={6} y2={1.5} />
      <line x1={6} y1={7.5} x2={6} y2={9} />
      <Triangle tip={[6, chord + h]} dir={[0, 1]} filled={filled} />
      {reversible && <Triangle tip={[6, 9 - chord - h]} dir={[0, -1]} filled={filled} />}
    </EnergyConversionUnit>
  );
}

/** Elektromotor (9M × 7M): Kreis mit "M", Welle nach rechts. */
function ElectricMotor() {
  return (
    <>
      <circle cx={3} cy={3.5} r={3} />
      <text x={3} y={3.5} className="fill" stroke="none" fontSize={2.6} textAnchor="middle" dominantBaseline="central">
        M
      </text>
      <line x1={6} y1={3} x2={9} y2={3} />
      <line x1={6} y1={4} x2={9} y2={4} />
    </>
  );
}

/** Offener Tank (4M × 2M), Leitung endet unter dem Flüssigkeitsspiegel. */
function Tank() {
  return (
    <>
      <polyline points={pts([0, 0], [0, 2], [4, 2], [4, 0])} />
      <line x1={2} y1={0} x2={2} y2={1.5} />
    </>
  );
}

/** Druckluftquelle (2M × 4M). */
function AirSource() {
  return (
    <>
      <line x1={1} y1={0} x2={1} y2={1} />
      <circle cx={1} cy={2} r={1} />
      <Triangle tip={[1, 1.45]} dir={[0, -1]} side={0.9} filled={false} />
    </>
  );
}

/** Entlüftung (2M × 2M): Dreieck zeigt vom Anschluss weg. */
function Exhaust() {
  return (
    <>
      <line x1={1} y1={0} x2={1} y2={0.6} />
      <Triangle tip={[1, 1.9]} dir={[0, 1]} side={1.5} filled={false} />
    </>
  );
}

/** Hydrospeicher, gasbelastet (4M × 6M). */
function Accumulator() {
  return (
    <>
      <rect x={1} y={0.5} width={2} height={4.5} rx={1} />
      <line x1={1} y1={2.5} x2={3} y2={2.5} />
      <Triangle tip={[2, 1.1]} dir={[0, -1]} side={0.9} filled={false} />
      <line x1={2} y1={5} x2={2} y2={6} />
    </>
  );
}

/** Filter (4M × 4M): Raute mit Filtereinsatz quer zur Strömung. */
function Filter() {
  return (
    <>
      <polygon points={pts([2, 0.5], [3.5, 2], [2, 3.5], [0.5, 2])} />
      <line x1={2} y1={0.5} x2={2} y2={3.5} strokeDasharray={DASH} />
      <line x1={0} y1={2} x2={0.5} y2={2} />
      <line x1={3.5} y1={2} x2={4} y2={2} />
    </>
  );
}

/** Wartungseinheit, vereinfacht (6M × 4M): Filter und Druckregler in einem Rahmen. */
function ServiceUnit() {
  return (
    <>
      <rect x={0.5} y={0.5} width={5} height={3} strokeDasharray="1 0.3 0.2 0.3" />
      <line x1={0} y1={2} x2={1.2} y2={2} />
      <polygon points={pts([2, 1.2], [2.8, 2], [2, 2.8], [1.2, 2])} />
      <line x1={2} y1={1.2} x2={2} y2={2.8} strokeDasharray="0.3 0.2" />
      <line x1={2.8} y1={2} x2={6} y2={2} />
      <rect x={3.6} y={1.3} width={1.4} height={1.4} />
      <FlowArrow from={[3.4, 2.9]} to={[5.2, 1.1]} length={0.6} />
    </>
  );
}

/** Manometer (2M × 2M). */
function Gauge() {
  return (
    <>
      <circle cx={1} cy={1} r={1} />
      <FlowArrow from={[0.35, 1.65]} to={[1.65, 0.35]} length={0.6} />
    </>
  );
}

// --- Sperrventile -------------------------------------------------------------

/** Rückschlagventil (2M × 4M), freier Durchfluss von 1 (unten) nach 2 (oben). */
function CheckValve({ spring = false }: { spring?: boolean }) {
  return (
    <>
      {spring ? (
        <>
          <line x1={1} y1={0} x2={1} y2={0.2} />
          <Spring from={[1, 0.2]} to={[1, 1.25]} amp={0.4} />
        </>
      ) : (
        <line x1={1} y1={0} x2={1} y2={1.25} />
      )}
      <CheckElement at={[1, 1.75]} />
      <line x1={1} y1={2.75} x2={1} y2={4} />
    </>
  );
}

/** Entsperrbares Rückschlagventil (4M × 6M): Steuerdruck an X öffnet auch in Sperrrichtung. */
function PilotedCheckValve() {
  return (
    <>
      <rect x={0} y={1} width={2.5} height={4} />
      <line x1={1} y1={0} x2={1} y2={1} />
      <Spring from={[1, 1]} to={[1, 2.25]} amp={0.4} />
      <CheckElement at={[1, 2.75]} />
      <line x1={1} y1={3.75} x2={1} y2={6} />
      <polyline points={pts([4, 4], [2.5, 4], [1.7, 3.3])} strokeDasharray={DASH} />
    </>
  );
}

/** Gehäuse von Wechsel- und Zweidruckventil (6M × 4M). */
function ThreePortBody({ children }: { children: ReactNode }) {
  return (
    <>
      <rect x={1} y={2} width={4} height={2} />
      <line x1={0} y1={3} x2={1} y2={3} />
      <line x1={5} y1={3} x2={6} y2={3} />
      <line x1={3} y1={0} x2={3} y2={2} />
      {children}
    </>
  );
}

/** Wechselventil (ODER): Kugel zwischen zwei Sitzen. */
function ShuttleValve() {
  return (
    <ThreePortBody>
      <polyline points={pts([1.9, 2.3], [1.2, 3], [1.9, 3.7])} />
      <polyline points={pts([4.1, 2.3], [4.8, 3], [4.1, 3.7])} />
      <circle cx={2.1} cy={3} r={0.5} />
    </ThreePortBody>
  );
}

/** Zweidruckventil (UND): Schieber zwischen zwei Sitzen. */
function TwoPressureValve() {
  return (
    <ThreePortBody>
      <polyline points={pts([1.3, 2.4], [2, 3], [1.3, 3.6])} />
      <polyline points={pts([4.7, 2.4], [4, 3], [4.7, 3.6])} />
      <rect x={2.4} y={2.5} width={1.2} height={1} />
    </ThreePortBody>
  );
}

// --- Druckventile -------------------------------------------------------------

/**
 * Grundform der direktgesteuerten Druckventile (8M × 6M): Ventilfeld 4M,
 * Anschlüsse oben und unten bei x = 3, Steuerleitung links, einstellbare
 * Feder rechts.
 */
function PressureValve({ arrow, pilotFrom, drain = false }: { arrow: 'offset-down' | 'through-up'; pilotFrom: 'top'; drain?: boolean }) {
  const py = pilotFrom === 'top' ? 0.5 : 5.5;
  return (
    <>
      <rect x={1} y={1} width={4} height={4} />
      <line x1={3} y1={0} x2={3} y2={1} />
      <line x1={3} y1={5} x2={3} y2={6} />
      {arrow === 'offset-down' ? <FlowArrow from={[2, 1]} to={[2, 5]} /> : <FlowArrow from={[3, 5]} to={[3, 1]} />}
      <polyline points={pts([3, py], [0.3, py], [0.3, 3], [1, 3])} strokeDasharray={DASH} />
      <Spring from={[5, 3]} to={[7, 3]} />
      <FlowArrow from={[5.2, 4.4]} to={[6.9, 1.6]} length={0.8} />
      {drain && <polyline points={pts([5, 4.5], [6, 4.5], [6, 6])} strokeDasharray={DASH} />}
    </>
  );
}

// --- Stromventile -------------------------------------------------------------

/** Drosselventil, einstellbar (2M × 4M). */
function ThrottleValve() {
  return (
    <>
      <line x1={1} y1={0} x2={1} y2={4} />
      <Throttle x={1} cy={2} />
      <FlowArrow from={[0.1, 3.2]} to={[1.9, 0.8]} length={0.6} />
    </>
  );
}

/** Drosselrückschlagventil (4M × 6M): gedrosselt von 2 nach 1, frei von 1 nach 2. */
function ThrottleCheckValve() {
  return (
    <>
      <rect x={0} y={1} width={4} height={4} />
      <line x1={1} y1={0} x2={1} y2={6} />
      <Throttle x={1} cy={3} />
      <FlowArrow from={[0.15, 4]} to={[1.85, 2]} length={0.6} />
      <polyline points={pts([1, 1.75], [3, 1.75], [3, 2.25])} />
      <CheckElement at={[3, 2.75]} />
      <polyline points={pts([3, 3.75], [3, 4.25], [1, 4.25])} />
      <Junction at={[1, 1.75]} />
      <Junction at={[1, 4.25]} />
    </>
  );
}

/** 2-Wege-Stromregelventil, druckkompensiert und einstellbar (4M × 6M). */
function FlowControlValve() {
  return (
    <>
      <rect x={0} y={1} width={4} height={4} />
      <line x1={2} y1={0} x2={2} y2={6} />
      <Throttle x={2} cy={3} />
      <FlowArrow from={[1.15, 4]} to={[2.85, 2]} length={0.6} />
      <FlowArrow from={[0.7, 4.4]} to={[0.7, 1.6]} length={0.6} />
    </>
  );
}

const SYMBOLS: Record<string, () => ReactNode> = {
  'supply.pump': () => <Pump />,
  'supply.pump-variable': () => <Pump variable />,
  'supply.compressor': Compressor,
  'supply.electric-motor': ElectricMotor,
  'supply.tank': Tank,
  'supply.air-source': AirSource,
  'supply.exhaust': Exhaust,
  'supply.accumulator': Accumulator,
  'supply.filter': Filter,
  'supply.service-unit': ServiceUnit,
  'actuator.motor': () => <Motor />,
  'actuator.motor-reversible': () => <Motor reversible />,
  'actuator.air-motor': () => <Motor filled={false} />,
  'valve.check': () => <CheckValve />,
  'valve.check-spring': () => <CheckValve spring />,
  'valve.check-piloted': PilotedCheckValve,
  'valve.shuttle': ShuttleValve,
  'valve.two-pressure': TwoPressureValve,
  'valve.pressure-relief': () => <PressureValve arrow="offset-down" pilotFrom="top" />,
  'valve.pressure-reducing': () => <PressureValve arrow="through-up" pilotFrom="top" />,
  'valve.sequence': () => <PressureValve arrow="offset-down" pilotFrom="top" drain />,
  'valve.throttle': ThrottleValve,
  'valve.throttle-check': ThrottleCheckValve,
  'valve.flow-control': FlowControlValve,
  'measure.gauge': Gauge,
};

const CONFIGURABLE_SYMBOLS = new Set(['valve.directional', 'actuator.cylinder']);

export function hasSymbol(type: string): boolean {
  return type in SYMBOLS || CONFIGURABLE_SYMBOLS.has(type);
}

/** Zeichnet das Symbol in lokalen Bauteilkoordinaten (Einheiten, nicht M). */
export function ComponentSymbol({ component }: { component: Pick<ComponentInstance, 'type' | 'config'> }) {
  const { config } = component;
  let content: ReactNode = null;
  if (config?.kind === 'directional-valve') content = <ValveSymbol config={config} />;
  else if (config?.kind === 'cylinder') content = <CylinderSymbol config={config} />;
  else {
    const Draw = SYMBOLS[component.type];
    if (Draw) content = <Draw />;
  }
  if (!content) return null;
  return (
    <g className="symbol" transform={`scale(${MODULE})`} strokeWidth={LINE_WIDTH}>
      {content}
    </g>
  );
}
