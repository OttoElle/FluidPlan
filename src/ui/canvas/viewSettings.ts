import { useState } from 'react';

/**
 * Ansichtseinstellungen, die der Browser sich merkt (nicht Teil der Datei).
 * Fangen und Lineale sind immer an; Alt beim Zeichnen schaltet das Fangen kurz ab.
 */
interface ViewSettings {
  grid: boolean;
}
const VIEW_SETTINGS_KEY = 'fluidplan.view';
const DEFAULT_VIEW_SETTINGS: ViewSettings = { grid: true };

function loadViewSettings(): ViewSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY) ?? 'null');
    if (raw && typeof raw === 'object' && typeof raw.grid === 'boolean') return { grid: raw.grid };
  } catch {
    // Kein Speicher (z. B. privates Fenster): Standard verwenden.
  }
  return DEFAULT_VIEW_SETTINGS;
}

/** Ansichtseinstellungen samt Setter, der sie im Browser merkt. */
export function useViewSettings(): [ViewSettings, (next: ViewSettings) => void] {
  const [settings, setSettings] = useState<ViewSettings>(loadViewSettings);
  const changeSettings = (next: ViewSettings) => {
    setSettings(next);
    try {
      localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Nicht speicherbar: gilt dann nur für diese Sitzung.
    }
  };
  return [settings, changeSettings];
}
