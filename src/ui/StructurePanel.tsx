import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  File,
  FileText,
  Folder,
  Frame,
  Group as GroupIcon,
  Layers,
  ListTree,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  Shapes,
  Spline,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { textLines } from '../model/annotations.ts';
import {
  DEFAULT_LAYER_ID,
  addLayer,
  deleteLayer,
  layerCounts,
  layerOf,
  layersOf,
  moveLayer,
  updateLayer,
} from '../model/layers.ts';
import { definitionOf, portName } from '../model/library.ts';
import { EMPTY_SELECTION, isEmpty, type Selection } from '../model/selection.ts';
import type { Annotation, ComponentInstance, Drawing, DrawingSheet, Endpoint, Layer } from '../model/types.ts';
import { IconButton } from './IconButton.tsx';
import type { PropertiesTarget } from './properties/PropertiesDialog.tsx';
import { SymbolPreview } from './SymbolPreview.tsx';

/**
 * Strukturbaum und Ebenen unten in der linken Seitenleiste, wie der
 * Feature-Baum eines CAD-Programms: Zeichnung › Blätter › Rahmen, Bauteile,
 * Leitungen, Grafik und Gruppen. Ein Klick wählt das Teil auf dem Blatt aus,
 * ein Doppelklick öffnet seine Eigenschaften. Der zweite Reiter verwaltet die
 * Zeichnungsebenen (siehe model/layers.ts).
 */

type Tab = 'tree' | 'layers';

interface Props {
  drawing: Drawing;
  /** Index des angezeigten Blatts. */
  active: number;
  /** Auswahl auf dem angezeigten Blatt. */
  selection: Selection;
  /** Ebene, auf die neue Teile kommen. */
  activeLayer: string;
  onShowSheet: (index: number) => void;
  /** Auswahl auf Blatt `index`; `additive` = Strg/Umschalt-Klick (umschalten). */
  onSelect: (index: number, selection: Selection, additive: boolean) => void;
  onOpenProperties: (index: number, target: PropertiesTarget) => void;
  /** Blatt und Schriftfeld bearbeiten. */
  onEditSheet: (index: number) => void;
  /** Änderung an der ganzen Zeichnung (Ebenen, Rahmen ein/aus). */
  onEdit: (drawing: Drawing) => void;
  onActiveLayer: (id: string) => void;
  /** Legt die Auswahl auf die Ebene. */
  onAssignLayer: (id: string) => void;
}

// --- Gespeicherte Anzeige -----------------------------------------------------

const STORAGE_KEY = 'fluidplan.structure';
const HEIGHT = { min: 120, default: 280 };

interface PanelSettings {
  open: boolean;
  height: number;
  tab: Tab;
}

function loadSettings(): PanelSettings {
  const fallback: PanelSettings = { open: true, height: HEIGHT.default, tab: 'tree' };
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PanelSettings> | null;
    return {
      open: typeof raw?.open === 'boolean' ? raw.open : fallback.open,
      height: typeof raw?.height === 'number' ? raw.height : fallback.height,
      tab: raw?.tab === 'layers' ? 'layers' : 'tree',
    };
  } catch {
    return fallback;
  }
}

function saveSettings(s: PanelSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ohne Speicher gilt die Einstellung nur bis zum Neuladen
  }
}

const clampHeight = (h: number) => Math.round(Math.max(HEIGHT.min, Math.min(window.innerHeight * 0.75, h)));

// --- Namen im Baum ------------------------------------------------------------

const ANNOTATION_NAMES: Record<Annotation['kind'], string> = {
  text: 'Text',
  line: 'Linie',
  rect: 'Rechteck',
  circle: 'Kreis',
  ellipse: 'Ellipse',
  polyline: 'Linienzug',
};

function annotationName(a: Annotation): string {
  if (a.kind === 'text') {
    const first = textLines(a)[0]?.trim() ?? '';
    return first ? `Text „${first.length > 24 ? first.slice(0, 23) + '…' : first}“` : 'Text';
  }
  if (a.kind === 'polyline' && a.closed) return 'Vieleck';
  return ANNOTATION_NAMES[a.kind];
}

