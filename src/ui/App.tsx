import {
  CircleQuestionMark,
  ClipboardPaste,
  Copy,
  CopyPlus,
  RotateCw,
  SlidersHorizontal,
  SquareDashedMousePointer,
  Trash2,
  TrianglesCenterlineDashedHorizontal,
  TrianglesCenterlineDashedVertical,
  FileCog,
  FilePlus2,
  FileDown,
  FolderOpen,
  Group,
  ListChecks,
  Redo2,
  Save,
  Scissors,
  Sun,
  Moon,
  Tag,
  Undo2,
  Ungroup,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DiagramError,
  addComponent,
  connect,
  lineKindFor,
  moveJunction,
  moveLabel,
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
import { MODULE, definitionOf, paletteFor, type PaletteEntry } from '../model/library.ts';

/** Alle Bauteilkataloge; in der Seitenleiste je Medium aufklappbar. */
const PALETTE: PaletteEntry[] = [...paletteFor('hydraulic'), ...paletteFor('pneumatic')];
import { drawingArea, type TitleField } from '../model/sheet.ts';
import type { Diagram, DiagramMeta, Drawing, Point } from '../model/types.ts';
import { downloadDrawing, readDrawingFile } from '../io/browser.ts';
import { exportSheets, type ExportFormat, type ExportOptions } from '../io/export.ts';
import { CheckPanel } from './CheckPanel.tsx';
import { DiagramView, type AnnotationTool } from './DiagramView.tsx';
import { HelpDialog } from './HelpDialog.tsx';
import { usePaletteWidth, useTheme } from './layout.ts';
import { PropertiesDialog, type PropertiesTarget } from './properties/PropertiesDialog.tsx';
import { SheetDialog } from './SheetDialog.tsx';
import { mirrorComponents, moveComponents, rotateComponents } from '../model/arrange.ts';
import { CanvasMenu, type MenuItem } from './CanvasMenu.tsx';
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
  toggle,
  type Selection,
} from '../model/selection.ts';
import { ExportDialog } from './ExportDialog.tsx';
import { IconButton } from './IconButton.tsx';
import { renderSheetSvgs } from './renderSheets.tsx';
import { Tooltip } from './Tooltip.tsx';
import { useHistory } from './useHistory.ts';
import { StructurePanel } from './StructurePanel.tsx';
import { ContextBar } from './ContextBar.tsx';
import { Palette } from './Palette.tsx';
import { useClipboard } from './useClipboard.ts';
import { DEFAULT_LAYER_ID, assignLayer, layerOf, layerState, layersOf, without } from '../model/layers.ts';
import { group, groupsIn, ungroup } from '../model/groups.ts';

import { NewDocumentDialog, type NewDocument } from './SheetSettings.tsx';

