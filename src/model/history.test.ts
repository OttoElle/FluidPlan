import { describe, expect, it } from 'vitest';
import { HISTORY_LIMIT, canRedo, canUndo, commit, createHistory, redo, replace, seal, undo } from './history.ts';

describe('Rückgängig/Wiederholen', () => {
  it('geht Schritte zurück und wieder vor', () => {
    let h = createHistory('a');
    h = commit(h, 'b');
    h = commit(h, 'c');
    h = undo(h);
    expect(h.present).toBe('b');
    h = undo(h);
    expect(h.present).toBe('a');
    expect(canUndo(h)).toBe(false);
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe('c');
    expect(canRedo(h)).toBe(false);
  });

  it('verwirft „Wiederholen“ nach einer neuen Änderung', () => {
    let h = commit(commit(createHistory('a'), 'b'), 'c');
    h = commit(undo(h), 'x');
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe('b');
  });

  it('legt für unveränderte Werte keinen Schritt an', () => {
    const h = createHistory('a');
    expect(commit(h, 'a')).toBe(h);
  });

  it('fasst Änderungen derselben Gruppe zusammen, bis sie versiegelt wird', () => {
    let h = createHistory(0);
    h = commit(h, 1, 'move:c1');
    h = commit(h, 2, 'move:c1');
    h = commit(h, 3, 'move:c1');
    expect(h.past).toEqual([0]);
    h = commit(seal(h), 4, 'move:c1');
    expect(h.past).toEqual([0, 3]);
    h = commit(h, 5, 'move:c2');
    expect(h.past).toEqual([0, 3, 4]);
    expect(undo(h).present).toBe(4);
  });

  it('setzt nach Rückgängig keine Gruppe fort', () => {
    let h = commit(createHistory('a'), 'ab', 'text');
    h = undo(h);
    h = commit(h, 'x', 'text');
    expect(h.past).toEqual(['a']);
  });

  it('ersetzt ohne neuen Schritt', () => {
    const h = replace(commit(createHistory('a'), 'b'), 'b*');
    expect(h.present).toBe('b*');
    expect(h.past).toEqual(['a']);
  });

  it('begrenzt die Zahl der Schritte', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 10; i++) h = commit(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    expect(h.past[0]).toBe(10);
  });
});
