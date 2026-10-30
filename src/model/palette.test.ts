import { describe, expect, it } from 'vitest';
import { isConfigurable, paletteFor } from './library.ts';

describe('Bauteilliste', () => {
  for (const domain of ['hydraulic', 'pneumatic'] as const) {
    it(`führt jeden konfigurierbaren Typ genau einmal als Symbolgruppe (${domain})`, () => {
      const palette = paletteFor(domain);
      const groups = palette.filter((e) => isConfigurable(e.type));
      expect(groups.every((e) => e.isGroup)).toBe(true);
      expect(new Set(groups.map((e) => e.type)).size).toBe(groups.length);
      expect(palette.filter((e) => e.isGroup).length).toBe(groups.length);
      expect(new Set(palette.map((e) => e.key)).size).toBe(palette.length);
    });
  }
});
