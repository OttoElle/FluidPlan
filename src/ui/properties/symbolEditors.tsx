import type { ReactNode } from 'react';
import { BORES, normalizeBallValve, WAYS, type BallValveConfig, type BallValveWays } from '../../model/ballValve.ts';
import { CHECK_COUNTS, CHECK_NAMES, type CouplingConfig } from '../../model/coupling.ts';
import {
  ACTION_NAMES,
  CUSHION_NAMES,
  DESIGN_NAMES,
  hasStroke,
  normalizeCylinder,
  ROD_NAMES,
  SPRING_NAMES,
  type Cushion,
  type CylinderAction,
  type CylinderConfig,
  type CylinderDesign,
  type CylinderRod,
  type CylinderSpring,
} from '../../model/cylinder.ts';
import { typeOfConfig } from '../../model/library.ts';
import { DIRECTION_COUNTS, DISPLACEMENT_NAMES, normalizeRotary, type RotaryConfig } from '../../model/rotary.ts';
import { normalizeSensor, OUTPUT_NAMES, QUANTITY_NAMES, type Quantity, type SensorConfig, type SensorOutput } from '../../model/sensor.ts';
import {
  ACCUMULATOR_NAMES,
  ACCUMULATOR_TYPES,
  LINE_END_NAMES,
  TANK_LINES,
  type AccumulatorConfig,
  type LineEnd,
  type TankConfig,
} from '../../model/storage.ts';
import type { ComponentConfig } from '../../model/types.ts';
import { SymbolPreview } from '../SymbolPreview.tsx';
import type { ConfigEditorProps } from './configEditors.tsx';
import { Segmented, type SegmentOption } from './Segmented.tsx';

/**
 * Konfiguratoren der Grundsymbole (Zylinder, Pumpe/Motor, Kugelhahn,
 * Speicher, Tank, Schnelltrennkupplung, Sensor). Jede Auswahl zeigt die
 * Möglichkeiten als kleine Symbolvorschau, der Name steht im Tooltip.
 */

/** Kleine Vorschau einer Variante als Symbol auf der Schaltfläche. */
function variantIcon(config: ComponentConfig): ReactNode {
  return <SymbolPreview component={{ type: typeOfConfig(config), config }} width={46} height={26} unitsPerPixel={2.4} />;
}

/** Auswahl mit Symbolvorschau: `variant` baut die Konfiguration für jeden Wert. */
function symbolOptions<T extends string | number>(
  values: readonly T[],
  name: (v: T) => string,
  variant: (v: T) => ComponentConfig,
): SegmentOption<T>[] {
  return values.map((value) => ({ value, label: name(value), icon: variantIcon(variant(value)) }));
}

function Field({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'field wide' : 'field'}>
      <span>{title}</span>
      {children}
    </div>
  );
}

function Check({ title, checked, onChange }: { title: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {title}
    </label>
  );
}

const keys = <T extends string>(r: Record<T, string>) => Object.keys(r) as T[];

// --- Zylinder -------------------------------------------------------------------

