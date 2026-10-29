import { ArrowLeft, ArrowRight, Copy, EllipsisVertical, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DrawingSheet } from '../model/types.ts';
import { IconButton } from './IconButton.tsx';

export type SheetAction = 'rename' | 'duplicate' | 'left' | 'right' | 'delete';

/**
 * Blattreiter unter der Zeichenfläche. Klick wechselt das Blatt, Doppelklick
 * benennt um, Ziehen ändert die Reihenfolge. Rechtsklick oder ⋮ öffnet das
 * Menü mit den übrigen Befehlen.
 */
export function SheetTabs({
  sheets,
  active,
  onSelect,
  onAdd,
  onRename,
  onMove,
  onAction,
}: {
  sheets: DrawingSheet[];
  active: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number, name: string) => void;
  onMove: (from: number, to: number) => void;
  onAction: (index: number, action: Exclude<SheetAction, 'rename'>) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ index: number; x: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  // Menü schließen bei Klick daneben oder Esc.
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && (e.target as HTMLElement).closest('.sheet-menu')) return;
      setMenu(null);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [menu]);

  const openMenu = (index: number, clientX: number) => {
    const left = bar.current?.getBoundingClientRect().left ?? 0;
    setMenu({ index, x: clientX - left });
  };

  const run = (action: SheetAction) => {
    if (!menu) return;
    setMenu(null);
    if (action === 'rename') {
      onSelect(menu.index);
      setEditing(menu.index);
    } else onAction(menu.index, action);
  };

  const items: [SheetAction, LucideIcon, string, boolean][] = menu
    ? [
        ['rename', Pencil, 'Umbenennen', true],
        ['duplicate', Copy, 'Duplizieren', true],
        ['left', ArrowLeft, 'Nach links', menu.index > 0],
        ['right', ArrowRight, 'Nach rechts', menu.index < sheets.length - 1],
        ['delete', Trash2, 'Löschen', sheets.length > 1],
      ]
    : [];

  return (
    <div className="sheet-bar" ref={bar}>
      <div className="sheet-tabs" role="tablist" aria-label="Blätter">
        {sheets.map((s, i) =>
          editing === i ? (
            <input
              key={s.id}
              className="sheet-tab editing"
              aria-label="Blattbenennung"
              defaultValue={s.name}
              autoFocus
              onFocus={(e) => e.currentTarget.select()}
              onBlur={(e) => {
                onRename(i, e.currentTarget.value.trim() || s.name);
                setEditing(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  e.currentTarget.value = s.name;
                  e.currentTarget.blur();
                }
              }}
            />
          ) : (
            <button
              key={s.id}
              role="tab"
              aria-selected={i === active}
              className={[
                'sheet-tab',
                dragging === i ? 'dragging' : '',
                dropAt === i && dragging !== null && dragging !== i
                  ? dragging < i
                    ? 'drop-after'
                    : 'drop-before'
                  : '',
              ].join(' ')}
              data-tooltip={`Blatt ${i + 1}: Doppelklick benennt um, Ziehen verschiebt, Rechtsklick für mehr`}
              data-tooltip-pos="above"
              draggable
              onClick={() => onSelect(i)}
              onDoubleClick={() => setEditing(i)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSelect(i);
                openMenu(i, e.clientX);
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/x-fluidplan-sheet', String(i));
                setDragging(i);
              }}
              onDragOver={(e) => {
                if (dragging === null) return;
                e.preventDefault();
                setDropAt(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging !== null) onMove(dragging, i);
              }}
              onDragEnd={() => {
                setDragging(null);
                setDropAt(null);
              }}
            >
              {s.name || `Blatt ${i + 1}`}
            </button>
          ),
        )}
        <IconButton icon={Plus} label="Blatt hinzufügen" tooltip="above" onClick={onAdd} />
        <IconButton
          icon={EllipsisVertical}
          label="Blatt umbenennen, duplizieren, verschieben oder löschen"
          tooltip="above"
          onClick={(e) => (menu ? setMenu(null) : openMenu(active, e.clientX))}
          onPointerDown={(e) => e.stopPropagation()}
        />
      </div>
      {menu && (
        <div className="sheet-menu" role="menu" style={{ left: menu.x }}>
          {items.map(([action, Icon, label, enabled]) => (
            <button key={action} role="menuitem" disabled={!enabled} onClick={() => run(action)}>
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
