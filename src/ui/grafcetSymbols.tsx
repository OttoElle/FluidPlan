import {
  actionHasCondition,
  actionLayout,
  connectorLayout,
  CONNECTOR_LINE,
  CONNECTOR_PITCH,
  GRAFCET_TEXT,
  grafcetTextWidth,
  negationParts,
  STEP_HEIGHT,
  stepWidth,
  syncLayout,
  transitionLayout,
  type GrafcetActionConfig,
  type GrafcetConnectorConfig,
  type GrafcetStepConfig,
  type GrafcetSyncConfig,
  type GrafcetTransitionConfig,
} from '../model/grafcet.ts';
import { DRAWING_FONT, fontSizeFor, LETTERING } from '../model/lettering.ts';
import { pts } from './symbolParts.tsx';

/**
 * GRAFCET-Symbole nach DIN EN 60848:2014, Abschnitt 5. Koordinaten in M wie
 * alle Symbole (siehe symbols.tsx); Lagen und Maße in model/grafcet.ts.
 */

/** Schriftgröße (Geviert) in M für 2,5 mm Versalhöhe. */
const FONT = fontSizeFor(LETTERING.normal) / 10;
/** Abstand des Überstrichs über der Grundlinie (Negation). */
const OVERLINE = GRAFCET_TEXT + 0.25;
/** Abstand der Doppellinie bei Anfangsschritt und zwangssteuerndem Befehl. */
const DOUBLE = 0.4;

/**
 * Text mit Negationen: Abschnitte nach `!` bekommen einen Überstrich
 * (z. B. „!b1 · b0“). Position = linker Rand der Grundlinie; `anchor` middle
 * zentriert um x.
 */
export function GrafcetText({ x, y, text, anchor = 'start' }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' }) {
  const parts = negationParts(text);
  const total = grafcetTextWidth(text);
  let cursor = anchor === 'middle' ? x - total / 2 : x;
  const overlines: { x1: number; x2: number }[] = [];
  for (const p of parts) {
    const w = grafcetTextWidth(p.text);
    if (p.over) overlines.push({ x1: cursor + 0.05, x2: cursor + w - 0.05 });
    cursor += w;
  }
  return (
    <>
      <text
        x={anchor === 'middle' ? x - total / 2 : x}
        y={y}
        className="fill"
        stroke="none"
        fontSize={FONT}
        fontFamily={DRAWING_FONT}
        xmlSpace="preserve"
      >
        {parts.map((p) => p.text).join('')}
      </text>
      {overlines.map((o, i) => (
        <line key={i} x1={o.x1} y1={y - OVERLINE} x2={o.x2} y2={y - OVERLINE} />
      ))}
    </>
  );
}

/** Schritt (Tabelle 1, Symbole [1], [3] bis [6]). Bezeichnung oben in der Mitte. */
export function StepSymbol({ config }: { config: GrafcetStepConfig }) {
  const w = stepWidth(config);
  const h = STEP_HEIGHT;
  const initial = config.variant === 'initial' || config.variant === 'initial-enclosing';
  const enclosing = config.variant === 'enclosing' || config.variant === 'initial-enclosing';
  const i = initial ? DOUBLE : 0;
  // Einschließender Schritt: abgeschrägte Ecken innen (Symbol [4]).
  const cut = 1;
  const label = config.variant === 'macro' && !config.name ? 'M' : config.name;
  return (
    <>
      <rect x={0} y={0} width={w} height={h} />
      {initial && <rect x={i} y={i} width={w - 2 * i} height={h - 2 * i} />}
      {enclosing && (
        <>
          <line x1={i} y1={i + cut} x2={i + cut} y2={i} />
          <line x1={w - i - cut} y1={i} x2={w - i} y2={i + cut} />
          <line x1={i} y1={h - i - cut} x2={i + cut} y2={h - i} />
          <line x1={w - i - cut} y1={h - i} x2={w - i} y2={h - i - cut} />
        </>
      )}
      {config.variant === 'macro' && (
        // Makroschritt (Symbol [6]): Querstriche oben und unten.
        <>
          <line x1={0} y1={0.5} x2={w} y2={0.5} />
          <line x1={0} y1={h - 0.5} x2={w} y2={h - 0.5} />
        </>
      )}
      <GrafcetText x={w / 2} y={config.variant === 'macro' ? 2.5 : 1.3 + i + GRAFCET_TEXT / 2} text={label} anchor="middle" />
      {config.active && <circle cx={w / 2} cy={h - 1 - i / 2} r={0.3} className="fill" />}
    </>
  );
}

