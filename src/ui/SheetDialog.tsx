import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TitleField } from '../model/sheet.ts';
import type { Diagram, DiagramMeta, Sheet } from '../model/types.ts';
import { SheetFields } from './SheetSettings.tsx';

/** Bearbeitbare Felder des Schriftfelds; Datum und Format füllt das Programm. */
const TITLE_FIELDS: [Exclude<TitleField, 'date' | 'format' | 'sheet'>, string][] = [
  ['title', 'Titel'],
  ['drawingNumber', 'Zeichnungsnummer'],
  ['organization', 'Firma / Abteilung'],
  ['author', 'Erstellt von'],
  ['checkedBy', 'Geprüft von'],
  ['approvedBy', 'Freigegeben von'],
  ['documentType', 'Dokumentart'],
  ['revision', 'Änderungsstand'],
];

/**
 * Fenster „Blatt und Schriftfeld“. Format und Benennung gelten für das
 * aktuelle Blatt, die Schriftfeld-Angaben für alle Blätter der Zeichnung.
 * `focus` springt zu einem Feld, z. B. nach einem Klick ins Schriftfeld.
 */
export function SheetDialog({
  open,
  diagram,
  focus,
  onApply,
  onClose,
}: {
  open: boolean;
  diagram: Diagram;
  focus?: TitleField;
  onApply: (sheet: Sheet, meta: DiagramMeta, name: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [sheet, setSheet] = useState(diagram.sheet);
  const [meta, setMeta] = useState(diagram.meta);
  const [name, setName] = useState(diagram.page?.name ?? '');
  const count = diagram.page?.count ?? 1;

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) {
      setSheet(diagram.sheet);
      setMeta(diagram.meta);
      setName(diagram.page?.name ?? '');
      dialog.showModal();
      requestAnimationFrame(() => {
        const el = dialog.querySelector<HTMLInputElement>(`#sheet-${focus ?? 'title'}`);
        el?.focus();
        el?.select();
      });
    }
    if (!open && dialog.open) dialog.close();
    // Nur beim Öffnen übernehmen, damit Eingaben nicht überschrieben werden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(sheet, meta, name);
    onClose();
  };

  return (
    <dialog ref={ref} className="sheet-dialog" onClose={onClose}>
      <form method="dialog" onSubmit={submit}>
        <h2>Blatt und Schriftfeld</h2>
        <div className="columns">
          <fieldset className="column">
            <legend>{count > 1 ? `Blatt ${diagram.page!.number} von ${count}` : 'Blatt'}</legend>
            <label>
              Blattbenennung
              <input id="sheet-sheet" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <SheetFields sheet={sheet} onChange={setSheet} />
          </fieldset>
          <fieldset className="column">
            <legend>{count > 1 ? 'Schriftfeld (für alle Blätter)' : 'Schriftfeld'}</legend>
            {TITLE_FIELDS.map(([field, caption]) => (
              <label key={field}>
                {caption}
                <input id={`sheet-${field}`} value={meta[field]} onChange={(e) => setMeta({ ...meta, [field]: e.target.value })} />
              </label>
            ))}
          </fieldset>
        </div>
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit" className="primary">
            OK
          </button>
        </div>
      </form>
    </dialog>
  );
}
