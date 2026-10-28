/**
 * Kern-Datenmodell von FluidPlan.
 *
 * Ein Schaltplan (Diagram) besteht aus platzierten Bauteilen (ComponentInstance)
 * und Leitungen (Connection) zwischen deren Anschlüssen (Ports).
 * Welche Anschlüsse ein Bauteil hat, legt seine Definition in der
 * Bauteilbibliothek fest (siehe library.ts); eine Instanz verweist nur per
 * `type` darauf. So bleibt die gespeicherte JSON-Datei klein und stabil.
 */

/** Medium eines Bauteils bzw. Schaltplans. */
export type Domain = 'hydraulic' | 'pneumatic';

/**
 * Punkt in Schaltplan-Koordinaten (y nach unten). 10 Einheiten = 1 Rasterschritt = 1 M;
 * auf dem Blatt entspricht eine Einheit 0,25 mm (siehe sheet.ts).
 */
export interface Point {
  x: number;
  y: number;
}

/** Erlaubte Drehungen in Grad, im Uhrzeigersinn. */
export type Rotation = 0 | 90 | 180 | 270;

/**
 * Funktion eines Anschlusses, angelehnt an die Bezeichnungen nach ISO 1219 / ISO 5599:
 * P/1 = Druck, T/R/S/3/5 = Rücklauf bzw. Entlüftung, A/B/2/4 = Arbeitsanschluss,
 * X/Y/12/14 = Steuerleitung, L = Leckage.
 */
export type PortKind = 'pressure' | 'return' | 'work' | 'pilot' | 'drain';

/** Anschluss, wie er in der Bauteildefinition beschrieben ist. */
export interface PortDefinition {
  /** Eindeutig innerhalb der Bauteildefinition, z. B. "P", "A", "1". */
  id: string;
  kind: PortKind;
  /** Position relativ zum Bauteilursprung (oben links), ungedreht. */
  offset: Point;
}

/** Eintrag der Bauteilbibliothek. */
export interface ComponentDefinition {
  /** Stabiler Schlüssel, wird in Dateien gespeichert, z. B. "valve.4-3". */
  type: string;
  /** Anzeigename (deutsch). */
  name: string;
  /** Für welche Medien das Bauteil angeboten wird. */
  domains: readonly Domain[];
  /** Ungedrehte Abmessungen des Symbols. */
  size: { width: number; height: number };
  ports: readonly PortDefinition[];
}

/** Ein im Schaltplan platziertes Bauteil. */
export interface ComponentInstance {
  /** Eindeutig innerhalb des Schaltplans. */
  id: string;
  /** Verweis auf ComponentDefinition.type. */
  type: string;
  /** Position des Bauteilursprungs (oben links, ungedreht). */
  position: Point;
  rotation: Rotation;
  /** Horizontal gespiegelt (vor der Drehung angewendet). */
  mirrored: boolean;
  /** Betriebsmittelkennzeichen, z. B. "1V1", "1A1". */
  label: string;
  /** Freie Kennwerte, z. B. { "Druck": "160 bar" }. */
  properties: Record<string, string>;
}

/** Ende einer Leitung: ein bestimmter Anschluss eines bestimmten Bauteils. */
export interface PortRef {
  componentId: string;
  portId: string;
}

/**
 * Linienart nach ISO 1219-1:
 * working = Arbeitsleitung (durchgezogen), pilot = Steuerleitung (gestrichelt),
 * drain = Leckageleitung (gestrichelt, fein).
 */
export type LineKind = 'working' | 'pilot' | 'drain';

/** Leitung zwischen zwei Anschlüssen. */
export interface Connection {
  id: string;
  from: PortRef;
  to: PortRef;
  kind: LineKind;
  /** Optionale Knickpunkte zwischen den beiden Anschlüssen. */
  waypoints: Point[];
}

export interface DiagramMeta {
  title: string;
  author: string;
  /** ISO-8601-Zeitstempel. */
  created: string;
  /** ISO-8601-Zeitstempel. */
  modified: string;
}

export type SheetFormat = 'A4' | 'A3' | 'A2' | 'A1';
export type Orientation = 'portrait' | 'landscape';

/** Zeichenblatt, auf dem der Schaltplan liegt. */
export interface Sheet {
  format: SheetFormat;
  orientation: Orientation;
  /** Zeichnungsrahmen mit Schriftfeld nach DIN EN ISO 5457. */
  frame: boolean;
}

/** Ein kompletter Schaltplan. */
export interface Diagram {
  domain: Domain;
  meta: DiagramMeta;
  sheet: Sheet;
  components: ComponentInstance[];
  connections: Connection[];
}
