import { describe, expect, it } from 'vitest';
import { isConfigurable, mediumOf, PALETTE_GROUPS, paletteFor, portName } from './library.ts';

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
    expect(names).toEqual(['2/x-Wegeventil', '3/x-Wegeventil', '4/x-Wegeventil', '5/x-Wegeventil']);
  });
});

describe('Kategorien', () => {
  it('ordnet jeden Eintrag einer Kategorie zu und hält die Kategorien überschaubar', () => {
    const palette = paletteFor('hydraulic');
    for (const e of palette) expect(PALETTE_GROUPS as readonly string[]).toContain(e.group);
    for (const group of PALETTE_GROUPS) expect(palette.filter((e) => e.group === group).length, group).toBeLessThanOrEqual(6);
  });
});

describe('Anschlussnamen je Medium', () => {
  it('benennt Ventile mit zwei Anschlüssen in der Hydraulik P und A (ISO 9461)', () => {
    const check = { type: 'valve.check' };
    expect(portName(check, { id: '1', label: undefined })).toBe('P');
    expect(portName({ ...check, medium: 'hydraulic' }, { id: '2', label: undefined })).toBe('A');
    expect(portName({ ...check, medium: 'pneumatic' }, { id: '1', label: undefined })).toBe('1');
  });

  it('nummeriert Druckventile in der Pneumatik (DIN ISO 11727, 8 und 9)', () => {
    expect(portName({ type: 'valve.pressure', medium: 'pneumatic' }, { id: 'P' })).toBe('1');
    expect(portName({ type: 'valve.pressure', medium: 'hydraulic' }, { id: 'T' })).toBe('T');
    expect(portName({ type: 'valve.pressure', medium: 'pneumatic' }, { id: 'L' })).toBe('3');
  });
});

describe('Medium je Bauteil', () => {
  it('nimmt das Medium der Konfiguration, dann das gemerkte, dann das einzig mögliche', () => {
    const valve = paletteFor('pneumatic').find((e) => e.type === 'valve.directional')!;
    expect(mediumOf({ type: valve.type, config: valve.config, medium: 'hydraulic' })).toBe('pneumatic');
    expect(mediumOf({ type: 'valve.check', medium: 'pneumatic' })).toBe('pneumatic');
    expect(mediumOf({ type: 'supply.silencer' })).toBe('pneumatic');
    expect(mediumOf({ type: 'valve.check' })).toBe('hydraulic');
  });

  it('trennt die Kataloge über Schlüssel und Medium', () => {
    const all = [...paletteFor('hydraulic'), ...paletteFor('pneumatic')];
    expect(new Set(all.map((e) => e.key)).size).toBe(all.length);
    expect(paletteFor('pneumatic').every((e) => e.medium === 'pneumatic')).toBe(true);
  });
});
