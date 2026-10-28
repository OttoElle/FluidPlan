import { cylinderGeometry, cylinderTitle, defaultCylinderConfig, readCylinderConfig, type CylinderConfig } from './cylinder.ts';
import type { ComponentConfig, ComponentDefinition, ComponentInstance, Domain, PortDefinition, PortKind } from './types.ts';
import {
  defaultValveConfig,
  readValveConfig,
  valveGeometry,
  valveTitle,
  type Actuator,
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
 *   - feste Bauteile mit genau einem Symbol (Pumpe, Rückschlagventil, …),
 *   - konfigurierbare Bauteile (Wegeventil, Zylinder), deren Symbol, Größe und
 *     Anschlüsse sich aus der Konfiguration der Instanz ergeben.
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
  // --- Energieversorgung ---
  fixed('supply.pump', 'Hydropumpe (konstant)', H, [10, 10], [['P', 'pressure', 6, 0], ['S', 'return', 6, 10]]),
  fixed('supply.pump-variable', 'Hydropumpe (verstellbar)', H, [10, 10], [['P', 'pressure', 6, 0], ['S', 'return', 6, 10]]),
  fixed('supply.compressor', 'Kompressor', P, [10, 10], [['1', 'pressure', 6, 0]]),
  fixed('supply.electric-motor', 'Elektromotor', HP, [10, 10], []),
  fixed('supply.tank', 'Tank', H, [6, 4], [['T', 'return', 2, 0]]),
  fixed('supply.air-source', 'Druckluftquelle', P, [6, 2], [['1', 'pressure', 6, 1]]),
  fixed('supply.silencer', 'Schalldämpfer', P, [2, 6], [['3', 'return', 1, 0]]),
  fixed('supply.accumulator', 'Hydrospeicher', H, [4, 10], [['P', 'work', 2, 10]]),
  fixed('supply.filter', 'Filter', HP, [8, 10], [['1', 'work', 4, 0], ['2', 'work', 4, 10]]),
  fixed('supply.service-unit', 'Wartungseinheit', P, [14, 6], [['1', 'pressure', 0, 3], ['2', 'work', 14, 3]]),

  // --- Antriebe ---
  fixed('actuator.motor', 'Hydromotor (eine Drehrichtung)', H, [10, 10], [['A', 'work', 6, 0], ['B', 'work', 6, 10]]),
  fixed('actuator.motor-reversible', 'Hydromotor (zwei Drehrichtungen)', H, [10, 10], [['A', 'work', 6, 0], ['B', 'work', 6, 10]]),
  fixed('actuator.air-motor', 'Druckluftmotor', P, [10, 10], [['A', 'work', 6, 0], ['B', 'return', 6, 10]]),

  // --- Sperrventile ---
  fixed('valve.check', 'Rückschlagventil', HP, [2, 6], [['1', 'work', 1, 6], ['2', 'work', 1, 0]]),
  fixed('valve.check-spring', 'Rückschlagventil mit Feder', HP, [2, 8], [['1', 'work', 1, 8], ['2', 'work', 1, 0]]),
  fixed('valve.check-piloted', 'Rückschlagventil, entsperrbar', H, [6, 10], [
    ['1', 'work', 2, 10],
    ['2', 'work', 2, 0],
    ['X', 'pilot', 4, 10],
  ]),
  fixed('valve.shuttle', 'Wechselventil (ODER)', HP, [12, 6], [
    ['X', 'work', 0, 4, '1'],
    ['Y', 'work', 12, 4, '1'],
    ['A', 'work', 6, 0, '2'],
  ]),
  fixed('valve.two-pressure', 'Zweidruckventil (UND)', P, [12, 6], [
    ['X', 'work', 0, 4, '1'],
    ['Y', 'work', 12, 4, '1'],
    ['A', 'work', 6, 0, '2'],
  ]),

  // --- Druckventile ---
  fixed('valve.pressure-relief', 'Druckbegrenzungsventil', HP, [10, 8], [['P', 'pressure', 4, 8], ['T', 'return', 4, 0]]),
  fixed('valve.pressure-reducing', 'Druckminderventil', HP, [10, 8], [
    ['P', 'pressure', 4, 8],
    ['A', 'work', 4, 0],
    ['L', 'drain', 8, 8],
  ]),
  fixed('valve.sequence', 'Zuschaltventil', H, [10, 8], [
    ['P', 'pressure', 4, 8],
    ['A', 'work', 4, 0],
    ['L', 'drain', 8, 8],
  ]),

  // --- Stromventile ---
  fixed('valve.throttle', 'Drosselventil (einstellbar)', HP, [4, 8], [['1', 'work', 2, 8], ['2', 'work', 2, 0]]),
  fixed('valve.throttle-check', 'Drosselrückschlagventil', HP, [8, 12], [['1', 'work', 2, 12], ['2', 'work', 2, 0]]),
  fixed('valve.flow-control', '2-Wege-Stromregelventil mit Umgehung', H, [10, 16], [['1', 'work', 3, 16], ['2', 'work', 3, 0]]),

  // --- Messgeräte ---
  fixed('measure.gauge', 'Manometer', HP, [4, 6], [['1', 'work', 2, 6]]),
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

const CONFIGURABLE = new Map<string, ConfigurableType<any>>([VALVE, CYLINDER].map((t) => [t.type, t]));

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
  name: string;
  group: string;
  type: string;
  config?: ComponentConfig;
}

