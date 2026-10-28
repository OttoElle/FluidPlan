import { useRef, useState } from 'react';
import { addComponent, createDiagram, removeComponent, touch, updateComponent } from '../model/diagram.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { definitionsFor } from '../model/library.ts';
import { drawingArea } from '../model/sheet.ts';
import type { Diagram } from '../model/types.ts';
import { downloadDiagram, readDiagramFile } from '../io/browser.ts';
import { DiagramView } from './DiagramView.tsx';
import { DOMAIN_NAMES, NewDocumentDialog, SheetFields, type NewDocument } from './SheetSettings.tsx';

export function App() {
  const [diagram, setDiagram] = useState<Diagram>(() => exampleHydraulicDiagram());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = ({ domain, title, sheet }: NewDocument) => {
    setNewDialogOpen(false);
    setDiagram(createDiagram(domain, title, new Date(), sheet));
    setSelectedId(null);
    setMessage(null);
  };

  const open = async (file: File) => {
    const result = await readDiagramFile(file);
    if (result.ok) {
      setDiagram(result.diagram);
      setSelectedId(null);
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
    setSelectedId(component.id);
  };

  const selected = diagram.components.find((c) => c.id === selectedId);

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
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={(id, position) => setDiagram((d) => updateComponent(d, id, { position }))}
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
              <button
                onClick={() => {
                  setDiagram(removeComponent(diagram, selected.id));
                  setSelectedId(null);
                }}
              >
                Löschen
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">
              Bauteil anklicken, um es zu bearbeiten. Ziehen verschiebt es. Mausrad zoomt, Ziehen auf freier Fläche
              verschiebt die Ansicht.
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
