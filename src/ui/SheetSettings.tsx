import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SHEET, SHEET_FORMATS } from '../model/sheet.ts';
import type { Domain, Orientation, Sheet, SheetFormat } from '../model/types.ts';

export const DOMAIN_NAMES: Record<Domain, string> = { hydraulic: 'Hydraulik', pneumatic: 'Pneumatik' };
const ORIENTATION_NAMES: Record<Orientation, string> = { landscape: 'Querformat', portrait: 'Hochformat' };
const FORMATS = Object.keys(SHEET_FORMATS) as SheetFormat[];

/** Eingabefelder für Blattformat, Ausrichtung und Rahmen. */
export function SheetFields({ sheet, onChange }: { sheet: Sheet; onChange: (sheet: Sheet) => void }) {
  return (
    <>
      <label>
        Format
        <select value={sheet.format} onChange={(e) => onChange({ ...sheet, format: e.target.value as SheetFormat })}>
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {f} ({SHEET_FORMATS[f].height} × {SHEET_FORMATS[f].width} mm)
            </option>
          ))}
        </select>
      </label>
      <label>
        Ausrichtung
        <select
          value={sheet.orientation}
          onChange={(e) => onChange({ ...sheet, orientation: e.target.value as Orientation })}
        >
          {(Object.keys(ORIENTATION_NAMES) as Orientation[]).map((o) => (
            <option key={o} value={o}>
              {ORIENTATION_NAMES[o]}
            </option>
          ))}
        </select>
      </label>
      <label className="check">
        <input type="checkbox" checked={sheet.frame} onChange={(e) => onChange({ ...sheet, frame: e.target.checked })} />
        Rahmen und Schriftfeld
      </label>
    </>
  );
}

export interface NewDocument {
  domain: Domain;
  title: string;
  sheet: Sheet;
}

/** Dialog „Neuer Schaltplan“: Medium, Titel und Blatt festlegen. */
export function NewDocumentDialog({
  open,
  onCreate,
  onClose,
}: {
  open: boolean;
  onCreate: (doc: NewDocument) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [doc, setDoc] = useState<NewDocument>({ domain: 'hydraulic', title: 'Neuer Schaltplan', sheet: DEFAULT_SHEET });

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose}>
      <form method="dialog" onSubmit={() => onCreate(doc)}>
        <h2>Neuer Schaltplan</h2>
        <fieldset>
          <legend>Medium</legend>
          {(Object.keys(DOMAIN_NAMES) as Domain[]).map((d) => (
            <label key={d} className="check">
              <input
                type="radio"
                name="domain"
                checked={doc.domain === d}
                onChange={() => setDoc({ ...doc, domain: d })}
              />
              {DOMAIN_NAMES[d]}
            </label>
          ))}
        </fieldset>
        <label>
          Titel
          <input value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} />
        </label>
        <SheetFields sheet={doc.sheet} onChange={(sheet) => setDoc({ ...doc, sheet })} />
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit">Anlegen</button>
        </div>
      </form>
    </dialog>
  );
}
