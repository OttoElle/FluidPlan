import type { ReactNode } from 'react';
import type { ComponentInstance } from '../model/types.ts';
import { CylinderSymbol } from './cylinderSymbol.tsx';
import { ArrowHead, CheckElement, DASH, FlowArrow, Junction, pts, seatTip, Spring, Throttle, Triangle, type P } from './symbolParts.tsx';
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
 * Messgerät 4M, Ventilfeld 4M × 4M, Zylinderrahmen 9M × 4M,
 * Wirkrichtungsdreieck 2M, Durchflusspfeil mit 1M langer Spitze und 30°
 * Öffnungswinkel, Welle 3M × 1M, Anschlussleitungen 2M. Die Maße stammen aus
 * den bemaßten Grundelementen (Abschnitt 8) und den Beispielen (Abschnitt 6
 * und 7) der DIN ISO 1219-1:2019; die Kommentare nennen die Abschnitte.
 *
 * Wegeventile und Zylinder sind konfigurierbar und werden aus ihrer
 * Konfiguration gezeichnet (valveSymbol.tsx, cylinderSymbol.tsx).
 */
export const MODULE = 10;
export const LINE_WIDTH = 0.125;

// --- Energieversorgung und Antriebe -----------------------------------------
//
// Pumpen, Motoren und Kompressor (10M × 10M): Kreis 6M (8.4.4) mit der Mitte
// bei (6, 5), Antriebswelle als Rechteck 3M × 1M nach links, Anschluss-
// leitungen 2M lang oben und unten (Beispiele 6.2), Dreieck 2M Seitenlänge.

const CX = 6;
const CY = 5;
/** Sehne der Länge 2M im Kreis r = 3M liegt 2√2 M von der Mitte entfernt. */
const CHORD = 2 * Math.SQRT2;
const TRI_H = Math.sqrt(3);

function EnergyConversionUnit({ top = true, bottom = true, children }: { top?: boolean; bottom?: boolean; children?: ReactNode }) {
  return (
    <>
      <circle cx={CX} cy={CY} r={3} />
      <rect x={0} y={CY - 0.5} width={3} height={1} />
      {top && <line x1={CX} y1={0} x2={CX} y2={CY - 3} />}
      {bottom && <line x1={CX} y1={CY + 3} x2={CX} y2={10} />}
      {children}
    </>
  );
}

/** Verstellbarkeit von Pumpe/Motor (8.6.8): Pfeil unter 45° über ein 9M-Quadrat. */
const Adjustable = () => <FlowArrow from={[CX - 4, CY + 4]} to={[CX + 4, CY - 4]} />;

/** Hydropumpe, eine Förderrichtung: Dreieck mit der Spitze am Kreis, zeigt nach außen. */
function Pump({ variable = false }: { variable?: boolean }) {
  return (
    <EnergyConversionUnit>
      <Triangle tip={[CX, CY - 3]} dir={[0, -1]} filled />
      {variable && <Adjustable />}
    </EnergyConversionUnit>
  );
}

/** Kompressor: wie die Pumpe, mit hohlem Dreieck, nur Druckanschluss. */
function Compressor() {
  return (
    <EnergyConversionUnit bottom={false}>
      <Triangle tip={[CX, CY - 3]} dir={[0, -1]} filled={false} />
    </EnergyConversionUnit>
  );
}

/** Motor: Dreieck mit der Grundseite am Kreis, Spitze zeigt nach innen. */
function Motor({ reversible = false, filled = true }: { reversible?: boolean; filled?: boolean }) {
  return (
    <EnergyConversionUnit>
      <Triangle tip={[CX, CY - CHORD + TRI_H]} dir={[0, 1]} filled={filled} />
      {reversible && <Triangle tip={[CX, CY + CHORD - TRI_H]} dir={[0, -1]} filled={filled} />}
    </EnergyConversionUnit>
  );
}

