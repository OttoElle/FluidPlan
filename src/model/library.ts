import {
  ballValveGeometry,
  ballValveTitle,
  defaultBallValveConfig,
  readBallValveConfig,
  type BallValveConfig,
} from './ballValve.ts';
import { couplingGeometry, couplingTitle, defaultCouplingConfig, readCouplingConfig, type CouplingConfig } from './coupling.ts';
import { cylinderGeometry, cylinderTitle, defaultCylinderConfig, readCylinderConfig, type CylinderConfig } from './cylinder.ts';
import {
  defaultMotorConfig,
  defaultPumpConfig,
  readMotorConfig,
  readPumpConfig,
  rotaryGeometry,
  rotaryTitle,
  type MotorConfig,
  type PumpConfig,
} from './rotary.ts';
import {
  defaultSensorConfig,
  readSensorConfig,
  sensorGeometry,
  sensorTitle,
  type Quantity,
  type SensorConfig,
  type SensorOutput,
} from './sensor.ts';
import {
  accumulatorGeometry,
  accumulatorTitle,
  defaultAccumulatorConfig,
  defaultTankConfig,
  readAccumulatorConfig,
  readTankConfig,
  tankGeometry,
  tankTitle,
  type AccumulatorConfig,
  type TankConfig,
} from './storage.ts';
import {
  coolerGeometry,
  coolerTitle,
  defaultCoolerConfig,
  defaultFilterConfig,
  filterGeometry,
  filterTitle,
  readCoolerConfig,
  readFilterConfig,
  type CoolerConfig,
  type FilterConfig,
} from './conditioning.ts';
import {
  checkValveGeometry,
  checkValveTitle,
  defaultCheckValveConfig,
  defaultFlowDividerConfig,
  defaultPressureValveConfig,
  defaultThrottleConfig,
  flowDividerGeometry,
  flowDividerTitle,
  pressureValveGeometry,
  pressureValveTitle,
  readCheckValveConfig,
  readFlowDividerConfig,
  readPressureValveConfig,
  readThrottleConfig,
  throttleGeometry,
  throttleTitle,
  type CheckValveConfig,
  type FlowDividerConfig,
  type PressureFunction,
  type PressureValveConfig,
  type ThrottleConfig,
} from './fluidValves.ts';
import {
  defaultIndicatorConfig,
  defaultInstrumentConfig,
  indicatorGeometry,
  indicatorTitle,
  instrumentGeometry,
  instrumentTitle,
  readIndicatorConfig,
  readInstrumentConfig,
  type IndicatorConfig,
  type InstrumentConfig,
} from './instruments.ts';
import type { ComponentConfig, ComponentDefinition, ComponentInstance, Domain, PortDefinition, PortKind } from './types.ts';
import {
  defaultValveConfig,
  readValveConfig,
  valveGeometry,
  valveTitle,
  type DirectionalValveConfig,
} from './valve.ts';

/**
 * Bauteilbibliothek.
 *
 * Alle Symbole sind im Modul M gezeichnet (ui/symbols.tsx), ein Rasterschritt
 * ist 1M = 10 Einheiten. Größen und Anschlüsse folgen den Grundmaßen aus
 * DIN ISO 1219-1 (Kreis 6M, Ventilfeld 4M, Zylinder 9M × 4M). Anschlüsse
 * liegen auf ganzen M und auf dem Rand des Symbols; Breite und Höhe in M haben
 * dieselbe Parität, damit die Anschlüsse auch gedreht auf dem Raster bleiben.
 *
 * Es gibt zwei Arten von Bauteilen:
 *   - feste Bauteile mit genau einem Symbol (Rückschlagventil, Filter, …),
 *   - konfigurierbare Bauteile (Wegeventil, Zylinder, Pumpe, Kugelhahn, …),
 *     deren Symbol, Größe und Anschlüsse sich aus der Konfiguration der
 *     Instanz ergeben. In der Bauteilliste steht je Grundsymbol ein Eintrag,
 *     die Einzelheiten stellt man im Konfigurator ein.
 */
export const MODULE = 10;

type PortSpec = [id: string, kind: PortKind, x: number, y: number, label?: string];

