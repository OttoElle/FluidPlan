import { describe, expect, it } from 'vitest';
import { COMPONENT_LIBRARY, getDefinition } from '../model/library.ts';
import { hasSymbol } from './symbols.tsx';

describe('Schaltzeichen', () => {
  it('gibt es für alle Bauteile der Bibliothek', () => {
    for (const def of COMPONENT_LIBRARY) expect(hasSymbol(def.type), def.type).toBe(true);
  });

  it('gibt es für die konfigurierbaren Bauteile', () => {
    for (const type of [
      'valve.directional',
      'actuator.cylinder',
      'supply.pump',
      'actuator.motor',
      'supply.tank',
      'supply.accumulator',
      'valve.ball',
      'line.coupling',
      'measure.sensor',
      'valve.check',
      'valve.pressure',
      'valve.throttle',
      'valve.flow-divider',
      'supply.filter',
      'supply.cooler',
      'measure.gauge',
      'measure.indicator',
    ]) {
      expect(getDefinition(type), type).toBeDefined();
      expect(hasSymbol(type), type).toBe(true);
    }
  });
});
