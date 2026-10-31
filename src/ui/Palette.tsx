import { Circle, Ellipse, Slash, SlidersHorizontal, Square, Type, Waypoints, type LucideIcon } from 'lucide-react';
import { MEDIUM_NAMES, PALETTE_GROUPS, type PaletteEntry } from '../model/library.ts';
import type { Domain } from '../model/types.ts';
import { SYMBOL_DRAG_TYPE, type AnnotationTool } from './DiagramView.tsx';
import { IconButton } from './IconButton.tsx';
import { useOpenCatalogs } from './layout.ts';
import { SymbolPreview } from './SymbolPreview.tsx';

const TOOLS: [AnnotationTool, LucideIcon, string][] = [
  ['text', Type, 'Text: Klick auf das Blatt setzt einen Text'],
  ['line', Slash, 'Linie auf dem Blatt aufziehen'],
  ['rect', Square, 'Rechteck aufziehen, z. B. als Baugruppen-Umrandung'],
  ['circle', Circle, 'Kreis vom Mittelpunkt aus aufziehen'],
  ['ellipse', Ellipse, 'Ellipse aufziehen'],
  ['polyline', Waypoints, 'Linienzug: Punkte anklicken; Doppelklick, Enter oder Rechtsklick beendet, Klick auf den ersten Punkt schließt ihn'],
];

const CATALOGS = Object.keys(MEDIUM_NAMES) as Domain[];

/**
 * Bauteilliste links: Zeichenwerkzeuge und die Bauteilkataloge (Hydraulik,
 * Pneumatik), die man nach Bedarf aufklappt; Symbole zum Anklicken oder
 * Aufs-Blatt-Ziehen. Ein Plan darf Bauteile aus beiden Katalogen enthalten.
 */
export function Palette({
  palette,
  tool,
  setTool,
  add,
}: {
  /** Einträge aller Kataloge; `medium` ordnet sie zu. */
  palette: PaletteEntry[];
  tool: AnnotationTool | null;
  setTool: (tool: AnnotationTool | null) => void;
  add: (entry: PaletteEntry) => void;
}) {
  const [openCatalogs, setCatalogOpen] = useOpenCatalogs();
  return (
    <aside className="palette">
      <h2>Zeichnen</h2>
      <div className="palette-tools">
        {TOOLS.map(([t, icon, title]) => (
          <IconButton key={t} icon={icon} label={title} aria-pressed={tool === t} onClick={() => setTool(tool === t ? null : t)} />
        ))}
      </div>
      <h2>Bauteile</h2>
      {CATALOGS.map((medium) => {
        const catalog = palette.filter((e) => e.medium === medium);
        if (catalog.length === 0) return null;
        return (
          <details
            key={medium}
            open={openCatalogs[medium]}
            className="palette-catalog"
            onToggle={(e) => setCatalogOpen(medium, e.currentTarget.open)}
          >
            <summary>{MEDIUM_NAMES[medium]}</summary>
            {/* Zugeklappte Kataloge nicht rendern: spart die vielen Symbolvorschauen. */}
            {openCatalogs[medium] &&
              PALETTE_GROUPS.map((group) => {
              const entries = catalog.filter((e) => e.group === group);
              if (entries.length === 0) return null;
              return (
                <details key={group} open className="palette-group">
                  <summary>{group}</summary>
                <div className="palette-grid">
                  {entries.map((entry) => (
                    <button
                      key={entry.key}
                      className={entry.configurable ? 'palette-item is-configurable' : 'palette-item'}
                      title={
                        entry.configurable
                          ? `${entry.name} (konfigurierbar): klicken oder aufs Blatt ziehen, Betätigung und Einzelheiten per Doppelklick im Konfigurator einstellen`
                          : `${entry.name}: klicken oder aufs Blatt ziehen`
                      }
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData(SYMBOL_DRAG_TYPE, entry.key);
                        e.dataTransfer.effectAllowed = 'copy';
                        const preview = e.currentTarget.querySelector('svg');
                        if (preview) e.dataTransfer.setDragImage(preview, preview.clientWidth / 2, preview.clientHeight / 2);
                      }}
                      onClick={() => add(entry)}
                    >
                      <SymbolPreview component={entry} />
                      <span>{entry.name}</span>
                      {entry.configurable && <SlidersHorizontal className="palette-config-badge" size={12} aria-label="konfigurierbar" />}
                    </button>
                  ))}
                </div>
                </details>
              );
            })}
          </details>
        );
      })}
    </aside>
  );
}