function fixed(
  type: string,
  name: string,
  domains: readonly Domain[],
  [width, height]: [number, number],
  ports: PortSpec[],
): ComponentDefinition {
  return {
    type,
    name,
    domains,
    size: { width: width * MODULE, height: height * MODULE },
    ports: ports.map(([id, kind, x, y, label]): PortDefinition => ({
      id,
      kind,
      offset: { x: x * MODULE, y: y * MODULE },
      ...(label ? { label } : {}),
    })),
  };
}

const H: Domain[] = ['hydraulic'];
const P: Domain[] = ['pneumatic'];
const HP: Domain[] = ['hydraulic', 'pneumatic'];

/** Feste Bauteile; Maße und Anschlusslagen in M. */
export const COMPONENT_LIBRARY: readonly ComponentDefinition[] = [
  // --- Druckerzeugung und Antriebe ---
  fixed('supply.electric-motor', 'Elektromotor', HP, [10, 10], []),
  fixed('supply.hand-pump', 'Handpumpe', H, [11, 9], [['P', 'pressure', 11, 3], ['S', 'return', 11, 6]]),
  fixed('supply.air-source', 'Druckluftquelle', P, [6, 2], [['1', 'pressure', 6, 1]]),

  // --- Aufbereitung ---
  fixed('supply.silencer', 'Schalldämpfer', P, [2, 6], [['3', 'return', 1, 0]]),
  fixed('supply.service-unit', 'Wartungseinheit', P, [14, 6], [['1', 'pressure', 0, 3], ['2', 'work', 14, 3]]),
  fixed('supply.heater', 'Heizung', H, [8, 10], [['1', 'work', 4, 0], ['2', 'work', 4, 10]]),
  fixed('supply.separator', 'Zentrifugalabscheider', H, [10, 8], [['1', 'work', 0, 4], ['2', 'work', 10, 4]]),

  // --- Sperrventile ---
  fixed('valve.shuttle', 'Wechselventil', HP, [12, 6], [
    ['X', 'work', 0, 4, '1'],
    ['Y', 'work', 12, 4, '1'],
    ['A', 'work', 6, 0, '2'],
  ]),
  fixed('valve.two-pressure', 'Zweidruckventil', HP, [12, 6], [
    ['X', 'work', 0, 4, '1'],
    ['Y', 'work', 12, 4, '1'],
    ['A', 'work', 6, 0, '2'],
  ]),

  // --- Stromventile ---
  fixed('valve.flow-control', '2-Wege-Stromregelventil', H, [10, 16], [['1', 'work', 3, 16], ['2', 'work', 3, 0]]),

  // --- Verbinder ---
  fixed('line.plug', 'Stopfen', HP, [2, 2], [['1', 'work', 1, 0]]),
  fixed('line.hose', 'Schlauchleitung', HP, [6, 2], [['1', 'work', 0, 1], ['2', 'work', 6, 1]]),
];

// --- Konfigurierbare Bauteile ------------------------------------------------

interface ConfigurableType<C extends ComponentConfig> {
  type: string;
  name: string;
  domains: readonly Domain[];
  defaultConfig: (domain: Domain) => C;
  title: (config: C) => string;
  geometry: (config: C, unit: number) => Pick<ComponentDefinition, 'size' | 'ports'>;
  read: (v: unknown, path: string, errors: string[]) => C | undefined;
}

const VALVE: ConfigurableType<DirectionalValveConfig> = {
  type: 'valve.directional',
  name: 'Wegeventil',
  domains: HP,
  defaultConfig: (domain) => defaultValveConfig(domain, domain === 'pneumatic' ? 5 : 4, 2),
  title: valveTitle,
  geometry: valveGeometry,
  read: readValveConfig,
};

const CYLINDER: ConfigurableType<CylinderConfig> = {
  type: 'actuator.cylinder',
  name: 'Zylinder',
  domains: HP,
  defaultConfig: () => defaultCylinderConfig('double'),
  title: cylinderTitle,
  geometry: cylinderGeometry,
  read: readCylinderConfig,
};

const PUMP: ConfigurableType<PumpConfig> = {
  type: 'supply.pump',
  name: 'Pumpe / Kompressor',
  domains: HP,
  defaultConfig: defaultPumpConfig,
  title: rotaryTitle,
  geometry: rotaryGeometry,
  read: readPumpConfig,
};