function componentName(c: ComponentInstance): string {
  return definitionOf(c)?.name ?? c.type;
}

function endpointName(s: DrawingSheet, e: Endpoint): string {
  if ('junctionId' in e) return 'Abzweig';
  const c = s.components.find((x) => x.id === e.componentId);
  if (!c) return '?';
  const port = definitionOf(c)?.ports.find((p) => p.id === e.portId);
  return `${c.label || componentName(c)}:${port ? portName(c, port) : e.portId}`;
}

const SHEET_ORIENTATION = { landscape: 'quer', portrait: 'hoch' } as const;

// --- Panel --------------------------------------------------------------------

export function StructurePanel(props: Props) {
  const [settings, setSettings] = useState(loadSettings);
  const change = (next: Partial<PanelSettings>) => {
    const s = { ...settings, ...next };
    setSettings(s);
    saveSettings(s);
  };

  const startResize = (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !settings.open) return;
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startHeight = settings.height;
    let last = startHeight;
    const move = (ev: globalThis.PointerEvent) => {
      last = clampHeight(startHeight - (ev.clientY - startY));
      setSettings((s) => ({ ...s, height: last }));
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      setSettings((s) => {
        saveSettings(s);
        return s;
      });
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  };

  return (
    <section
      className={settings.open ? 'structure open' : 'structure'}
      style={settings.open ? { height: clampHeight(settings.height) } : undefined}
      aria-label="Struktur und Ebenen"
    >
      {settings.open && (
        <div
          className="structure-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Höhe des Strukturbaums"
          onPointerDown={startResize}
          onDoubleClick={() => change({ height: HEIGHT.default })}
        />
      )}
      <header className="structure-header">
        <div className="structure-tabs" role="tablist">
          {(
            [
              ['tree', ListTree, 'Struktur'],
              ['layers', Layers, 'Ebenen'],
            ] as [Tab, LucideIcon, string][]
          ).map(([tab, Icon, title]) => (
            <button
              key={tab}
              role="tab"
              aria-selected={settings.open && settings.tab === tab}
              onClick={() => change({ tab, open: true })}
            >
              <Icon size={14} aria-hidden />
              {title}
            </button>
          ))}
        </div>
        <IconButton
          icon={settings.open ? ChevronDown : ChevronRight}
          label={settings.open ? 'Struktur ausblenden' : 'Struktur einblenden'}
          tooltip="left"
          onClick={() => change({ open: !settings.open })}
        />
      </header>
      {settings.open && (settings.tab === 'tree' ? <StructureTree {...props} /> : <LayerList {...props} />)}
    </section>
  );
}

// --- Strukturbaum -------------------------------------------------------------

