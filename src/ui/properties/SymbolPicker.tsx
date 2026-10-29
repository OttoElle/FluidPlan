import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface PickerOption<T> {
  value: T;
  label: string;
  icon: ReactNode;
}

/**
 * Auswahlfeld mit Symbol (wie ein Dropdown, aber mit Schaltzeichen statt
 * Text): zeigt die aktuelle Wahl, ein Klick öffnet ein Raster mit allen
 * Möglichkeiten. Der Name steht im Tooltip.
 */
export function SymbolPicker<T extends string | number>({
  options,
  value,
  onChange,
  label,
  empty = 'Keine',
}: {
  options: readonly PickerOption<T>[];
  /** undefined = nichts gewählt (z. B. keine Betätigung). */
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  label: string;
  /** Text für „nichts gewählt“; null, wenn es diese Wahl nicht gibt. */
  empty?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const current = options.find((o) => o.value === value);
  const pick = (v: T | undefined) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <div
      className="symbol-picker"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          // Nur das Auswahlfeld schließen, nicht das ganze Fenster.
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current?.label ?? empty ?? ''}`}
        data-tooltip={current?.label ?? empty ?? undefined}
        onClick={() => setOpen(!open)}
      >
        <span className="picker-icon">{current?.icon ?? <span className="picker-empty">{empty}</span>}</span>
        <ChevronDown size={14} aria-hidden />
      </button>
      {open && (
        <div className="picker-list" role="listbox" aria-label={label}>
          {empty !== null && (
            <button type="button" role="option" aria-selected={value === undefined} className="picker-option" onClick={() => pick(undefined)}>
              <span className="picker-icon picker-empty">–</span>
              <span className="picker-caption">{empty}</span>
            </button>
          )}
          {options.map((o) => (
            <button
              key={String(o.value)}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className="picker-option"
              data-tooltip={o.label}
              aria-label={o.label}
              onClick={() => pick(o.value)}
            >
              {o.icon}
              <span className="picker-caption">{o.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
