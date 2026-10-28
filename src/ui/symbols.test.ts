import { describe, expect, it } from 'vitest';
import { getDefinition } from '../model/library.ts';
import { hasSymbol } from './symbols.tsx';

describe('Schaltzeichen', () => {
  it('gibt es für die ersten ISO-1219-Bauteile', () => {
    for (const type of ['supply.pump', 'supply.compressor', 'valve.4-2', 'actuator.cylinder-double']) {
      expect(getDefinition(type), type).toBeDefined();
      expect(hasSymbol(type), type).toBe(true);
    }
  });
});
