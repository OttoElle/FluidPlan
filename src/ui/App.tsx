import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  Circle,
  CircleQuestionMark,
  ClipboardPaste,
  Copy,
  Ellipse,
  FileCog,
  FilePlus2,
  FileDown,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
  FolderOpen,
  Group,
  ListChecks,
  Redo2,
  RotateCw,
  Route,
  Save,
  Scissors,
  Slash,
  SlidersHorizontal,
  Square,
  Sun,
  Moon,
  Tag,
  Trash2,
  Type,
  Undo2,
  Ungroup,
  Waypoints,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DiagramError,
  addComponent,
  connect,
  createDiagram,
  lineKindFor,
  moveJunction,
  splitConnection,
  touch,
  updateConnection,
} from '../model/diagram.ts';
import {
  addAnnotation,
  moveAnnotations,
  updateAnnotation,
  type NewAnnotation,
} from '../model/annotations.ts';
import { checkDiagram, type Issue } from '../model/check.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { autoLabel } from '../model/labels.ts';
import { MODULE, PALETTE_GROUPS, definitionOf, paletteFor, type PaletteEntry } from '../model/library.ts';
import { drawingArea, type TitleField } from '../model/sheet.ts';
import type { Annotation, Diagram, DiagramMeta, LineKind, Point, StrokeStyle } from '../model/types.ts';
import { downloadDiagram, readDiagramFile } from '../io/browser.ts';
import { exportDiagram, type ExportFormat, type ExportOptions } from '../io/export.ts';
import { CheckPanel } from './CheckPanel.tsx';
import { DiagramView, SYMBOL_DRAG_TYPE, type AnnotationTool } from './DiagramView.tsx';
import { HelpDialog } from './HelpDialog.tsx';
import { usePaletteWidth, useTheme } from './layout.ts';
import { LINE_KIND_OPTIONS, STROKE_STYLE_OPTIONS } from './properties/options.tsx';
import { PropertiesDialog, type PropertiesTarget } from './properties/PropertiesDialog.tsx';
import { Segmented } from './properties/Segmented.tsx';
import { SheetDialog } from './SheetDialog.tsx';
import { alignComponents, mirrorComponents, moveComponents, rotateComponents, type Alignment } from '../model/arrange.ts';
import { keepRoutes } from '../model/routing.ts';
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
import { IconButton } from './IconButton.tsx';
import { SymbolPreview } from './SymbolPreview.tsx';
import { Tooltip } from './Tooltip.tsx';
import { useHistory } from './useHistory.ts';
import { copySelection, pasteFragment } from '../model/clipboard.ts';
import { group, groupsIn, ungroup } from '../model/groups.ts';
import { parseDiagram, serializeDiagram } from '../io/json.ts';

import { DOMAIN_NAMES, NewDocumentDialog, type NewDocument } from './SheetSettings.tsx';

const TOOLS: [AnnotationTool, LucideIcon, string][] = [
  ['text', Type, 'Text: Klick auf das Blatt setzt einen Text'],
  ['line', Slash, 'Linie auf dem Blatt aufziehen'],
  ['rect', Square, 'Rechteck aufziehen, z. B. als Baugruppen-Umrandung'],
  ['circle', Circle, 'Kreis vom Mittelpunkt aus aufziehen'],
  ['ellipse', Ellipse, 'Ellipse aufziehen'],
  ['polyline', Waypoints, 'Linienzug: Punkte anklicken; Doppelklick, Enter oder Rechtsklick beendet, Klick auf den ersten Punkt schließt ihn'],
];

/** Versatz beim wiederholten Einfügen (2 Rasterschritte). */
const PASTE_STEP = 20;

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

