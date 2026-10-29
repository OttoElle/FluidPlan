/**
 * Kern-Datenmodell von FluidPlan.
 *
 * Ein Schaltplan (Diagram) besteht aus platzierten Bauteilen (ComponentInstance)
 * und Leitungen (Connection) zwischen deren Anschlüssen (Ports).
 * Welche Anschlüsse ein Bauteil hat, legt seine Definition in der
 * Bauteilbibliothek fest (siehe library.ts); eine Instanz verweist nur per
 * `type` darauf. So bleibt die gespeicherte JSON-Datei klein und stabil.
 * Konfigurierbare Bauteile tragen zusätzlich ihre Einstellungen (`config`).
 */

import type { BallValveConfig } from './ballValve.ts';
import type { CouplingConfig } from './coupling.ts';
import type { CylinderConfig } from './cylinder.ts';
import type { MotorConfig, PumpConfig } from './rotary.ts';
import type { SensorConfig } from './sensor.ts';
import type { AccumulatorConfig, TankConfig } from './storage.ts';
import type { DirectionalValveConfig } from './valve.ts';

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
  /**
   * Angezeigte Bezeichnung, falls sie von `id` abweicht. Konfigurierbare
   * Bauteile benennen ihre Anschlüsse intern nach ISO 1219 (P, A, …) und
   * zeigen sie in der Pneumatik nach ISO 5599 an (1, 2, …).
   */
  label?: string;
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

/**
 * Einstellungen eines konfigurierbaren Bauteils (Wegeventil, Zylinder, Pumpe, …).
 * Aus ihnen ergeben sich Symbol, Größe und Anschlüsse; siehe library.ts.
 */
export type ComponentConfig =
  | DirectionalValveConfig
  | CylinderConfig
  | PumpConfig
  | MotorConfig
  | TankConfig
  | AccumulatorConfig
  | BallValveConfig
  | CouplingConfig
  | SensorConfig;

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
  /** Nur bei konfigurierbaren Bauteiltypen. */
  config?: ComponentConfig;
}

/** Ende einer Leitung: ein bestimmter Anschluss eines bestimmten Bauteils. */
export interface PortRef {
  componentId: string;
  portId: string;
}

/**
 * Abzweigpunkt (T-Verteiler) im Leitungsnetz. Er entsteht, wenn eine Leitung
 * auf einer anderen endet, und wird mit einem Punkt gezeichnet.
 * An einem Abzweig hängen 3 oder 4 Leitungen.
 */
export interface Junction {
  id: string;
  position: Point;
}

/** Ende einer Leitung am Abzweigpunkt. */
export interface JunctionRef {
  junctionId: string;
}

/** Ende einer Leitung: ein Bauteilanschluss oder ein Abzweigpunkt. */
export type Endpoint = PortRef | JunctionRef;

/**
 * Linienart nach ISO 1219-1:
 * working = Arbeitsleitung (durchgezogen), pilot = Steuerleitung (gestrichelt),
 * drain = Leckageleitung (gestrichelt, fein).
 */
export type LineKind = 'working' | 'pilot' | 'drain';

/** Leitung zwischen zwei Anschlüssen bzw. Abzweigpunkten. */
export interface Connection {
  id: string;
  from: Endpoint;
  to: Endpoint;
  kind: LineKind;
  /** Optionale Knickpunkte zwischen den beiden Anschlüssen. */
  waypoints: Point[];
}

/**
 * Angaben im Schriftfeld (vereinfacht nach DIN EN ISO 7200). Datum und
 * Blattformat ergeben sich von selbst und werden nicht gespeichert.
 */
export interface DiagramMeta {
  title: string;
  /** Ersteller ("Erstellt von"). */
  author: string;
  /** Zeichnungs- bzw. Sachnummer. */
  drawingNumber: string;
  /** Firma bzw. Abteilung. */
  organization: string;
  /** Geprüft von. */
  checkedBy: string;
  /** Änderungsstand, z. B. "A". */
  revision: string;
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
  /** Leitungssprünge (kleine Bögen) an Kreuzungen ohne Verbindung. */
  lineJumps?: boolean;
}

/**
 * Linienart freier Grafik: durchgezogen, gestrichelt oder Strich-Punkt.
 * Strich-Punkt umrandet nach ISO 1219-1 eine Baugruppe.
 */
export type StrokeStyle = 'solid' | 'dashed' | 'dashdot';

/** Freier Text; `position` ist der linke Rand der Grundlinie der ersten Zeile. */
export interface TextAnnotation {
  id: string;
  kind: 'text';
  position: Point;
  /** Mehrzeilig mit "\n". */
  text: string;
  /** Schrifthöhe in Einheiten (14 = 3,5 mm). */
  size: number;
}

export interface LineAnnotation {
  id: string;
  kind: 'line';
  from: Point;
  to: Point;
  style: StrokeStyle;
}

export interface RectAnnotation {
  id: string;
  kind: 'rect';
  /** Linke obere Ecke. */
  position: Point;
  width: number;
  height: number;
  style: StrokeStyle;
}

export interface CircleAnnotation {
  id: string;
  kind: 'circle';
  center: Point;
  radius: number;
  style: StrokeStyle;
}

export interface EllipseAnnotation {
  id: string;
  kind: 'ellipse';
  center: Point;
  /** Halbachsen waagerecht und senkrecht. */
  rx: number;
  ry: number;
  style: StrokeStyle;
}

/** Linienzug durch mindestens zwei Punkte; `closed` verbindet den letzten mit dem ersten. */
export interface PolylineAnnotation {
  id: string;
  kind: 'polyline';
  points: Point[];
  closed: boolean;
  style: StrokeStyle;
}

/**
 * Freier Text und einfache Grafik auf dem Blatt (z. B. Baugruppen-Umrandung).
 * Sie gehören zu keinem Bauteil und haben keine Anschlüsse.
 */
export type Annotation =
  | TextAnnotation
  | LineAnnotation
  | RectAnnotation
  | CircleAnnotation
  | EllipseAnnotation
  | PolylineAnnotation;

/**
 * Gruppe: Teile, die zusammen ausgewählt und verschoben werden.
 * Ein Teil gehört zu höchstens einer Gruppe; Gruppen sind nicht verschachtelt.
 */
export interface Group {
  id: string;
  components: string[];
  connections: string[];
  junctions: string[];
  annotations: string[];
}

/** Ein kompletter Schaltplan. */
export interface Diagram {
  domain: Domain;
  meta: DiagramMeta;
  sheet: Sheet;
  components: ComponentInstance[];
  connections: Connection[];
  junctions: Junction[];
  annotations: Annotation[];
  groups: Group[];
}