const MOTOR: ConfigurableType<MotorConfig> = {
  type: 'actuator.motor',
  name: 'Motor',
  domains: HP,
  defaultConfig: defaultMotorConfig,
  title: rotaryTitle,
  geometry: rotaryGeometry,
  read: readMotorConfig,
};

const TANK: ConfigurableType<TankConfig> = {
  type: 'supply.tank',
  name: 'Behälter',
  domains: H,
  defaultConfig: defaultTankConfig,
  title: tankTitle,
  geometry: tankGeometry,
  read: readTankConfig,
};

const ACCUMULATOR: ConfigurableType<AccumulatorConfig> = {
  type: 'supply.accumulator',
  name: 'Speicher',
  domains: HP,
  defaultConfig: defaultAccumulatorConfig,
  title: accumulatorTitle,
  geometry: accumulatorGeometry,
  read: readAccumulatorConfig,
};

const BALL_VALVE: ConfigurableType<BallValveConfig> = {
  type: 'valve.ball',
  name: 'Kugelhahn',
  domains: HP,
  defaultConfig: () => defaultBallValveConfig(2),
  title: ballValveTitle,
  geometry: ballValveGeometry,
  read: readBallValveConfig,
};

const COUPLING: ConfigurableType<CouplingConfig> = {
  type: 'line.coupling',
  name: 'Schnelltrennkupplung',
  domains: HP,
  defaultConfig: defaultCouplingConfig,
  title: couplingTitle,
  geometry: couplingGeometry,
  read: readCouplingConfig,
};

const SENSOR: ConfigurableType<SensorConfig> = {
  type: 'measure.sensor',
  name: 'Sensor',
  domains: HP,
  defaultConfig: () => defaultSensorConfig(),
  title: sensorTitle,
  geometry: sensorGeometry,
  read: readSensorConfig,
};

const CHECK_VALVE: ConfigurableType<CheckValveConfig> = {
  type: 'valve.check',
  name: 'Rückschlagventil',
  domains: HP,
  defaultConfig: defaultCheckValveConfig,
  title: checkValveTitle,
  geometry: checkValveGeometry,
  read: readCheckValveConfig,
};

const PRESSURE_VALVE: ConfigurableType<PressureValveConfig> = {
  type: 'valve.pressure',
  name: 'Druckventil',
  domains: HP,
  defaultConfig: () => defaultPressureValveConfig(),
  title: pressureValveTitle,
  geometry: pressureValveGeometry,
  read: readPressureValveConfig,
};

const THROTTLE: ConfigurableType<ThrottleConfig> = {
  type: 'valve.throttle',
  name: 'Drosselventil',
  domains: HP,
  defaultConfig: defaultThrottleConfig,
  title: throttleTitle,
  geometry: throttleGeometry,
  read: readThrottleConfig,
};

const FLOW_DIVIDER: ConfigurableType<FlowDividerConfig> = {
  type: 'valve.flow-divider',
  name: 'Stromteilerventil',
  domains: H,
  defaultConfig: defaultFlowDividerConfig,
  title: flowDividerTitle,
  geometry: flowDividerGeometry,
  read: readFlowDividerConfig,
};

const FILTER: ConfigurableType<FilterConfig> = {
  type: 'supply.filter',
  name: 'Filter',
  domains: HP,
  defaultConfig: defaultFilterConfig,
  title: filterTitle,
  geometry: filterGeometry,
  read: readFilterConfig,
};

const COOLER: ConfigurableType<CoolerConfig> = {
  type: 'supply.cooler',
  name: 'Kühler',
  domains: H,
  defaultConfig: defaultCoolerConfig,
  title: coolerTitle,
  geometry: coolerGeometry,
  read: readCoolerConfig,
};

const INSTRUMENT: ConfigurableType<InstrumentConfig> = {
  type: 'measure.gauge',
  name: 'Messgerät',
  domains: HP,
  defaultConfig: () => defaultInstrumentConfig(),
  title: instrumentTitle,
  geometry: instrumentGeometry,
  read: readInstrumentConfig,
};

