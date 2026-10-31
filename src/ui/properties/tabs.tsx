import type { ComponentType } from 'react';
import { mediumOf } from '../../model/library.ts';
import type { ComponentInstance, Rotation } from '../../model/types.ts';
import { Configurator } from './configEditors.tsx';
import { Segmented } from './Segmented.tsx';

/** Was ein Reiter im Eigenschaften-Fenster bekommt: den Entwurf des Bauteils. */
export interface ComponentTabProps {
  /** Entwurf; wird erst mit „OK“ in den Schaltplan übernommen. */
  component: ComponentInstance;
  onChange: (component: ComponentInstance) => void;
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

function PlacementTab({ component, onChange }: ComponentTabProps) {
  return (
    <div className="tab-form">
      <div className="field">
        <span>Drehung</span>
        <Segmented
          label="Drehung"
          value={component.rotation}
          onChange={(rotation) => onChange({ ...component, rotation })}
          options={ROTATIONS.map((r) => ({ value: r, label: `${r}°` }))}
        />
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={component.mirrored ?? false}
          onChange={(e) => onChange({ ...component, mirrored: e.target.checked })}
        />
        Gespiegelt
      </label>
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
  { id: 'placement', title: 'Lage', applies: () => true, Panel: PlacementTab },
];