export function CylinderEditor({ config, onChange }: ConfigEditorProps<CylinderConfig>) {
  const set = (c: Partial<CylinderConfig>) => onChange(normalizeCylinder({ ...config, ...c }));
  const variant = (c: Partial<CylinderConfig>) => normalizeCylinder({ ...config, stroke: 0, ...c });
  const piston = config.design === 'piston';
  const cushion = (side: 'piston' | 'rod', title: string) => (
    <Field title={title}>
      <Segmented<Cushion>
        label={title}
        value={config.cushion[side]}
        onChange={(v) => set({ cushion: { ...config.cushion, [side]: v } })}
        options={keys(CUSHION_NAMES).map((value) => ({ value, label: CUSHION_NAMES[value] }))}
      />
    </Field>
  );
  return (
    <div className="configurator config-grid">
      <Field title="Bauart" wide>
        <Segmented<CylinderDesign>
          label="Bauart"
          value={config.design}
          onChange={(design) => set({ design, action: design === 'piston' ? config.action : 'single' })}
          options={symbolOptions(keys(DESIGN_NAMES), (v) => DESIGN_NAMES[v], (design) => variant({ design, action: design === 'piston' ? config.action : 'single' }))}
        />
      </Field>
      {config.design !== 'plunger' && (
        <Field title="Wirkungsweise">
          <Segmented<CylinderAction>
            label="Wirkungsweise"
            value={config.action}
            onChange={(action) => set({ action, spring: action === 'single' && config.spring === 'none' ? 'rod' : config.spring })}
            options={symbolOptions(keys(ACTION_NAMES), (v) => ACTION_NAMES[v], (action) =>
              variant({ action, spring: action === 'single' && config.spring === 'none' ? 'rod' : config.spring }),
            )}
          />
        </Field>
      )}
      {piston && (
        <Field title="Kolbenstange">
          <Segmented<CylinderRod>
            label="Kolbenstange"
            value={config.rod}
            onChange={(rod) => set({ rod })}
            options={symbolOptions(keys(ROD_NAMES), (v) => ROD_NAMES[v], (rod) => variant({ rod }))}
          />
        </Field>
      )}
      {piston && config.action === 'single' && (
        <Field title="Rückstellung" wide>
          <Segmented<CylinderSpring>
            label="Rückstellung"
            value={config.spring}
            onChange={(spring) => set({ spring })}
            options={symbolOptions(keys(SPRING_NAMES), (v) => SPRING_NAMES[v], (spring) => variant({ spring }))}
          />
        </Field>
      )}
      {piston && cushion('piston', 'Dämpfung kolbenseitig')}
      {piston && cushion('rod', 'Dämpfung stangenseitig')}
      {hasStroke(config) && (
        <Field title={`Kolbenstellung: ${config.stroke} %`} wide>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={config.stroke}
            aria-label="Kolbenstellung in Prozent des Hubs"
            onChange={(e) => set({ stroke: Number(e.target.value) })}
          />
        </Field>
      )}
    </div>
  );
}

// --- Pumpe und Motor -------------------------------------------------------------

export function RotaryEditor<C extends RotaryConfig>({ config, onChange }: ConfigEditorProps<C>) {
  const set = (c: Partial<RotaryConfig>) => onChange(normalizeRotary({ ...config, ...c }) as C);
  const variant = (c: Partial<RotaryConfig>) => normalizeRotary({ ...config, ...c }) as ComponentConfig;
  const pump = config.kind === 'pump';
  const hydraulic = config.medium === 'hydraulic';
  return (
    <div className="configurator config-grid">
      <Field title="Verdrängung">
        <Segmented
          label="Verdrängung"
          value={config.displacement}
          onChange={(displacement) => set({ displacement })}
          options={symbolOptions(keys(DISPLACEMENT_NAMES), (v) => DISPLACEMENT_NAMES[v], (displacement) => variant({ displacement }))}
        />
      </Field>
      {(hydraulic || !pump) && (
        <Field title={pump ? 'Förderrichtungen' : 'Drehrichtungen'}>
          <Segmented
            label={pump ? 'Förderrichtungen' : 'Drehrichtungen'}
            value={config.directions}
            onChange={(directions) => set({ directions })}
            options={symbolOptions(DIRECTION_COUNTS, (n) => (n === 1 ? 'Eine Richtung' : 'Zwei Richtungen'), (directions) => variant({ directions }))}
          />
        </Field>
      )}
      {hydraulic && <Check title="Leckanschluss" checked={config.drain} onChange={(drain) => set({ drain })} />}
      {pump && (
        <Check title="Mit Elektromotor (Motor-Pumpe-Einheit)" checked={config.electricMotor} onChange={(electricMotor) => set({ electricMotor })} />
      )}
    </div>
  );
}

// --- Kugelhahn ------------------------------------------------------------------

export function BallValveEditor({ config, onChange }: ConfigEditorProps<BallValveConfig>) {
  const bores = Object.keys(BORES[config.ways]);
  return (
    <div className="configurator config-grid">
      <Field title="Wege" wide>
        <Segmented<BallValveWays>
          label="Wege"
          value={config.ways}
          onChange={(ways) => onChange(normalizeBallValve({ ...config, ways }))}
          options={symbolOptions(WAYS, (n) => `${n}-Wege-Kugelhahn`, (ways) => normalizeBallValve({ ...config, ways }))}
        />
      </Field>
      <Field title="Schaltstellung" wide>
        <Segmented<string>
          label="Schaltstellung"
          value={config.bore}
          onChange={(bore) => onChange({ ...config, bore })}
          options={symbolOptions(bores, (b) => BORES[config.ways][b]!.name, (bore) => ({ ...config, bore }))}
        />
      </Field>
    </div>
  );
}

