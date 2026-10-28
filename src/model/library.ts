import type { ComponentDefinition, Domain } from './types.ts';

/**
 * Bauteilbibliothek (erste, bewusst kleine Auswahl).
 * Anschlussbezeichnungen: Hydraulik nach ISO 1219 (P, T, A, B, …),
 * Pneumatik nach ISO 5599 (1, 2, 3, 4, 5, 12, 14).
 * Maße in Rastereinheiten; Anschlüsse liegen auf dem 10er-Raster.
 *
 * Bauteile mit ISO-1219-Symbol (siehe ui/symbols.tsx) sind im Modul M = 10
 * gezeichnet, ein Rasterschritt ist also 1M. Ihre Größen und Anschlüsse folgen
 * den Grundmaßen aus DIN ISO 1219-1 (Kreis 6M, Ventilfeld 4M, Zylinder 9M × 4M,
 * benachbarte Anschlüsse 2M auseinander).
 */
export const COMPONENT_LIBRARY: readonly ComponentDefinition[] = [
  // --- Energieversorgung ---
  {
    type: 'supply.pump',
    name: 'Hydropumpe (konstant)',
    domains: ['hydraulic'],
    size: { width: 90, height: 90 },
    ports: [
      { id: 'P', kind: 'pressure', offset: { x: 60, y: 0 } },
      { id: 'S', kind: 'return', offset: { x: 60, y: 90 } },
    ],
  },
  {
    type: 'supply.compressor',
    name: 'Kompressor',
    domains: ['pneumatic'],
    size: { width: 90, height: 70 },
    ports: [{ id: '1', kind: 'pressure', offset: { x: 60, y: 0 } }],
  },
  {
    type: 'supply.tank',
    name: 'Tank',
    domains: ['hydraulic'],
    size: { width: 40, height: 20 },
    ports: [{ id: 'T', kind: 'return', offset: { x: 20, y: 0 } }],
  },
  {
    type: 'supply.air-source',
    name: 'Druckluftquelle',
    domains: ['pneumatic'],
    size: { width: 30, height: 30 },
    ports: [{ id: '1', kind: 'pressure', offset: { x: 20, y: 0 } }],
  },
  {
    type: 'supply.service-unit',
    name: 'Wartungseinheit',
    domains: ['pneumatic'],
    size: { width: 60, height: 40 },
    ports: [
      { id: '1', kind: 'pressure', offset: { x: 0, y: 20 } },
      { id: '2', kind: 'work', offset: { x: 60, y: 20 } },
    ],
  },

  // --- Wegeventile ---
  {
    type: 'valve.4-3',
    name: '4/3-Wegeventil',
    domains: ['hydraulic'],
    size: { width: 120, height: 40 },
    ports: [
      { id: 'A', kind: 'work', offset: { x: 50, y: 0 } },
      { id: 'B', kind: 'work', offset: { x: 70, y: 0 } },
      { id: 'P', kind: 'pressure', offset: { x: 50, y: 40 } },
      { id: 'T', kind: 'return', offset: { x: 70, y: 40 } },
    ],
  },
  {
    type: 'valve.4-2',
    name: '4/2-Wegeventil',
    domains: ['hydraulic'],
    size: { width: 120, height: 60 },
    ports: [
      { id: 'A', kind: 'work', offset: { x: 70, y: 0 } },
      { id: 'B', kind: 'work', offset: { x: 90, y: 0 } },
      { id: 'P', kind: 'pressure', offset: { x: 70, y: 60 } },
      { id: 'T', kind: 'return', offset: { x: 90, y: 60 } },
    ],
  },
  {
    type: 'valve.3-2',
    name: '3/2-Wegeventil',
    domains: ['pneumatic'],
    size: { width: 80, height: 40 },
    ports: [
      { id: '2', kind: 'work', offset: { x: 50, y: 0 } },
      { id: '1', kind: 'pressure', offset: { x: 50, y: 40 } },
      { id: '3', kind: 'return', offset: { x: 60, y: 40 } },
      { id: '12', kind: 'pilot', offset: { x: 0, y: 20 } },
    ],
  },
  {
    type: 'valve.5-2',
    name: '5/2-Wegeventil',
    domains: ['pneumatic'],
    size: { width: 80, height: 40 },
    ports: [
      { id: '4', kind: 'work', offset: { x: 50, y: 0 } },
      { id: '2', kind: 'work', offset: { x: 70, y: 0 } },
      { id: '5', kind: 'return', offset: { x: 50, y: 40 } },
      { id: '1', kind: 'pressure', offset: { x: 60, y: 40 } },
      { id: '3', kind: 'return', offset: { x: 70, y: 40 } },
      { id: '14', kind: 'pilot', offset: { x: 0, y: 20 } },
      { id: '12', kind: 'pilot', offset: { x: 80, y: 20 } },
    ],
  },

  // --- Sperr-, Strom- und Druckventile ---
  {
    type: 'valve.check',
    name: 'Rückschlagventil',
    domains: ['hydraulic', 'pneumatic'],
    size: { width: 20, height: 40 },
    ports: [
      { id: '1', kind: 'work', offset: { x: 10, y: 40 } },
      { id: '2', kind: 'work', offset: { x: 10, y: 0 } },
    ],
  },
  {
    type: 'valve.throttle',
    name: 'Drosselventil',
    domains: ['hydraulic', 'pneumatic'],
    size: { width: 20, height: 40 },
    ports: [
      { id: '1', kind: 'work', offset: { x: 10, y: 40 } },
      { id: '2', kind: 'work', offset: { x: 10, y: 0 } },
    ],
  },
  {
    type: 'valve.pressure-relief',
    name: 'Druckbegrenzungsventil',
    domains: ['hydraulic', 'pneumatic'],
    size: { width: 40, height: 60 },
    ports: [
      { id: 'P', kind: 'pressure', offset: { x: 10, y: 0 } },
      { id: 'T', kind: 'return', offset: { x: 10, y: 60 } },
    ],
  },

  // --- Antriebe ---
  {
    type: 'actuator.cylinder-double',
    name: 'Doppeltwirkender Zylinder',
    domains: ['hydraulic', 'pneumatic'],
    size: { width: 130, height: 50 },
    ports: [
      { id: 'A', kind: 'work', offset: { x: 10, y: 50 } },
      { id: 'B', kind: 'work', offset: { x: 80, y: 50 } },
    ],
  },
  {
    type: 'actuator.cylinder-single',
    name: 'Einfachwirkender Zylinder',
    domains: ['hydraulic', 'pneumatic'],
    size: { width: 130, height: 50 },
    ports: [{ id: 'A', kind: 'work', offset: { x: 10, y: 50 } }],
  },

  // --- Messgeräte ---
  {
    type: 'measure.gauge',
    name: 'Manometer',
    domains: ['hydraulic', 'pneumatic'],
    size: { width: 20, height: 20 },
    ports: [{ id: '1', kind: 'work', offset: { x: 10, y: 20 } }],
  },
];

const BY_TYPE = new Map(COMPONENT_LIBRARY.map((d) => [d.type, d]));

export function getDefinition(type: string): ComponentDefinition | undefined {
  return BY_TYPE.get(type);
}

export function definitionsFor(domain: Domain): ComponentDefinition[] {
  return COMPONENT_LIBRARY.filter((d) => d.domains.includes(domain));
}