const INDICATOR: ConfigurableType<IndicatorConfig> = {
  type: 'measure.indicator',
  name: 'Anzeige',
  domains: HP,
  defaultConfig: defaultIndicatorConfig,
  title: indicatorTitle,
  geometry: indicatorGeometry,
  read: readIndicatorConfig,
};

const CONFIGURABLE = new Map<string, ConfigurableType<any>>(
  [
    VALVE,
    CYLINDER,
    PUMP,
    MOTOR,
    TANK,
    ACCUMULATOR,
    BALL_VALVE,
    COUPLING,
    SENSOR,
    CHECK_VALVE,
    PRESSURE_VALVE,
    THROTTLE,
    FLOW_DIVIDER,
    FILTER,
    COOLER,
    INSTRUMENT,
    INDICATOR,
  ].map((t) => [t.type, t]),
);

const BY_TYPE = new Map(COMPONENT_LIBRARY.map((d) => [d.type, d]));

export function isConfigurable(type: string): boolean {
  return CONFIGURABLE.has(type);
}

export function isKnownType(type: string): boolean {
  return BY_TYPE.has(type) || CONFIGURABLE.has(type);
}

/** Startkonfiguration für einen konfigurierbaren Typ, sonst undefined. */
export function defaultConfigFor(type: string, domain: Domain): ComponentConfig | undefined {
  return CONFIGURABLE.get(type)?.defaultConfig(domain);
}

/** Bauteiltyp, zu dem eine Konfiguration gehört (z. B. für Vorschauen im Konfigurator). */
export function typeOfConfig(config: ComponentConfig): string {
  for (const t of CONFIGURABLE.values()) if (t.defaultConfig('hydraulic').kind === config.kind) return t.type;
  throw new Error(`Keine Bauteilart für Konfiguration "${config.kind}"`);
}

/** Prüft die Konfiguration eines konfigurierbaren Typs aus einer Datei. */
export function readConfig(type: string, v: unknown, path: string, errors: string[]): ComponentConfig | undefined {
  const t = CONFIGURABLE.get(type);
  if (!t) {
    errors.push(`${path}: Bauteiltyp "${type}" hat keine Konfiguration`);
    return undefined;
  }
  return t.read(v, path, errors);
}

/**
 * Angezeigte Anschlussnamen, die vom Medium des Bauteils abhängen.
 * Die Anschluss-IDs bleiben gleich, damit Leitungen gültig bleiben.
 *
 * Hydraulik nach ISO 9461: Ventile mit zwei Hauptanschlüssen heißen P (Eingang)
 * und A (Ausgang), Druckbegrenzungsventile P und T, Steueranschluss X.
 * Pneumatik nach DIN ISO 11727: Eingang 1, Ausgang 2, Entlüftung 3 (Abschnitte 6 bis 9).
 */
const PORT_NAMES: Record<Domain, Record<string, Record<string, string>>> = {
  hydraulic: {
    'valve.check': { '1': 'P', '2': 'A' },
    'valve.throttle': { '1': 'P', '2': 'A' },
    'valve.flow-control': { '1': 'P', '2': 'A' },
    // ISO 9461 kennt kein Wechselventil; Eingänge wie bei Ventilen mit zwei Hauptanschlüssen.
    'valve.shuttle': { X: 'P', Y: 'P', A: 'A' },
  },
  pneumatic: {
    'valve.pressure': { P: '1', T: '2', A: '2', L: '3' },
    'valve.check': { A1: '1', A2: '2', B1: '1', B2: '2' },
  },
};

/**
 * Medium eines Bauteils: das der Konfiguration (Wegeventil, Pumpe, Motor), sonst
 * das beim Einfügen gemerkte, sonst das einzige, für das es das Bauteil gibt,
 * sonst Hydraulik.
 */
export function mediumOf(component: Pick<ComponentInstance, 'type' | 'config' | 'medium'>): Domain {
  const configured = (component.config as { medium?: Domain } | undefined)?.medium;
  if (configured) return configured;
  if (component.medium) return component.medium;
  const domains = definitionOf(component)?.domains;
  return domains?.length === 1 ? domains[0]! : 'hydraulic';
}