/** Elektromotor (10M × 10M): Kreis 6M mit "M", Welle 3M × 1M nach rechts, auf Höhe der Pumpenwelle. */
function ElectricMotor() {
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

/** Behälter (8.7.32/33, 6M × 4M): offen, 2M hoch; Rücklauf 2M von der Wand, endet 1M über dem Boden. */
function Tank() {
  return (
    <>
      <polyline points={pts([0, 2], [0, 4], [6, 4], [6, 2])} />
      <line x1={2} y1={0} x2={2} y2={3} />
    </>
  );
}

/** Pneumatische Energiequelle (8.7.35, 6M × 2M): hohles Dreieck 2M, Leitung 4M zum Anschluss. */
function AirSource() {
  return (
    <>
      <Triangle tip={[2, 1]} dir={[1, 0]} filled={false} />
      <line x1={2} y1={1} x2={6} y2={1} />
    </>
  );
}

/** Schalldämpfer (8.7.37, 2M × 6M): Rechteck 2M × 4M mit versetzten Prallwänden. */
function Silencer() {
  return (
    <>
      <line x1={1} y1={0} x2={1} y2={2} />
      <rect x={0} y={2} width={2} height={4} />
      <line x1={0} y1={3} x2={1} y2={3} />
      <line x1={1} y1={4} x2={2} y2={4} />
      <line x1={0} y1={5} x2={1} y2={5} />
    </>
  );
}

/** Hydrospeicher, gasbelastet (8.7.34, 4M × 10M): Behälter 4M × 8M, Trennlinie, Gas-Dreieck. */
function Accumulator() {
  return (
    <>
      <rect x={0} y={0} width={4} height={8} rx={2} />
      <line x1={0} y1={4} x2={4} y2={4} />
      <Triangle tip={[2, 1]} dir={[0, -1]} filled={false} />
      <line x1={2} y1={8} x2={2} y2={10} />
    </>
  );
}

/** Filter (8.7.24, 8M × 10M): auf die Spitze gestelltes Quadrat 4M, Filtereinsatz quer zur Strömung. */
function Filter() {
  const d = 2 * Math.SQRT2;
  return (
    <>
      <polygon points={pts([4, 5 - d], [4 + d, 5], [4, 5 + d], [4 - d, 5])} />
      <line x1={4 - d} y1={5} x2={4 + d} y2={5} strokeDasharray={DASH} />
      <line x1={4} y1={0} x2={4} y2={5 - d} />
      <line x1={4} y1={5 + d} x2={4} y2={10} />
    </>
  );
}

/** Messgerät-Zeiger (8.3.20) in einem Kreis 4M um (cx, cy). */
function GaugeFace({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} r={2} />
      <FlowArrow from={[cx + 0.9, cy + 0.9]} to={[cx - 1.05, cy - 1.05]} />
    </>
  );
}

/** Wartungseinheit, vereinfacht (Beispiel 7.4.4.17, 14M × 6M). */
function ServiceUnit() {
  return (
    <>
      <rect x={2} y={0} width={10} height={6} />
      <line x1={0} y1={3} x2={2} y2={3} />
      <line x1={12} y1={3} x2={14} y2={3} />
      <line x1={3} y1={0} x2={3} y2={6} strokeDasharray={DASH} />
      <GaugeFace cx={7} cy={3} />
      <line x1={11} y1={0} x2={11} y2={2} />
    </>
  );
}

/** Manometer (Beispiel 6.4.3.4, 4M × 6M). */
function Gauge() {
  return (
    <>
      <GaugeFace cx={2} cy={2} />
      <line x1={2} y1={4} x2={2} y2={6} />
    </>
  );
}

// --- Sperrventile -------------------------------------------------------------

const DOWN: P = [0, 1];
const UP: P = [0, -1];

/** Rückschlagventil (Beispiel 6.1.5.1, 2M × 6M), frei von 1 (unten) nach 2 (oben). */
function CheckValve() {
  const ball: P = [1, 2.8];
  return (
    <>
      <line x1={1} y1={0} x2={1} y2={2.3} />
      <CheckElement ball={ball} seat={DOWN} />
      <line x1={1} y1={seatTip(ball, DOWN)[1]} x2={1} y2={6} />
    </>
  );
}

/** Rückschlagventil mit Feder (Beispiel 6.1.5.2, 2M × 8M). */
function SpringCheckValve() {
  const ball: P = [1, 5.25];
  return (
    <>
      <line x1={1} y1={0} x2={1} y2={2.25} />
      <Spring from={[1, 2.25]} to={[1, 4.75]} amp={0.9} peaks={6} />
      <CheckElement ball={ball} seat={DOWN} />
      <line x1={1} y1={seatTip(ball, DOWN)[1]} x2={1} y2={8} />
    </>
  );
}

