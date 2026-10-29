import type { ReactNode } from 'react';

export interface SegmentOption<T> {
  value: T;
  /** Tooltip und Screenreader-Text. */
  label: string;
  /** Symbol oder kurzer Text auf der Schaltfläche; ohne Angabe wird `label` angezeigt. */
  icon?: ReactNode;
}

/**
 * Auswahl aus wenigen Möglichkeiten als Reihe von Schaltflächen mit Symbol
 * (statt Dropdown mit Text). `value` darf fehlen, z. B. bei gemischter Auswahl.
 */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  tooltip = 'below',
}: {
  options: readonly SegmentOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Name der ganzen Gruppe für Screenreader. */
  label: string;
  tooltip?: 'below' | 'above' | 'left';
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.icon ? 'segment' : 'segment text'}
          aria-pressed={o.value === value}
          aria-label={o.label}
          data-tooltip={o.label}
          data-tooltip-pos={tooltip}
          onClick={() => onChange(o.value)}
        >
          {o.icon ?? o.label}
        </button>
      ))}
    </div>
  );
}

/** Kleines Symbol einer Linie mit Strichmuster, z. B. für Linienarten. */
export function StrokeIcon({ dash, width = 28 }: { dash?: string; width?: number }) {
  return (
    <svg className="stroke-icon" width={width} height={16} viewBox={`0 0 ${width} 16`} aria-hidden>
      <line x1={2} y1={8} x2={width - 2} y2={8} strokeDasharray={dash} />
    </svg>
  );
}