/** Name eines Anschlusses, wie er im Schaltplan steht (abhängig vom Medium des Bauteils). */
export function portName(
  component: Pick<ComponentInstance, 'type' | 'config' | 'medium'>,
  port: Pick<PortDefinition, 'id' | 'label'>,
): string {
  const domain = mediumOf(component);
  const byType = PORT_NAMES[domain][component.type];
  if (byType?.[port.id]) return byType[port.id]!;
  // Zweiwege-Kugelhahn als Absperrventil (ISO 9461, 3.3); Drei- und Vierwege bleiben nummeriert.
  if (domain === 'hydraulic' && component.type === 'valve.ball' && (component.config as { ways?: number } | undefined)?.ways === 2) {
    return port.id === '1' ? 'P' : port.id === '2' ? 'A' : port.id;
  }
  return port.label ?? port.id;
}

/**
 * Definition (Name, Größe, Anschlüsse) eines Bauteils. Bei konfigurierbaren
 * Typen wird sie aus der Konfiguration berechnet; fehlt diese, gilt die
 * Startkonfiguration für Hydraulik.
 */
export function definitionOf(component: Pick<ComponentInstance, 'type' | 'config'>): ComponentDefinition | undefined {
  const t = CONFIGURABLE.get(component.type);
  if (!t) return BY_TYPE.get(component.type);
  const config = component.config?.kind === t.defaultConfig('hydraulic').kind ? component.config : t.defaultConfig('hydraulic');
  return { type: t.type, name: t.title(config), domains: t.domains, ...t.geometry(config, MODULE) };
}

/** Definition eines Typs ohne Konfiguration (konfigurierbare Typen in Startkonfiguration). */
export function getDefinition(type: string): ComponentDefinition | undefined {
  const legacy = LEGACY_TYPES[type];
  return legacy ? definitionOf(legacy) : definitionOf({ type });
}

export function definitionsFor(domain: Domain): ComponentDefinition[] {
  return COMPONENT_LIBRARY.filter((d) => d.domains.includes(domain));
}

// --- Bauteilliste in der Oberfläche ----------------------------------------------

export interface PaletteEntry {
  key: string;
  /** Bauteilkatalog, aus dem der Eintrag stammt; wird beim Einfügen am Bauteil gemerkt. */
  medium: Domain;
  name: string;
  group: string;
  type: string;
  config?: ComponentConfig;
  /** Einzelheiten wie Betätigung oder Wirkungsweise stellt man nach dem Einfügen im Konfigurator ein. */
  configurable?: boolean;
}

/** Bauteilkataloge in der Seitenleiste, in dieser Reihenfolge. */
export const MEDIUM_NAMES: Record<Domain, string> = { hydraulic: 'Hydraulik', pneumatic: 'Pneumatik' };

/** Kategorien der Bauteilliste, in dieser Reihenfolge (nach Ottos Liste vom 31.10.2026). */
export const PALETTE_GROUPS = [
  'Druckerzeugung',
  'Antriebe',
  'Zylinder',
  'Kugelhähne',
  'Wegeventile',
  'Sperrventile',
  'Stromventile',
  'Druckventile',
  'Speicher',
  'Verbinder',
  'Aufbereitung',
  'Messen',
] as const;

type PaletteGroup = (typeof PALETTE_GROUPS)[number];

/**
 * Bauteilkatalog eines Mediums: ein Eintrag je Grundform (z. B. 4/x-Wegeventil,
 * Plunger- und Teleskopzylinder, Druckbegrenzungsventil), Einzelheiten wie
 * Betätigung, Schaltstellungen oder Wirkungsweise stellt man im Konfigurator ein.
 */
