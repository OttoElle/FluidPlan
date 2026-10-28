import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';

/**
 * Schaltfläche nur mit Symbol. Beschriftung und Tastenkürzel erscheinen als
 * Tooltip (und für Screenreader als aria-label).
 */
export function IconButton({
  icon: Icon,
  label,
  shortcut,
  tooltip = 'below',
  className,
  ...rest
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  /** Lage des Tooltips; am rechten Rand 'left', damit er nicht abgeschnitten wird. */
  tooltip?: 'below' | 'above' | 'left';
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label'>) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      {...rest}
      className={`icon-button${className ? ' ' + className : ''}`}
      aria-label={tip}
      data-tooltip={tip}
      data-tooltip-pos={tooltip}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden />
    </button>
  );
}
