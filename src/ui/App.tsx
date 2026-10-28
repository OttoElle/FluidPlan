import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DiagramError,
  addComponent,
  configureComponent,
  connect,
  createDiagram,
  lineKindFor,
  moveJunction,
  splitConnection,
  touch,
  updateComponent,
  updateConnection,
} from '../model/diagram.ts';
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  addAnnotation,
  moveAnnotations,
  updateAnnotation,
  type NewAnnotation,
} from '../model/annotations.ts';
import { checkDiagram, type Issue } from '../model/check.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { autoLabel } from '../model/labels.ts';
import { PALETTE_GROUPS, paletteFor, type PaletteEntry } from '../model/library.ts';
import { drawingArea, type TitleField } from '../model/sheet.ts';
import type { Diagram, DiagramMeta, LineKind, StrokeStyle } from '../model/types.ts';
import { downloadDiagram, readDiagramFile } from '../io/browser.ts';
import { exportDiagram, type ExportFormat, type ExportOptions } from '../io/export.ts';
import { CheckPanel } from './CheckPanel.tsx';
import { Configurator } from './Configurator.tsx';
import { DiagramView, type AnnotationTool } from './DiagramView.tsx';
import { alignComponents, mirrorComponents, moveComponents, rotateComponents, type Alignment } from '../model/arrange.ts';
import {
  EMPTY_SELECTION,
  deleteSelected,
  isEmpty,
  prune,
  selectAll,
  selectAnnotation,
  selectComponent,
  selectConnection,
  selectionCount,
  type Selection,
} from '../model/selection.ts';
import { ExportDialog } from './ExportDialog.tsx';
import { useHistory } from './useHistory.ts';

const LINE_KIND_NAMES: Record<LineKind, string> = {
  working: 'Arbeitsleitung',
  pilot: 'Steuerleitung',
  drain: 'Leckageleitung',
};
import { DOMAIN_NAMES, NewDocumentDialog, SheetFields, type NewDocument } from './SheetSettings.tsx';

const lineKindOptions = (Object.keys(LINE_KIND_NAMES) as LineKind[]).map((k) => (
  <option key={k} value={k}>
    {LINE_KIND_NAMES[k]}
  </option>
));

const STROKE_STYLE_NAMES: Record<StrokeStyle, string> = {
  solid: 'Volllinie',
  dashed: 'Strichlinie',
  dashdot: 'Strich-Punkt (Baugruppe)',
};

const TOOLS: [AnnotationTool, string, string][] = [
  ['text', 'Text', 'Klick auf das Blatt setzt einen Text'],
  ['line', 'Linie', 'Linie auf dem Blatt aufziehen'],
  ['rect', 'Rechteck', 'Rechteck aufziehen, z. B. als Baugruppen-Umrandung (Strich-Punkt)'],
];

/** Bearbeitbare Felder des Schriftfelds; Datum und Format füllt das Programm. */
const TITLE_FIELDS: [Exclude<TitleField, 'date' | 'format'>, string][] = [
  ['title', 'Titel'],
  ['drawingNumber', 'Zeichnungsnummer'],
  ['organization', 'Firma / Abteilung'],
  ['author', 'Erstellt von'],
  ['checkedBy', 'Geprüft von'],
  ['revision', 'Änderungsstand'],
];

/** Fokussiert ein Eingabefeld der Seitenleiste, sobald es gerendert ist. */
const focusField = (id: string) =>
  requestAnimationFrame(() => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
    el?.focus();
    el?.select();
  });

