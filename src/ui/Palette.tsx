import { Circle, createLucideIcon, Ellipse, Quote, Slash, SlidersHorizontal, Square, Type, Waypoints, type LucideIcon } from 'lucide-react';
import { CATALOG_NAMES, PALETTE_GROUPS, type Catalog, type PaletteEntry } from '../model/library.ts';
import { SYMBOL_DRAG_TYPE, type AnnotationTool } from './DiagramView.tsx';
import { IconButton } from './IconButton.tsx';
import { useOpenCatalogs } from './layout.ts';
import { SymbolPreview } from './SymbolPreview.tsx';

/** Kreisbogen mit Mittelpunkt, im Stil der übrigen Werkzeug-Icons. */
const Arc = createLucideIcon('FluidPlanArc', [
  ['path', { d: 'M4 16a8 8 0 0 1 16 0', key: 'arc' }],
  ['circle', { cx: '12', cy: '16', r: '1', key: 'center' }],
]);

const TOOLS: [AnnotationTool, LucideIcon, string][] = [
  ['text', Type, 'Text: Klick auf das Blatt setzt einen Text'],
  ['line', Slash, 'Linie auf dem Blatt aufziehen'],
  ['rect', Square, 'Rechteck aufziehen, z. B. als Baugruppen-Umrandung'],
  ['circle', Circle, 'Kreis vom Mittelpunkt aus aufziehen'],
  ['ellipse', Ellipse, 'Ellipse aufziehen'],
  ['arc', Arc, 'Kreisbogen: Mittelpunkt, Anfang und Ende anklicken; die Maus gibt die Richtung vor (im oder gegen den Uhrzeigersinn)'],
  ['polyline', Waypoints, 'Linienzug: Punkte anklicken; Doppelklick, Enter oder Rechtsklick beendet, Klick auf den ersten Punkt schließt ihn'],
];

/** Teil-GRAFCET-Rahmen mit abgerundeten Ecken. */
const Frame = createLucideIcon('FluidPlanGrafcetFrame', [
  ['rect', { x: '3', y: '4', width: '18', height: '15', rx: '3', key: 'frame' }],
  ['path', { d: 'M7 15h3', key: 'name' }],
]);

const GRAFCET_TOOLS: [AnnotationTool, LucideIcon, string][] = [
  ['grafcet-frame', Frame, 'Teil-GRAFCET-Rahmen aufziehen (Name G1, G2 … unten links); im Eigenschaften-Fenster auch als Einschließung'],
  ['comment', Quote, 'Kommentar: Klick auf das Blatt setzt einen Text in Anführungszeichen'],
];

const CATALOGS = Object.keys(CATALOG_NAMES) as Catalog[];

/**
 * Bauteilliste links: Zeichenwerkzeuge und die Bauteilkataloge (Hydraulik,
 * Pneumatik, GRAFCET), die man nach Bedarf aufklappt; Symbole zum Anklicken oder
 * Aufs-Blatt-Ziehen. Ein Plan darf Bauteile aus beiden Katalogen enthalten.
 */
export function Palette({
  palette,
  tool,
  setTool,
  add,
}: {
  /** Einträge aller Kataloge; `catalog` ordnet sie zu. */
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
        const catalog = palette.filter((e) => e.catalog === medium);
        if (catalog.length === 0) return null;
        return (
          <details
            key={medium}
            open={openCatalogs[medium]}
            className="palette-catalog"
            onToggle={(e) => setCatalogOpen(medium, e.currentTarget.open)}
          >
            <summary>{CATALOG_NAMES[medium]}</summary>
            {medium === 'grafcet' && openCatalogs.grafcet && (
              // Rahmen und Kommentar sind Grafik, keine Bauteile: als Werkzeuge wie oben.
              <div className="palette-tools grafcet-tools">
                {GRAFCET_TOOLS.map(([t, icon, title]) => (
                  <IconButton key={t} icon={icon} label={title} aria-pressed={tool === t} onClick={() => setTool(tool === t ? null : t)} />
                ))}
              </div>
            )}
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
