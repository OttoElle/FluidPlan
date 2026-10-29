import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { EMPTY_SELECTION } from '../model/selection.ts';
import type { Diagram } from '../model/types.ts';
import { DiagramView } from './DiagramView.tsx';

const ignore = () => {};

/**
 * Zeichnet Blätter unsichtbar mit derselben Darstellung wie im Editor, aber
 * ohne Auswahl und Mauszustand, und gibt ihre SVGs für den Export zurück.
 * So lassen sich auch Blätter exportieren, die gerade nicht angezeigt sind.
 */
export function renderSheetSvgs(diagrams: Diagram[]): SVGSVGElement[] {
  return diagrams.map((diagram) => {
    const host = document.createElement('div');
    const root = createRoot(host);
    try {
      flushSync(() =>
        root.render(
          <DiagramView
            diagram={diagram}
            selection={EMPTY_SELECTION}
            onSelect={ignore}
            onMove={ignore}
            onConnect={ignore}
            onConnectToLine={ignore}
            onRouteChange={ignore}
            onMoveJunction={ignore}
          />,
        ),
      );
      const svg = host.querySelector<SVGSVGElement>('svg.diagram');
      if (!svg) throw new Error('Das Blatt konnte nicht gezeichnet werden.');
      return svg.cloneNode(true) as SVGSVGElement;
    } finally {
      root.unmount();
    }
  });
}
