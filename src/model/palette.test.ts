import { describe, expect, it } from 'vitest';
import { isConfigurable, paletteFor, portName } from './library.ts';

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

describe('Anschlussnamen je Medium', () => {
  it('benennt Ventile mit zwei Anschlüssen in der Hydraulik P und A (ISO 9461)', () => {
    const check = { type: 'valve.check' };
    expect(portName(check, { id: '1', label: undefined }, 'hydraulic')).toBe('P');
    expect(portName(check, { id: '2', label: undefined }, 'hydraulic')).toBe('A');
    expect(portName(check, { id: '1', label: undefined }, 'pneumatic')).toBe('1');
  });

  it('nummeriert Druckventile in der Pneumatik (DIN ISO 11727, 8 und 9)', () => {
    expect(portName({ type: 'valve.pressure-relief' }, { id: 'P' }, 'pneumatic')).toBe('1');
    expect(portName({ type: 'valve.pressure-relief' }, { id: 'T' }, 'hydraulic')).toBe('T');
    expect(portName({ type: 'valve.pressure-reducing' }, { id: 'L' }, 'pneumatic')).toBe('3');
  });
});
