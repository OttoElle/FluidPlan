import {
  ACTUATION_NAMES,
  COIL_VARIANT_NAMES,
  CONTACT_FUNCTION_NAMES,
  CONTACT_INDEXES,
  contactTerminals,
  DELAY_NAMES,
  LAMP_COLORS,
  RAIL_NAMES,
  RAIL_SPACINGS,
  RAIL_TAPS,
  SENSING_NAMES,
  type CoilVariant,
  type ContactActuation,
  type ContactDelay,
  type ContactFunction,
  type ElectricCoilConfig,
  type ElectricContactConfig,
  type ElectricLampConfig,
  type ElectricRailConfig,
  type ElectricSensorConfig,
  type RailPolarity,
  type Sensing,
} from '../../model/electric.ts';
import type { ConfigEditorProps } from './configEditors.tsx';
import { Segmented } from './Segmented.tsx';
import { Check, Field, symbolOptions } from './symbolEditors.tsx';

/** Konfiguratoren der Schaltzeichen für Stromlaufpläne (DIN EN 60617). */

const keys = <T extends string>(r: Record<T, string>) => Object.keys(r) as T[];

export function ContactEditor({ config, onChange }: ConfigEditorProps<ElectricContactConfig>) {
  const v = (c: Partial<ElectricContactConfig>): ElectricContactConfig => ({ ...config, ...c });
  const t = contactTerminals(config);
  const terminals = [t.top, t.bottom, t.nc].filter(Boolean).join(' / ');
  const manual = config.actuation !== 'none' && config.actuation !== 'position' && config.actuation !== 'proximity';
  return (
    <div className="configurator config-grid">
      <Field title="Kontaktart" wide>
        <Segmented
          label="Kontaktart"
          value={config.function}
          onChange={(fn) => onChange(v({ function: fn }))}
          options={symbolOptions(keys(CONTACT_FUNCTION_NAMES), (f: ContactFunction) => CONTACT_FUNCTION_NAMES[f], (fn) => v({ function: fn }))}
        />
      </Field>
      <Field title="Betätigung" wide>
        <Segmented
          label="Betätigung"
          value={config.actuation}
          onChange={(actuation) => onChange(v({ actuation }))}
          options={symbolOptions(keys(ACTUATION_NAMES), (a: ContactActuation) => ACTUATION_NAMES[a], (actuation) => v({ actuation }))}
        />
      </Field>
      {config.actuation === 'proximity' && (
        <Field title="Näherungsschalter" wide>
          <Segmented
            label="Näherungsschalter"
            value={config.sensing}
            onChange={(sensing) => onChange(v({ sensing }))}
            options={symbolOptions(keys(SENSING_NAMES), (s: Sensing) => SENSING_NAMES[s], (sensing) => v({ sensing }))}
          />
        </Field>
      )}
      {config.actuation === 'none' && (
        <Field title="Zeitverhalten (Zeitrelais)" wide>
          <Segmented
            label="Zeitverhalten"
            value={config.delay}
            onChange={(delay) => onChange(v({ delay }))}
            options={symbolOptions(keys(DELAY_NAMES), (d: ContactDelay) => DELAY_NAMES[d], (delay) => v({ delay }))}
          />
        </Field>
      )}
      <Field title="Darstellung">
        {manual && <Check title="Mit Raste (Stellschalter)" checked={config.detent} onChange={(detent) => onChange(v({ detent }))} />}
        <Check title="In betätigtem Zustand gezeichnet (↑)" checked={config.actuated} onChange={(actuated) => onChange(v({ actuated }))} />
      </Field>
      <label className="field">
        <span>Ordnungsziffer (Anschlüsse {terminals})</span>
        <select value={config.index} onChange={(e) => onChange(v({ index: Number(e.target.value) }))}>
          {CONTACT_INDEXES.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function CoilEditor({ config, onChange }: ConfigEditorProps<ElectricCoilConfig>) {
  const v = (c: Partial<ElectricCoilConfig>): ElectricCoilConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Art" wide>
        <Segmented
          label="Art"
          value={config.variant}
          onChange={(variant) => onChange(v({ variant }))}
          options={symbolOptions(keys(COIL_VARIANT_NAMES), (c: CoilVariant) => COIL_VARIANT_NAMES[c], (variant) => v({ variant }))}
        />
      </Field>
      {config.variant !== 'solenoid' && (
        <Field title="Kontaktspiegel" wide>
          <Check
            title="Unter dem Strompfad zeigen (Kontakte mit gleichem Kennzeichen, Strompfade der +24-V-Schiene)"
            checked={config.contactTable}
            onChange={(contactTable) => onChange(v({ contactTable }))}
          />
        </Field>
      )}
    </div>
  );
}

export function LampEditor({ config, onChange }: ConfigEditorProps<ElectricLampConfig>) {
  return (
    <div className="configurator config-grid">
      <label className="field">
        <span>Farbe</span>
        <select value={config.color} onChange={(e) => onChange({ ...config, color: e.target.value })}>
          {Object.entries(LAMP_COLORS).map(([k, name]) => (
            <option key={k} value={k}>
              {k ? `${k} (${name})` : name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function ElectricSensorEditor({ config, onChange }: ConfigEditorProps<ElectricSensorConfig>) {
  const v = (c: Partial<ElectricSensorConfig>): ElectricSensorConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Art" wide>
        <Segmented
          label="Art"
          value={config.sensing}
          onChange={(sensing) => onChange(v({ sensing }))}
          options={symbolOptions(keys(SENSING_NAMES), (s: Sensing) => SENSING_NAMES[s], (sensing) => v({ sensing }))}
        />
      </Field>
      <Field title="Schaltausgang BK" wide>
        <Segmented
          label="Schaltausgang"
          value={config.output}
          onChange={(output) => onChange(v({ output }))}
          options={symbolOptions(['no', 'nc'] as const, (o) => (o === 'no' ? 'Schließer' : 'Öffner'), (output) => v({ output }))}
        />
      </Field>
    </div>
  );
}

export function RailEditor({ config, onChange }: ConfigEditorProps<ElectricRailConfig>) {
  const v = (c: Partial<ElectricRailConfig>): ElectricRailConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Lage" wide>
        <Segmented
          label="Lage"
          value={config.polarity}
          onChange={(polarity) => onChange(v({ polarity }))}
          options={keys(RAIL_NAMES).map((p: RailPolarity) => ({ value: p, label: RAIL_NAMES[p], icon: p === 'plus' ? '+24 V' : '0 V' }))}
        />
      </Field>
      <label className="field">
        <span>Beschriftung</span>
        <input value={config.text} placeholder="z. B. +24 V, L+, 0 V oder L−" onChange={(e) => onChange(v({ text: e.target.value }))} />
      </label>
      <label className="field">
        <span>Anzahl Strompfade</span>
        <select value={config.taps} onChange={(e) => onChange(v({ taps: Number(e.target.value) }))}>
          {RAIL_TAPS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <Field title="Abstand der Strompfade" wide>
        <Segmented
          label="Abstand der Strompfade"
          value={config.spacing}
          onChange={(spacing) => onChange(v({ spacing }))}
          options={RAIL_SPACINGS.map((s) => ({ value: s, label: `${s * 2.5} mm (${s} Rasterschritte)`, icon: `${s * 2.5}` }))}
        />
      </Field>
      {config.polarity === 'plus' && (
        <>
          <Field title="Strompfade">
            <Check title="Nummerieren (über der Schiene)" checked={config.numbering} onChange={(numbering) => onChange(v({ numbering }))} />
          </Field>
          {config.numbering && (
            <label className="field">
              <span>Erster Strompfad</span>
              <input
                type="number"
                min={0}
                max={999}
                value={config.start}
                onChange={(e) => onChange(v({ start: Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))) }))}
              />
            </label>
          )}
        </>
      )}
    </div>
  );
}