export function paletteFor(domain: Domain): PaletteEntry[] {
  const hydraulic = domain === 'hydraulic';
  const c = (key: string, name: string, group: PaletteGroup, t: ConfigurableType<any>, config: ComponentConfig): PaletteEntry => ({
    key: `${domain}:${key}`,
    medium: domain,
    name,
    group,
    type: t.type,
    config,
    configurable: true,
  });
  const f = (type: string, group: PaletteGroup): PaletteEntry[] => {
    const d = BY_TYPE.get(type);
    if (!d || !d.domains.includes(domain)) return [];
    return [{ key: `${domain}:${type}`, medium: domain, name: d.name, group, type }];
  };
  const valve = (ports: DirectionalValveConfig['ports']) =>
    c(`valve-${ports}`, `${ports}/x-Wegeventil`, 'Wegeventile', VALVE, defaultValveConfig(domain, ports, 2));
  const ball = (ways: 2 | 3 | 4) => c(`ball-valve-${ways}`, `${ways}-Wege-Kugelhahn`, 'Kugelhähne', BALL_VALVE, defaultBallValveConfig(ways));
  const pressure = (fn: PressureFunction, name: string) => c(`pressure-${fn}`, name, 'Druckventile', PRESSURE_VALVE, defaultPressureValveConfig(fn));
  const sensor = (key: string, name: string, quantity: Quantity, output: SensorOutput) =>
    c(key, name, 'Messen', SENSOR, defaultSensorConfig(quantity, output));
  return [
    // Druckerzeugung
    c('pump', hydraulic ? 'Pumpe' : 'Kompressor', 'Druckerzeugung', PUMP, defaultPumpConfig(domain)),
    ...f('supply.hand-pump', 'Druckerzeugung'),
    ...f('supply.air-source', 'Druckerzeugung'),
    // Antriebe
    ...f('supply.electric-motor', 'Antriebe'),
    c('motor', hydraulic ? 'Hydromotor' : 'Druckluftmotor', 'Antriebe', MOTOR, defaultMotorConfig(domain)),
    // Zylinder
    c('cylinder', 'Zylinder', 'Zylinder', CYLINDER, defaultCylinderConfig('double')),
    ...(hydraulic
      ? [
          c('cyl-plunger', 'Plungerzylinder', 'Zylinder', CYLINDER, defaultCylinderConfig('single', 'plunger')),
          c('cyl-telescopic', 'Teleskopzylinder', 'Zylinder', CYLINDER, defaultCylinderConfig('single', 'telescopic')),
        ]
      : []),
    // Kugelhähne
    ball(2),
    ball(3),
    ball(4),
    // Wegeventile
    ...(hydraulic ? [valve(2), valve(3), valve(4), valve(5)] : [valve(2), valve(3), valve(5)]),
    // Sperrventile
    c('check', 'Rückschlagventil', 'Sperrventile', CHECK_VALVE, defaultCheckValveConfig()),
    ...f('valve.shuttle', 'Sperrventile'),
    ...f('valve.two-pressure', 'Sperrventile'),
    // Stromventile
    c('throttle', 'Drosselventil', 'Stromventile', THROTTLE, defaultThrottleConfig()),
    ...f('valve.flow-control', 'Stromventile'),
    ...(hydraulic ? [c('flow-divider', 'Stromteilerventil', 'Stromventile', FLOW_DIVIDER, defaultFlowDividerConfig())] : []),
    // Druckventile
    pressure('relief', 'Druckbegrenzungsventil'),
    pressure('reducing', 'Druckreduzierventil'),
    ...(hydraulic ? [pressure('sequence', 'Folgeventil')] : []),
    // Speicher
    ...(hydraulic ? [c('tank', 'Behälter', 'Speicher', TANK, defaultTankConfig())] : []),
    c('accumulator', hydraulic ? 'Speicher' : 'Luftbehälter', 'Speicher', ACCUMULATOR, defaultAccumulatorConfig(domain)),
    // Verbinder
    c('coupling', 'Schnelltrennkupplung', 'Verbinder', COUPLING, defaultCouplingConfig()),
    ...f('line.hose', 'Verbinder'),
    ...f('line.plug', 'Verbinder'),
    ...(hydraulic ? [c('tank-return', 'Behälterrückführung', 'Verbinder', TANK, { ...defaultTankConfig(), size: 'small' })] : []),
    // Aufbereitung
    c('filter', 'Filter', 'Aufbereitung', FILTER, defaultFilterConfig()),
    ...(hydraulic ? [c('cooler', 'Kühler', 'Aufbereitung', COOLER, defaultCoolerConfig())] : []),
    ...f('supply.heater', 'Aufbereitung'),
    ...f('supply.separator', 'Aufbereitung'),
    ...f('supply.silencer', 'Aufbereitung'),
    ...f('supply.service-unit', 'Aufbereitung'),
    // Messen
    c('instrument', 'Messgerät', 'Messen', INSTRUMENT, defaultInstrumentConfig()),
    c('indicator', 'Anzeige', 'Messen', INDICATOR, defaultIndicatorConfig()),
    sensor('pressure-sensor', 'Drucksensor / -schalter', 'pressure', 'switching'),
    sensor('flow-sensor', 'Durchflusssensor', 'flow', 'analog'),
    sensor('temperature-sensor', 'Temperatursensor', 'temperature', 'analog'),
    sensor('position-sensor', 'Näherungsschalter', 'position', 'switching'),
  ];
}