/** Transition (Symbol [7]) mit Name links in Klammern ([8]) und Bedingung rechts ([13]). */
export function TransitionSymbol({ config }: { config: GrafcetTransitionConfig }) {
  const l = transitionLayout(config);
  const mid = l.height / 2;
  const baseline = mid + GRAFCET_TEXT / 2;
  return (
    <>
      <line x1={l.axis} y1={0} x2={l.axis} y2={l.height} />
      <line x1={l.axis - 1} y1={mid} x2={l.axis + 1} y2={mid} />
      {config.name && <GrafcetText x={l.axis - 1.5 - grafcetTextWidth(`(${config.name})`)} y={baseline} text={`(${config.name})`} />}
      {config.condition && <GrafcetText x={l.axis + 1.5} y={baseline} text={config.condition} />}
    </>
  );
}

/**
 * Aktion (Tabellen 5 und 6) bzw. zwangssteuernder Befehl (Tabelle 9, doppelt
 * umrahmt): Wirkungslinie 1M zum Anschluss, Rechteck in Schritthöhe.
 */
export function ActionSymbol({ config }: { config: GrafcetActionConfig }) {
  const l = actionLayout(config);
  const y = l.top;
  const h = STEP_HEIGHT;
  const x = 1;
  const forcing = config.type === 'forcing';
  return (
    <>
      <line x1={0} y1={l.portY} x2={x} y2={l.portY} />
      <rect x={x} y={y} width={l.box} height={h} />
      {forcing && <rect x={x + DOUBLE} y={y + DOUBLE} width={l.box - 2 * DOUBLE} height={h - 2 * DOUBLE} />}
      <GrafcetText x={x + l.box / 2} y={l.portY + GRAFCET_TEXT / 2} text={config.text} anchor="middle" />
      {config.type === 'activation' && (
        // Aufwärtspfeil auf der Wirkungslinie (Symbol [27]).
        <>
          <line x1={0.5} y1={l.portY} x2={0.5} y2={0.9} />
          <polygon points={pts([0.5, 0], [0.1, 1], [0.9, 1])} className="fill" />
        </>
      )}
      {config.type === 'deactivation' && (
        // Abwärtspfeil (Symbol [28]).
        <>
          <line x1={0.5} y1={l.portY} x2={0.5} y2={l.height - 0.9} />
          <polygon points={pts([0.5, l.height], [0.1, l.height - 1], [0.9, l.height - 1])} className="fill" />
        </>
      )}
      {actionHasCondition(config) && (
        // Zuweisungsbedingung (Symbol [22]) bzw. Ereignis mit Fähnchen (Symbol [29]).
        <>
          <line x1={l.line} y1={0} x2={l.line} y2={y} />
          {config.type === 'event' && <polygon points={pts([l.line, 0], [l.line, 1], [l.line - 0.9, 0.5])} className="fill" />}
          <GrafcetText x={l.line + 0.5} y={1.2} text={config.type === 'event' ? config.condition || '↑' : config.condition} />
        </>
      )}
    </>
  );
}

/** Synchronisierung (Symbol [9]): zwei waagerechte Linien mit den Wirkungslinien. */
export function SyncSymbol({ config }: { config: GrafcetSyncConfig }) {
  const l = syncLayout(config);
  const xs = [...l.top, ...l.bottom];
  const x1 = Math.min(...xs) - 1;
  const x2 = Math.max(...xs) + 1;
  return (
    <>
      <line x1={x1} y1={0.8} x2={x2} y2={0.8} />
      <line x1={x1} y1={1.2} x2={x2} y2={1.2} />
      {l.top.map((x) => (
        <line key={`t${x}`} x1={x} y1={0} x2={x} y2={0.8} />
      ))}
      {l.bottom.map((x) => (
        <line key={`b${x}`} x1={x} y1={1.2} x2={x} y2={l.height} />
      ))}
    </>
  );
}

/** Zielhinweis (Symbol [12]): unterbrochene Wirkungslinie mit Zielschritt und Seite. */
export function ConnectorSymbol({ config }: { config: GrafcetConnectorConfig }) {
  const l = connectorLayout(config);
  const out = config.direction === 'out';
  const lineFrom = out ? 0 : l.height - CONNECTOR_LINE;
  const firstBaseline = out ? CONNECTOR_LINE + 0.6 + GRAFCET_TEXT : l.height - CONNECTOR_LINE - 0.6 - (l.lines.length - 1) * CONNECTOR_PITCH;
  return (
    <>
      <line x1={l.axis} y1={lineFrom} x2={l.axis} y2={lineFrom + CONNECTOR_LINE} />
      {l.lines.map((text, i) => (
        <GrafcetText key={i} x={l.axis} y={firstBaseline + i * CONNECTOR_PITCH} text={text} anchor="middle" />
      ))}
    </>
  );
}
