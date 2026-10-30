import { ArrowLeft, ArrowRight, Copy, EllipsisVertical, Pencil, Plus, Trash2, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from './IconButton.tsx';

export type SheetAction = 'rename' | 'duplicate' | 'left' | 'right' | 'delete';

/** Lage eines Blatts auf dem Bildschirm, in Pixeln relativ zur Zeichenfläche. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Höhe der Blattbeschriftung über dem Blatt. */
export const LABEL_HEIGHT = 26;
const ADD_BUTTON = 36;

/**
 * Blattnamen über den Blättern auf der Zeichenfläche und „+“ rechts neben dem
 * letzten Blatt. Klick wählt das Blatt, Doppelklick benennt um, Rechtsklick
 * oder ⋮ öffnet das Menü mit den übrigen Befehlen.
 */
export function SheetLabels({
  names,
  rects,
  active,
  onSelect,
  onAdd,
  onRename,
  onAction,
}: {
  names: string[];
  rects: ScreenRect[];
  active: number;
  onSelect: (index: number) => void;
  onAdd: () => void;
  onRename: (index: number, name: string) => void;
  onAction: (index: number, action: Exclude<SheetAction, 'rename'>) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const [menu, setMenu] = useState<number | null>(null);

  // Menü schließen bei Klick daneben oder Esc.
  useEffect(() => {
    if (menu === null) return;
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

  const run = (action: SheetAction) => {
    if (menu === null) return;
    setMenu(null);
    if (action === 'rename') {
      onSelect(menu);
      setEditing(menu);
    } else onAction(menu, action);
  };

  const items: [SheetAction, LucideIcon, string, boolean][] =
    menu !== null
      ? [
          ['rename', Pencil, 'Umbenennen', true],
          ['duplicate', Copy, 'Duplizieren', true],
          ['left', ArrowLeft, 'Nach links', menu > 0],
          ['right', ArrowRight, 'Nach rechts', menu < names.length - 1],
          ['delete', Trash2, 'Löschen', names.length > 1],
        ]
      : [];

  const last = rects.at(-1);
  const menuRect = menu !== null ? rects[menu] : undefined;

  return (
    <div className="sheet-labels">
      {rects.map((r, i) => {
        const name = names[i] || `Blatt ${i + 1}`;
        return (
          <div
            key={i}
            className={i === active ? 'sheet-label active' : 'sheet-label'}
            style={{ left: r.left, top: r.top - LABEL_HEIGHT, maxWidth: Math.max(r.width, 120) }}
          >
            {editing === i ? (
              <input
                aria-label="Blattbenennung"
                defaultValue={names[i]}
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                onBlur={(e) => {
                  onRename(i, e.currentTarget.value.trim() || names[i]!);
                  setEditing(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                  if (e.key === 'Escape') {
                    e.currentTarget.value = names[i]!;
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <button
                className="sheet-name"
                data-tooltip={`Blatt ${i + 1} von ${names.length}: Doppelklick benennt um, Rechtsklick für mehr`}
                data-tooltip-pos="above"
                onClick={() => onSelect(i)}
                onDoubleClick={() => setEditing(i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSelect(i);
                  setMenu(i);
                }}
              >
                <span className="number">{i + 1}</span>
                {name}
              </button>
            )}
            <IconButton
              icon={EllipsisVertical}
              label="Blatt umbenennen, duplizieren, verschieben oder löschen"
              tooltip="above"
              onClick={() => setMenu(menu === i ? null : i)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          </div>
        );
      })}
      {last && (
        <IconButton
          icon={Plus}
          className="add-sheet"
          label="Blatt hinzufügen"
          tooltip="above"
          style={{
            left: last.left + last.width + 24,
            top: last.top + last.height / 2 - ADD_BUTTON / 2,
          }}
          onClick={onAdd}
        />
      )}
      {menuRect && (
        <div className="sheet-menu" role="menu" style={{ left: menuRect.left, top: menuRect.top + 4 }}>
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
