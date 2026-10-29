import { Plus, X } from 'lucide-react';
import type { ComponentType } from 'react';
import { IconButton } from '../IconButton.tsx';
import {
  AccumulatorEditor,
  BallValveEditor,
  CouplingEditor,
  CylinderEditor,
  RotaryEditor,
  SensorEditor,
  TankEditor,
} from './symbolEditors.tsx';
import type { ComponentConfig, Domain } from '../../model/types.ts';
import {
  ACTUATOR_NAMES,
  ACTUATORS,
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

/** Was ein Konfigurator bekommt: die aktuelle Konfiguration und wohin Änderungen gehen. */
export interface ConfigEditorProps<C extends ComponentConfig = ComponentConfig> {
  config: C;
  /** Medium des Schaltplans, z. B. für Anschlussbezeichnungen. */
  domain: Domain;
  onChange: (config: C) => void;
}

type ConfigOf<K extends ComponentConfig['kind']> = Extract<ComponentConfig, { kind: K }>;

/**
 * Konfigurator je Konfigurationsart (`config.kind`). Erweiterungspunkt für neue
 * konfigurierbare Bauteile: Art in ComponentConfig (types.ts) aufnehmen und hier
 * einen Eintrag ergänzen; TypeScript meldet fehlende Einträge. Der Eintrag
 * erscheint im Eigenschaften-Fenster als Reiter „Konfigurator“.
 */
export const CONFIG_EDITORS: { [K in ComponentConfig['kind']]: ComponentType<ConfigEditorProps<ConfigOf<K>>> } = {
  'directional-valve': ValveConfigurator,
  cylinder: CylinderEditor,
  pump: RotaryEditor,
  motor: RotaryEditor,
  tank: TankEditor,
  accumulator: AccumulatorEditor,
  'ball-valve': BallValveEditor,
  coupling: CouplingEditor,
  sensor: SensorEditor,
};

/** Passenden Konfigurator für eine beliebige Konfiguration anzeigen. */
export function Configurator({ config, domain, onChange }: ConfigEditorProps) {
  const Editor = CONFIG_EDITORS[config.kind] as ComponentType<ConfigEditorProps>;
  return <Editor config={config} domain={domain} onChange={onChange} />;
}

const PATH_KIND_SYMBOL: Record<PathKind, string> = { flow: '→', both: '↔', open: '—' };

function ValveConfigurator({ config, onChange }: ConfigEditorProps<DirectionalValveConfig>) {
  const set = (c: DirectionalValveConfig) => onChange(normalizeValve(c));
  const roles = rolesOf(config.ports);
  const names = positionNames(config.positions.length);
  const label = (r: ValveRole) => portLabel(config, r);
  const templates = positionTemplates(config.ports);

  const setPaths = (index: number, paths: ValvePath[]) =>
    set({ ...config, positions: config.positions.map((p, i) => (i === index ? { paths } : p)) });

  return (
    <div className="configurator">
      <div className="row">
        <label>
          Anschlüsse
          <select
            value={config.ports}
            onChange={(e) => set(resizeValve(config, Number(e.target.value) as DirectionalValveConfig['ports'], config.positions.length))}
          >
            {PORT_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stellungen
          <select value={config.positions.length} onChange={(e) => set(resizeValve(config, config.ports, Number(e.target.value)))}>
            {POSITION_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ruhestellung
          <select value={config.rest} onChange={(e) => set({ ...config, rest: Number(e.target.value) })}>
            {names.map((n, i) => (
              <option key={n} value={i}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>

      {config.positions.map((pos, i) => (
        <fieldset key={i} className="position">
          <legend>
            Stellung {names[i]}
            {i === config.rest ? ' (Ruhestellung)' : ''}
          </legend>
          <select
            aria-label={`Vorlage für Stellung ${names[i]}`}
            value=""
            onChange={(e) => {
              const t = templates[Number(e.target.value)];
              if (t) setPaths(i, t.paths.map((p) => ({ ...p })));
            }}
          >
            <option value="">Vorlage wählen…</option>
            {templates.map((t, k) => (
              <option key={t.name} value={k}>
                {t.name.replace(/\b([PTABRS])\b/g, (m) => label(m as ValveRole))}
              </option>
            ))}
          </select>
          {pos.paths.map((p, k) => (
            <div key={k} className="row path">
              <RoleSelect value={p.from} roles={roles} label={label} onChange={(from) => setPaths(i, replace(pos.paths, k, { ...p, from }))} />
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
              <RoleSelect value={p.to} roles={roles} label={label} onChange={(to) => setPaths(i, replace(pos.paths, k, { ...p, to }))} />
              <IconButton icon={X} label="Weg entfernen" tooltip="left" onClick={() => setPaths(i, pos.paths.filter((_, j) => j !== k))} />
            </div>
          ))}
          <button
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

      <ActuatorList title="Betätigung links" list={config.left} onChange={(left) => set({ ...config, left })} />
      <ActuatorList title="Betätigung rechts" list={config.right} onChange={(right) => set({ ...config, right })} />
    </div>
  );
}

function replace<T>(list: T[], index: number, item: T): T[] {
  return list.map((x, i) => (i === index ? item : x));
}

function RoleSelect({
  value,
  roles,
  label,
  onChange,
}: {
  value: ValveRole;
  roles: ValveRole[];
  label: (r: ValveRole) => string;
  onChange: (r: ValveRole) => void;
}) {
  return (
    <select aria-label="Anschluss" value={value} onChange={(e) => onChange(e.target.value as ValveRole)}>
      {roles.map((r) => (
        <option key={r} value={r}>
          {label(r)}
        </option>
      ))}
    </select>
  );
}

function ActuatorList({ title, list, onChange }: { title: string; list: Actuator[]; onChange: (l: Actuator[]) => void }) {
  const available = ACTUATORS.filter((a) => !list.includes(a));
  return (
    <fieldset className="actuators">
      <legend>{title}</legend>
      {list.map((a) => (
        <div key={a} className="row chip">
          <span>{ACTUATOR_NAMES[a]}</span>
          <IconButton icon={X} label={`${ACTUATOR_NAMES[a]} entfernen`} tooltip="left" onClick={() => onChange(list.filter((x) => x !== a))} />
        </div>
      ))}
      {list.length < MAX_ACTUATORS && (
        <select
          aria-label={`${title} hinzufügen`}
          value=""
          onChange={(e) => e.target.value && onChange([...list, e.target.value as Actuator])}
        >
          <option value="">+ hinzufügen…</option>
          {available.map((a) => (
            <option key={a} value={a}>
              {ACTUATOR_NAMES[a]}
            </option>
          ))}
        </select>
      )}
    </fieldset>
  );
}