function StructureTree({
  drawing,
  active,
  selection,
  onShowSheet,
  onSelect,
  onOpenProperties,
  onEditSheet,
  onEdit,
}: Props) {
  const layers = layersOf(drawing);
  const activeSheet = drawing.sheets[active]!;
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['doc', `s:${activeSheet.id}`]));
  const toggleNode = (key: string) =>
    setExpanded((e) => {
      const next = new Set(e);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const list = useRef<HTMLDivElement>(null);

  // Angezeigtes Blatt aufklappen; Ausgewähltes sichtbar machen.
  const kinds = (['components', 'connections', 'annotations'] as const).filter((k) => selection[k].length > 0);
  const expandKey = `${activeSheet.id}|${kinds.join(',')}`;
  useEffect(() => {
    setExpanded((e) => {
      const want = ['doc', `s:${activeSheet.id}`, ...kinds.map((k) => `s:${activeSheet.id}:${k}`)];
      if (want.every((k) => e.has(k))) return e;
      return new Set([...e, ...want]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandKey]);
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selection, expanded]);

  const isOpen = (key: string) => expanded.has(key);

  const sheetRows = (s: DrawingSheet, index: number): ReactNode => {
    const key = `s:${s.id}`;
    const shown = index === active;
    const sel = shown ? selection : EMPTY_SELECTION;
    const pick = (selection: Selection, e: React.MouseEvent) => onSelect(index, selection, e.ctrlKey || e.metaKey || e.shiftKey);
    const props = (target: PropertiesTarget) => () => onOpenProperties(index, target);
    const layerHint = (item: { layer?: string }) => {
      const l = layerOf(layers, item);
      return { dim: !l.visible, locked: l.locked, detail: l.id === DEFAULT_LAYER_ID ? undefined : l.name };
    };
    const folder = (kind: string, icon: LucideIcon, title: string, count: number, children: () => ReactNode) => {
      const k = `${key}:${kind}`;
      if (count === 0) return null;
      return (
        <>
          <TreeRow depth={2} icon={icon} label={title} detail={String(count)} open={isOpen(k)} onToggle={() => toggleNode(k)} />
          {isOpen(k) && children()}
        </>
      );
    };
    return (
      <div key={s.id} role="group">
        <TreeRow
          depth={1}
          icon={File}
          label={s.name || `Blatt ${index + 1}`}
          detail={`${s.sheet.format} ${SHEET_ORIENTATION[s.sheet.orientation]}`}
          current={shown}
          open={isOpen(key)}
          onToggle={() => toggleNode(key)}
          onClick={() => onShowSheet(index)}
          onDoubleClick={() => onEditSheet(index)}
        />
        {isOpen(key) && (
          <>
            <TreeRow
              depth={2}
              icon={Frame}
              label="Rahmen und Schriftfeld"
              dim={!s.sheet.frame}
              onClick={() => onShowSheet(index)}
              onDoubleClick={() => onEditSheet(index)}
              actions={
                <RowToggle
                  on={s.sheet.frame}
                  iconOn={Eye}
                  iconOff={EyeOff}
                  label={s.sheet.frame ? 'Rahmen ausblenden' : 'Rahmen einblenden'}
                  onClick={() =>
                    onEdit({
                      ...drawing,
                      sheets: drawing.sheets.map((x, i) => (i === index ? { ...x, sheet: { ...x.sheet, frame: !x.sheet.frame } } : x)),
                    })
                  }
                />
              }
            />
            {folder('components', Shapes, 'Bauteile', s.components.length, () =>
              s.components.map((c) => (
                <TreeRow
                  key={c.id}
                  depth={3}
                  preview={<SymbolPreview component={c} width={22} height={16} unitsPerPixel={4} />}
                  label={c.label ? `${c.label}  ${componentName(c)}` : componentName(c)}
                  title={c.description || undefined}
                  selected={sel.components.includes(c.id)}
                  {...layerHint(c)}
                  onClick={(e) => pick({ ...EMPTY_SELECTION, components: [c.id] }, e)}
                  onDoubleClick={props({ kind: 'component', id: c.id })}
                />
              )),
            )}
            {folder('connections', Spline, 'Leitungen', s.connections.length, () =>
              s.connections.map((l) => (
                <TreeRow
                  key={l.id}
                  depth={3}
                  icon={Spline}
                  label={`${endpointName(s, l.from)} – ${endpointName(s, l.to)}`}
                  selected={sel.connections.includes(l.id)}
                  {...layerHint(l)}
                  onClick={(e) => pick({ ...EMPTY_SELECTION, connections: [l.id] }, e)}
                  onDoubleClick={props({ kind: 'connection', id: l.id })}
                />
              )),
            )}
            {folder('annotations', FileText, 'Text und Grafik', s.annotations.length, () =>
              s.annotations.map((a) => (
                <TreeRow
                  key={a.id}
                  depth={3}
                  icon={FileText}
                  label={annotationName(a)}
                  selected={sel.annotations.includes(a.id)}
                  {...layerHint(a)}
                  onClick={(e) => pick({ ...EMPTY_SELECTION, annotations: [a.id] }, e)}
                  onDoubleClick={props({ kind: 'annotation', id: a.id })}
                />
              )),
            )}
            {folder('groups', GroupIcon, 'Gruppen', s.groups.length, () =>
              s.groups.map((g, i) => {
                const members: Selection = {
                  components: g.components,
                  connections: g.connections,
                  junctions: g.junctions,
                  annotations: g.annotations,
                };
                const n = g.components.length + g.connections.length + g.annotations.length;
                const all = (['components', 'connections', 'annotations'] as const).every((k) =>
                  g[k].every((id) => sel[k].includes(id)),
                );
                return (
                  <TreeRow
                    key={g.id}
                    depth={3}
                    icon={GroupIcon}
                    label={`Gruppe ${i + 1}`}
                    detail={`${n} ${n === 1 ? 'Teil' : 'Teile'}`}
                    selected={shown && !isEmpty(sel) && all}
                    onClick={(e) => pick(members, e)}
                  />
                );
              }),
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="structure-body tree" role="tree" ref={list}>
      <TreeRow
        depth={0}
        icon={Folder}
        label={drawing.meta.title || 'Ohne Titel'}
        open={isOpen('doc')}
        onToggle={() => toggleNode('doc')}
        onDoubleClick={() => onEditSheet(active)}
      />
      {isOpen('doc') && drawing.sheets.map(sheetRows)}
    </div>
  );
}

function TreeRow({
  depth,
  icon: Icon,
  preview,
  label,
  detail,
  title,
  open,
  current = false,
  selected = false,
  dim = false,
  locked = false,
  onToggle,
  onClick,
  onDoubleClick,
  actions,
}: {
  depth: number;
  icon?: LucideIcon;
  /** Statt des Icons, z. B. ein kleines Schaltzeichen. */
  preview?: ReactNode;
  label: string;
  detail?: string;
  title?: string;
  /** Aufgeklappt; fehlt bei Blättern des Baums. */
  open?: boolean;
  /** Angezeigtes Blatt. */
  current?: boolean;
  selected?: boolean;
  /** Ausgeblendet (Ebene oder Rahmen aus). */
  dim?: boolean;
  locked?: boolean;
  onToggle?: () => void;
  onClick?: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  actions?: ReactNode;
}) {
  const className = ['tree-row', current && 'current', dim && 'dim'].filter(Boolean).join(' ');
  return (
    <div
      className={className}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={open}
      title={title}
      style={{ paddingLeft: 4 + depth * 14 }}
      onClick={(e) => (onClick ? onClick(e) : onToggle?.())}
      onDoubleClick={onDoubleClick}
    >
      {open === undefined ? (
        <span className="tree-twisty" />
      ) : (
        <button
          className="tree-twisty"
          aria-label={open ? 'Zuklappen' : 'Aufklappen'}
          onClick={(e) => {
            e.stopPropagation();
            onToggle?.();
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
      )}
      <span className="tree-icon">{preview ?? (Icon && <Icon size={14} aria-hidden />)}</span>
      <span className="tree-label">{label}</span>
      {locked && <Lock className="tree-lock" size={11} aria-label="gesperrt" />}
      {detail && <span className="tree-detail">{detail}</span>}
      {actions}
    </div>
  );
}

function RowToggle({
  on,
  iconOn: On,
  iconOff: Off,
  label,
  onClick,
}: {
  on: boolean;
  iconOn: LucideIcon;
  iconOff: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  const Icon = on ? On : Off;
  return (
    <button
      className={on ? 'row-toggle' : 'row-toggle off'}
      aria-label={label}
      aria-pressed={on}
      data-tooltip={label}
      data-tooltip-pos="left"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <Icon size={14} />
    </button>
  );
}

// --- Ebenen -------------------------------------------------------------------

function LayerList({ drawing, selection, activeLayer, onEdit, onActiveLayer, onAssignLayer }: Props) {
  const layers = layersOf(drawing);
  const counts = layerCounts(drawing);
  const current = layerOf(layers, { layer: activeLayer });
  const index = layers.indexOf(current);
  const [renaming, setRenaming] = useState<string | null>(null);
  const hasSelection = selection.components.length + selection.connections.length + selection.annotations.length > 0;

  const create = () => {
    const r = addLayer(drawing);
    onEdit(r.drawing);
    onActiveLayer(r.layer.id);
    setRenaming(r.layer.id);
  };

  return (
    <>
      <div className="structure-body layers" role="listbox" aria-label="Ebenen">
        {layers.map((l) => (
          <div
            key={l.id}
            className={['tree-row', 'layer-row', !l.visible && 'dim'].filter(Boolean).join(' ')}
            role="option"
            aria-selected={l.id === current.id}
            onClick={() => onActiveLayer(l.id)}
            onDoubleClick={() => setRenaming(l.id)}
            title={l.id === current.id ? 'Aktive Ebene: neue Teile kommen hierhin' : 'Klick macht die Ebene aktiv, Doppelklick benennt sie um'}
          >
            <span className="tree-icon">{l.id === current.id && <Pencil size={13} aria-label="aktiv" />}</span>
            {renaming === l.id ? (
              <LayerNameInput
                layer={l}
                onDone={(name) => {
                  setRenaming(null);
                  if (name !== null && name.trim()) onEdit(updateLayer(drawing, l.id, { name: name.trim() }));
                }}
              />
            ) : (
              <span className="tree-label">{l.name}</span>
            )}
            <span className="tree-detail">{counts.get(l.id) ?? 0}</span>
            <RowToggle
              on={l.visible}
              iconOn={Eye}
              iconOff={EyeOff}
              label={l.visible ? 'Ebene ausblenden' : 'Ebene einblenden'}
              onClick={() => onEdit(updateLayer(drawing, l.id, { visible: !l.visible }))}
            />
            <RowToggle
              on={!l.locked}
              iconOn={LockOpen}
              iconOff={Lock}
              label={l.locked ? 'Ebene entsperren' : 'Ebene sperren'}
              onClick={() => onEdit(updateLayer(drawing, l.id, { locked: !l.locked }))}
            />
          </div>
        ))}
      </div>
      <footer className="structure-footer">
        <IconButton icon={Plus} label="Neue Ebene" tooltip="above" onClick={create} />
        <IconButton
          icon={ArrowDownToLine}
          label={`Auswahl auf Ebene „${current.name}“ legen`}
          tooltip="above"
          disabled={!hasSelection}
          onClick={() => onAssignLayer(current.id)}
        />
        <IconButton
          icon={ArrowUp}
          label="Ebene nach oben"
          tooltip="above"
          disabled={index <= 0}
          onClick={() => onEdit(moveLayer(drawing, current.id, index - 1))}
        />
        <IconButton
          icon={ArrowDown}
          label="Ebene nach unten"
          tooltip="above"
          disabled={index >= layers.length - 1}
          onClick={() => onEdit(moveLayer(drawing, current.id, index + 1))}
        />
        <IconButton
          icon={Trash2}
          label={
            current.id === DEFAULT_LAYER_ID
              ? 'Die Standardebene bleibt immer'
              : `Ebene „${current.name}“ löschen (ihre Teile kommen auf die Standardebene)`
          }
          tooltip="above"
          disabled={current.id === DEFAULT_LAYER_ID}
          onClick={() => {
            onEdit(deleteLayer(drawing, current.id));
            onActiveLayer(DEFAULT_LAYER_ID);
          }}
        />
      </footer>
    </>
  );
}

function LayerNameInput({ layer, onDone }: { layer: Layer; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(layer.name);
  // Enter bzw. Esc nehmen das Feld weg; das folgende blur soll nichts mehr ändern.
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      className="tree-rename"
      aria-label="Name der Ebene"
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(value)}
    />
  );
}