// --- Speicher und Tank -------------------------------------------------------------

export function AccumulatorEditor({ config, domain, onChange }: ConfigEditorProps<AccumulatorConfig>) {
  const types = ACCUMULATOR_TYPES[domain].includes(config.type) ? ACCUMULATOR_TYPES[domain] : [config.type, ...ACCUMULATOR_TYPES[domain]];
  return (
    <div className="configurator config-grid">
      <Field title="Bauart" wide>
        <Segmented
          label="Bauart"
          value={config.type}
          onChange={(type) => onChange({ ...config, type })}
          options={symbolOptions(types, (t) => ACCUMULATOR_NAMES[t], (type) => ({ ...config, type }))}
        />
      </Field>
    </div>
  );
}

export function TankEditor({ config, onChange }: ConfigEditorProps<TankConfig>) {
  const set = (c: Partial<TankConfig>) => onChange({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Ausführung">
        <Segmented
          label="Ausführung"
          value={config.closed ? 'closed' : 'open'}
          onChange={(v) => set({ closed: v === 'closed' })}
          options={symbolOptions(['open', 'closed'] as const, (v) => (v === 'open' ? 'Offen' : 'Geschlossen'), (v) => ({ ...config, closed: v === 'closed' }))}
        />
      </Field>
      <Field title="Rückführungen">
        <Segmented
          label="Rückführungen"
          value={config.lines}
          onChange={(lines) => set({ lines })}
          options={symbolOptions(TANK_LINES, (n) => `${n} Leitung${n > 1 ? 'en' : ''}`, (lines) => ({ ...config, lines }))}
        />
      </Field>
      <Field title="Leitung endet" wide>
        <Segmented<LineEnd>
          label="Leitung endet"
          value={config.lineEnd}
          onChange={(lineEnd) => set({ lineEnd })}
          options={symbolOptions(keys(LINE_END_NAMES), (v) => LINE_END_NAMES[v], (lineEnd) => ({ ...config, lineEnd }))}
        />
      </Field>
    </div>
  );
}

// --- Schnelltrennkupplung ---------------------------------------------------------

export function CouplingEditor({ config, onChange }: ConfigEditorProps<CouplingConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Rückschlagventile">
        <Segmented
          label="Rückschlagventile"
          value={config.checks}
          onChange={(checks) => onChange({ ...config, checks })}
          options={symbolOptions(CHECK_COUNTS, (n) => CHECK_NAMES[n], (checks) => ({ ...config, checks }))}
        />
      </Field>
      <Field title="Zustand">
        <Segmented
          label="Zustand"
          value={config.coupled ? 'coupled' : 'uncoupled'}
          onChange={(v) => onChange({ ...config, coupled: v === 'coupled' })}
          options={symbolOptions(['coupled', 'uncoupled'] as const, (v) => (v === 'coupled' ? 'Gekuppelt' : 'Entkuppelt'), (v) => ({
            ...config,
            coupled: v === 'coupled',
          }))}
        />
      </Field>
    </div>
  );
}

// --- Sensor -----------------------------------------------------------------------

export function SensorEditor({ config, onChange }: ConfigEditorProps<SensorConfig>) {
  const set = (c: Partial<SensorConfig>) => onChange(normalizeSensor({ ...config, ...c }));
  const variant = (c: Partial<SensorConfig>) => normalizeSensor({ ...config, ...c });
  const outputs = keys(OUTPUT_NAMES).filter((o) => o !== 'mechanical' || config.quantity === 'pressure');
  return (
    <div className="configurator config-grid">
      <Field title="Messgröße" wide>
        <Segmented<Quantity>
          label="Messgröße"
          value={config.quantity}
          onChange={(quantity) => set({ quantity })}
          options={symbolOptions(keys(QUANTITY_NAMES), (v) => QUANTITY_NAMES[v], (quantity) => variant({ quantity }))}
        />
      </Field>
      <Field title="Ausgangssignal">
        <Segmented<SensorOutput>
          label="Ausgangssignal"
          value={config.output}
          onChange={(output) => set({ output })}
          options={symbolOptions(outputs, (v) => OUTPUT_NAMES[v], (output) => variant({ output }))}
        />
      </Field>
      {config.output !== 'mechanical' && (
        <Check title="Schaltpunkt einstellbar" checked={config.adjustable} onChange={(adjustable) => set({ adjustable })} />
      )}
    </div>
  );
}
