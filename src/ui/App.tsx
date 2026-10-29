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
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DiagramError,
  addComponent,
  connect,
  lineKindFor,
  moveJunction,
  splitConnection,
  updateConnection,
} from '../model/diagram.ts';
import {
  addSheet,
  allSheetViews,
  createDrawing,
  deleteSheet,
  drawingOf,
  duplicateSheet,
  moveSheet,
  renameSheet,
  sheetIndex,
  sheetView,
  withSheet,
} from '../model/drawing.ts';
import {
  addAnnotation,
  moveAnnotations,
  updateAnnotation,
  type NewAnnotation,
} from '../model/annotations.ts';
import { checkSheets, sheetName, type Issue } from '../model/check.ts';
import { exampleHydraulicDiagram } from '../model/example.ts';
import { autoLabelSheets } from '../model/labels.ts';
import { MODULE, PALETTE_GROUPS, definitionOf, paletteFor, type PaletteEntry } from '../model/library.ts';
import { drawingArea, type TitleField } from '../model/sheet.ts';
import type { Annotation, Diagram, DiagramMeta, Drawing, LineKind, Point, StrokeStyle } from '../model/types.ts';
import { downloadDrawing, readDrawingFile } from '../io/browser.ts';
import { exportSheets, type ExportFormat, type ExportOptions } from '../io/export.ts';
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
import { renderSheetSvgs } from './renderSheets.tsx';
import { SheetTabs } from './SheetTabs.tsx';
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
  const history = useHistory<Drawing>(() => drawingOf(exampleHydraulicDiagram()));
  const drawing = history.present;
  /** Angezeigtes Blatt; fehlt es (z. B. nach Rückgängig), gilt das erste. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = sheetIndex(drawing, activeId);
  const diagram = useMemo(() => sheetView(drawing, active), [drawing, active]);
  const historyEdit = history.edit;
  /** Ändert das angezeigte Blatt (und Schriftfeld-Angaben, die für alle Blätter gelten). */
  const edit = useCallback(
    (update: Diagram | ((d: Diagram) => Diagram), group?: string) =>
      historyEdit((dr) => withSheet(dr, active, typeof update === 'function' ? update(sheetView(dr, active)) : update), group),
    [historyEdit, active],
  );
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
  const issues = useMemo(() => (checking ? checkSheets(allSheetViews(drawing), active) : []), [checking, drawing, active]);
  const fileInput = useRef<HTMLInputElement>(null);
  const palette = paletteFor(diagram.domain);

  const startNew = ({ domain, title, sheet }: NewDocument) => {
    setNewDialogOpen(false);
    history.reset(createDrawing(domain, title, new Date(), sheet));
    setActiveId(null);
    setSelection(EMPTY_SELECTION);
    setMessage(null);
  };

  const open = async (file: File) => {
    const result = await readDrawingFile(file);
    if (result.ok) {
      history.reset(result.drawing);
      setActiveId(null);
      setSelection(EMPTY_SELECTION);
      setMessage(null);
    } else {
      setMessage(`„${file.name}“ konnte nicht geladen werden:\n` + result.errors.join('\n'));
    }
  };

  const save = () => {
    const saved: Drawing = { ...drawing, meta: { ...drawing.meta, modified: new Date().toISOString() } };
    history.replace(saved);
    downloadDrawing(saved);
  };

  // --- Blätter ---------------------------------------------------------------

  const showSheet = (id: string) => {
    if (id === drawing.sheets[active]!.id) return;
    setActiveId(id);
    setSelection(EMPTY_SELECTION);
    setTool(null);
  };

  const newSheet = () => {
    const r = addSheet(drawing, active);
    history.edit(r.drawing);
    showSheet(r.sheet.id);
  };

  const sheetAction = (index: number, action: 'duplicate' | 'left' | 'right' | 'delete') => {
    if (action === 'duplicate') {
      const r = duplicateSheet(drawing, index);
      history.edit(r.drawing);
      showSheet(r.sheet.id);
    } else if (action === 'delete') {
      const next = drawing.sheets[index + 1] ?? drawing.sheets[index - 1];
      history.edit(deleteSheet(drawing, index));
      if (next && index === active) showSheet(next.id);
    } else {
      history.edit(moveSheet(drawing, index, index + (action === 'left' ? -1 : 1)));
    }
  };

  // Nach Rückgängig/Wiederholen das Blatt zeigen, auf dem sich etwas geändert hat.
  const followUndo = useRef(false);
  const previous = useRef(drawing);
  useEffect(() => {
    const before = previous.current;
    previous.current = drawing;
    if (!followUndo.current) return;
    followUndo.current = false;
    const changed = (id: string) => before.sheets.find((s) => s.id === id) !== drawing.sheets.find((s) => s.id === id);
    const shown = drawing.sheets[active]!;
    if (changed(shown.id)) return;
    const other = drawing.sheets.find((s) => changed(s.id));
    if (other) showSheet(other.id);
    // showSheet hängt nur von Werten dieses Renderns ab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing]);
  const undo = () => {
    followUndo.current = true;
    history.undo();
  };
  const redo = () => {
    followUndo.current = true;
    history.redo();
  };

  const runExport = async (format: ExportFormat, options: ExportOptions) => {
    setExportOpen(false);
    const diagrams = options.sheets === 'all' ? allSheetViews(drawing) : [diagram];
    try {
      await exportSheets(renderSheetSvgs(diagrams), diagrams, format, options);
    } catch (err) {
      setMessage(`Export fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const label = () => {
    const before = allSheetViews(drawing);
    const after = autoLabelSheets(before);
    const changed = after.reduce(
      (n, d, s) => n + d.components.filter((c, i) => c.label !== before[s]!.components[i]!.label).length,
      0,
    );
    if (changed) history.edit(after.reduce((dr, d, s) => withSheet(dr, s, d), drawing));
    setMessage(changed ? null : 'Alle Kennzeichen sind schon aktuell.');
  };

  /** Klick auf eine Prüfmeldung: betroffenes Teil auswählen. */
  const pickIssue = (issue: Issue) => {
    if (issue.sheet !== undefined && issue.sheet !== active) showSheet(drawing.sheets[issue.sheet]!.id);
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
        if (key === 'y' || e.shiftKey) redo();
        else undo();
        return;
      }
      // Strg+Bild auf/ab: voriges bzw. nächstes Blatt.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'PageUp' || e.key === 'PageDown')) {
        e.preventDefault();
        const next = drawing.sheets[active + (e.key === 'PageUp' ? -1 : 1)];
        if (next) showSheet(next.id);
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
          <IconButton icon={Undo2} label="Rückgängig" shortcut="Strg+Z" onClick={undo} disabled={!history.canUndo} />
          <IconButton icon={Redo2} label="Wiederholen" shortcut="Strg+Y" onClick={redo} disabled={!history.canRedo} />
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
        sheetCount={drawing.sheets.length}
        onExport={(format, options) => void runExport(format, options)}
        onClose={() => setExportOpen(false)}
      />
      <NewDocumentDialog open={newDialogOpen} onCreate={startNew} onClose={() => setNewDialogOpen(false)} />
      <PropertiesDialog diagram={diagram} target={properties} onApply={(next) => edit(next)} onClose={() => setProperties(null)} />
      <SheetDialog
        open={sheetDialog !== null}
        diagram={diagram}
        focus={sheetDialog?.focus}
        onApply={(sheet, meta, name) =>
          history.edit((dr) => renameSheet(withSheet(dr, active, { ...sheetView(dr, active), sheet, meta }), active, name))
        }
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
        <div className="canvas-area">
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
          {checking && (
            <CheckPanel
              issues={issues}
              sheetLabel={(i) => (drawing.sheets.length > 1 && i !== active ? sheetName(sheetView(drawing, i), i) : undefined)}
              onPick={pickIssue}
              onClose={() => setChecking(false)}
            />
          )}
        </div>
        <SheetTabs
          sheets={drawing.sheets}
          active={active}
          onSelect={(i) => showSheet(drawing.sheets[i]!.id)}
          onAdd={newSheet}
          onRename={(i, name) => history.edit(renameSheet(drawing, i, name))}
          onMove={(from, to) => history.edit(moveSheet(drawing, from, to))}
          onAction={sheetAction}
        />
      </main>
    </div>
  );
}
