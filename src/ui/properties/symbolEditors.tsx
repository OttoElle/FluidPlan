import type { ReactNode } from 'react';
import {
  CONVERTER_NAMES,
  ENGINE_NAMES,
  MANIFOLD_OUTLETS,
  SWIVEL_ACTION_NAMES,
  type ManifoldConfig,
  type PressureConverterConfig,
  type PrimeMoverConfig,
  type SwivelConfig,
} from '../../model/actuators.ts';
import { BORES, normalizeBallValve, WAYS, type BallValveConfig, type BallValveWays } from '../../model/ballValve.ts';
import { CHECK_COUNTS, CHECK_NAMES, CHECK_SIDE_NAMES, type CouplingConfig } from '../../model/coupling.ts';
import { COOLANT_NAMES, FILTER_DESIGN_NAMES, FILTER_INDICATOR_NAMES, type CoolerConfig, type FilterConfig } from '../../model/conditioning.ts';
import {
  FLOW_DIVIDER_NAMES,
  PRESSURE_FUNCTION_NAMES,
  THROTTLE_ELEMENT_NAMES,
  type CheckValveConfig,
  type FlowDividerConfig,
  type PressureValveConfig,
  type ThrottleConfig,
} from '../../model/fluidValves.ts';
import { INDICATOR_NAMES, INSTRUMENT_NAMES, type IndicatorConfig, type InstrumentConfig } from '../../model/instruments.ts';
import {
  canDetent,
  canVent,
  DESIGN_NAMES,
  DETENT_NAMES,
  hasStroke,
  LIMIT_SWITCH_NAMES,
  normalizeCylinder,
  ROD_ACTUATOR_NAMES,
  ROD_ACTUATORS,
  ROD_NAMES,
  type RodActuator,
  type Cushion,
  type CylinderConfig,
  type CylinderDesign,
  type CylinderRod,
} from '../../model/cylinder.ts';
import { typeOfConfig } from '../../model/library.ts';
import { DIRECTION_COUNTS, DISPLACEMENT_NAMES, normalizeRotary, ROTATION_NAMES, type RotaryConfig, type Rotation } from '../../model/rotary.ts';
import { normalizeSensor, OUTPUT_NAMES, QUANTITY_NAMES, type Quantity, type SensorConfig, type SensorOutput } from '../../model/sensor.ts';
import {
  ACCUMULATOR_NAMES,
  ACCUMULATOR_TYPES,
  LINE_END_NAMES,
  TANK_LINES,
  TANK_SIZE_NAMES,
  type AccumulatorConfig,
  type LineEnd,
  type TankConfig,
} from '../../model/storage.ts';
import type { ComponentConfig } from '../../model/types.ts';
import { SymbolPreview } from '../SymbolPreview.tsx';
import { ActuatorIcon } from '../valveSymbol.tsx';
import type { ConfigEditorProps } from './configEditors.tsx';
import { Segmented, type SegmentOption } from './Segmented.tsx';
import { SymbolPicker } from './SymbolPicker.tsx';

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

type Direction = 'push' | 'pull' | 'double';