export const PALETTE_GROUPS = [
  'Energieversorgung',
  'Antriebe',
  'Wegeventile',
  'Sperrventile',
  'Druckventile',
  'Stromventile',
  'Zubehör',
] as const;

const GROUP_OF: Record<string, (typeof PALETTE_GROUPS)[number]> = {
  supply: 'Energieversorgung',
  actuator: 'Antriebe',
  measure: 'Zubehör',
};

function groupOfFixed(type: string): (typeof PALETTE_GROUPS)[number] {
  if (type.startsWith('valve.check') || type === 'valve.shuttle' || type === 'valve.two-pressure') return 'Sperrventile';
  if (type.startsWith('valve.pressure') || type === 'valve.sequence') return 'Druckventile';
  if (type.startsWith('valve.throttle') || type === 'valve.flow-control') return 'Stromventile';
  if (type === 'supply.filter' || type === 'supply.accumulator') return 'Zubehör';
  return GROUP_OF[type.split('.')[0]!] ?? 'Zubehör';
}

function valvePreset(
  domain: Domain,
  ports: DirectionalValveConfig['ports'],
  positions: number,
  left?: Actuator[],
  right?: Actuator[],
  suffix = '',
): PaletteEntry {
  const base = defaultValveConfig(domain, ports, positions);
  const config = { ...base, left: left ?? base.left, right: right ?? base.right };
  return {
    key: `valve-${ports}-${positions}${suffix ? '-' + suffix : ''}`,
    name: `${ports}/${positions}-Wegeventil${suffix ? ` (${suffix})` : ''}`,
    group: 'Wegeventile',
    type: VALVE.type,
    config,
  };
}

/** Bauteilliste für ein Medium, gruppiert über `group`. */
export function paletteFor(domain: Domain): PaletteEntry[] {
  const presets: PaletteEntry[] =
    domain === 'hydraulic'
      ? [
          valvePreset(domain, 2, 2),
          valvePreset(domain, 3, 2),
          valvePreset(domain, 4, 2),
          valvePreset(domain, 4, 3),
        ]
      : [
          valvePreset(domain, 3, 2, ['pushbutton'], ['spring']),
          valvePreset(domain, 5, 2),
          valvePreset(domain, 5, 2, ['pilot'], ['pilot'], 'Impuls'),
          valvePreset(domain, 5, 3),
        ];
  const cylinders: PaletteEntry[] = [
    { key: 'cyl-double', name: 'Zylinder, doppeltwirkend', group: 'Antriebe', type: CYLINDER.type, config: defaultCylinderConfig('double') },
    { key: 'cyl-single', name: 'Zylinder, einfachwirkend', group: 'Antriebe', type: CYLINDER.type, config: defaultCylinderConfig('single') },
  ];
  const fixedEntries = definitionsFor(domain).map(
    (d): PaletteEntry => ({ key: d.type, name: d.name, group: groupOfFixed(d.type), type: d.type }),
  );
  return [...cylinders, ...presets, ...fixedEntries];
}

// --- Ältere Bauteiltypen ----------------------------------------------------

/**
 * Bauteiltypen aus früheren Ständen, die heute konfigurierbar sind.
 * Beim Laden werden sie auf den neuen Typ samt Konfiguration umgestellt,
 * `ports` übersetzt die alten Anschluss-IDs.
 */
export const LEGACY_TYPES: Record<string, { type: string; config: ComponentConfig; ports: Record<string, string> }> = {
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
  'actuator.cylinder-single': {
    type: CYLINDER.type,
    config: defaultCylinderConfig('single'),
    ports: { A: 'A' },
  },
};
