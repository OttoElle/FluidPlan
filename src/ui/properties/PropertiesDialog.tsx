import { isGrafcetType } from '../../model/grafcet.ts';
import { Route } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DEFAULT_LINE_WIDTH, DEFAULT_TEXT_SIZE, LINE_WIDTHS } from '../../model/annotations.ts';
import { ColorPicker } from '../ColorPicker.tsx';
import { updateAnnotation } from '../../model/annotations.ts';
import { configureComponent, updateComponent, updateConnection } from '../../model/diagram.ts';
import { DEFAULT_LAYER_ID } from '../../model/layers.ts';
import { definitionOf } from '../../model/library.ts';
import { boundsOf, mirrorComponents, moveComponents, rotateComponents } from '../../model/arrange.ts';
import { GRID, componentBox, keepRoutes } from '../../model/routing.ts';
import type { Annotation, ComponentInstance, Connection, Diagram, Layer } from '../../model/types.ts';
import { SymbolPreview } from '../SymbolPreview.tsx';
import { LINE_KIND_OPTIONS, STROKE_STYLE_OPTIONS, TEXT_SIZE_OPTIONS } from './options.tsx';
import { Segmented } from './Segmented.tsx';
import { COMPONENT_TABS } from './tabs.tsx';

/** Was im Eigenschaften-Fenster bearbeitet wird. */
export type PropertiesTarget = { kind: 'component' | 'connection' | 'annotation'; id: string };

/**
 * Eigenschaften-Fenster (Doppelklick auf ein Teil). Änderungen bleiben ein
 * Entwurf, bis „OK“ sie als ein Rückgängig-Schritt übernimmt.
 */
export function PropertiesDialog({
  diagram,
  layers,
  target,
  onApply,
  onClose,
}: {
  diagram: Diagram;
  /** Ebenen der Zeichnung (Auswahl im Reiter „Lage“). */
  layers: readonly Layer[];
  target: PropertiesTarget | null;
  onApply: (next: Diagram) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = target !== null;
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const component = target?.kind === 'component' ? diagram.components.find((c) => c.id === target.id) : undefined;
  const connection = target?.kind === 'connection' ? diagram.connections.find((l) => l.id === target.id) : undefined;
  const annotation = target?.kind === 'annotation' ? diagram.annotations.find((a) => a.id === target.id) : undefined;
  const body = { diagram, onApply, onClose };

  return (
    <dialog ref={ref} className="properties" onClose={onClose}>
      {component ? (
        <ComponentProperties key={component.id} component={component} layers={layers} {...body} />
      ) : connection ? (
        <ConnectionProperties key={connection.id} connection={connection} {...body} />
      ) : annotation ? (
        <AnnotationProperties key={annotation.id} annotation={annotation} {...body} />
      ) : null}
    </dialog>
  );
}

interface BodyProps {
  diagram: Diagram;
  onApply: (next: Diagram) => void;
  onClose: () => void;
}

/** Formular mit OK/Abbrechen; `apply` liefert den geänderten Schaltplan. */
function Frame({ apply, onApply, onClose, children }: { apply: () => Diagram } & Omit<BodyProps, 'diagram'> & { children: ReactNode }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(apply());
    onClose();
  };
  return (
    <form method="dialog" onSubmit={submit}>
      {children}
      <div className="dialog-buttons">
        <button type="button" onClick={onClose}>
          Abbrechen
        </button>
        <button type="submit" className="primary">
          OK
        </button>
      </div>
    </form>
  );
}

function ComponentProperties({
  component,
  layers,
  diagram,
  ...rest
}: BodyProps & { component: ComponentInstance; layers: readonly Layer[] }) {
  const [draft, setDraft] = useState(component);
  const tabs = COMPONENT_TABS.filter((t) => t.applies(draft));
  const [tabId, setTabId] = useState(tabs[0]?.id);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const def = definitionOf(draft);

  const apply = () => {
    let d = updateComponent(diagram, component.id, {
      label: draft.label,
      // Standardwerte nicht speichern, damit Dateien schlank bleiben.
      description: draft.description || undefined,
      showLabel: draft.showLabel === false ? false : undefined,
      showDescription: draft.showDescription || undefined,
      technicalData: draft.technicalData?.trim() || undefined,
      showTechnicalData: draft.showTechnicalData === false ? false : undefined,
      manufacturer: draft.manufacturer?.trim() || undefined,
      partNumber: draft.partNumber?.trim() || undefined,
      layer: draft.layer === DEFAULT_LAYER_ID ? undefined : draft.layer,
    });
    // Lage über arrange.ts ändern: dreht um die Rastermitte und führt Leitungen nach.
    const id = [component.id];
    const now = () => d.components.find((c) => c.id === component.id)!;
    if (Boolean(draft.mirrored) !== Boolean(component.mirrored)) d = mirrorComponents(d, id, 'horizontal');
    for (let i = 0; i < 3 && now().rotation !== draft.rotation; i++) d = rotateComponents(d, id);
    if (draft.config && draft.config !== component.config) d = configureComponent(d, component.id, draft.config);
    // Neue Position aus dem Reiter „Lage“: linke obere Symbolecke dorthin
    // schieben, auf das Raster gerundet, damit die Anschlüsse im Raster bleiben.
    const target = draft.position !== component.position ? componentBox(draft) : undefined;
    const box = target && boundsOf(d, id);
    if (target && box) {
      const snap = (v: number) => Math.round(v / GRID) * GRID;
      d = moveComponents(d, id, { x: snap(target.minX - box.minX), y: snap(target.minY - box.minY) });
    }
    // Übrige Leitungen behalten ihren Verlauf, nur die angeschlossenen werden nachgeführt.
    return keepRoutes(diagram, d);
  };

  return (
    <Frame apply={apply} {...rest}>
      <div className="props-head">
        <div className="props-preview">
          <SymbolPreview component={draft} width={220} height={140} unitsPerPixel={0.55} />
        </div>
        <div className="props-ident">
          <h2>{def?.name ?? draft.type}</h2>
          {/* GRAFCET-Elemente haben kein Kennzeichen nach ISO 1219-2; Schrittnummer usw. im Konfigurator. */}
          {!isGrafcetType(draft.type) && (
          <div className="ident-row">
            <label>
              Kennzeichen
              <input
                autoFocus
                value={draft.label}
                placeholder="z. B. 1.2"
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.showLabel !== false}
                onChange={(e) => setDraft({ ...draft, showLabel: e.target.checked })}
              />
              Anzeigen
            </label>
          </div>
          )}
          <div className="ident-row">
            <label>
              Bezeichnung
              <input
                value={draft.description ?? ''}
                placeholder="z. B. Spannzylinder"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={draft.showDescription ?? false}
                onChange={(e) => setDraft({ ...draft, showDescription: e.target.checked })}
              />
              Anzeigen
            </label>
          </div>
        </div>
      </div>
      {tab && (
        <>
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={t.id === tab.id}
                onClick={() => setTabId(t.id)}
              >
                {t.title}
              </button>
            ))}
          </div>
          <div className="tab-panel" role="tabpanel">
            <tab.Panel component={draft} onChange={setDraft} layers={layers} />
          </div>
        </>
      )}
    </Frame>
  );
}

