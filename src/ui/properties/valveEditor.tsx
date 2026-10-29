import { Plus, X } from 'lucide-react';
import { IconButton } from '../IconButton.tsx';
import { ActuatorIcon, FieldIcon } from '../valveSymbol.tsx';
import {
  ACTUATOR_NAMES,
  MAX_ACTUATORS,
  normalizeValve,
  PORT_COUNTS,
  portLabel,
  POSITION_COUNTS,
  positionNames,
  positionTemplates,
  resizeValve,
  rolesOf,
  type Actuator,
  type DirectionalValveConfig,
  type PathKind,
  type ValvePath,
  type ValveRole,
} from '../../model/valve.ts';
import type { ConfigEditorProps } from './configEditors.tsx';
import { Segmented } from './Segmented.tsx';
import { SymbolPicker, type PickerOption } from './SymbolPicker.tsx';

/**
 * Konfigurator für Wegeventile, aufgebaut wie das Symbol selbst:
 * Betätigungen links und rechts in drei Gruppen (Muskelkraft, mechanisch,
 * elektrisch/Druck) plus Feder und Vorsteuerung, in der Mitte die
 * Schaltstellungen als Symbolauswahl mit der Ruhestellung darunter.
 * Wer Wege einzeln festlegen will, findet das unter „Wege einzeln bearbeiten“.
 */

const MANUAL: Actuator[] = ['manual', 'pushbutton', 'lever', 'pedal'];
const MECHANICAL: Actuator[] = ['plunger', 'roller', 'detent'];
const POWERED: Actuator[] = ['solenoid', 'pilot'];

interface SideState {
  manual?: Actuator;
  mechanical?: Actuator;
  powered?: Actuator;
  spring: boolean;
  piloted: boolean;
}

function sideState(list: Actuator[]): SideState {
  return {
    manual: list.find((a) => MANUAL.includes(a)),
    mechanical: list.find((a) => MECHANICAL.includes(a)),
    powered: list.includes('solenoid-pilot') ? 'solenoid' : list.find((a) => POWERED.includes(a)),
    spring: list.includes('spring'),
    piloted: list.includes('solenoid-pilot'),
  };
}

/** Liste in Norm-Reihenfolge; normalizeValve begrenzt auf MAX_ACTUATORS. */
function sideList(s: SideState): Actuator[] {
  const powered = s.powered === 'solenoid' && s.piloted ? 'solenoid-pilot' : s.powered;
  return [powered, s.spring ? 'spring' : undefined, s.mechanical, s.manual].filter((a): a is Actuator => a !== undefined);
}

function ActuationColumn({
  title,
  list,
  medium,
  mirrored,
  onChange,
}: {
  title: string;
  list: Actuator[];
  medium: DirectionalValveConfig['medium'];
  mirrored: boolean;
  onChange: (list: Actuator[]) => void;
}) {
  const s = sideState(list);
  const set = (change: Partial<SideState>) => onChange(sideList({ ...s, ...change }));
  const options = (kinds: Actuator[]): PickerOption<Actuator>[] =>
    kinds.map((kind) => ({
      value: kind,
      label: ACTUATOR_NAMES[kind],
      icon: (
        <span className={mirrored ? 'mirrored' : undefined}>
          <ActuatorIcon kind={kind} medium={medium} />
        </span>
      ),
    }));
  const full = sideList(s).length >= MAX_ACTUATORS;
  return (
    <fieldset className="actuation">
      <legend>{title}</legend>
      <div className="actuation-row">
        <SymbolPicker label="Muskelkraft" value={s.manual} options={options(MANUAL)} onChange={(manual) => set({ manual })} />
        <span>Muskelkraft</span>
      </div>
      <div className="actuation-row">
        <SymbolPicker label="Mechanisch" value={s.mechanical} options={options(MECHANICAL)} onChange={(mechanical) => set({ mechanical })} />
        <span>Mechanisch</span>
      </div>
      <div className="actuation-row">
        <SymbolPicker label="Elektrisch oder Druck" value={s.powered} options={options(POWERED)} onChange={(powered) => set({ powered })} />
        <span>Elektrisch / Druck</span>
      </div>
      <label className="check">
        <input type="checkbox" checked={s.spring} onChange={(e) => set({ spring: e.target.checked })} />
        Federrückstellung
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.piloted}
          disabled={s.powered !== 'solenoid'}
          onChange={(e) => set({ piloted: e.target.checked })}
        />
        Vorgesteuert
      </label>
      {full && <p className="hint">Höchstens {MAX_ACTUATORS} Betätigungen je Seite.</p>}
    </fieldset>
  );
}

const samePaths = (a: ValvePath[], b: ValvePath[]) => JSON.stringify(a) === JSON.stringify(b);

