import { useRef } from 'react';
import {
  ACTION_TYPE_NAMES,
  CONNECTOR_DIRECTION_NAMES,
  STEP_VARIANT_NAMES,
  SYNC_COUNTS,
  SYNC_SPACINGS,
  type ActionType,
  type ConnectorDirection,
  type GrafcetActionConfig,
  type GrafcetConnectorConfig,
  type GrafcetStepConfig,
  type GrafcetSyncConfig,
  type GrafcetTransitionConfig,
  type StepVariant,
} from '../../model/grafcet.ts';
import type { ConfigEditorProps } from './configEditors.tsx';
import { Segmented } from './Segmented.tsx';
import { Check, Field, symbolOptions } from './symbolEditors.tsx';

/**
 * Konfiguratoren der GRAFCET-Elemente (DIN EN 60848). Texte wie
 * Transitionsbedingungen tippt man ein; Zeichen, die auf der Tastatur fehlen
 * (Flanken, UND-Punkt), fügen kleine Schaltflächen an der Schreibmarke ein.
 */

const keys = <T extends string>(r: Record<T, string>) => Object.keys(r) as T[];

/** Zeichen für Bedingungen: Flanken (Symbole [15], [16]), UND, ODER, Negation. */
const CONDITION_CHARS: [string, string][] = [
  ['↑', 'Steigende Flanke'],
  ['↓', 'Fallende Flanke'],
  [' · ', 'UND'],
  [' + ', 'ODER'],
  ['!', 'Negation: ! vor einem Namen oder einer Klammer wird als Überstrich gezeichnet'],
];

/** Textfeld mit Schaltflächen, die Sonderzeichen an der Schreibmarke einfügen. */
function ExpressionInput({
  value,
  onChange,
  placeholder,
  chars = CONDITION_CHARS,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  chars?: [string, string][];
}) {
  const ref = useRef<HTMLInputElement>(null);
  const insert = (text: string) => {
    const input = ref.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  return (
    <div className="expression-input">
      <input ref={ref} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      <div className="expression-chars">
        {chars.map(([text, title]) => (
          <button key={text} type="button" className="char-button" title={title} onClick={() => insert(text)}>
            {text.trim()}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GrafcetStepEditor({ config, onChange }: ConfigEditorProps<GrafcetStepConfig>) {
  const v = (c: Partial<GrafcetStepConfig>): GrafcetStepConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Art" wide>
        <Segmented
          label="Art"
          value={config.variant}
          onChange={(variant) => onChange(v({ variant }))}
          options={symbolOptions(keys(STEP_VARIANT_NAMES), (s: StepVariant) => STEP_VARIANT_NAMES[s], (variant) => v({ variant }))}
        />
      </Field>
      <label className="field">
        <span>Schrittbezeichnung</span>
        <input value={config.name} placeholder={config.variant === 'macro' ? 'z. B. M1' : 'z. B. 2'} onChange={(e) => onChange(v({ name: e.target.value }))} />
      </label>
      <Field title="Darstellung">
        <Check title="Als aktiv markieren (Punkt)" checked={config.active} onChange={(active) => onChange(v({ active }))} />
      </Field>
    </div>
  );
}

export function GrafcetTransitionEditor({ config, onChange }: ConfigEditorProps<GrafcetTransitionConfig>) {
  const v = (c: Partial<GrafcetTransitionConfig>): GrafcetTransitionConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Transitionsbedingung" wide>
        <ExpressionInput
          value={config.condition}
          onChange={(condition) => onChange(v({ condition }))}
          placeholder="z. B. S1 · !B2, ↑a, 3s/X2, [C1 = 3] oder 1"
          chars={[...CONDITION_CHARS, ['s/X', 'Zeitverzögerung: t/Variable, z. B. 3s/X2'], ['[ ]', 'Aussage, z. B. [C1 = 3]']]}
        />
      </Field>
      <label className="field">
        <span>Transitionsname (optional)</span>
        <input value={config.name} placeholder="z. B. 8" onChange={(e) => onChange(v({ name: e.target.value }))} />
      </label>
    </div>
  );
}

export function GrafcetActionEditor({ config, onChange }: ConfigEditorProps<GrafcetActionConfig>) {
  const v = (c: Partial<GrafcetActionConfig>): GrafcetActionConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Wirkungsart" wide>
        <Segmented
          label="Wirkungsart"
          value={config.type}
          onChange={(type) => onChange(v({ type }))}
          options={symbolOptions(keys(ACTION_TYPE_NAMES), (t: ActionType) => ACTION_TYPE_NAMES[t], (type) => v({ type }))}
        />
      </Field>
      <label className="field wide">
        <span>{config.type === 'forcing' ? 'Situation des Teil-GRAFCET' : config.type === 'continuous' ? 'Ausgang' : 'Zuordnung'}</span>
        <input
          value={config.text}
          placeholder={config.type === 'forcing' ? 'z. B. G2{INIT}, G3{*}, G4{}, G12{8,9,11}' : config.type === 'continuous' ? 'z. B. Y1 oder Ventil 2 öffnen' : 'z. B. A := 1 oder C := C + 1'}
          onChange={(e) => onChange(v({ text: e.target.value }))}
        />
      </label>
      {(config.type === 'continuous' || config.type === 'event') && (
        <Field title={config.type === 'event' ? 'Ereignis' : 'Zuweisungsbedingung (optional)'} wide>
          <ExpressionInput
            value={config.condition}
            onChange={(condition) => onChange(v({ condition }))}
            placeholder={config.type === 'event' ? 'z. B. ↑a oder ↑(a + b)' : 'z. B. d, 3s/X27 oder !B1'}
          />
        </Field>
      )}
    </div>
  );
}

export function GrafcetSyncEditor({ config, onChange }: ConfigEditorProps<GrafcetSyncConfig>) {
  const v = (c: Partial<GrafcetSyncConfig>): GrafcetSyncConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Wirkungslinien oben" wide>
        <Segmented label="Wirkungslinien oben" value={config.above} onChange={(above) => onChange(v({ above }))} options={symbolOptions(SYNC_COUNTS, String, (above) => v({ above }))} />
      </Field>
      <Field title="Wirkungslinien unten" wide>
        <Segmented label="Wirkungslinien unten" value={config.below} onChange={(below) => onChange(v({ below }))} options={symbolOptions(SYNC_COUNTS, String, (below) => v({ below }))} />
      </Field>
      <Field title="Abstand der Ablaufketten" wide>
        <Segmented
          label="Abstand der Ablaufketten"
          value={config.spacing}
          onChange={(spacing) => onChange(v({ spacing }))}
          options={SYNC_SPACINGS.map((s) => ({ value: s, label: `${s * 2.5} mm (${s} Rasterschritte)`, icon: `${s * 2.5}` }))}
        />
      </Field>
    </div>
  );
}

export function GrafcetConnectorEditor({ config, onChange }: ConfigEditorProps<GrafcetConnectorConfig>) {
  const v = (c: Partial<GrafcetConnectorConfig>): GrafcetConnectorConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Richtung" wide>
        <Segmented
          label="Richtung"
          value={config.direction}
          onChange={(direction) => onChange(v({ direction }))}
          options={symbolOptions(keys(CONNECTOR_DIRECTION_NAMES), (d: ConnectorDirection) => CONNECTOR_DIRECTION_NAMES[d], (direction) => v({ direction }))}
        />
      </Field>
      <label className="field wide">
        <span>Zielschritt und Seite (eine Angabe je Zeile)</span>
        <textarea rows={2} value={config.target} onChange={(e) => onChange(v({ target: e.target.value }))} />
      </label>
    </div>
  );
}