function ConnectionProperties({ connection, diagram, ...rest }: BodyProps & { connection: Connection }) {
  const [draft, setDraft] = useState(connection);
  const apply = () => updateConnection(diagram, connection.id, { kind: draft.kind, waypoints: draft.waypoints });
  return (
    <Frame apply={apply} {...rest}>
      <h2>Leitung</h2>
      <div className="tab-form">
        <div className="field">
          <span>Linienart</span>
          <Segmented label="Linienart" options={LINE_KIND_OPTIONS} value={draft.kind} onChange={(kind) => setDraft({ ...draft, kind })} />
        </div>
        <button
          type="button"
          className="with-icon"
          disabled={draft.waypoints.length === 0}
          onClick={() => setDraft({ ...draft, waypoints: [] })}
        >
          <Route size={14} aria-hidden /> Automatisch führen
        </button>
      </div>
    </Frame>
  );
}

const ANNOTATION_NAMES: Record<Annotation['kind'], string> = {
  text: 'Text',
  line: 'Linie',
  rect: 'Rechteck',
  circle: 'Kreis',
  ellipse: 'Ellipse',
  polyline: 'Linienzug',
  arc: 'Kreisbogen',
};

function AnnotationProperties({ annotation, diagram, ...rest }: BodyProps & { annotation: Annotation }) {
  const [draft, setDraft] = useState<Annotation>(annotation);
  // Fehlende Farbe bzw. Linienbreite heißt Standard: als null übergeben, damit sie entfällt.
  const apply = () =>
    updateAnnotation(diagram, annotation.id, {
      ...draft,
      color: draft.color ?? null,
      lineWidth: draft.kind === 'text' ? undefined : (draft.lineWidth ?? null),
    });
  return (
    <Frame apply={apply} {...rest}>
      <h2>{ANNOTATION_NAMES[annotation.kind]}</h2>
      <div className="tab-form">
        {draft.kind === 'text' && (
          <>
            <label>
              Text
              <textarea
                autoFocus
                rows={4}
                value={draft.text}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                onKeyDown={(e) => {
                  // Strg+Enter übernimmt, Enter allein macht eine neue Zeile.
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
                }}
              />
            </label>
            <div className="field">
              <span>Schrifthöhe</span>
              <Segmented
                label="Schrifthöhe"
                options={TEXT_SIZE_OPTIONS}
                value={draft.size ?? DEFAULT_TEXT_SIZE}
                onChange={(size) => setDraft({ ...draft, size })}
              />
            </div>
          </>
        )}
        {'style' in draft && (
          <div className="field">
            <span>Linienart</span>
            <Segmented
              label="Linienart"
              options={STROKE_STYLE_OPTIONS}
              value={draft.style}
              onChange={(style) => setDraft({ ...draft, style })}
            />
          </div>
        )}
        {draft.kind !== 'text' && (
          <label className="field">
            <span>Linienbreite</span>
            <select
              value={draft.lineWidth ?? DEFAULT_LINE_WIDTH}
              onChange={(e) => setDraft({ ...draft, lineWidth: Number(e.target.value) })}
            >
              {LINE_WIDTHS.map((w) => (
                <option key={w} value={w}>
                  {String(w).replace('.', ',')} mm{w === DEFAULT_LINE_WIDTH ? ' (wie Symbole und Leitungen)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field">
          <span>Farbe</span>
          <ColorPicker inline value={draft.color} onChange={(color) => setDraft({ ...draft, color: color ?? undefined })} />
        </div>
      </div>
    </Frame>
  );
}