export function ValveConfigurator({ config, onChange }: ConfigEditorProps<DirectionalValveConfig>) {
  const set = (c: DirectionalValveConfig) => onChange(normalizeValve(c));
  const names = positionNames(config.positions.length);
  const templates = positionTemplates(config.ports);
  const setPaths = (index: number, paths: ValvePath[]) =>
    set({ ...config, positions: config.positions.map((p, i) => (i === index ? { paths } : p)) });

  return (
    <div className="configurator valve-editor">
      <div className="valve-size">
        <div className="field">
          <span>Anschlüsse</span>
          <Segmented
            label="Anschlüsse"
            value={config.ports}
            onChange={(ports) => set(resizeValve(config, ports, config.positions.length))}
            options={PORT_COUNTS.map((n) => ({ value: n, label: `${n} Anschlüsse`, icon: <span>{n}</span> }))}
          />
        </div>
        <div className="field">
          <span>Stellungen</span>
          <Segmented
            label="Stellungen"
            value={config.positions.length}
            onChange={(n) => set(resizeValve(config, config.ports, n))}
            options={POSITION_COUNTS.map((n) => ({ value: n, label: `${n} Schaltstellungen`, icon: <span>{n}</span> }))}
          />
        </div>
      </div>
      <div className="valve-columns">
        <ActuationColumn
          title="Betätigung links"
          list={config.left}
          medium={config.medium}
          mirrored
          onChange={(left) => set({ ...config, left })}
        />
        <fieldset className="valve-body">
          <legend>Schaltstellungen</legend>
          <div className="positions">
            {config.positions.map((pos, i) => {
              const options: PickerOption<number>[] = templates.map((t, k) => ({
                value: k,
                label: t.name.replace(/\b([PTABRS])\b/g, (m) => portLabel(config, m as ValveRole)),
                icon: <FieldIcon config={config} paths={t.paths} />,
              }));
              const match = templates.findIndex((t) => samePaths(t.paths, pos.paths));
              // Eigene Wege, die keiner Vorlage entsprechen, als zusätzliche Wahl zeigen.
              if (match < 0) options.push({ value: -1, label: 'Eigene Wege', icon: <FieldIcon config={config} paths={pos.paths} /> });
              return (
                <div key={i} className="position-pick">
                  <SymbolPicker
                    label={`Stellung ${names[i]}`}
                    value={match < 0 ? -1 : match}
                    empty={null}
                    options={options}
                    onChange={(k) => k !== undefined && k >= 0 && setPaths(i, templates[k]!.paths.map((p) => ({ ...p })))}
                  />
                  <span className="position-name">{names[i]}</span>
                  <label className="rest" data-tooltip="Ruhestellung">
                    <input
                      type="radio"
                      name="valve-rest"
                      checked={config.rest === i}
                      aria-label={`Stellung ${names[i]} ist Ruhestellung`}
                      onChange={() => set({ ...config, rest: i })}
                    />
                  </label>
                </div>
              );
            })}
          </div>
          <p className="hint">Punkt = Ruhestellung (dort liegen die Anschlüsse).</p>
        </fieldset>
        <ActuationColumn
          title="Betätigung rechts"
          list={config.right}
          medium={config.medium}
          mirrored={false}
          onChange={(right) => set({ ...config, right })}
        />
      </div>
      <details className="path-editor">
        <summary>Wege einzeln bearbeiten</summary>
        <PathEditor config={config} names={names} setPaths={setPaths} />
      </details>
    </div>
  );
}

const PATH_KIND_SYMBOL: Record<PathKind, string> = { flow: '→', both: '↔', open: '—' };

function PathEditor({
  config,
  names,
  setPaths,
}: {
  config: DirectionalValveConfig;
  names: string[];
  setPaths: (index: number, paths: ValvePath[]) => void;
}) {
  const roles = rolesOf(config.ports);
  const label = (r: ValveRole) => portLabel(config, r);
  const roleSelect = (value: ValveRole, onChange: (r: ValveRole) => void) => (
    <select aria-label="Anschluss" value={value} onChange={(e) => onChange(e.target.value as ValveRole)}>
      {roles.map((r) => (
        <option key={r} value={r}>
          {label(r)}
        </option>
      ))}
    </select>
  );
  const replace = <T,>(list: T[], index: number, item: T) => list.map((x, i) => (i === index ? item : x));
  return (
    <>
      {config.positions.map((pos, i) => (
        <fieldset key={i} className="position">
          <legend>Stellung {names[i]}</legend>
          {pos.paths.map((p, k) => (
            <div key={k} className="row path">
              {roleSelect(p.from, (from) => setPaths(i, replace(pos.paths, k, { ...p, from })))}
              <select
                aria-label="Art des Weges"
                value={p.kind}
                onChange={(e) => setPaths(i, replace(pos.paths, k, { ...p, kind: e.target.value as PathKind }))}
              >
                {(Object.keys(PATH_KIND_SYMBOL) as PathKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {PATH_KIND_SYMBOL[kind]}
                  </option>
                ))}
              </select>
              {roleSelect(p.to, (to) => setPaths(i, replace(pos.paths, k, { ...p, to })))}
              <IconButton icon={X} label="Weg entfernen" tooltip="left" onClick={() => setPaths(i, pos.paths.filter((_, j) => j !== k))} />
            </div>
          ))}
          <button
            type="button"
            className="with-icon"
            onClick={() => {
              // Erstes noch freies Anschlusspaar vorschlagen.
              const used = new Set(pos.paths.flatMap((p) => [p.from, p.to]));
              const free = roles.filter((r) => !used.has(r));
              const from = free[0] ?? roles[0]!;
              const to = free.find((r) => r !== from) ?? roles.find((r) => r !== from)!;
              setPaths(i, [...pos.paths, { from, to, kind: 'flow' }]);
            }}
          >
            <Plus size={14} aria-hidden /> Weg
          </button>
          {pos.paths.length === 0 && <p className="hint">Alle Anschlüsse gesperrt.</p>}
        </fieldset>
      ))}
    </>
  );
}
