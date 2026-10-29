import { useEffect, useRef } from 'react';

const MOUSE: [string, string][] = [
  ['Klick', 'Auswählen'],
  ['Doppelklick', 'Eigenschaften öffnen'],
  ['Ziehen', 'Verschieben; auf freier Fläche: Auswahlrahmen'],
  ['Umschalt+Klick', 'Zur Auswahl hinzufügen oder entfernen'],
  ['Anschluss ziehen', 'Leitung zeichnen; auf einer Leitung loslassen ergibt einen Abzweig'],
  ['Anschluss klicken', 'Leitung mit Knickpunkten: Fläche anklicken, Ziel anklicken'],
  ['Symbol aus der Liste ziehen', 'Bauteil an dieser Stelle einfügen'],
  ['Mausrad', 'Zoomen'],
  ['Mittlere Taste / Leertaste+Ziehen', 'Ansicht verschieben'],
];

const KEYS: [string, string][] = [
  ['Enter', 'Eigenschaften der Auswahl'],
  ['R', 'Drehen'],
  ['Entf', 'Löschen'],
  ['Esc', 'Abbrechen / Auswahl aufheben'],
  ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen'],
  ['Strg+A', 'Alles auswählen'],
  ['Strg+S / Strg+O / Strg+E', 'Speichern / Öffnen / Exportieren'],
];

/** Übersicht der Maus- und Tastenbedienung. */
export function HelpDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const table = (rows: [string, string][]) => (
    <dl className="help-table">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <dialog ref={ref} className="help" onClose={onClose}>
      <form method="dialog">
        <h2>Bedienung</h2>
        <h3>Maus</h3>
        {table(MOUSE)}
        <h3>Tastatur</h3>
        {table(KEYS)}
        <div className="dialog-buttons">
          <button type="submit" className="primary">
            Schließen
          </button>
        </div>
      </form>
    </dialog>
  );
}
