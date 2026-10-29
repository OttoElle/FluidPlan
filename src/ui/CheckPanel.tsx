import { X } from 'lucide-react';
import type { Issue } from '../model/check.ts';
import { IconButton } from './IconButton.tsx';

/**
 * Ergebnis von „Zeichnung prüfen“. Die Liste aktualisiert sich beim
 * Bearbeiten; ein Klick auf eine Meldung wählt das betroffene Teil aus.
 */
export function CheckPanel({
  issues,
  sheetLabel,
  onPick,
  onClose,
}: {
  issues: Issue[];
  /** Blattangabe für Meldungen, die nicht das angezeigte Blatt betreffen. */
  sheetLabel?: (sheet: number) => string | undefined;
  onPick: (issue: Issue) => void;
  onClose: () => void;
}) {
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warnings = issues.length - errors;
  return (
    <section className="check-panel" aria-label="Zeichnung prüfen">
      <header>
        <strong>Zeichnung prüfen</strong>
        <span className="summary">
          {issues.length === 0 ? 'Keine Auffälligkeiten' : `${errors} Fehler, ${warnings} ${warnings === 1 ? 'Hinweis' : 'Hinweise'}`}
        </span>
        <IconButton icon={X} label="Schließen" onClick={onClose} />
      </header>
      {issues.length > 0 && (
        <ul>
          {issues.map((issue, i) => (
            <li key={i}>
              <button className={issue.severity} onClick={() => onPick(issue)}>
                <span className="badge">{issue.severity === 'error' ? 'Fehler' : 'Hinweis'}</span>
                <span>
                  {issue.sheet !== undefined && sheetLabel?.(issue.sheet) && (
                    <span className="sheet-ref">{sheetLabel(issue.sheet)}: </span>
                  )}
                  {issue.message}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