export function App() {
  const history = useHistory<Drawing>(() => drawingOf(exampleHydraulicDiagram()));
  const drawing = history.present;
  /** Angezeigtes Blatt; fehlt es (z. B. nach Rückgängig), gilt das erste. */
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = sheetIndex(drawing, activeId);
  const diagram = useMemo(() => sheetView(drawing, active), [drawing, active]);
  const allViews = useMemo(() => allSheetViews(drawing), [drawing]);
  const historyEdit = history.edit;
  /** Ändert das angezeigte Blatt (und Schriftfeld-Angaben, die für alle Blätter gelten). */
  const edit = useCallback(
    (update: Diagram | ((d: Diagram) => Diagram), group?: string) =>
      historyEdit((dr) => withSheet(dr, active, typeof update === 'function' ? update(sheetView(dr, active)) : update), group),
    [historyEdit, active],
  );
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  /** Ebene, auf die neue Teile kommen; gibt es sie nicht mehr, gilt die Standardebene. */
  const [activeLayerId, setActiveLayer] = useState(DEFAULT_LAYER_ID);
  const activeLayer = layerOf(layersOf(drawing), { layer: activeLayerId }).id;
  /** Legt neu angelegte Teile auf die aktive Ebene. */
  const onActiveLayer = (d: Diagram, s: Partial<Selection>) =>
    assignLayer(d, { ...EMPTY_SELECTION, ...s }, activeLayer);
  const layers = useMemo(() => layerState(diagram), [diagram]);
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
  const startNew = ({ title, sheet }: NewDocument) => {
    setNewDialogOpen(false);
    history.reset(createDrawing(title, new Date(), sheet));
    setActiveId(null);
    setActiveLayer(DEFAULT_LAYER_ID);
    setSelection(EMPTY_SELECTION);
    setMessage(null);
  };
  const open = async (file: File) => {
    const result = await readDrawingFile(file);
    if (result.ok) {
      history.reset(result.drawing);
      setActiveId(null);
      setActiveLayer(DEFAULT_LAYER_ID);
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

  /** Klick auf ein anderes Blatt der Zeichenfläche: das Werkzeug bleibt gewählt. */
  const activateSheet = (index: number) => {
    if (index === active) return;
    setActiveId(drawing.sheets[index]!.id);
    setSelection(EMPTY_SELECTION);
  };

  /** Neues Blatt hinten anfügen („+“ rechts neben dem letzten Blatt). */
  const newSheet = () => {
    const r = addSheet(drawing, drawing.sheets.length - 1);
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
  /** Fügt ein Bauteil ein; `sheet` = Blatt, auf das es gezogen wurde (sonst das aktuelle). */
  const add = (entry: PaletteEntry, at?: Point, sheet = active) => {
    const base = sheet === active ? diagram : sheetView(drawing, sheet);
    let position: Point;
    if (at) {
      const size = definitionOf(entry)?.size ?? { width: 0, height: 0 };
      const snap = (v: number) => Math.round(v / MODULE) * MODULE;
      position = { x: snap(at.x - size.width / 2), y: snap(at.y - size.height / 2) };
    } else {
      const offset = (base.components.length % 10) * 10;
      const area = drawingArea(base.sheet);
      position = { x: area.x + 40 + offset, y: area.y + 40 + offset };
    }
    const { diagram: placed, component } = addComponent(base, entry.type, position, { config: entry.config, medium: entry.medium });
    const next = onActiveLayer(placed, { components: [component.id] });
    if (sheet === active) edit(keepRoutes(base, next));
    else {
      history.edit((dr) => withSheet(dr, sheet, keepRoutes(base, next)));
      activateSheet(sheet);
    }
    setSelection(selectComponent(component.id));
  };

  // Nach Rückgängig/Wiederholen kann Ausgewähltes verschwunden sein, ausgeblendete Ebenen sind nicht auswählbar.
  const current = useMemo(() => {
    const pruned = prune(diagram, selection);
    const visible = without(pruned, layers.hidden);
    return visible === pruned ? pruned : visible;
  }, [diagram, selection, layers]);
  useEffect(() => {
    if (current !== selection) setSelection(current);
  }, [current, selection]);
  const single = selectionCount(current) === 1;
  const selectedIds = current.components;
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
    edit(onActiveLayer(r.diagram, { annotations: [r.annotation.id] }));
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
  const canCopy = current.components.length > 0 || current.annotations.length > 0;
  const { copy, cut, paste, duplicate, hasContent, toSystemClipboard } = useClipboard({ diagram, current, edit, setSelection, deleteSelection });
  const canGroup = selectionCount(current) >= 2;
  const canUngroup = groupsIn(diagram, current).length > 0;
  const groupSelection = () => {
    const r = group(diagram, current);
    if (r.group) edit(r.diagram);
  };
  const ungroupSelection = () => {
    if (canUngroup) edit(ungroup(diagram, current));
  };
  const rotate = () => edit((d) => rotateComponents(d, selectedIds));
  const mirror = (axis: 'horizontal' | 'vertical') => edit((d) => mirrorComponents(d, selectedIds, axis));
  const doSelectAll = () => setSelection(without(selectAll(diagram), layers.hidden, layers.locked));
  /** Rechtsklickmenü der Zeichenfläche: Bildschirmstelle und Stelle im Schaltplan. */
  const [menu, setMenu] = useState<{ client: Point; at: Point } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const pasteAt = (at: Point) => {
    // Eigener Ausschnitt zuerst; sonst die System-Zwischenablage (z. B. aus einem anderen Fenster).
    if (hasContent()) paste(undefined, at);
    else navigator.clipboard?.readText().then((text) => paste(text, at), () => {});
  };
  const menuItems = (at: Point): MenuItem[] => {
    const any = !isEmpty(current);
    const items: MenuItem[] = [
      { label: 'Ausschneiden', icon: Scissors, shortcut: 'Strg+X', disabled: !canCopy, run: () => toSystemClipboard(cut()) },
      { label: 'Kopieren', icon: Copy, shortcut: 'Strg+C', disabled: !canCopy, run: () => toSystemClipboard(copy()) },
      { label: 'Hier einfügen', icon: ClipboardPaste, shortcut: 'Strg+V', run: () => pasteAt(at) },
      { label: 'Duplizieren', icon: CopyPlus, shortcut: 'Strg+D', disabled: !canCopy, run: duplicate },
      { label: 'Löschen', icon: Trash2, shortcut: 'Entf', disabled: !any, run: deleteSelection },
    ];
    if (selectedIds.length > 0) {
      items.push(
        null,
        { label: '90° drehen', icon: RotateCw, shortcut: 'R', run: rotate },
        { label: 'Spiegeln: links und rechts', icon: TrianglesCenterlineDashedVertical, run: () => mirror('horizontal') },
        { label: 'Spiegeln: oben und unten', icon: TrianglesCenterlineDashedHorizontal, run: () => mirror('vertical') },
      );
    }
    if (canGroup || canUngroup) {
      items.push(
        null,
        { label: 'Gruppieren', icon: Group, shortcut: 'Strg+G', disabled: !canGroup, run: groupSelection },
        { label: 'Gruppierung aufheben', icon: Ungroup, shortcut: 'Strg+Umschalt+G', disabled: !canUngroup, run: ungroupSelection },
      );
    }
    items.push(null, { label: 'Alles auswählen', icon: SquareDashedMousePointer, shortcut: 'Strg+A', run: doSelectAll });
    if (propertiesTarget) {
      const target = propertiesTarget;
      items.push({ label: 'Eigenschaften …', icon: SlidersHorizontal, shortcut: 'Enter', run: () => setProperties(target) });
    }
    return items;
  };
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
      if (t.closest('input, textarea, select, [contenteditable], dialog, .canvas-menu')) return;
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
        doSelectAll();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && key === 'd') {
        e.preventDefault();
        duplicate();
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
  return (
    <div className="app" style={{ '--palette-width': `${paletteWidth}px` } as CSSProperties}>
      <header className="toolbar">
        <strong className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={20} height={20} />
          FluidPlan
        </strong>
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
          <IconButton icon={Tag} label="Kennzeichnen nach ISO 1219-2 (0.1, 1.1, 1.2, …)" onClick={label} />
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
      <PropertiesDialog diagram={diagram} layers={layersOf(drawing)} target={properties} onApply={(next) => edit(next)} onClose={() => setProperties(null)} />
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

      <div className="sidebar">
      <Palette palette={PALETTE} tool={tool} setTool={setTool} add={(entry) => add(entry)} />
      <StructurePanel
        drawing={drawing}
        active={active}
        selection={current}
        activeLayer={activeLayer}
        onShowSheet={(i) => showSheet(drawing.sheets[i]!.id)}
        onSelect={(i, s, additive) => {
          showSheet(drawing.sheets[i]!.id);
          const shown = without(s, (i === active ? layers : layerState(sheetView(drawing, i))).hidden);
          setSelection(additive && i === active ? toggle(current, shown) : shown);
        }}
        onOpenProperties={(i, target) => {
          showSheet(drawing.sheets[i]!.id);
          setProperties(target);
        }}
        onEditSheet={(i) => {
          showSheet(drawing.sheets[i]!.id);
          setSheetDialog({});
        }}
        onEdit={(next) => history.edit(next)}
        onActiveLayer={setActiveLayer}
        onAssignLayer={(id) => edit((d) => assignLayer(d, current, id))}
      />
      </div>

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
            pages={{
              all: allViews,
              active,
              onActivate: activateSheet,
              onAdd: newSheet,
              onRename: (i, name) => history.edit(renameSheet(drawing, i, name)),
              onAction: sheetAction,
            }}
            selection={current}
            onSelect={setSelection}
            onMove={(target, delta) =>
              edit((d) => moveAnnotations(moveComponents(d, target.components, delta), target.annotations, delta), 'move')
            }
            tool={tool}
            onCreateAnnotation={createAnnotation}
            onReshapeAnnotation={(id, changes) => edit((d) => updateAnnotation(d, id, changes), `shape:${id}`)}
            onOpenProperties={setProperties}
            onDropSymbol={(key, point, sheet) => {
              const entry = PALETTE.find((e) => e.key === key);
              if (entry) add(entry, point, sheet);
            }}
            onEditTitleField={(field) => setSheetDialog({ focus: field })}
            onConnect={(from, to, waypoints) => {
              try {
                const r = connect(diagram, from, to, lineKindFor(diagram, from, to), waypoints);
                edit(onActiveLayer(r.diagram, { connections: [r.connection.id] }));
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
                edit(onActiveLayer(r.diagram, { connections: [r.connection.id] }));
                setSelection(selectConnection(r.connection.id));
                setMessage(null);
              } catch (err) {
                if (!(err instanceof DiagramError)) throw err;
                setMessage(err.message);
              }
            }}
            onRouteChange={(id, waypoints) => edit((d) => updateConnection(d, id, { waypoints }), `route:${id}`)}
            onMoveJunction={(id, position) => edit((d) => keepRoutes(d, moveJunction(d, id, position)), `junction:${id}`)}
            onMoveLabel={(id, port, offset) => edit((d) => moveLabel(d, id, port, offset), `label:${id}:${port ?? ''}`)}
            onGestureEnd={history.seal}
            onContextMenu={(client, at) => setMenu({ client, at })}
          />
          {menu && <CanvasMenu at={menu.client} items={menuItems(menu.at)} onClose={closeMenu} />}
          <ContextBar
            diagram={diagram}
            layers={layersOf(drawing)}
            current={current}
            propertiesTarget={propertiesTarget}
            edit={edit}
            onRotate={rotate}
            onOpenProperties={setProperties}
            onDelete={deleteSelection}
          />
          {checking && (
            <CheckPanel
              issues={issues}
              sheetLabel={(i) => (drawing.sheets.length > 1 && i !== active ? sheetName(sheetView(drawing, i), i) : undefined)}
              onPick={pickIssue}
              onClose={() => setChecking(false)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
