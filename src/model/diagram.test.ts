import { describe, expect, it } from 'vitest';
import {
  addComponent,
  connect,
  connectionsAt,
  createDiagram,
  DiagramError,
  nextId,
  portPosition,
  removeComponent,
  transformLocalPoint,
  updateComponent,
} from './diagram.ts';
import { COMPONENT_LIBRARY, definitionsFor } from './library.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { defaultValveConfig } from './valve.ts';

describe('Bauteilbibliothek', () => {
  it('hat eindeutige Typen und eindeutige Anschlüsse je Bauteil', () => {
    const types = COMPONENT_LIBRARY.map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
    for (const def of COMPONENT_LIBRARY) {
      const ids = def.ports.map((p) => p.id);
      expect(new Set(ids).size, def.type).toBe(ids.length);
    }
  });

  it('legt alle Anschlüsse auf den Rand des Symbols', () => {
    for (const def of COMPONENT_LIBRARY) {
      for (const p of def.ports) {
        const { width, height } = def.size;
        const onEdge = p.offset.x === 0 || p.offset.x === width || p.offset.y === 0 || p.offset.y === height;
        const inside = p.offset.x >= 0 && p.offset.x <= width && p.offset.y >= 0 && p.offset.y <= height;
        expect(onEdge && inside, `${def.type}.${p.id}`).toBe(true);
      }
    }
  });

  it('hält alle Anschlüsse in jeder Drehung und Spiegelung auf dem Raster', () => {
    const onGrid = (v: number) => Number.isInteger(v / 10);
    for (const def of COMPONENT_LIBRARY) {
      for (const rotation of [0, 90, 180, 270] as const) {
        for (const mirrored of [false, true]) {
          for (const p of def.ports) {
            const at = transformLocalPoint({ position: { x: 0, y: 0 }, rotation, mirrored }, def, p.offset);
            expect(onGrid(at.x) && onGrid(at.y), `${def.type}.${p.id} ${rotation}° ${mirrored}`).toBe(true);
          }
        }
      }
    }
  });

  it('filtert nach Medium', () => {
    expect(definitionsFor('pneumatic').some((d) => d.type === 'supply.pump')).toBe(false);
    expect(definitionsFor('hydraulic').some((d) => d.type === 'supply.pump')).toBe(true);
  });
});

describe('Schaltplan bearbeiten', () => {
  it('vergibt fortlaufende IDs', () => {
    expect(nextId('c', [])).toBe('c1');
    expect(nextId('c', [{ id: 'c1' }, { id: 'c7' }, { id: 'l9' }])).toBe('c8');
  });

  it('fügt Bauteile hinzu, ohne das Original zu verändern', () => {
    const empty = createDiagram('pneumatic');
    const { diagram, component } = addComponent(empty, 'supply.compressor', { x: 10, y: 20 }, { label: '1V1' });
    expect(empty.components).toHaveLength(0);
    expect(diagram.components).toEqual([component]);
    expect(component).toMatchObject({ id: 'c1', rotation: 0, mirrored: false, label: '1V1' });
  });

  it('lehnt unbekannte Bauteiltypen ab', () => {
    expect(() => addComponent(createDiagram('hydraulic'), 'gibt.es.nicht', { x: 0, y: 0 })).toThrow(DiagramError);
  });

  it('verbindet nur existierende Anschlüsse und keine Duplikate', () => {
    let d = createDiagram('hydraulic');
    d = addComponent(d, 'supply.pump', { x: 0, y: 0 }).diagram;
    d = addComponent(d, 'supply.tank', { x: 0, y: 100 }).diagram;
    const pumpS = { componentId: 'c1', portId: 'S' };
    const tankT = { componentId: 'c2', portId: 'T' };

    d = connect(d, pumpS, tankT).diagram;
    expect(d.connections[0]).toMatchObject({ id: 'l1', kind: 'working' });
    expect(() => connect(d, tankT, pumpS)).toThrow(/existiert bereits/);
    expect(() => connect(d, pumpS, pumpS)).toThrow(/sich selbst/);
    expect(() => connect(d, pumpS, { componentId: 'c2', portId: 'X' })).toThrow(/keinen Anschluss/);
    expect(() => connect(d, pumpS, { componentId: 'c9', portId: 'T' })).toThrow(/existiert nicht/);
  });

  it('entfernt mit einem Bauteil auch dessen Leitungen', () => {
    const d = exampleHydraulicDiagram();
    const valveId = d.components.find((c) => c.label === '1V1')!.id;
    const after = removeComponent(d, valveId);
    expect(after.components.some((c) => c.id === valveId)).toBe(false);
    expect(after.connections.some((l) => JSON.stringify(l).includes(`"${valveId}"`))).toBe(false);
    expect(after.connections.length).toBe(d.connections.length - 4);
  });

  it('findet Leitungen an einem Anschluss', () => {
    const d = exampleHydraulicDiagram();
    const pumpId = d.components.find((c) => c.label === '0P1')!.id;
    expect(connectionsAt(d, { componentId: pumpId, portId: 'P' })).toHaveLength(2);
  });
});

describe('Anschlussposition', () => {
  // supply.tank: 60 x 40, Anschluss T bei (20, 0)
  const at = (rotation: 0 | 90 | 180 | 270, mirrored = false) => {
    let d = addComponent(createDiagram('hydraulic'), 'supply.tank', { x: 100, y: 100 }).diagram;
    d = updateComponent(d, 'c1', { rotation, mirrored });
    return portPosition(d, { componentId: 'c1', portId: 'T' });
  };

  it('berücksichtigt die Drehung um die Bauteilmitte', () => {
    // Mitte liegt bei (130, 120)
    expect(at(0)).toEqual({ x: 120, y: 100 });
    expect(at(90)).toEqual({ x: 150, y: 110 });
    expect(at(180)).toEqual({ x: 140, y: 140 });
    expect(at(270)).toEqual({ x: 110, y: 130 });
  });

  it('berücksichtigt die Spiegelung', () => {
    const config = { ...defaultValveConfig('pneumatic', 3, 2), left: ['pilot' as const], right: ['spring' as const] };
    let d = addComponent(createDiagram('pneumatic'), 'valve.directional', { x: 0, y: 0 }, { config }).diagram;
    d = updateComponent(d, 'c1', { mirrored: true });
    // 16M × 8M; Steueranschluss X (14) liegt links 1M über der Feld-Unterkante
    // bei (0, 50) und wandert gespiegelt nach rechts.
    expect(portPosition(d, { componentId: 'c1', portId: 'X' })).toEqual({ x: 160, y: 50 });
  });
});
