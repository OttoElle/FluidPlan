import { useRef, useState } from 'react';
import { addComponent, createDiagram, removeComponent, touch, updateComponent } from '../model/diagram.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { definitionsFor } from '../model/library.ts';
import type { Diagram, Domain } from '../model/types.ts';
import { downloadDiagram, readDiagramFile } from '../io/browser.ts';
import { DiagramView } from './DiagramView.tsx';

const DOMAIN_NAMES: Record<Domain, string> = { hydraulic: 'Hydraulik', pneumatic: 'Pneumatik' };

export function App() {
  const [diagram, setDiagram] = useState<Diagram>(() => exampleHydraulicDiagram());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = (domain: Domain) => {
    setDiagram(createDiagram(domain));
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
    const { diagram: next, component } = addComponent(diagram, type, { x: 40 + offset, y: 40 + offset });
    setDiagram(next);
    setSelectedId(component.id);
  };

  const selected = diagram.components.find((c) => c.id === selectedId);

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">FluidPlan</strong>
        <button onClick={() => startNew('hydraulic')}>Neu: Hydraulik</button>
        <button onClick={() => startNew('pneumatic')}>Neu: Pneumatik</button>
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
          <p className="hint">Bauteil anklicken, um es zu bearbeiten. Ziehen verschiebt es.</p>
        )}
      </aside>
    </div>
  );
}
