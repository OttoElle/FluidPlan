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

/** Medium eines Bauteils (Hydraulik oder Pneumatik). */
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
  /** Bezeichnungsschlüssel nach DIN ISO 1219-2, z. B. "1.2" oder "1-H1.2". */
  label: string;
  /** Freie Kennwerte, z. B. { "Druck": "160 bar" }. */
  properties: Record<string, string>;
  /** Bezeichnung, z. B. "Hubzylinder Presse"; fehlt in älteren Dateien. */
  description?: string;
  /** Kennzeichen am Symbol anzeigen (Standard: ja). */
  showLabel?: boolean;
  /** Bezeichnung am Symbol anzeigen (Standard: nein). */
  showDescription?: boolean;
  /**
   * Technische Daten nach DIN ISO 1219-2, 6.4, z. B. "Ø100/56×50" oder
   * "160 bar"; fehlt in älteren Dateien.
   */
  technicalData?: string;
  /** Technische Daten am Symbol anzeigen (Standard: ja). */
  showTechnicalData?: boolean;
  /** Hersteller, z. B. für eine spätere Stückliste. */
  manufacturer?: string;
  /** Teile- bzw. Bestellnummer des Herstellers. */
  partNumber?: string;
  /** Verschiebung von Kennzeichen und Bezeichnung gegenüber der Standardlage (Blattkoordinaten). */
  labelOffset?: Point;
  /** Verschiebung einzelner Anschlussbezeichnungen gegenüber der Standardlage, je Anschluss-ID. */
  portLabelOffsets?: Record<string, Point>;
  /** Nur bei konfigurierbaren Bauteiltypen. */
  config?: ComponentConfig;
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  /**
   * Medium, aus dessen Bauteilkatalog das Bauteil stammt; bestimmt z. B. die
   * Anschlussnamen. Fehlt es, gilt das Medium der Konfiguration bzw. Hydraulik
   * (siehe mediumOf in library.ts).
   */
  medium?: Domain;
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
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
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
  /** Genehmigt von (genehmigende Person, Pflichtfeld nach DIN EN ISO 7200, 5.3.4). */
  approvedBy: string;
  /** Dokumentenart nach DIN EN ISO 7200 (5.3.6), z. B. "Schaltplan". */
  documentType: string;
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

/**
 * Darstellung freier Grafik und freien Texts, beides optional.
 * `lineWidth`: Linienbreite in mm aus der Reihe nach ISO 128 (siehe LINE_WIDTHS), fehlt = 0,25 mm.
 * `color`: Farbe als #rrggbb, fehlt = Zeichenfarbe (schwarz, im dunklen Modus hell).
 */
export interface AnnotationLook {
  lineWidth?: number;
  color?: string;
}

/** Freier Text; `position` ist der linke Rand der Grundlinie der ersten Zeile. */
export interface TextAnnotation extends Pick<AnnotationLook, 'color'> {
  id: string;
  kind: 'text';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  position: Point;
  /** Mehrzeilig mit "\n". */
  text: string;
  /** Schrifthöhe in Einheiten (14 = 3,5 mm). */
  size: number;
}

export interface LineAnnotation extends AnnotationLook {
  id: string;
  kind: 'line';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  from: Point;
  to: Point;
  style: StrokeStyle;
}

export interface RectAnnotation extends AnnotationLook {
  id: string;
  kind: 'rect';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  /** Linke obere Ecke. */
  position: Point;
  width: number;
  height: number;
  style: StrokeStyle;
}

export interface CircleAnnotation extends AnnotationLook {
  id: string;
  kind: 'circle';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  center: Point;
  radius: number;
  style: StrokeStyle;
}

export interface EllipseAnnotation extends AnnotationLook {
  id: string;
  kind: 'ellipse';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  center: Point;
  /** Halbachsen waagerecht und senkrecht. */
  rx: number;
  ry: number;
  style: StrokeStyle;
}

/** Linienzug durch mindestens zwei Punkte; `closed` verbindet den letzten mit dem ersten. */
export interface PolylineAnnotation extends AnnotationLook {
  id: string;
  kind: 'polyline';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  points: Point[];
  closed: boolean;
  style: StrokeStyle;
}

/**
 * Kreisbogen um `center`. Winkel in Grad wie auf dem Bildschirm: 0° zeigt nach
 * rechts, positive Winkel drehen im Uhrzeigersinn. `sweep` ist die Bogenlänge
 * mit Richtung (positiv = im Uhrzeigersinn), 0 < |sweep| < 360.
 */
export interface ArcAnnotation extends AnnotationLook {
  id: string;
  kind: 'arc';
  /** Zeichnungsebene (siehe layers.ts); fehlt = Standardebene. */
  layer?: string;
  center: Point;
  radius: number;
  start: number;
  sweep: number;
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
  | PolylineAnnotation
  | ArcAnnotation;

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

/**
 * Ein Schaltplan auf einem Blatt. Alle Bearbeitungsfunktionen arbeiten auf
 * diesem Typ; bei mehreren Blättern ist es die Sicht auf eines davon
 * (siehe drawing.ts), mit dem Schriftfeld der ganzen Zeichnung.
 */
export interface Diagram {
  meta: DiagramMeta;
  sheet: Sheet;
  components: ComponentInstance[];
  connections: Connection[];
  junctions: Junction[];
  annotations: Annotation[];
  groups: Group[];
  /** Nur in der Sicht auf ein Blatt einer Zeichnung: Name und Nummer fürs Schriftfeld. */
  page?: PageInfo;
  /** Nur in der Sicht auf ein Blatt: die Ebenen der Zeichnung (für Sichtbarkeit und Sperre). */
  layers?: Layer[];
}

/**
 * Zeichnungsebene wie in CAD-Programmen; gilt für alle Blätter der Zeichnung.
 * Siehe layers.ts.
 */
export interface Layer {
  /** Eindeutig in der Zeichnung; "0" ist die Standardebene. */
  id: string;
  name: string;
  /** Ausgeblendet: nicht gezeichnet und nicht exportiert. */
  visible: boolean;
  /** Gesperrt: auf dem Blatt nicht anklickbar. */
  locked: boolean;
}

/** Lage eines Blatts in der Zeichnung, z. B. „Blatt 2 von 3“. */
export interface PageInfo {
  name: string;
  /** Ab 1 gezählt. */
  number: number;
  count: number;
}

/** Inhalt eines Blatts; Schriftfeld-Angaben gelten für die ganze Zeichnung. */
export type SheetContent = Pick<Diagram, 'sheet' | 'components' | 'connections' | 'junctions' | 'annotations' | 'groups'>;

/** Ein Blatt der Zeichnung mit eigenem Format und eigenem Inhalt. */
export interface DrawingSheet extends SheetContent {
  /** Eindeutig innerhalb der Zeichnung, z. B. "s2". */
  id: string;
  /** Blattbenennung, erscheint im Schriftfeld. */
  name: string;
}

/**
 * Eine Zeichnung (= eine Datei) mit einem oder mehreren Blättern. Bauteile
 * gehören immer zu genau einem Blatt; Leitungen verbinden nur Bauteile
 * desselben Blatts.
 */
export interface Drawing {
  meta: DiagramMeta;
  sheets: DrawingSheet[];
  /** Zeichnungsebenen; fehlt in älteren Dateien (dann nur die Standardebene). */
  layers?: Layer[];
}
