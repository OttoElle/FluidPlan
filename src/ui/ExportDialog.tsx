import { useEffect, useRef, useState } from 'react';
import { DEFAULT_EXPORT_OPTIONS, paperSizeMm, type ExportFormat, type ExportOptions } from '../io/export.ts';
import type { Diagram } from '../model/types.ts';
import { loadViewSettings } from './canvas/viewSettings.ts';

const FORMAT_NAMES: Record<ExportFormat, string> = {
  pdf: 'PDF (Vektor, zum Drucken)',
  svg: 'SVG (Vektor, zum Weiterbearbeiten)',
  png: 'PNG (Bild)',
};
const DPI_CHOICES = [150, 300, 600];

/** Dialog „Exportieren“: Format und Optionen wählen. */
export function ExportDialog({
  open,
  diagram,
  sheetCount,
  onExport,
  onClose,
}: {
  open: boolean;
  /** Das angezeigte Blatt. */
  diagram: Diagram;
  sheetCount: number;
  onExport: (format: ExportFormat, options: ExportOptions) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<ExportFormat>('pdf');
  const [options, setOptions] = useState<ExportOptions>(DEFAULT_EXPORT_OPTIONS);

  useEffect(() => {
    const dialog = ref.current!;
    if (open && !dialog.open) {
      // Ausgegeben wird, was gerade zu sehen ist; im Dialog lässt sich das ändern.
      const view = loadViewSettings();
      setOptions((o) => ({ ...o, portLabels: view.portLabels, componentLabels: view.componentLabels }));
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const mm = paperSizeMm(diagram);
  const px = (v: number) => Math.round((v / 25.4) * options.dpi);

  return (
    <dialog ref={ref} onClose={onClose}>
      <form method="dialog" onSubmit={() => onExport(format, options)}>
        <h2>Exportieren</h2>
        <fieldset className="column">
          <legend>Format</legend>
          {(Object.keys(FORMAT_NAMES) as ExportFormat[]).map((f) => (
            <label key={f} className="check">
              <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} />
              {FORMAT_NAMES[f]}
            </label>
          ))}
        </fieldset>
        {sheetCount > 1 && (
          <fieldset className="column">
            <legend>Blätter</legend>
            <label className="check">
              <input
                type="radio"
                name="sheets"
                checked={options.sheets === 'all'}
                onChange={() => setOptions({ ...options, sheets: 'all' })}
              />
              Alle {sheetCount} Blätter{format === 'pdf' ? ' (eine Seite je Blatt)' : ' (eine Datei je Blatt)'}
            </label>
            <label className="check">
              <input
                type="radio"
                name="sheets"
                checked={options.sheets === 'current'}
                onChange={() => setOptions({ ...options, sheets: 'current' })}
              />
              Nur dieses Blatt ({diagram.page?.name || `Blatt ${diagram.page?.number ?? 1}`})
            </label>
          </fieldset>
        )}
        {format === 'png' && (
          <label>
            Auflösung
            <select value={options.dpi} onChange={(e) => setOptions({ ...options, dpi: Number(e.target.value) })}>
              {DPI_CHOICES.map((dpi) => (
                <option key={dpi} value={dpi}>
                  {dpi} dpi ({px(mm.width)} × {px(mm.height)} Pixel)
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={options.portLabels}
            onChange={(e) => setOptions({ ...options, portLabels: e.target.checked })}
          />
          Anschlussbezeichnungen ausgeben
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={options.componentLabels}
            onChange={(e) => setOptions({ ...options, componentLabels: e.target.checked })}
          />
          Bauteilkennzeichen und Bezeichnungen ausgeben
        </label>
        <p className="hint">
          Blatt {diagram.sheet.format}, {mm.width} × {mm.height} mm. PDF und SVG haben die echte Papiergröße und lassen
          sich mit 100 % drucken.
        </p>
        <div className="dialog-buttons">
          <button type="button" onClick={onClose}>
            Abbrechen
          </button>
          <button type="submit">Exportieren</button>
        </div>
      </form>
    </dialog>
  );
}
