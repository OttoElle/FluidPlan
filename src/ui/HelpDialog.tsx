import { useEffect, useRef } from 'react';

const MOUSE: [string, string][] = [
  ['Klick', 'Auswählen'],
  ['Doppelklick', 'Eigenschaften öffnen'],
  ['Ziehen', 'Verschieben; auf freier Fläche: Auswahlrahmen'],
  ['Umschalt+Klick', 'Zur Auswahl hinzufügen oder entfernen'],
  ['Anschluss ziehen', 'Leitung zeichnen; auf einer Leitung loslassen ergibt einen Abzweig'],
  ['Anschluss klicken', 'Leitung mit Knickpunkten: Fläche anklicken, Ziel anklicken'],
  ['Symbol aus der Liste ziehen', 'Bauteil an dieser Stelle einfügen'],
  ['Kennzeichen oder Anschlussname ziehen', 'Beschriftung verschieben, rastet im halben Raster; Alt = frei, Doppelklick = zurück'],
  ['Mausrad', 'Zoomen'],
  ['Mittlere Taste / Leertaste+Ziehen', 'Ansicht verschieben'],
  ['Kreisbogen-Werkzeug', 'Mittelpunkt, Anfang und Ende anklicken; wie die Maus um den Mittelpunkt läuft, so dreht der Bogen (Rücktaste: Schritt zurück, Rechtsklick/Esc: abbrechen)'],
  ['Linienzug-Werkzeug', 'Punkte anklicken; Doppelklick oder Rechtsklick beendet, Klick auf den ersten Punkt schließt'],
  ['Rechtsklick auf die Zeichenfläche', 'Menü mit Kopieren, Einfügen an dieser Stelle, Duplizieren, Drehen, Spiegeln, Gruppieren und Eigenschaften'],
  ['Alt beim Zeichnen', 'Text und Grafik frei setzen, ohne Fangen an Raster, Anschluss und Endpunkt'],
  ['Leiste unten links', 'Raster ein/aus'],
  ['Anderes Blatt anklicken', 'Blatt bearbeiten; die Lineale messen ab seiner linken oberen Ecke'],
  ['Blattname über dem Blatt', 'Doppelklick benennt um, Rechtsklick oder ⋮ für Duplizieren, Verschieben und Löschen'],
  ['+ rechts neben dem letzten Blatt', 'Neues Blatt anfügen'],
  ['Struktur (unten links)', 'Klick wählt das Teil aus, Doppelklick öffnet Eigenschaften; Strg+Klick ergänzt die Auswahl'],
  ['Ebenen (unten links)', 'Klick macht eine Ebene aktiv (neue Teile kommen dorthin), Auge blendet aus, Schloss sperrt'],
];

const KEYS: [string, string][] = [
  ['Enter', 'Eigenschaften der Auswahl'],
  ['R', 'Drehen'],
  ['Entf', 'Löschen'],
  ['Esc', 'Abbrechen / Auswahl aufheben'],
  ['Strg+Z / Strg+Y', 'Rückgängig / Wiederholen'],
  ['Strg+A', 'Alles auswählen'],
  ['Strg+C / Strg+X / Strg+V', 'Kopieren / Ausschneiden / Einfügen (Leitungen zwischen kopierten Bauteilen kommen mit)'],
  ['Strg+D', 'Duplizieren'],
  ['Strg+G / Strg+Umschalt+G', 'Gruppieren / Gruppierung aufheben'],
  ['Enter / Rücktaste', 'Linienzug beenden / letzten Punkt zurücknehmen'],
  ['Strg+S / Strg+O / Strg+E', 'Speichern / Öffnen / Exportieren'],
  ['Strg+Bild auf / Strg+Bild ab', 'Voriges / nächstes Blatt'],
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
