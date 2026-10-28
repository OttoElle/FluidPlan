import { useEffect, useRef, useState } from 'react';
import {
  DiagramError,
  addComponent,
  configureComponent,
  connect,
  createDiagram,
  lineKindFor,
  removeComponent,
  removeConnection,
  touch,
  updateComponent,
  updateConnection,
} from '../model/diagram.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { PALETTE_GROUPS, paletteFor, type PaletteEntry } from '../model/library.ts';
import { drawingArea } from '../model/sheet.ts';
import type { Diagram, LineKind } from '../model/types.ts';
import { downloadDiagram, readDiagramFile } from '../io/browser.ts';
import { Configurator } from './Configurator.tsx';
import { DiagramView, type Selection } from './DiagramView.tsx';
import { useHistory } from './useHistory.ts';

const LINE_KIND_NAMES: Record<LineKind, string> = {
  working: 'Arbeitsleitung',
  pilot: 'Steuerleitung',
  drain: 'Leckageleitung',
};
import { DOMAIN_NAMES, NewDocumentDialog, SheetFields, type NewDocument } from './SheetSettings.tsx';

export function App() {
  const history = useHistory<Diagram>(exampleHydraulicDiagram);
  const { present: diagram, edit } = history;
  const [selection, setSelection] = useState<Selection>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = ({ domain, title, sheet }: NewDocument) => {
    setNewDialogOpen(false);
    history.reset(createDiagram(domain, title, new Date(), sheet));
    setSelection(null);
    setMessage(null);
  };

  const open = async (file: File) => {
    const result = await readDiagramFile(file);
    if (result.ok) {
      history.reset(result.diagram);
      setSelection(null);
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
    setSelection({ kind: 'component', id: component.id });
  };

  const selected = selection?.kind === 'component' ? diagram.components.find((c) => c.id === selection.id) : undefined;
  const selectedLine =
    selection?.kind === 'connection' ? diagram.connections.find((l) => l.id === selection.id) : undefined;

  const deleteSelection = () => {
    if (selection?.kind === 'component') edit((d) => removeComponent(d, selection.id));
    if (selection?.kind === 'connection') edit((d) => removeConnection(d, selection.id));
    setSelection(null);
  };

  // Nach Rückgängig/Wiederholen kann das Ausgewählte verschwunden sein.
  useEffect(() => {
    if (selection && !selected && !selectedLine) setSelection(null);
  }, [selection, selected, selectedLine]);

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
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!selection) return;
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
            edit((d) => ({ ...d, meta: { ...d.meta, title } }), 'title');
          }}
        />
        <span className="domain">{DOMAIN_NAMES[diagram.domain]}</span>
      </header>

      <NewDocumentDialog open={newDialogOpen} onCreate={startNew} onClose={() => setNewDialogOpen(false)} />

      {message && (
        <pre className="message" role="alert" onClick={() => setMessage(null)}>
          {message}
        </pre>
      )}

      <aside className="palette">
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
          selection={selection}
          onSelect={setSelection}
          onMove={(id, position) => edit((d) => updateComponent(d, id, { position }), `move:${id}`)}
          onConnect={(from, to, waypoints) => {
            try {
              const r = connect(diagram, from, to, lineKindFor(diagram, from, to), waypoints);
              edit(r.diagram);
              setSelection({ kind: 'connection', id: r.connection.id });
              setMessage(null);
            } catch (err) {
              if (!(err instanceof DiagramError)) throw err;
              setMessage(err.message);
            }
          }}
          onRouteChange={(id, waypoints) => edit((d) => updateConnection(d, id, { waypoints }), `route:${id}`)}
          onGestureEnd={history.seal}
        />
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
            <div className="row">
              <button
                onClick={() =>
                  edit(
                    updateComponent(diagram, selected.id, {
                      rotation: ((selected.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                    }),
                  )
                }
              >
                Drehen
              </button>
              <button onClick={() => edit(updateComponent(diagram, selected.id, { mirrored: !selected.mirrored }))}>
                Spiegeln
              </button>
              <button onClick={deleteSelection}>Löschen</button>
            </div>
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
                onChange={(e) =>
                  edit(updateConnection(diagram, selectedLine.id, { kind: e.target.value as LineKind }))
                }
              >
                {(Object.keys(LINE_KIND_NAMES) as LineKind[]).map((k) => (
                  <option key={k} value={k}>
                    {LINE_KIND_NAMES[k]}
                  </option>
                ))}
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
        ) : (
          <>
            <p className="hint">
              Bauteil anklicken, um es zu bearbeiten. Ziehen verschiebt es. Mausrad zoomt, Ziehen auf freier Fläche
              verschiebt die Ansicht.
            </p>
            <p className="hint">
              Leitung zeichnen: von einem Anschluss zum anderen ziehen, oder Anschluss anklicken, bei Bedarf Knickpunkte
              auf die Fläche klicken und den Zielanschluss anklicken. Esc bricht ab.
            </p>
            <h2>Blatt</h2>
            <SheetFields sheet={diagram.sheet} onChange={(sheet) => edit((d) => ({ ...d, sheet }))} />
            <label>
              Erstellt von
              <input
                value={diagram.meta.author}
                onChange={(e) => {
                  const author = e.target.value;
                  edit((d) => ({ ...d, meta: { ...d.meta, author } }), 'author');
                }}
              />
            </label>
          </>
        )}
      </aside>
    </div>
  );
}
