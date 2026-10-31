import { useEffect, useRef, useState } from 'react';
import { ANNOTATION_COLORS } from '../model/annotations.ts';

/**
 * Farbwahl für freie Grafik und Text: Knopf mit der aktuellen Farbe, darunter
 * eine kleine Auswahl vorgeschlagener Farben und eine eigene Farbe.
 * `value`: `undefined` = Zeichenfarbe, `'mixed'` = Auswahl hat verschiedene Farben.
 * `onChange(null)` setzt auf die Zeichenfarbe zurück.
 */
export function ColorPicker({
  value,
  onChange,
  inline = false,
}: {
  value: string | undefined | 'mixed';
  onChange: (color: string | null) => void;
  /** Farben gleich zeigen statt erst nach Klick (z. B. im Eigenschaftsfenster). */
  inline?: boolean;
}) {
  const [opened, setOpen] = useState(false);
  const open = inline || opened;
  const ref = useRef<HTMLDivElement>(null);
  const custom = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  latest.current = onChange;

  // Eigene Farbe erst übernehmen, wenn sie gewählt ist ("change"), nicht bei
  // jedem Zwischenschritt ("input"), sonst landet jeder davon im Rückgängig-Verlauf.
  useEffect(() => {
    const input = custom.current;
    if (!open || !input) return;
    const apply = () => latest.current(input.value);
    input.addEventListener('change', apply);
    return () => input.removeEventListener('change', apply);
  }, [open]);

  useEffect(() => {
    if (!opened || inline) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [opened, inline]);

  const name =
    value === 'mixed'
      ? 'verschiedene Farben'
      : (ANNOTATION_COLORS.find((c) => c.color === value)?.name ?? value ?? 'Zeichenfarbe');
  const pick = (color: string | undefined) => {
    onChange(color ?? null);
    setOpen(false);
  };
  return (
    <div className={`color-picker${inline ? ' inline' : ''}`} ref={ref}>
      {!inline && (
      <button
        type="button"
        className="icon-button color-button"
        aria-label={`Farbe: ${name}`}
        data-tooltip={`Farbe: ${name}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className={`swatch${value === undefined ? ' default' : ''}${value === 'mixed' ? ' mixed' : ''}`} style={value && value !== 'mixed' ? { background: value } : undefined} />
      </button>
      )}
      {open && (
        <div className="color-menu" role="menu">
          <div className="color-grid">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c.color ?? 'default'}
                type="button"
                role="menuitemradio"
                aria-checked={value === c.color}
                aria-label={c.name}
                data-tooltip={c.name}
                className="color-choice"
                onClick={() => pick(c.color)}
              >
                <span className={`swatch${c.color ? '' : ' default'}`} style={c.color ? { background: c.color } : undefined} />
              </button>
            ))}
          </div>
          <label className="color-custom">
            <input ref={custom} type="color" defaultValue={value && value !== 'mixed' ? value : '#000000'} />
            Eigene Farbe …
          </label>
        </div>
      )}
    </div>
  );
}
