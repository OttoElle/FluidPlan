import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Layers,
  RotateCw,
  Route,
  SlidersHorizontal,
  Trash2,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
  type LucideIcon,
} from 'lucide-react';
import { alignComponents, mirrorComponents, type Alignment } from '../model/arrange.ts';
import { updateAnnotation } from '../model/annotations.ts';
import { updateConnection } from '../model/diagram.ts';
import { assignLayer, layerOf } from '../model/layers.ts';
import { isEmpty, selectionCount, type Selection } from '../model/selection.ts';
import type { Annotation, Diagram, Layer, LineKind, StrokeStyle } from '../model/types.ts';
import { IconButton } from './IconButton.tsx';
import { LINE_KIND_OPTIONS, STROKE_STYLE_OPTIONS } from './properties/options.tsx';
import type { PropertiesTarget } from './properties/PropertiesDialog.tsx';
import { Segmented } from './properties/Segmented.tsx';

const ALIGNMENTS: [Alignment, LucideIcon, string][] = [
  ['left', AlignStartVertical, 'Linke Kanten bündig'],
  ['center', AlignCenterVertical, 'Waagerecht mittig (senkrechte Achse)'],
  ['right', AlignEndVertical, 'Rechte Kanten bündig'],
  ['top', AlignStartHorizontal, 'Obere Kanten bündig'],
  ['middle', AlignCenterHorizontal, 'Senkrecht mittig (waagerechte Achse)'],
  ['bottom', AlignEndHorizontal, 'Untere Kanten bündig'],
];

/** z. B. „3 Bauteile, 1 Leitung“. */
function describe(s: Selection): string {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => count > 0 && parts.push(`${count} ${count === 1 ? one : many}`);
  n(s.components.length, 'Bauteil', 'Bauteile');
  n(s.connections.length, 'Leitung', 'Leitungen');
  n(s.junctions.length, 'Abzweig', 'Abzweige');
  n(s.annotations.length, 'Grafik', 'Grafiken');
  return parts.join(', ');
}

/** Leiste über der Zeichenfläche mit den Befehlen für die aktuelle Auswahl. */
export function ContextBar({
  diagram,
  layers,
  current,
  propertiesTarget,
  edit,
  onRotate,
  onOpenProperties,
  onDelete,
}: {
  diagram: Diagram;
  /** Ebenen der Zeichnung. */
  layers: Layer[];
  current: Selection;
  /** Was „Eigenschaften“ öffnet; null bei Mehrfachauswahl. */
  propertiesTarget: PropertiesTarget | null;
  edit: (update: Diagram | ((d: Diagram) => Diagram)) => void;
  onRotate: () => void;
  onOpenProperties: (target: PropertiesTarget) => void;
  onDelete: () => void;
}) {
  const single = selectionCount(current) === 1;
  const selectedIds = current.components;
  const selectedLine = single ? diagram.connections.find((l) => l.id === current.connections[0]) : undefined;
  const selectedLines = diagram.connections.filter((l) => current.connections.includes(l.id));
  const styledAnnotations = diagram.annotations.filter(
    (a): a is Extract<Annotation, { style: StrokeStyle }> => 'style' in a && current.annotations.includes(a.id),
  );
  const mirror = (axis: 'horizontal' | 'vertical') => edit((d) => mirrorComponents(d, selectedIds, axis));
  const align = (alignment: Alignment) => edit((d) => alignComponents(d, selectedIds, alignment));
  const setLineKind = (kind: LineKind) =>
    edit((d) => selectedLines.reduce((acc, l) => updateConnection(acc, l.id, { kind }), d));
  const setStrokeStyle = (style: StrokeStyle) =>
    edit((d) => styledAnnotations.reduce((acc, a) => updateAnnotation(acc, a.id, { style }), d));
  const selectedLayers = [
    ...diagram.components.filter((c) => current.components.includes(c.id)),
    ...selectedLines,
    ...diagram.annotations.filter((a) => current.annotations.includes(a.id)),
  ].map((x) => layerOf(layers, x).id);
  const common = <T,>(values: T[]) => (values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined);

  if (isEmpty(current)) return null;
  return (
    <div className="context-bar" role="toolbar" aria-label="Auswahl bearbeiten">
      <span className="count">{describe(current)}</span>
      {selectedIds.length > 0 && (
        <div className="tool-group">
          <IconButton icon={RotateCw} label="90° im Uhrzeigersinn drehen" shortcut="R" onClick={onRotate} />
          <IconButton icon={TrianglesCenterlineDashedVertical} label="Spiegeln: links und rechts vertauschen" onClick={() => mirror('horizontal')} />
          <IconButton icon={TrianglesCenterlineDashedHorizontal} label="Spiegeln: oben und unten vertauschen" onClick={() => mirror('vertical')} />
        </div>
      )}
      {selectedIds.length >= 2 && (
        <div className="tool-group">
          {ALIGNMENTS.map(([alignment, icon, title]) => (
            <IconButton key={alignment} icon={icon} label={title} onClick={() => align(alignment)} />
          ))}
        </div>
      )}
      {selectedLines.length > 0 && (
        <div className="tool-group">
          <Segmented
            label="Linienart"
            options={LINE_KIND_OPTIONS}
            value={common(selectedLines.map((l) => l.kind))}
            onChange={setLineKind}
          />
          {selectedLine && (
            <IconButton
              icon={Route}
              label="Automatisch führen (eigene Knicke verwerfen)"
              disabled={selectedLine.waypoints.length === 0}
              onClick={() => edit(updateConnection(diagram, selectedLine.id, { waypoints: [] }))}
            />
          )}
        </div>
      )}
      {styledAnnotations.length > 0 && (
        <div className="tool-group">
          <Segmented
            label="Linienart"
            options={STROKE_STYLE_OPTIONS}
            value={common(styledAnnotations.map((a) => a.style))}
            onChange={setStrokeStyle}
          />
        </div>
      )}
      {layers.length > 1 && selectionCount({ ...current, junctions: [] }) > 0 && (
        <div className="tool-group">
          <Layers size={16} aria-hidden className="context-icon" />
          <select
            aria-label="Ebene"
            data-tooltip="Ebene der Auswahl"
            value={common(selectedLayers) ?? ''}
            onChange={(e) => edit((d) => assignLayer(d, current, e.target.value))}
          >
            {common(selectedLayers) === undefined && <option value="">Verschiedene Ebenen</option>}
            {layers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="tool-group">
        {propertiesTarget && (
          <IconButton
            icon={SlidersHorizontal}
            label="Eigenschaften (Doppelklick)"
            shortcut="Enter"
            onClick={() => onOpenProperties(propertiesTarget)}
          />
        )}
        <IconButton icon={Trash2} label="Löschen" shortcut="Entf" onClick={onDelete} />
      </div>
    </div>
  );
}
