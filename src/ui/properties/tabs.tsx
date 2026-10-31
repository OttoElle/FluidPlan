import { TrianglesCenterlineDashedHorizontal, TrianglesCenterlineDashedVertical } from 'lucide-react';
import type { ComponentType } from 'react';
import { mediumOf } from '../../model/library.ts';
import { DEFAULT_LAYER_ID } from '../../model/layers.ts';
import { MM_PER_UNIT } from '../../model/sheet.ts';
import { GRID, componentBox } from '../../model/routing.ts';
import type { ComponentInstance, Layer, Rotation } from '../../model/types.ts';
import { Configurator } from './configEditors.tsx';
import { Segmented } from './Segmented.tsx';

/** Was ein Reiter im Eigenschaften-Fenster bekommt: den Entwurf des Bauteils. */
export interface ComponentTabProps {
  /** Entwurf; wird erst mit „OK“ in den Schaltplan übernommen. */
  component: ComponentInstance;
  onChange: (component: ComponentInstance) => void;
  /** Ebenen der Zeichnung, für die Ebenenauswahl. */
  layers: readonly Layer[];
}

export interface ComponentTab {
  id: string;
  title: string;
  /** Ob der Reiter für dieses Bauteil angezeigt wird. */
  applies: (component: ComponentInstance) => boolean;
  Panel: ComponentType<ComponentTabProps>;
}

function ConfiguratorTab({ component, onChange }: ComponentTabProps) {
  return <Configurator config={component.config!} domain={mediumOf(component)} onChange={(config) => onChange({ ...component, config })} />;
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/** Rasterweite in mm; Positionen werden darauf gerundet. */
const GRID_MM = GRID * MM_PER_UNIT;
const mm = (units: number) => Math.round(units * MM_PER_UNIT * 100) / 100;

/**
 * Position als Lage der linken oberen Ecke des Symbols (nach Drehung und
 * Spiegelung) in mm ab der linken oberen Blattecke, wie die Lineale.
 */
function PositionInput({ axis, component, onChange }: { axis: 'x' | 'y' } & Omit<ComponentTabProps, 'layers'>) {
  const box = componentBox(component);
  if (!box) return null;
  const value = axis === 'x' ? box.minX : box.minY;
  return (
    <label className="unit-input">
      {axis.toUpperCase()}
      <input
        type="number"
        step={GRID_MM}
        value={mm(value)}
        onChange={(e) => {
          const target = Number(e.target.value);
          if (!Number.isFinite(target) || e.target.value === '') return;
          const delta = target / MM_PER_UNIT - value;
          onChange({ ...component, position: { ...component.position, [axis]: component.position[axis] + delta } });
        }}
      />
      <span>mm</span>
    </label>
  );
}

function PlacementTab({ component, onChange, layers }: ComponentTabProps) {
  return (
    <div className="tab-form">
      <div className="field">
        <span>Position (linke obere Ecke, ab Blattecke; rastet auf {String(GRID_MM).replace('.', ',')} mm)</span>
        <div className="field-row">
          <PositionInput axis="x" component={component} onChange={onChange} />
          <PositionInput axis="y" component={component} onChange={onChange} />
        </div>
      </div>
      <div className="field">
        <span>Drehung</span>
        <Segmented
          label="Drehung"
          value={component.rotation}
          onChange={(rotation) => onChange({ ...component, rotation })}
          options={ROTATIONS.map((r) => ({ value: r, label: `${r}°` }))}
        />
      </div>
      <div className="field">
        <span>Spiegeln</span>
        <div className="field-row">
          {/* Wie mirrorComponents (arrange.ts): oben/unten = spiegeln und um 180° drehen. */}
          <button
            type="button"
            className="with-icon"
            onClick={() =>
              onChange({ ...component, mirrored: !component.mirrored, rotation: ((360 - component.rotation) % 360) as Rotation })
            }
          >
            <TrianglesCenterlineDashedVertical size={16} strokeWidth={1.75} aria-hidden /> Links und rechts
          </button>
          <button
            type="button"
            className="with-icon"
            onClick={() =>
              onChange({ ...component, mirrored: !component.mirrored, rotation: ((540 - component.rotation) % 360) as Rotation })
            }
          >
            <TrianglesCenterlineDashedHorizontal size={16} strokeWidth={1.75} aria-hidden /> Oben und unten
          </button>
        </div>
      </div>
      <label>
        Ebene
        <select
          value={layers.some((l) => l.id === component.layer) ? component.layer : DEFAULT_LAYER_ID}
          onChange={(e) => onChange({ ...component, layer: e.target.value })}
        >
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.visible ? '' : ' (ausgeblendet)'}
              {l.locked ? ' (gesperrt)' : ''}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Technische Daten und Angaben für eine spätere Stückliste. */
function DataTab({ component, onChange }: ComponentTabProps) {
  return (
    <div className="tab-form">
      <div className="ident-row">
        <label>
          Technische Daten
          <input
            value={component.technicalData ?? ''}
            placeholder="z. B. Ø100/56×50 oder 160 bar"
            onChange={(e) => onChange({ ...component, technicalData: e.target.value })}
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={component.showTechnicalData !== false}
            onChange={(e) => onChange({ ...component, showTechnicalData: e.target.checked })}
          />
          Anzeigen
        </label>
      </div>
      <p className="hint">Nach DIN ISO 1219-2, 6.4 z. B. Zylinder Kolben-Ø/Stangen-Ø × Hub, Pumpe Fördervolumen, Ventil Einstelldruck.</p>
      <div className="field-row">
        <label>
          Hersteller
          <input value={component.manufacturer ?? ''} onChange={(e) => onChange({ ...component, manufacturer: e.target.value })} />
        </label>
        <label>
          Teilenummer
          <input
            value={component.partNumber ?? ''}
            placeholder="Bestellnummer"
            onChange={(e) => onChange({ ...component, partNumber: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Reiter des Eigenschaften-Fensters für Bauteile, in dieser Reihenfolge.
 * Neue Reiter hier eintragen; Konfiguratoren für neue Bauteilarten gehören
 * dagegen in CONFIG_EDITORS (configEditors.tsx).
 */
export const COMPONENT_TABS: ComponentTab[] = [
  { id: 'config', title: 'Konfigurator', applies: (c) => c.config !== undefined, Panel: ConfiguratorTab },
  { id: 'data', title: 'Daten', applies: () => true, Panel: DataTab },
  { id: 'placement', title: 'Lage', applies: () => true, Panel: PlacementTab },
];
