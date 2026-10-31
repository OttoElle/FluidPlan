import type { ComponentType } from 'react';
import type { ComponentConfig, Domain } from '../../model/types.ts';
import {
  AccumulatorEditor,
  BallValveEditor,
  CheckValveEditor,
  CoolerEditor,
  CouplingEditor,
  CylinderEditor,
  FilterEditor,
  FlowDividerEditor,
  IndicatorEditor,
  InstrumentEditor,
  PressureValveEditor,
  RotaryEditor,
  SensorEditor,
  TankEditor,
  ThrottleEditor,
} from './symbolEditors.tsx';
import { ValveConfigurator } from './valveEditor.tsx';

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
const CONFIG_EDITORS: { [K in ComponentConfig['kind']]: ComponentType<ConfigEditorProps<ConfigOf<K>>> } = {
  'directional-valve': ValveConfigurator,
  cylinder: CylinderEditor,
  pump: RotaryEditor,
  motor: RotaryEditor,
  tank: TankEditor,
  accumulator: AccumulatorEditor,
  'ball-valve': BallValveEditor,
  coupling: CouplingEditor,
  sensor: SensorEditor,
  'check-valve': CheckValveEditor,
  'pressure-valve': PressureValveEditor,
  throttle: ThrottleEditor,
  'flow-divider': FlowDividerEditor,
  filter: FilterEditor,
  cooler: CoolerEditor,
  instrument: InstrumentEditor,
  indicator: IndicatorEditor,
};

/** Passenden Konfigurator für eine beliebige Konfiguration anzeigen. */
export function Configurator({ config, domain, onChange }: ConfigEditorProps) {
  const Editor = CONFIG_EDITORS[config.kind] as ComponentType<ConfigEditorProps>;
  return <Editor config={config} domain={domain} onChange={onChange} />;
}