/** Entsperrbares Rückschlagventil (Beispiel 6.1.5.3, 6M × 10M), Steueranschluss X unten. */
function PilotedCheckValve() {
  const ball: P = [2, 6.25];
  return (
    <>
      <rect x={0} y={2} width={5} height={6} />
      <line x1={2} y1={0} x2={2} y2={3.25} />
      <Spring from={[2, 3.25]} to={[2, 5.75]} amp={0.9} peaks={6} />
      <CheckElement ball={ball} seat={DOWN} />
      <line x1={2} y1={seatTip(ball, DOWN)[1]} x2={2} y2={10} />
      <polyline points={pts([2.6, 6.95], [4, 8], [4, 10])} strokeDasharray={DASH} />
    </>
  );
}

/**
 * Gehäuse von Wechsel- und Zweidruckventil (12M × 6M): Rahmen 8M × 4M,
 * Eingänge links und rechts auf halber Höhe, Ausgang oben in der Mitte,
 * Anschlussleitungen 2M.
 */
function ThreePortBody({ children }: { children: ReactNode }) {
  return (
    <>
      <rect x={2} y={2} width={8} height={4} />
      <line x1={0} y1={4} x2={2} y2={4} />
      <line x1={10} y1={4} x2={12} y2={4} />
      <line x1={6} y1={0} x2={6} y2={2} />
      {children}
    </>
  );
}

/** Wechselventil (ODER, Beispiel 6.1.5.5): Kugel zwischen zwei Sitzen. */
function ShuttleValve() {
  return (
    <ThreePortBody>
      <line x1={2} y1={4} x2={3.2} y2={4} />
      <line x1={4.2} y1={4} x2={10} y2={4} />
      <line x1={6} y1={2} x2={6} y2={4} />
      <Junction at={[6, 4]} />
      <polyline points={pts([4, 3], [3, 4], [4, 5])} />
      <polyline points={pts([8, 3], [9, 4], [8, 5])} />
      <circle cx={3.7} cy={4} r={0.5} />
    </ThreePortBody>
  );
}

/** Zweidruckventil (UND, Beispiel 7.1.3.5): Doppelkolben zwischen zwei Sitzen. */
function TwoPressureValve() {
  return (
    <ThreePortBody>
      <line x1={3} y1={3} x2={3} y2={5} />
      <line x1={9} y1={3} x2={9} y2={5} />
      <line x1={3} y1={3.8} x2={9} y2={3.8} />
      <line x1={3} y1={4.2} x2={9} y2={4.2} />
      <line x1={4} y1={2} x2={4} y2={3} />
      <line x1={8} y1={2} x2={8} y2={3} />
      <line x1={4} y1={5} x2={4} y2={6} />
      <line x1={8} y1={5} x2={8} y2={6} />
    </ThreePortBody>
  );
}

// --- Druckventile -------------------------------------------------------------

/**
 * Direktgesteuerte Druckventile (Beispiele 6.1.3, 10M × 8M): Ventilfeld 4M
 * von (2, 2) bis (6, 6), Anschlüsse in der Mitte bei x = 4, Leitungen 2M.
 * Die Steuerleitung läuft 2M links am Feld vorbei und mündet 1M über der
 * Unterkante (8.2.5/8.2.6), die einstellbare Feder sitzt rechts auf
 * derselben Höhe (8.5.23, 8.6.3).
 */
function PressureValve({ kind }: { kind: 'relief' | 'reducing' | 'sequence' }) {
  const reducing = kind === 'reducing';
  return (
    <>
      <rect x={2} y={2} width={4} height={4} />
      <line x1={4} y1={0} x2={4} y2={2} />
      <line x1={4} y1={6} x2={4} y2={8} />
      {reducing ? (
        // offen: Pfeil auf der Leitung, Steuerdruck vom Ausgang (oben)
        <>
          <FlowArrow from={[4, 6]} to={[4, 2]} />
          <polyline points={pts([4, 2], [3, 1], [0, 1], [0, 5], [2, 5])} strokeDasharray={DASH} />
        </>
      ) : (
        // geschlossen: Pfeil 1M neben der Leitung, Steuerdruck vom Eingang (unten)
        <>
          <FlowArrow from={[3, 6]} to={[3, 2]} />
          <polyline points={pts([4, 6], [2, 8], [0, 8], [0, 5], [2, 5])} strokeDasharray={DASH} />
        </>
      )}
      <Spring from={[6, 5]} to={[8.5, 5]} amp={1} peaks={6} />
      <FlowArrow from={[6.8, 6.8]} to={[7.85, 2.05]} />
      {kind !== 'relief' && <line x1={8} y1={6.2} x2={8} y2={8} strokeDasharray={DASH} />}
    </>
  );
}

