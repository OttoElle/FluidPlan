import { useCallback, useMemo, useReducer } from 'react';
import {
  type History,
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  replace,
  seal,
  undo,
} from '../model/history.ts';

type Update<T> = T | ((current: T) => T);

type Action<T> =
  | { type: 'edit'; update: Update<T>; group?: string }
  | { type: 'replace'; update: Update<T> }
  | { type: 'reset'; value: T }
  | { type: 'seal' | 'undo' | 'redo' };

const apply = <T,>(update: Update<T>, current: T): T =>
  typeof update === 'function' ? (update as (c: T) => T)(current) : update;

function reducer<T>(history: History<T>, action: Action<T>): History<T> {
  switch (action.type) {
    case 'edit':
      return commit(history, apply(action.update, history.present), action.group);
    case 'replace':
      return replace(history, apply(action.update, history.present));
    case 'reset':
      return createHistory(action.value);
    case 'seal':
      return seal(history);
    case 'undo':
      return undo(history);
    case 'redo':
      return redo(history);
  }
}

/**
 * Zustand mit Rückgängig/Wiederholen (siehe model/history.ts).
 * `edit` ersetzt `setState` für alles, was rückgängig gemachbar sein soll;
 * eine Gruppe fasst fortlaufende Änderungen (Ziehen, Tippen) zu einem Schritt zusammen.
 */
export function useHistory<T>(initial: () => T) {
  const [history, dispatch] = useReducer(reducer<T>, undefined, () => createHistory(initial()));
  const edit = useCallback((update: Update<T>, group?: string) => dispatch({ type: 'edit', update, group }), []);
  const actions = useMemo(
    () => ({
      edit,
      /** Ändert den Zustand ohne eigenen Schritt, z. B. den Zeitstempel beim Speichern. */
      replace: (update: Update<T>) => dispatch({ type: 'replace', update }),
      /** Neuer Ausgangszustand ohne Vorgeschichte, z. B. nach „Neu“ oder „Öffnen“. */
      reset: (value: T) => dispatch({ type: 'reset', value }),
      /** Beendet die laufende Gruppe. */
      seal: () => dispatch({ type: 'seal' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
    }),
    [edit],
  );
  return { present: history.present, canUndo: canUndo(history), canRedo: canRedo(history), ...actions };
}