/** Wie in FluidDraw gegliedert: Zylinderart, Kolben, Kolbenstange, Kolbenstellung. */
export function CylinderEditor({ config, onChange }: ConfigEditorProps<CylinderConfig>) {
  const set = (c: Partial<CylinderConfig>) => onChange(normalizeCylinder({ ...config, ...c }));
  const variant = (c: Partial<CylinderConfig>) => normalizeCylinder({ ...config, stroke: 0, ...c });
  const diaphragm = config.design === 'diaphragm';
  const rodless = config.rod === 'rodless';
  // Kolben- und Membranzylinder haben dieselben Einstellungen für Kolben und Stange
  const piston = config.design === 'piston' || diaphragm;
  const direction: Direction = config.action === 'double' ? 'double' : config.spring === 'piston' ? 'pull' : 'push';
  const setDirection = (d: Direction) =>
    set(
      d === 'double'
        ? { action: 'double' }
        : { action: 'single', spring: d === 'pull' ? 'piston' : config.spring === 'none' && !diaphragm ? 'none' : 'rod' },
    );
  const directions: { value: Direction; label: string }[] = rodless
    ? []
    : piston
    ? [
        { value: 'push', label: 'Einfachwirkend, drückend →' },
        { value: 'pull', label: 'Einfachwirkend, ziehend ←' },
        { value: 'double', label: 'Doppeltwirkend ↔' },
      ]
    : config.design === 'telescopic'
      ? [
          { value: 'push', label: 'Einfachwirkend' },
          { value: 'double', label: 'Doppeltwirkend' },
        ]
      : [];
  const { piston: cp, rod: cr } = config.cushion;
  const adjustable = cp === 'adjustable' || cr === 'adjustable';
  const cushion = (pistonSide: boolean, rodSide: boolean, adj: boolean) => {
    const kind: Cushion = adj ? 'adjustable' : 'fixed';
    set({ cushion: { piston: pistonSide ? kind : 'none', rod: rodSide ? kind : 'none' } });
  };
  return (
    <div className="configurator cylinder-editor">
      <fieldset>
        <legend>Zylinderart</legend>
        <div className="group-row">
          <SymbolPicker<CylinderDesign>
            label="Bauart"
            value={config.design}
            empty={null}
            onChange={(design) => design && set(designChange(config, design))}
            options={keys(DESIGN_NAMES).map((design) => ({
              value: design,
              label: DESIGN_NAMES[design],
              icon: variantIcon(variant(designChange(config, design))),
            }))}
          />
          <div className="radio-list" role="radiogroup" aria-label="Wirkungsweise">
            {directions.map((d) => (
              <label key={d.value} className="check">
                <input type="radio" name="cyl-direction" checked={direction === d.value} onChange={() => setDirection(d.value)} />
                {d.label}
              </label>
            ))}
            {config.design === 'plunger' && <span className="hint">Plungerzylinder sind immer einfachwirkend.</span>}
            {rodless && <span className="hint">Kolbenstangenlose Zylinder sind doppeltwirkend.</span>}
          </div>
          {config.design === 'piston' && direction === 'push' && (
            <label className="check">
              <input type="checkbox" checked={config.spring === 'rod'} onChange={(e) => set({ spring: e.target.checked ? 'rod' : 'none' })} />
              Rückstellfeder
            </label>
          )}
          {piston && config.spring !== 'none' && (
            <label className="check">
              <input type="checkbox" checked={config.springPort} onChange={(e) => set({ springPort: e.target.checked })} />
              Federraum mit Anschluss
            </label>
          )}
        </div>
      </fieldset>
      {piston && (
        <div className="group-columns">
          <fieldset>
            <legend>Kolben: Endlagendämpfung</legend>
            <label className="check">
              <input type="checkbox" checked={cp !== 'none'} onChange={(e) => cushion(e.target.checked, cr !== 'none', adjustable)} />
              Kolbenseitig
            </label>
            <label className="check">
              <input type="checkbox" checked={cr !== 'none'} onChange={(e) => cushion(cp !== 'none', e.target.checked, adjustable)} />
              Stangenseitig
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={adjustable}
                disabled={cp === 'none' && cr === 'none'}
                onChange={(e) => cushion(cp !== 'none', cr !== 'none', e.target.checked)}
              />
              Einstellbar
            </label>
          </fieldset>
          <fieldset>
            <legend>Kolbenstange</legend>
            {!diaphragm && (
              <SymbolPicker<CylinderRod>
                label="Kolbenstange"
                value={config.rod}
                empty={null}
                onChange={(rod) => rod && set({ rod })}
                options={keys(ROD_NAMES).map((rod) => ({ value: rod, label: ROD_NAMES[rod], icon: variantIcon(variant({ rod })) }))}
              />
            )}
            {!rodless && <div className="actuation-row">
              <SymbolPicker<RodActuator>
                label="Betätigung am Stangenende"
                value={config.rodActuator === 'none' ? undefined : config.rodActuator}
                onChange={(a) => set({ rodActuator: a ?? 'none' })}
                options={ROD_ACTUATORS.map((a) => ({ value: a, label: ROD_ACTUATOR_NAMES[a], icon: <ActuatorIcon kind={a} medium="hydraulic" /> }))}
              />
              <span>Betätigung am Stangenende</span>
            </div>}
          </fieldset>
        </div>
      )}
      {piston && (
        <fieldset>
          <legend>Ausstattung</legend>
          <div className="config-grid">
            <Field title="Endschalter" wide>
              <Segmented
                label="Endschalter"
                value={config.limitSwitch}
                onChange={(limitSwitch) => set({ limitSwitch })}
                options={symbolOptions(keys(LIMIT_SWITCH_NAMES), (v) => LIMIT_SWITCH_NAMES[v], (limitSwitch) => variant({ limitSwitch }))}
              />
            </Field>
            {canDetent(config) && (
              <Field title="Raste" wide>
                <Segmented
                  label="Raste"
                  value={config.detent}
                  onChange={(detent) => set({ detent })}
                  options={symbolOptions(keys(DETENT_NAMES), (v) => DETENT_NAMES[v], (detent) => variant({ detent }))}
                />
              </Field>
            )}
            {canVent(config) && (
              <Check title="Entlüftung ohne Anschlussmöglichkeit" checked={config.vent} onChange={(vent) => set({ vent })} />
            )}
            {diaphragm && (
              <Check title="Hubbegrenzung, voreingestellt" checked={config.strokeLimiter} onChange={(strokeLimiter) => set({ strokeLimiter })} />
            )}
          </div>
        </fieldset>
      )}
      {hasStroke(config) && (
        <fieldset>
          <legend>Kolbenstellung</legend>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            list="stroke-ticks"
            value={config.stroke}
            aria-label="Kolbenstellung in Prozent des Hubs"
            onChange={(e) => set({ stroke: Number(e.target.value) })}
          />
          <datalist id="stroke-ticks">
            {[0, 25, 50, 75, 100].map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="ticks">
            {[0, 25, 50, 75, 100].map((v) => (
              <span key={v}>{v} %</span>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

/** Beim Wechsel der Bauart bleibt die Wirkungsweise, soweit die neue Bauart sie kennt. */
function designChange(config: CylinderConfig, design: CylinderDesign): Partial<CylinderConfig> {
  if (design === 'piston' || design === 'diaphragm') {
    return { design, action: config.action, rod: config.rod === 'rodless' && design === 'diaphragm' ? 'single' : config.rod };
  }
  return { design, action: 'single' };
}

// --- Pumpe und Motor -------------------------------------------------------------

/** Motoren mit zwei Drehrichtungen zeigen immer beide Pfeilspitzen, mit einer nie. */
function rotationChoices(config: RotaryConfig): Rotation[] {
  if (config.kind === 'motor') return config.directions === 2 ? ['none', 'both'] : ['none', 'cw', 'ccw'];
  return ['none', 'cw', 'ccw', 'both'];
}

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
      <Field title="Drehrichtung">
        <Segmented
          label="Drehrichtung"
          value={config.rotation}
          onChange={(rotation) => set({ rotation })}
          options={symbolOptions(rotationChoices(config), (v) => ROTATION_NAMES[v], (rotation) => variant({ rotation }))}
        />
      </Field>
      {hydraulic && <Check title="Leckölanschluss" checked={config.drain} onChange={(drain) => set({ drain })} />}
      {pump && hydraulic && (
        <Toggle
          title="Arbeitsweise"
          names={['Pumpe', 'Pumpe/Motor']}
          value={config.pumpMotor}
          variant={(pumpMotor) => variant({ pumpMotor }) as C}
          onChange={onChange}
        />
      )}
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
      <Field title="Größe">
        <Segmented
          label="Größe"
          value={config.size}
          onChange={(size) => set({ size })}
          options={symbolOptions(keys(TANK_SIZE_NAMES), (v) => TANK_SIZE_NAMES[v], (size) => ({ ...config, size }))}
        />
      </Field>
      <Field title="Leitung endet">
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
      {config.checks === 1 && (
        <Field title="Rückschlagventil">
          <Segmented
            label="Rückschlagventil"
            value={config.checkSide}
            onChange={(checkSide) => onChange({ ...config, checkSide })}
            options={symbolOptions(keys(CHECK_SIDE_NAMES), (v) => CHECK_SIDE_NAMES[v], (checkSide) => ({ ...config, checkSide }))}
          />
        </Field>
      )}
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

// --- Sperr-, Strom- und Druckventile ------------------------------------------------

const YES_NO = ['no', 'yes'] as const;
type YesNo = (typeof YES_NO)[number];
const yn = (v: boolean): YesNo => (v ? 'yes' : 'no');

/** Ja/Nein-Auswahl mit Symbolvorschau beider Varianten. */
function Toggle<C extends ComponentConfig>({
  title,
  names,
  value,
  variant,
  onChange,
}: {
  title: string;
  names: [string, string];
  value: boolean;
  variant: (v: boolean) => C;
  onChange: (config: C) => void;
}) {
  return (
    <Field title={title}>
      <Segmented
        label={title}
        value={yn(value)}
        onChange={(v) => onChange(variant(v === 'yes'))}
        options={symbolOptions(YES_NO, (v) => names[v === 'yes' ? 1 : 0], (v) => variant(v === 'yes'))}
      />
    </Field>
  );
}

export function CheckValveEditor({ config, onChange }: ConfigEditorProps<CheckValveConfig>) {
  const v = (c: Partial<CheckValveConfig>): CheckValveConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Toggle title="Bauart" names={['Einfach', 'Doppelt, entsperrbar']} value={config.double} variant={(double) => v({ double })} onChange={onChange} />
      {!config.double && (
        <>
          <Toggle title="Feder" names={['Ohne Feder', 'Mit Feder']} value={config.spring} variant={(spring) => v({ spring })} onChange={onChange} />
          <Toggle title="Entsperrbar" names={['Nein', 'Ja (Steueranschluss X)']} value={config.piloted} variant={(piloted) => v({ piloted })} onChange={onChange} />
        </>
      )}
    </div>
  );
}

export function PressureValveEditor({ config, onChange }: ConfigEditorProps<PressureValveConfig>) {
  const v = (c: Partial<PressureValveConfig>): PressureValveConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Funktion" wide>
        <Segmented
          label="Funktion"
          value={config.function}
          onChange={(fn) => onChange(v({ function: fn }))}
          options={symbolOptions(keys(PRESSURE_FUNCTION_NAMES), (f) => PRESSURE_FUNCTION_NAMES[f], (fn) => v({ function: fn }))}
        />
      </Field>
      <Toggle title="Einstellung" names={['Fest', 'Einstellbar']} value={config.adjustable} variant={(adjustable) => v({ adjustable })} onChange={onChange} />
      <Toggle title="Steuerung" names={['Direktgesteuert', 'Vorgesteuert']} value={config.piloted} variant={(piloted) => v({ piloted })} onChange={onChange} />
    </div>
  );
}

export function ThrottleEditor({ config, onChange }: ConfigEditorProps<ThrottleConfig>) {
  const v = (c: Partial<ThrottleConfig>): ThrottleConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Engstelle">
        <Segmented
          label="Engstelle"
          value={config.element}
          onChange={(element) => onChange(v({ element }))}
          options={symbolOptions(keys(THROTTLE_ELEMENT_NAMES), (e) => THROTTLE_ELEMENT_NAMES[e], (element) => v({ element }))}
        />
      </Field>
      <Toggle title="Einstellung" names={['Fest', 'Einstellbar']} value={config.adjustable} variant={(adjustable) => v({ adjustable })} onChange={onChange} />
      <Toggle title="Rückschlagventil" names={['Ohne', 'Mit Rückschlagventil']} value={config.check} variant={(check) => v({ check })} onChange={onChange} />
    </div>
  );
}

export function FlowDividerEditor({ config, onChange }: ConfigEditorProps<FlowDividerConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Funktion" wide>
        <Segmented
          label="Funktion"
          value={config.mode}
          onChange={(mode) => onChange({ ...config, mode })}
          options={symbolOptions(keys(FLOW_DIVIDER_NAMES), (m) => FLOW_DIVIDER_NAMES[m], (mode) => ({ ...config, mode }))}
        />
      </Field>
    </div>
  );
}

// --- Aufbereitung ------------------------------------------------------------------

export function FilterEditor({ config, onChange }: ConfigEditorProps<FilterConfig>) {
  const v = (c: Partial<FilterConfig>): FilterConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Bauart" wide>
        <Segmented
          label="Bauart"
          value={config.design}
          onChange={(design) => onChange(v({ design }))}
          options={symbolOptions(keys(FILTER_DESIGN_NAMES), (d) => FILTER_DESIGN_NAMES[d], (design) => v({ design }))}
        />
      </Field>
      {config.design === 'filter' && (
        <>
          <Field title="Anzeige" wide>
            <Segmented
              label="Anzeige"
              value={config.indicator}
              onChange={(indicator) => onChange(v({ indicator }))}
              options={symbolOptions(keys(FILTER_INDICATOR_NAMES), (i) => FILTER_INDICATOR_NAMES[i], (indicator) => v({ indicator }))}
            />
          </Field>
          <Toggle title="Magnetelement" names={['Ohne', 'Mit Magnetelement']} value={config.magnet} variant={(magnet) => v({ magnet })} onChange={onChange} />
          <Toggle title="Umgehungsventil" names={['Ohne', 'Mit Umgehungsventil']} value={config.bypass} variant={(bypass) => v({ bypass })} onChange={onChange} />
        </>
      )}
    </div>
  );
}

export function CoolerEditor({ config, onChange }: ConfigEditorProps<CoolerConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Kühlung" wide>
        <Segmented
          label="Kühlung"
          value={config.coolant}
          onChange={(coolant) => onChange({ ...config, coolant })}
          options={symbolOptions(keys(COOLANT_NAMES), (c) => COOLANT_NAMES[c], (coolant) => ({ ...config, coolant }))}
        />
      </Field>
    </div>
  );
}

// --- Messen ---------------------------------------------------------------------

export function InstrumentEditor({ config, onChange }: ConfigEditorProps<InstrumentConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Messgröße" wide>
        <Segmented
          label="Messgröße"
          value={config.quantity}
          onChange={(quantity) => onChange({ ...config, quantity })}
          options={symbolOptions(keys(INSTRUMENT_NAMES), (q) => INSTRUMENT_NAMES[q], (quantity) => ({ ...config, quantity }))}
        />
      </Field>
    </div>
  );
}

export function IndicatorEditor({ config, onChange }: ConfigEditorProps<IndicatorConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Art" wide>
        <Segmented
          label="Art"
          value={config.type}
          onChange={(type) => onChange({ ...config, type })}
          options={symbolOptions(keys(INDICATOR_NAMES), (t) => INDICATOR_NAMES[t], (type) => ({ ...config, type }))}
        />
      </Field>
    </div>
  );
}

