import { useState } from 'react';

/**
 * Ansichtseinstellungen, die der Browser sich merkt (nicht Teil der Datei).
 * Fangen und Lineale sind immer an; Alt beim Zeichnen schaltet das Fangen kurz ab.
 */
export interface ViewSettings {
  grid: boolean;
  /** Anschlussbezeichnungen (P, T, A, B, 1, 2, …) zeigen. */
  portLabels: boolean;
  /** Kennzeichen, Bezeichnung und technische Daten an den Bauteilen zeigen. */
  componentLabels: boolean;
}
const VIEW_SETTINGS_KEY = 'fluidplan.view';
const DEFAULT_VIEW_SETTINGS: ViewSettings = { grid: true, portLabels: true, componentLabels: true };

export function loadViewSettings(): ViewSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY) ?? 'null');
    if (raw && typeof raw === 'object') {
      const flag = (key: keyof ViewSettings) => (typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_VIEW_SETTINGS[key]);
      return { grid: flag('grid'), portLabels: flag('portLabels'), componentLabels: flag('componentLabels') };
    }
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