const ALIGNMENTS: [Alignment, string, string][] = [
  ['left', '⇤ Links', 'Linke Kanten bündig'],
  ['center', '↔ Mitte', 'Waagerecht mittig (senkrechte Achse)'],
  ['right', 'Rechts ⇥', 'Rechte Kanten bündig'],
  ['top', '⤒ Oben', 'Obere Kanten bündig'],
  ['middle', '↕ Mitte', 'Senkrecht mittig (waagerechte Achse)'],
  ['bottom', '⤓ Unten', 'Untere Kanten bündig'],
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

export function App() {
  const history = useHistory<Diagram>(exampleHydraulicDiagram);
  const { present: diagram, edit } = history;
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [message, setMessage] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const issues = useMemo(() => (checking ? checkDiagram(diagram) : []), [checking, diagram]);
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = ({ domain, title, sheet }: NewDocument) => {
    setNewDialogOpen(false);
    history.reset(createDiagram(domain, title, new Date(), sheet));
    setSelection(EMPTY_SELECTION);
    setMessage(null);
  };

  const open = async (file: File) => {
    const result = await readDiagramFile(file);
    if (result.ok) {
      history.reset(result.diagram);
      setSelection(EMPTY_SELECTION);
      setMessage(null);
    } else {
      setMessage(`„${file.name}“ konnte nicht geladen werden:\n` + result.errors.join('\n'));
    }
  };

  const save = () => {
    const saved = touch(diagram);
    history.replace(saved);
    downloadDiagram(saved);
  };

  const runExport = async (format: ExportFormat, options: ExportOptions) => {
    setExportOpen(false);
    const svg = document.querySelector<SVGSVGElement>('svg.diagram');
    if (!svg) return;
    try {
      await exportDiagram(svg, diagram, format, options);
    } catch (err) {
      setMessage(`Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const label = () => {
    const next = autoLabel(diagram);
    const changed = next.components.filter((c, i) => c.label !== diagram.components[i]!.label).length;
    if (changed) edit(next);
    setMessage(changed ? null : 'Alle Kennzeichen sind schon aktuell.');
  };

  /** Klick auf eine Prüfmeldung: betroffenes Teil auswählen. */
  const pickIssue = (issue: Issue) => {
    setSelection({ ...EMPTY_SELECTION, components: issue.components, connections: issue.connections });
  };

  const add = (entry: PaletteEntry) => {
    const offset = (diagram.components.length % 10) * 10;
    const area = drawingArea(diagram.sheet);
    const { diagram: next, component } = addComponent(
      diagram,
      entry.type,
      { x: area.x + 40 + offset, y: area.y + 40 + offset },
      { config: entry.config },
    );
    edit(next);
    setSelection(selectComponent(component.id));
  };

  // Nach Rückgängig/Wiederholen kann Ausgewähltes verschwunden sein.
  const current = prune(diagram, selection);
  useEffect(() => {
    if (current !== selection) setSelection(current);
  }, [current, selection]);

  const single = selectionCount(current) === 1;
  const selected = single ? diagram.components.find((c) => c.id === current.components[0]) : undefined;
  const selectedLine = single ? diagram.connections.find((l) => l.id === current.connections[0]) : undefined;
  const selectedJunction = single ? diagram.junctions.find((j) => j.id === current.junctions[0]) : undefined;
  const selectedAnnotation = single ? diagram.annotations.find((a) => a.id === current.annotations[0]) : undefined;
  const selectedIds = current.components;
  const selectedLines = diagram.connections.filter((l) => current.connections.includes(l.id));

  const createAnnotation = (a: NewAnnotation) => {
    const r = addAnnotation(diagram, a);
    edit(r.diagram);
    setSelection(selectAnnotation(r.annotation.id));
    setTool(null);
    if (a.kind === 'text') focusField('annotation-text');
  };

  const setMeta = (field: keyof DiagramMeta, value: string) =>
    edit((d) => ({ ...d, meta: { ...d.meta, [field]: value } }), `meta:${field}`);

  const editTitleField = (field: TitleField) => {
    setSelection(EMPTY_SELECTION);
    focusField(`title-${field}`);
  };

  const deleteSelection = () => {
    edit((d) => deleteSelected(d, current));
    setSelection(EMPTY_SELECTION);
  };
  const rotate = () => edit((d) => rotateComponents(d, selectedIds));
  const mirror = (axis: 'horizontal' | 'vertical') => edit((d) => mirrorComponents(d, selectedIds, axis));
  const align = (alignment: Alignment) => edit((d) => alignComponents(d, selectedIds, alignment));
  const setLineKind = (kind: LineKind) =>
    edit((d) => selectedLines.reduce((acc, l) => updateConnection(acc, l.id, { kind }), d));

  const arrangeButtons = (
    <div className="row">
      <button onClick={rotate} title="90° im Uhrzeigersinn drehen (R)">
        Drehen
      </button>
      <button onClick={() => mirror('horizontal')} title="Links und rechts vertauschen">
        Spiegeln ↔
      </button>
      <button onClick={() => mirror('vertical')} title="Oben und unten vertauschen">
        Spiegeln ↕
      </button>
      <button onClick={deleteSelection}>Löschen</button>
    </div>
  );

  // Tastatur: Strg+Z / Strg+Y (bzw. Strg+Umschalt+Z) und Entf.
  // In Eingabefeldern bleiben die Tasten beim Feld (dort wirkt das Rückgängig des Browsers).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 'z' || key === 'y')) {
        e.preventDefault();
        if (key === 'y' || e.shiftKey) history.redo();
        else history.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && key === 'a') {
        e.preventDefault();
        setSelection(selectAll(diagram));
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (tool) setTool(null);
        else setSelection(EMPTY_SELECTION);
      }
      if (key === 'r' && selectedIds.length > 0) rotate();
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEmpty(current)) return;
      e.preventDefault();
      deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">FluidPlan</strong>
        <button onClick={() => setNewDialogOpen(true)}>Neu…</button>
        <button onClick={() => fileInput.current?.click()}>Öffnen…</button>
        <button onClick={save}>Speichern</button>
        <button onClick={history.undo} disabled={!history.canUndo} title="Rückgängig (Strg+Z)">
          ↶
        </button>
        <button onClick={history.redo} disabled={!history.canRedo} title="Wiederholen (Strg+Y)">
          ↷
        </button>
        <button onClick={label} title="Alle Kennzeichen nach ISO 1219-2 neu vergeben (1A1, 1V1, 0P1, …)">
          Kennzeichnen
        </button>
        <button onClick={() => setChecking(!checking)} aria-pressed={checking} title="Zeichnung auf Fehler prüfen">
          Prüfen
        </button>
        <button onClick={() => setExportOpen(true)}>Exportieren…</button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void open(file);
            e.target.value = '';
          }}
        />
        <input
          className="title"
          aria-label="Titel"
          value={diagram.meta.title}
          onChange={(e) => {
            const title = e.target.value;
            setMeta('title', title);
          }}
        />
        <span className="domain">{DOMAIN_NAMES[diagram.domain]}</span>
      </header>

      <ExportDialog
        open={exportOpen}
        diagram={diagram}
        onExport={(format, options) => void runExport(format, options)}
        onClose={() => setExportOpen(false)}
      />
      <NewDocumentDialog open={newDialogOpen} onCreate={startNew} onClose={() => setNewDialogOpen(false)} />

      {message && (
        <pre className="message" role="alert" onClick={() => setMessage(null)}>
          {message}
        </pre>
      )}

      <aside className="palette">
        <h2>Zeichnen</h2>
        <div className="palette-tools">
          {TOOLS.map(([t, name, title]) => (
            <button key={t} title={title} aria-pressed={tool === t} onClick={() => setTool(tool === t ? null : t)}>
              {name}
            </button>
          ))}
        </div>
        <h2>Bauteile</h2>
        {PALETTE_GROUPS.map((group) => {
          const entries = paletteFor(diagram.domain).filter((e) => e.group === group);
          if (entries.length === 0) return null;
          return (
            <details key={group} open className="palette-group">
              <summary>{group}</summary>
              {entries.map((entry) => (
                <button key={entry.key} onClick={() => add(entry)}>
                  {entry.name}
                </button>
              ))}
            </details>
          );
        })}
      </aside>

      <main className="canvas">
        <DiagramView
          diagram={diagram}
          selection={current}
          onSelect={setSelection}
          onMove={(target, delta) =>
            edit((d) => moveAnnotations(moveComponents(d, target.components, delta), target.annotations, delta), 'move')
          }
          tool={tool}
          onCreateAnnotation={createAnnotation}
          onReshapeAnnotation={(id, changes) => edit((d) => updateAnnotation(d, id, changes), `shape:${id}`)}
          onEditText={() => focusField('annotation-text')}
          onEditTitleField={editTitleField}
          onConnect={(from, to, waypoints) => {
            try {
              const r = connect(diagram, from, to, lineKindFor(diagram, from, to), waypoints);
              edit(r.diagram);
              setSelection(selectConnection(r.connection.id));
              setMessage(null);
            } catch (err) {
              if (!(err instanceof DiagramError)) throw err;
              setMessage(err.message);
            }
          }}
          onConnectToLine={(from, lineId, path, point, waypoints) => {
            try {
              const split = splitConnection(diagram, lineId, path, point);
              const to = { junctionId: split.junction.id };
              const r = connect(split.diagram, from, to, lineKindFor(split.diagram, from, to), waypoints);
              edit(r.diagram);
              setSelection(selectConnection(r.connection.id));
              setMessage(null);
            } catch (err) {
              if (!(err instanceof DiagramError)) throw err;
              setMessage(err.message);
            }
          }}
          onRouteChange={(id, waypoints) => edit((d) => updateConnection(d, id, { waypoints }), `route:${id}`)}
          onMoveJunction={(id, position) => edit((d) => moveJunction(d, id, position), `junction:${id}`)}
          onGestureEnd={history.seal}
        />
        {checking && <CheckPanel issues={issues} onPick={pickIssue} onClose={() => setChecking(false)} />}
      </main>

      <aside className="inspector">
        <h2>Eigenschaften</h2>
        {selected ? (
          <>
            <label>
              Kennzeichen
              <input
                value={selected.label}
                onChange={(e) => edit(updateComponent(diagram, selected.id, { label: e.target.value }), `label:${selected.id}`)}
              />
            </label>
            {arrangeButtons}
            {selected.config && (
              <Configurator
                config={selected.config}
                onChange={(config) => edit((d) => configureComponent(d, selected.id, config))}
              />
            )}
          </>
        ) : selectedLine ? (
          <>
            <label>
              Linienart
              <select
                value={selectedLine.kind}
                onChange={(e) => setLineKind(e.target.value as LineKind)}
              >
                {lineKindOptions}
              </select>
            </label>
            <div className="row">
              <button
                disabled={selectedLine.waypoints.length === 0}
                title="Eigene Knicke verwerfen und die Leitung automatisch führen"
                onClick={() => edit(updateConnection(diagram, selectedLine.id, { waypoints: [] }))}
              >
                Automatisch führen
              </button>
              <button onClick={deleteSelection}>Löschen</button>
            </div>
            <p className="hint">
              Ein Teilstück der Leitung ziehen, um es zu verschieben. Entf löscht die Leitung.
            </p>
          </>
        ) : selectedAnnotation ? (
          <>
            {selectedAnnotation.kind === 'text' ? (
              <>
                <label>
                  Text
                  <textarea
                    id="annotation-text"
                    rows={3}
                    value={selectedAnnotation.text}
                    onChange={(e) =>
                      edit(updateAnnotation(diagram, selectedAnnotation.id, { text: e.target.value }), `text:${selectedAnnotation.id}`)
                    }
                  />
                </label>
                <label>
                  Schrifthöhe
                  <select
                    value={selectedAnnotation.size}
                    onChange={(e) => edit(updateAnnotation(diagram, selectedAnnotation.id, { size: Number(e.target.value) }))}
                  >
                    {TEXT_SIZES.some((t) => t.size === selectedAnnotation.size) ? null : (
                      <option value={selectedAnnotation.size}>{selectedAnnotation.size / 4} mm</option>
                    )}
                    {TEXT_SIZES.map((t) => (
                      <option key={t.size} value={t.size}>
                        {t.name}
                        {t.size === DEFAULT_TEXT_SIZE ? ' (Standard)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <label>
                Linienart
                <select
                  value={selectedAnnotation.style}
                  onChange={(e) =>
                    edit(updateAnnotation(diagram, selectedAnnotation.id, { style: e.target.value as StrokeStyle }))
                  }
                >
                  {(Object.keys(STROKE_STYLE_NAMES) as StrokeStyle[]).map((k) => (
                    <option key={k} value={k}>
                      {STROKE_STYLE_NAMES[k]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="row">
              <button onClick={deleteSelection}>Löschen</button>
            </div>
            <p className="hint">
              {selectedAnnotation.kind === 'text'
                ? 'Ziehen verschiebt den Text, Doppelklick springt zum Textfeld. Zeilenumbruch mit Enter.'
                : 'Ziehen verschiebt das Objekt, die Anfasser ändern Lage und Größe.'}
            </p>
          </>
        ) : selectedJunction ? (
          <>
            <p className="hint">
              Abzweigpunkt. Ziehen verschiebt ihn. Löschen entfernt ihn mit allen daran hängenden Leitungen; bleiben an
              einem Abzweig nur zwei Leitungen übrig, werden sie wieder zu einer.
            </p>
            <div className="row">
              <button onClick={deleteSelection}>Löschen</button>
            </div>
          </>
        ) : !isEmpty(current) ? (
          <>
            <p>{describe(current)} ausgewählt</p>
            {selectedIds.length > 0 && arrangeButtons}
            {selectedIds.length >= 2 && (
              <>
                <h2>Ausrichten</h2>
                <div className="row align">
                  {ALIGNMENTS.map(([alignment, label, title]) => (
                    <button key={alignment} onClick={() => align(alignment)} title={title}>
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {selectedLines.length > 0 && (
              <label>
                Linienart
                <select
                  value={selectedLines.every((l) => l.kind === selectedLines[0]!.kind) ? selectedLines[0]!.kind : ''}
                  onChange={(e) => setLineKind(e.target.value as LineKind)}
                >
                  <option value="" disabled>
                    gemischt
                  </option>
                  {lineKindOptions}
                </select>
              </label>
            )}
            {selectedIds.length === 0 && (
              <div className="row">
                <button onClick={deleteSelection}>Löschen</button>
              </div>
            )}
            <p className="hint">
              Ziehen an einem ausgewählten Bauteil verschiebt die ganze Auswahl. Umschalt+Klick nimmt Teile hinzu oder
              heraus.
            </p>
          </>
        ) : (
          <>
            <p className="hint">
              Bauteil anklicken, um es zu bearbeiten. Ziehen verschiebt es. Rahmen auf freier Fläche aufziehen oder
              Umschalt+Klick wählt mehrere Teile, Strg+A alles. Mausrad zoomt; mittlere Maustaste oder Leertaste+Ziehen
              verschiebt die Ansicht.
            </p>
            <p className="hint">
              Leitung zeichnen: von einem Anschluss zum anderen ziehen, oder Anschluss anklicken, bei Bedarf Knickpunkte
              auf die Fläche klicken und den Zielanschluss anklicken. Endet die Leitung auf einer anderen Leitung, entsteht
              dort ein Abzweig. Esc bricht ab.
            </p>
            <h2>Blatt</h2>
            <SheetFields sheet={diagram.sheet} onChange={(sheet) => edit((d) => ({ ...d, sheet }))} />
            <h2>Schriftfeld</h2>
            {TITLE_FIELDS.map(([field, caption]) => (
              <label key={field}>
                {caption}
                <input id={`title-${field}`} value={diagram.meta[field]} onChange={(e) => setMeta(field, e.target.value)} />
              </label>
            ))}
            <p className="hint">Datum und Format füllt das Programm. Ein Klick ins Schriftfeld springt zum passenden Feld.</p>
          </>
        )}
      </aside>
    </div>
  );
}