// --- Stromventile -------------------------------------------------------------

/** Verstellbarkeit einer Drossel (8.6.6): Pfeil 3,5M breit, 1,5M steigend. */
const ThrottleArrow = ({ x, cy }: { x: number; cy: number }) => (
  <FlowArrow from={[x - 1.4, cy + 0.6]} to={[x + 2.1, cy - 0.9]} />
);

/** Drosselventil, einstellbar (Beispiel 6.1.4.1, 4M × 8M). */
function ThrottleValve() {
  return (
    <>
      <line x1={2} y1={0} x2={2} y2={8} />
      <Throttle x={2} cy={4} />
      <ThrottleArrow x={2} cy={4} />
    </>
  );
}

/**
 * Drosselrückschlagventil (Beispiel 6.1.4.2, 8M × 12M): Rahmen 8M × 8M,
 * gedrosselt von 1 (unten) nach 2 (oben), Umgehung über das
 * Rückschlagventil frei von 2 nach 1.
 */
function ThrottleCheckValve() {
  const ball: P = [6, 6.35];
  return (
    <>
      <rect x={0} y={2} width={8} height={8} />
      <line x1={2} y1={0} x2={2} y2={12} />
      <Throttle x={2} cy={6} />
      <ThrottleArrow x={2} cy={6} />
      <polyline points={pts([2, 3], [6, 3], seatTip(ball, UP))} />
      <CheckElement ball={ball} seat={UP} />
      <polyline points={pts([6, 6.85], [6, 9], [2, 9])} />
      <Junction at={[2, 3]} />
      <Junction at={[2, 9]} />
    </>
  );
}

/**
 * 2-Wege-Stromregelventil mit Umgehungs-Rückschlagventil (Beispiel 6.1.4.4,
 * 10M × 16M): druckkompensierte Blende (> <) mit Voreinstellung, geregelt
 * von 1 (unten) nach 2 (oben).
 */
function FlowControlValve() {
  const ball: P = [7, 7.9];
  // Voreinstellung (8.6.5): schräger Strich mit Querbalken 1,5M
  const [x1, y1, x2, y2] = [1.6, 10.8, 4.6, 5.7];
  const len = Math.hypot(x2 - x1, y2 - y1);
  const [nx, ny] = [-(y2 - y1) / len, (x2 - x1) / len];
  return (
    <>
      <rect x={0} y={2} width={9} height={12} />
      <line x1={3} y1={0} x2={3} y2={16} />
      <ArrowHead from={[3, 6]} to={[3, 4.2]} />
      <polyline points={pts([1.5, 7.25], [2.5, 8.3], [1.5, 9.35])} />
      <polyline points={pts([4.5, 7.25], [3.5, 8.3], [4.5, 9.35])} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line x1={x2 - nx * 0.75} y1={y2 - ny * 0.75} x2={x2 + nx * 0.75} y2={y2 + ny * 0.75} />
      <polyline points={pts([3, 4], [7, 4], seatTip(ball, UP))} />
      <CheckElement ball={ball} seat={UP} />
      <polyline points={pts([7, 8.4], [7, 12], [3, 12])} />
      <Junction at={[3, 4]} />
      <Junction at={[3, 12]} />
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
  'supply.silencer': Silencer,
  'supply.accumulator': Accumulator,
  'supply.filter': Filter,
  'supply.service-unit': ServiceUnit,
  'actuator.motor': () => <Motor />,
  'actuator.motor-reversible': () => <Motor reversible />,
  'actuator.air-motor': () => <Motor filled={false} />,
  'valve.check': CheckValve,
  'valve.check-spring': SpringCheckValve,
  'valve.check-piloted': PilotedCheckValve,
  'valve.shuttle': ShuttleValve,
  'valve.two-pressure': TwoPressureValve,
  'valve.pressure-relief': () => <PressureValve kind="relief" />,
  'valve.pressure-reducing': () => <PressureValve kind="reducing" />,
  'valve.sequence': () => <PressureValve kind="sequence" />,
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
