import { describe, expect, it } from 'vitest';
import { isConfigurable, paletteFor } from './library.ts';

describe('Bauteilliste', () => {
  for (const domain of ['hydraulic', 'pneumatic'] as const) {
    it(`markiert konfigurierbare Einträge und hat eindeutige Schlüssel (${domain})`, () => {
      const palette = paletteFor(domain);
      for (const e of palette) expect(!!e.configurable).toBe(isConfigurable(e.type));
      expect(new Set(palette.map((e) => e.key)).size).toBe(palette.length);
    });
  }

  it('führt Wegeventile je Grundform, nicht je Betätigung', () => {
    const names = paletteFor('hydraulic').filter((e) => e.group === 'Wegeventile').map((e) => e.name);
    expect(names).toEqual(['2/2-Wegeventil', '3/2-Wegeventil', '4/2-Wegeventil', '4/3-Wegeventil']);
  });
});
