import { useEffect, useState } from 'react';

/**
 * Gedrückte Leertaste (Ziehen verschiebt die Ansicht) und Alt (freie Grafik
 * ohne Fangen). Verliert das Fenster den Fokus, gelten beide als losgelassen.
 */
export function useModifierKeys() {
  const [spaceDown, setSpaceDown] = useState(false);
  const [altDown, setAltDown] = useState(false);

  // Leertaste gedrückt halten: Ziehen mit der linken Maustaste verschiebt die Ansicht.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || (e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]')) return;
      e.preventDefault();
      setSpaceDown(e.type === 'keydown');
    };
    const onAlt = (e: KeyboardEvent) => {
      if (e.key !== 'Alt') return;
      // Sonst springt der Fokus unter Windows ins Browsermenü.
      e.preventDefault();
      setAltDown(e.type === 'keydown');
    };
    const onBlur = () => {
      setSpaceDown(false);
      setAltDown(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onAlt);
    window.addEventListener('keyup', onAlt);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('keydown', onAlt);
      window.removeEventListener('keyup', onAlt);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return { spaceDown, altDown };
}
