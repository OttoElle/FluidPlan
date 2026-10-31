import { describe, expect, it } from 'vitest';
import { checkDiagram } from './check.ts';
import { addComponent, createDiagram, updateComponent } from './diagram.ts';
import { exampleHydraulicDiagram } from './example.ts';
import { drawingArea } from './sheet.ts';

describe('checkDiagram', () => {
  it('findet im Beispielplan nur den offenen Sauganschluss der Pumpe', () => {
    expect(checkDiagram(exampleHydraulicDiagram()).map((i) => i.message)).toEqual([
      '0.2 Hydropumpe (konstant): Anschluss S offen.',
    ]);
  });

  it('meldet doppelte Kennzeichen als Fehler', () => {
    const d = exampleHydraulicDiagram();
    const twice = updateComponent(d, d.components[1]!.id, { label: '1.1' });
    const [first] = checkDiagram(twice);
    expect(first).toMatchObject({ severity: 'error', components: [d.components[0]!.id, d.components[1]!.id] });
    expect(first!.message).toContain('1.1');
  });

  it('meldet offene Anschlüsse und fehlende Kennzeichen', () => {
    const area = drawingArea(createDiagram('hydraulic').sheet);
    const { diagram } = addComponent(createDiagram('hydraulic'), 'valve.check', { x: area.x + 50, y: area.y + 50 });
    const messages = checkDiagram(diagram).map((i) => i.message);
    expect(messages).toEqual([
      'Rückschlagventil hat kein Kennzeichen.',
      'Rückschlagventil: Anschlüsse A, P offen.',
    ]);
  });

  it('meldet Überlappung, Lage außerhalb und Leitungen durch Symbole', () => {
    const d = exampleHydraulicDiagram();
    const [cylinder, valve, pump] = d.components;
    const moved = updateComponent(d, pump!.id, { position: { x: valve!.position.x + 10, y: valve!.position.y } });
    const messages = checkDiagram(moved).map((i) => i.message);
    expect(messages.some((m) => m.includes('überlappen'))).toBe(true);
    expect(messages.some((m) => m.startsWith('Eine Leitung läuft durch'))).toBe(true);

    const outside = updateComponent(d, cylinder!.id, { position: { x: -100, y: 0 } });
    expect(checkDiagram(outside).map((i) => i.message)).toContain(
      '1.1 Doppeltwirkender Zylinder liegt außerhalb der Zeichenfläche.',
    );
  });

  it('lässt offene Entlüftungen pneumatischer Ventile zu', () => {
    let d = createDiagram('pneumatic');
    const area = drawingArea(d.sheet);
    const r = addComponent(d, 'valve.directional', { x: area.x + 100, y: area.y + 100 }, { label: '1.2' });
    d = r.diagram;
    expect(checkDiagram(d).map((i) => i.message)).toEqual(['1.2 5/2-Wegeventil: Anschlüsse 1, 2, 4 offen.']);
  });
});