// --- Antriebe, Wandler, Verteiler -----------------------------------------------

export function SwivelEditor({ config, onChange }: ConfigEditorProps<SwivelConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Wirkungsweise" wide>
        <Segmented
          label="Wirkungsweise"
          value={config.action}
          onChange={(action) => onChange({ ...config, action })}
          options={symbolOptions(keys(SWIVEL_ACTION_NAMES), (a) => SWIVEL_ACTION_NAMES[a], (action) => ({ ...config, action }))}
        />
      </Field>
    </div>
  );
}

export function PressureConverterEditor({ config, onChange }: ConfigEditorProps<PressureConverterConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Bauart" wide>
        <Segmented
          label="Bauart"
          value={config.type}
          onChange={(type) => onChange({ ...config, type })}
          options={symbolOptions(keys(CONVERTER_NAMES), (t) => CONVERTER_NAMES[t], (type) => ({ ...config, type }))}
        />
      </Field>
    </div>
  );
}

export function PrimeMoverEditor({ config, onChange }: ConfigEditorProps<PrimeMoverConfig>) {
  const v = (c: Partial<PrimeMoverConfig>): PrimeMoverConfig => ({ ...config, ...c });
  return (
    <div className="configurator config-grid">
      <Field title="Bauart" wide>
        <Segmented
          label="Bauart"
          value={config.engine}
          onChange={(engine) => onChange(v({ engine }))}
          options={symbolOptions(keys(ENGINE_NAMES), (e) => ENGINE_NAMES[e], (engine) => v({ engine }))}
        />
      </Field>
      <Field title="Drehrichtung" wide>
        <Segmented
          label="Drehrichtung"
          value={config.rotation}
          onChange={(rotation) => onChange(v({ rotation }))}
          options={symbolOptions(keys(ROTATION_NAMES), (r) => ROTATION_NAMES[r], (rotation) => v({ rotation }))}
        />
      </Field>
    </div>
  );
}

export function ManifoldEditor({ config, onChange }: ConfigEditorProps<ManifoldConfig>) {
  return (
    <div className="configurator config-grid">
      <Field title="Abgänge" wide>
        <Segmented
          label="Abgänge"
          value={config.outlets}
          onChange={(outlets) => onChange({ ...config, outlets })}
          options={symbolOptions(MANIFOLD_OUTLETS, (n) => `${n} Abgänge`, (outlets) => ({ ...config, outlets }))}
        />
      </Field>
    </div>
  );
}