// --- Ältere Bauteiltypen ----------------------------------------------------

/**
 * Bauteiltypen aus früheren Ständen, die heute konfigurierbar sind.
 * Beim Laden werden sie auf den neuen Typ samt Konfiguration umgestellt,
 * `ports` übersetzt die alten Anschluss-IDs.
 */
export const LEGACY_TYPES: Record<string, { type: string; config: ComponentConfig; ports: Record<string, string> }> = {
  'valve.check-spring': {
    type: CHECK_VALVE.type,
    config: { ...defaultCheckValveConfig(), spring: true },
    ports: { '1': '1', '2': '2' },
  },
  'valve.check-piloted': {
    type: CHECK_VALVE.type,
    config: { ...defaultCheckValveConfig(), spring: true, piloted: true },
    ports: { '1': '1', '2': '2', X: 'X' },
  },
  'valve.throttle-check': {
    type: THROTTLE.type,
    config: { ...defaultThrottleConfig(), check: true },
    ports: { '1': '1', '2': '2' },
  },
  'valve.pressure-relief': {
    type: PRESSURE_VALVE.type,
    config: defaultPressureValveConfig('relief'),
    ports: { P: 'P', T: 'T' },
  },
  'valve.pressure-reducing': {
    type: PRESSURE_VALVE.type,
    config: defaultPressureValveConfig('reducing'),
    ports: { P: 'P', A: 'A', L: 'L' },
  },
  'valve.sequence': {
    type: PRESSURE_VALVE.type,
    config: defaultPressureValveConfig('sequence'),
    ports: { P: 'P', A: 'A', L: 'L' },
  },
  'valve.4-2': {
    type: VALVE.type,
    config: defaultValveConfig('hydraulic', 4, 2),
    ports: { A: 'A', B: 'B', P: 'P', T: 'T' },
  },
  'valve.4-3': {
    type: VALVE.type,
    config: defaultValveConfig('hydraulic', 4, 3),
    ports: { A: 'A', B: 'B', P: 'P', T: 'T' },
  },
  'valve.3-2': {
    type: VALVE.type,
    config: { ...defaultValveConfig('pneumatic', 3, 2), left: ['pilot'], right: ['spring'] },
    ports: { '2': 'A', '1': 'P', '3': 'T', '12': 'X' },
  },
  'valve.5-2': {
    type: VALVE.type,
    config: { ...defaultValveConfig('pneumatic', 5, 2), left: ['pilot'], right: ['pilot'] },
    ports: { '4': 'B', '2': 'A', '5': 'S', '1': 'P', '3': 'R', '14': 'X', '12': 'Y' },
  },
  'actuator.cylinder-double': {
    type: CYLINDER.type,
    config: defaultCylinderConfig('double'),
    ports: { A: 'A', B: 'B' },
  },
  'supply.pump-variable': {
    type: PUMP.type,
    config: { ...defaultPumpConfig('hydraulic'), displacement: 'variable' },
    ports: { P: 'P', S: 'S' },
  },
  'supply.compressor': {
    type: PUMP.type,
    config: defaultPumpConfig('pneumatic'),
    ports: { '1': 'P' },
  },
  'actuator.motor-reversible': {
    type: MOTOR.type,
    config: { ...defaultMotorConfig('hydraulic'), directions: 2 },
    ports: { A: 'A', B: 'B' },
  },
  'actuator.air-motor': {
    type: MOTOR.type,
    config: defaultMotorConfig('pneumatic'),
    ports: { A: 'A', B: 'B' },
  },
  'actuator.cylinder-single': {
    type: CYLINDER.type,
    config: defaultCylinderConfig('single'),
    ports: { A: 'A' },
  },
};