export function App() {
  const history = useHistory<Diagram>(exampleHydraulicDiagram);
  const { present: diagram, edit } = history;
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [message, setMessage] = useState<string | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const [properties, setProperties] = useState<PropertiesTarget | null>(null);
  const [sheetDialog, setSheetDialog] = useState<{ focus?: TitleField } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [paletteWidth, startPaletteResize, resetPaletteWidth] = usePaletteWidth();
  const issues = useMemo(() => (checking ? checkDiagram(diagram) : []), [checking, diagram]);
  const fileInput = useRef<HTMLInputElement>(null);
  const palette = paletteFor(diagram.domain);

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

  /** Bauteil einfügen: per Klick versetzt oben links, per Ziehen mittig unter der Maus. */
  const add = (entry: PaletteEntry, at?: Point) => {
    let position: Point;
    if (at) {
      const size = definitionOf(entry)?.size ?? { width: 0, height: 0 };
      const snap = (v: number) => Math.round(v / MODULE) * MODULE;
      position = { x: snap(at.x - size.width / 2), y: snap(at.y - size.height / 2) };
    } else {
      const offset = (diagram.components.length % 10) * 10;
      const area = drawingArea(diagram.sheet);
      position = { x: area.x + 40 + offset, y: area.y + 40 + offset };
    }
    const { diagram: next, component } = addComponent(diagram, entry.type, position, { config: entry.config });
    edit(keepRoutes(diagram, next));
    setSelection(selectComponent(component.id));
  };

  // Nach Rückgängig/Wiederholen kann Ausgewähltes verschwunden sein.
  const current = prune(diagram, selection);
  useEffect(() => {
    if (current !== selection) setSelection(current);
  }, [current, selection]);

  const single = selectionCount(current) === 1;
  const selectedLine = single ? diagram.connections.find((l) => l.id === current.connections[0]) : undefined;
  const selectedIds = current.components;
  const selectedLines = diagram.connections.filter((l) => current.connections.includes(l.id));
  const styledAnnotations = diagram.annotations.filter(
    (a): a is Extract<Annotation, { style: StrokeStyle }> => 'style' in a && current.annotations.includes(a.id),
  );
  /** Was ein Doppelklick bzw. Enter bei der jetzigen Auswahl öffnen würde. */
  const propertiesTarget: PropertiesTarget | null = !single
    ? null
    : current.components[0]
      ? { kind: 'component', id: current.components[0] }
      : current.connections[0]
        ? { kind: 'connection', id: current.connections[0] }
        : current.annotations[0]
          ? { kind: 'annotation', id: current.annotations[0] }
          : null;

  const createAnnotation = (a: NewAnnotation) => {
    const r = addAnnotation(diagram, a);
    edit(r.diagram);
    setSelection(selectAnnotation(r.annotation.id));
    setTool(null);
    // Neuen Text gleich im Eigenschaften-Fenster eintippen.
    if (a.kind === 'text') setProperties({ kind: 'annotation', id: r.annotation.id });
  };

  const setMeta = (field: keyof DiagramMeta, value: string) =>
    edit((d) => ({ ...d, meta: { ...d.meta, [field]: value } }), `meta:${field}`);

  const deleteSelection = () => {
    edit((d) => deleteSelected(d, current));
    setSelection(EMPTY_SELECTION);
  };

  /**
   * Zuletzt kopierter Ausschnitt als Datei-Text (siehe model/clipboard.ts) und
   * wie oft er schon eingefügt wurde; jedes Einfügen rückt zwei Raster weiter.
   * Strg+C/X/V gehen zusätzlich über die Zwischenablage des Systems, so lässt
   * sich auch zwischen zwei Fenstern kopieren.
   */
  const clipboard = useRef<{ text: string; pasted: number } | null>(null);
  const canCopy = current.components.length > 0 || current.annotations.length > 0;

  const copy = (): string | null => {
    const fragment = copySelection(diagram, current);
    if (!fragment) return null;
    const text = serializeDiagram(fragment);
    clipboard.current = { text, pasted: 1 };
    return text;
  };

  const cut = (): string | null => {
    const text = copy();
    if (text === null) return null;
    // Ausgeschnittenes kommt beim ersten Einfügen an dieselbe Stelle.
    clipboard.current = { text, pasted: 0 };
    deleteSelection();
    return text;
  };

  /** Fügt `text` (aus der System-Zwischenablage) oder den zuletzt kopierten Ausschnitt ein. */
  const paste = (text?: string) => {
    const known = clipboard.current;
    const source = text === undefined || text === known?.text ? known : { text, pasted: 1 };
    if (!source) return;
    const parsed = parseDiagram(source.text);
    // Fremder Text in der Zwischenablage: nichts einfügen.
    if (!parsed.ok) return;
    if (parsed.diagram.domain !== diagram.domain && parsed.diagram.components.length > 0) {
      setMessage(`Bauteile aus einem ${DOMAIN_NAMES[parsed.diagram.domain]}-Plan lassen sich hier nicht einfügen.`);
      return;
    }
    const step = source.pasted * PASTE_STEP;
    const r = pasteFragment(diagram, parsed.diagram, { x: step, y: step });
    edit(r.diagram);
    setSelection(r.selection);
    clipboard.current = { ...source, pasted: source.pasted + 1 };
  };

  /** Schaltflächen: zusätzlich in die System-Zwischenablage schreiben, wenn der Browser es erlaubt. */
  const toSystemClipboard = (text: string | null) => {
    if (text !== null) navigator.clipboard?.writeText(text).catch(() => {});
  };

  const canGroup = selectionCount(current) >= 2;
  const canUngroup = groupsIn(diagram, current).length > 0;
  const groupSelection = () => {
    const r = group(diagram, current);
    if (r.group) edit(r.diagram);
  };
  const ungroupSelection = () => {
    if (canUngroup) edit(ungroup(diagram, current));
  };

  // Strg+C/X/V außerhalb von Eingabefeldern: Ausschnitt statt Text kopieren.
  useEffect(() => {
    const outsideFields = (e: ClipboardEvent) =>
      !(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]');
    const onCopy = (e: ClipboardEvent) => {
      if (!outsideFields(e)) return;
      const text = e.type === 'cut' ? cut() : copy();
      if (text === null) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', text);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (!outsideFields(e)) return;
      e.preventDefault();
      paste(e.clipboardData?.getData('text/plain') || undefined);
    };
    window.addEventListener('copy', onCopy);
    window.addEventListener('cut', onCopy);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('copy', onCopy);
      window.removeEventListener('cut', onCopy);
      window.removeEventListener('paste', onPaste);
    };
  });
  const rotate = () => edit((d) => rotateComponents(d, selectedIds));
  const mirror = (axis: 'horizontal' | 'vertical') => edit((d) => mirrorComponents(d, selectedIds, axis));
  const align = (alignment: Alignment) => edit((d) => alignComponents(d, selectedIds, alignment));
  const setLineKind = (kind: LineKind) =>
    edit((d) => selectedLines.reduce((acc, l) => updateConnection(acc, l.id, { kind }), d));
  const setStrokeStyle = (style: StrokeStyle) =>
    edit((d) => styledAnnotations.reduce((acc, a) => updateAnnotation(acc, a.id, { style }), d));
  const common = <T,>(values: T[]) => (values.length > 0 && values.every((v) => v === values[0]) ? values[0] : undefined);

  // Tastatur: Strg+Z / Strg+Y (bzw. Strg+Umschalt+Z) und Entf.
  // In Eingabefeldern bleiben die Tasten beim Feld (dort wirkt das Rückgängig des Browsers).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      // Speichern, Öffnen und Exportieren wirken auch in Eingabefeldern.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (key === 's' || key === 'o' || key === 'e')) {
        e.preventDefault();
        if (key === 's') save();
        else if (key === 'o') fileInput.current?.click();
        else setExportOpen(true);
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable], dialog')) return;
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
      if ((e.ctrlKey || e.metaKey) && !e.altKey && key === 'g') {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection();
        else groupSelection();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (tool) setTool(null);
        else setSelection(EMPTY_SELECTION);
      }
      if (key === 'r' && selectedIds.length > 0) rotate();
      if (e.key === 'Enter' && propertiesTarget) {
        e.preventDefault();
        setProperties(propertiesTarget);
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (isEmpty(current)) return;
      e.preventDefault();
      deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const contextBar = !isEmpty(current) && (
    <div className="context-bar" role="toolbar" aria-label="Auswahl bearbeiten">
      <span className="count">{describe(current)}</span>
      {selectedIds.length > 0 && (
        <div className="tool-group">
          <IconButton icon={RotateCw} label="90° im Uhrzeigersinn drehen" shortcut="R" onClick={rotate} />
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
      <div className="tool-group">
        {propertiesTarget && (
          <IconButton
            icon={SlidersHorizontal}
            label="Eigenschaften (Doppelklick)"
            shortcut="Enter"
            onClick={() => setProperties(propertiesTarget)}
          />
        )}
        <IconButton icon={Trash2} label="Löschen" shortcut="Entf" onClick={deleteSelection} />
      </div>
    </div>
  );

  return (
    <div className="app" style={{ '--palette-width': `${paletteWidth}px` } as CSSProperties}>
      <header className="toolbar">
        <strong className="brand">FluidPlan</strong>
        <div className="tool-group">
          <IconButton icon={FilePlus2} label="Neuer Schaltplan" onClick={() => setNewDialogOpen(true)} />
          <IconButton icon={FolderOpen} label="Öffnen" shortcut="Strg+O" onClick={() => fileInput.current?.click()} />
          <IconButton icon={Save} label="Speichern" shortcut="Strg+S" onClick={save} />
          <IconButton icon={FileCog} label="Blatt und Schriftfeld" onClick={() => setSheetDialog({})} />
        </div>
        <div className="tool-group">
          <IconButton icon={Undo2} label="Rückgängig" shortcut="Strg+Z" onClick={history.undo} disabled={!history.canUndo} />
          <IconButton icon={Redo2} label="Wiederholen" shortcut="Strg+Y" onClick={history.redo} disabled={!history.canRedo} />
        </div>
        <div className="tool-group">
          <IconButton icon={Scissors} label="Ausschneiden" shortcut="Strg+X" disabled={!canCopy} onClick={() => toSystemClipboard(cut())} />
          <IconButton icon={Copy} label="Kopieren" shortcut="Strg+C" disabled={!canCopy} onClick={() => toSystemClipboard(copy())} />
          <IconButton icon={ClipboardPaste} label="Einfügen" shortcut="Strg+V" onClick={() => paste()} />
          <IconButton icon={Group} label="Gruppieren" shortcut="Strg+G" disabled={!canGroup} onClick={groupSelection} />
          <IconButton
            icon={Ungroup}
            label="Gruppierung aufheben"
            shortcut="Strg+Umschalt+G"
            disabled={!canUngroup}
            onClick={ungroupSelection}
          />
        </div>
        <div className="tool-group">
          <IconButton icon={Tag} label="Kennzeichnen nach ISO 1219-2 (1A1, 1V1, 0P1, …)" onClick={label} />
          <IconButton
            icon={ListChecks}
            label="Zeichnung prüfen"
            onClick={() => setChecking(!checking)}
            aria-pressed={checking}
          />
          <IconButton icon={FileDown} label="Exportieren als PDF, SVG oder PNG" shortcut="Strg+E" onClick={() => setExportOpen(true)} />
        </div>
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
        <div className="tool-group end">
          <IconButton
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Helle Darstellung' : 'Dunkle Darstellung'}
            tooltip="left"
            onClick={toggleTheme}
          />
          <IconButton icon={CircleQuestionMark} label="Bedienung" tooltip="left" onClick={() => setHelpOpen(true)} />
        </div>
      </header>

      <ExportDialog
        open={exportOpen}
        diagram={diagram}
        onExport={(format, options) => void runExport(format, options)}
        onClose={() => setExportOpen(false)}
      />
      <NewDocumentDialog open={newDialogOpen} onCreate={startNew} onClose={() => setNewDialogOpen(false)} />
      <PropertiesDialog diagram={diagram} target={properties} onApply={(next) => edit(next)} onClose={() => setProperties(null)} />
      <SheetDialog
        open={sheetDialog !== null}
        diagram={diagram}
        focus={sheetDialog?.focus}
        onApply={(sheet, meta) => edit((d) => ({ ...d, sheet, meta }))}
        onClose={() => setSheetDialog(null)}
      />
      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />

      <Tooltip />
      {message && (
        <pre className="message" role="alert" onClick={() => setMessage(null)}>
          {message}
        </pre>
      )}

      <aside className="palette">
        <h2>Zeichnen</h2>
        <div className="palette-tools">
          {TOOLS.map(([t, icon, title]) => (
            <IconButton key={t} icon={icon} label={title} aria-pressed={tool === t} onClick={() => setTool(tool === t ? null : t)} />
          ))}
        </div>
        <h2>Bauteile</h2>
        {PALETTE_GROUPS.map((group) => {
          const entries = palette.filter((e) => e.group === group);
          if (entries.length === 0) return null;
          return (
            <details key={group} open className="palette-group">
              <summary>{group}</summary>
              <div className="palette-grid">
                {entries.map((entry) => (
                  <button
                    key={entry.key}
                    className="palette-item"
                    title={`${entry.name}: klicken oder aufs Blatt ziehen`}
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
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </aside>

      <main className="canvas">
        <div
          className="palette-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="Breite der Bauteilliste"
          data-tooltip="Ziehen ändert die Breite, Doppelklick setzt sie zurück"
          data-tooltip-pos="below"
          onPointerDown={startPaletteResize}
          onDoubleClick={resetPaletteWidth}
        />
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
          onOpenProperties={setProperties}
          onDropSymbol={(key, point) => {
            const entry = palette.find((e) => e.key === key);
            if (entry) add(entry, point);
          }}
          onEditTitleField={(field) => setSheetDialog({ focus: field })}
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
          onMoveJunction={(id, position) => edit((d) => keepRoutes(d, moveJunction(d, id, position)), `junction:${id}`)}
          onGestureEnd={history.seal}
        />
        {contextBar}
        {checking && <CheckPanel issues={issues} onPick={pickIssue} onClose={() => setChecking(false)} />}
      </main>
    </div>
  );
}
