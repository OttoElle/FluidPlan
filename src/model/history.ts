/**
 * Rückgängig/Wiederholen als Liste von Zuständen.
 *
 * Da alle Bearbeitungsfunktionen (diagram.ts) neue Werte liefern und die alten
 * unverändert lassen, genügt es, frühere Zustände aufzuheben. Jede Änderung am
 * Schaltplan läuft über `commit`; Ansichtszustände wie Zoom oder Auswahl
 * gehören nicht hinein.
 *
 * Zusammenfassen: Änderungen mit derselben Gruppe (`group`) direkt
 * hintereinander ergeben einen einzigen Schritt, z. B. alle Zwischenstände
 * beim Ziehen eines Bauteils oder das Tippen in ein Textfeld. `seal` beendet
 * die laufende Gruppe, etwa beim Loslassen der Maus.
 */

export interface History<T> {
  /** Ältester Zustand zuerst. */
  past: T[];
  present: T;
  /** Nächster Zustand für „Wiederholen“ zuerst. */
  future: T[];
  /** Gruppe der letzten Änderung, solange sie noch fortgesetzt werden kann. */
  group: string | null;
}

/** Höchstzahl gespeicherter Schritte; ältere fallen weg. */
export const HISTORY_LIMIT = 200;

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [], group: null };
}

/**
 * Übernimmt einen neuen Zustand. Ist `next` derselbe Wert wie der aktuelle,
 * bleibt alles, wie es ist.
 */
export function commit<T>(history: History<T>, next: T, group?: string): History<T> {
  if (next === history.present) return history;
  if (group !== undefined && group === history.group) {
    return { ...history, present: next, future: [] };
  }
  const past = [...history.past, history.present];
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT);
  return { past, present: next, future: [], group: group ?? null };
}

/** Ersetzt den aktuellen Zustand, ohne einen Schritt anzulegen (z. B. Zeitstempel beim Speichern). */
export function replace<T>(history: History<T>, next: T): History<T> {
  return { ...history, present: next };
}

/** Beendet die laufende Gruppe; die nächste Änderung wird ein eigener Schritt. */
export function seal<T>(history: History<T>): History<T> {
  return history.group === null ? history : { ...history, group: null };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
  if (!canUndo(history)) return history;
  const past = history.past.slice(0, -1);
  return { past, present: history.past.at(-1)!, future: [history.present, ...history.future], group: null };
}

export function redo<T>(history: History<T>): History<T> {
  if (!canRedo(history)) return history;
  const [present, ...future] = history.future;
  return { past: [...history.past, history.present], present: present!, future, group: null };
}
