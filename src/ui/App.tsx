import { useEffect, useRef, useState } from 'react';
import {
  DiagramError,
  addComponent,
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
import { definitionsFor } from '../model/library.ts';
import { drawingArea } from '../model/sheet.ts';
import type { Diagram, LineKind } from '../model/types.ts';
import { downloadDiagram, readDiagramFile } from '../io/browser.ts';
import { DiagramView, type Selection } from './DiagramView.tsx';

const LINE_KIND_NAMES: Record<LineKind, string> = {
  working: 'Arbeitsleitung',
  pilot: 'Steuerleitung',
  drain: 'Leckageleitung',
};
import { DOMAIN_NAMES, NewDocumentDialog, SheetFields, type NewDocument } from './SheetSettings.tsx';

export function App() {
  const [diagram, setDiagram] = useState<Diagram>(() => exampleHydraulicDiagram());
  const [selection, setSelection] = useState<Selection>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = ({ domain, title, sheet }: NewDocument) => {
    setNewDialogOpen(false);
    setDiagram(createDiagram(domain, title, new Date(), sheet));
    setSelection(null);
    setMessage(null);
  };

  const open = async (file: File) => {
    const result = await readDiagramFile(file);
    if (result.ok) {
      setDiagram(result.diagram);
      setSelection(null);
      setMessage(null);
    } else {
      setMessage(`„${file.name}“ konnte nicht geladen werden:\n` + result.errors.join('\n'));
    }
  };

  const save = () => {
    const saved = touch(diagram);
    setDiagram(saved);
    downloadDiagram(saved);
  };

  const add = (type: string) => {
    const offset = (diagram.components.length % 10) * 10;
    const area = drawingArea(diagram.sheet);
    const { diagram: next, component } = addComponent(diagram, type, {
      x: area.x + 40 + offset,
      y: area.y + 40 + offset,
    });
    setDiagram(next);
    setSelection({ kind: 'component', id: component.id });
  };

  const selected = selection?.kind === 'component' ? diagram.components.find((c) => c.id === selection.id) : undefined;
  const selectedLine =
    selection?.kind === 'connection' ? diagram.connections.find((l) => l.id === selection.id) : undefined;

  const deleteSelection = () => {
    if (selection?.kind === 'component') setDiagram((d) => removeComponent(d, selection.id));
    if (selection?.kind === 'connection') setDiagram((d) => removeConnection(d, selection.id));
    setSelection(null);
  };

  // Entf bzw. Rücktaste löscht die Auswahl, außer beim Tippen in ein Eingabefeld.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
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
          onChange={(e) => setDiagram({ ...diagram, meta: { ...diagram.meta, title: e.target.value } })}
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
        {definitionsFor(diagram.domain).map((def) => (
          <button key={def.type} onClick={() => add(def.type)}>
            {def.name}
          </button>
        ))}
      </aside>

      <main className="canvas">
        <DiagramView
          diagram={diagram}
          selection={selection}
          onSelect={setSelection}
          onMove={(id, position) => setDiagram((d) => updateComponent(d, id, { position }))}
          onConnect={(from, to, waypoints) => {
            try {
              const r = connect(diagram, from, to, lineKindFor(diagram, from, to), waypoints);
              setDiagram(r.diagram);
              setSelection({ kind: 'connection', id: r.connection.id });
              setMessage(null);
            } catch (err) {
              if (!(err instanceof DiagramError)) throw err;
              setMessage(err.message);
            }
          }}
          onRouteChange={(id, waypoints) => setDiagram((d) => updateConnection(d, id, { waypoints }))}
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
                onChange={(e) => setDiagram(updateComponent(diagram, selected.id, { label: e.target.value }))}
              />
            </label>
            <div className="row">
              <button
                onClick={() =>
                  setDiagram(
                    updateComponent(diagram, selected.id, {
                      rotation: ((selected.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                    }),
                  )
                }
              >
                Drehen
              </button>
              <button onClick={() => setDiagram(updateComponent(diagram, selected.id, { mirrored: !selected.mirrored }))}>
                Spiegeln
              </button>
              <button onClick={deleteSelection}>Löschen</button>
            </div>
          </>
        ) : selectedLine ? (
          <>
            <label>
              Linienart
              <select
                value={selectedLine.kind}
                onChange={(e) =>
                  setDiagram(updateConnection(diagram, selectedLine.id, { kind: e.target.value as LineKind }))
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
                onClick={() => setDiagram(updateConnection(diagram, selectedLine.id, { waypoints: [] }))}
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
            <SheetFields sheet={diagram.sheet} onChange={(sheet) => setDiagram({ ...diagram, sheet })} />
            <label>
              Erstellt von
              <input
                value={diagram.meta.author}
                onChange={(e) => setDiagram({ ...diagram, meta: { ...diagram.meta, author: e.target.value } })}
              />
            </label>
          </>
        )}
      </aside>
    </div>
  );
}
