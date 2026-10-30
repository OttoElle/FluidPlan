import { GRID } from '../../model/routing.ts';
import { drawingArea, titleBlock, titleCells, type TitleCell, type TitleField } from '../../model/sheet.ts';
import type { Diagram } from '../../model/types.ts';

/** Raster: jeder fünfte Punkt ist kräftiger. */
export const MAJOR_EVERY = 5;

const ORIENTATION_NAMES = { portrait: 'hoch', landscape: 'quer' } as const;

/** Zeichnungsrahmen und vereinfachtes Schriftfeld nach DIN EN ISO 5457 / 7200. */
export function SheetFrame({ diagram, onPick }: { diagram: Diagram; onPick?: (field: TitleField) => void }) {
  const area = drawingArea(diagram.sheet);
  const block = titleBlock(diagram.sheet);
  const { sheet, meta } = diagram;
  const page = diagram.page ?? { name: '', number: 1, count: 1 };
  const value = (field: TitleField): string =>
    field === 'date'
      ? meta.modified.slice(0, 10)
      : field === 'format'
        ? `${sheet.format} ${ORIENTATION_NAMES[sheet.orientation]}`
        : field === 'sheet'
          ? page.name
          : meta[field];
  const caption = (c: TitleCell) => (c.field === 'sheet' ? `Blatt ${page.number} von ${page.count}` : c.caption);
  const editable = (field: TitleField) => field !== 'date' && field !== 'format';
  return (
    <g className="sheet-frame" pointerEvents="none">
      <rect x={area.x} y={area.y} width={area.width} height={area.height} className="frame" />
      {titleCells(sheet).map((c) => (
        <g key={c.field}>
          <rect x={c.x} y={c.y} width={c.width} height={c.height} className="cell" />
          <text x={c.x + 6} y={c.y + 11} className="caption">
            {caption(c)}
          </text>
          <text x={c.x + 6} y={c.y + c.height - 7} className={c.big ? 'value big' : 'value'}>
            {value(c.field)}
          </text>
          {onPick && editable(c.field) && (
            <rect
              x={c.x}
              y={c.y}
              width={c.width}
              height={c.height}
              className="title-cell"
              pointerEvents="all"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.stopPropagation();
                onPick(c.field);
              }}
            >
              <title>{c.field === 'sheet' ? 'Blattbenennung' : c.caption} bearbeiten</title>
            </rect>
          )}
        </g>
      ))}
      <rect x={block.x} y={block.y} width={block.width} height={block.height} className="frame" />
    </g>
  );
}

/** Größe der Rasterpunkte in Einheiten; `minor` = auch die feinen Punkte zeigen. */
export interface GridLook {
  dot: number;
  major: number;
  minor: boolean;
}

/** Punktraster im Zeichenfeld; jeder fünfte Punkt ist kräftiger. */
export function GridDots({ id, sheet, look }: { id: string; sheet: Diagram['sheet']; look: GridLook }) {
  const area = drawingArea(sheet);
  const cell = GRID * MAJOR_EVERY;
  // Die Kachel ist um eine halbe Kachel versetzt, damit kein Punkt an ihrem Rand abgeschnitten wird.
  const half = cell / 2;
  const steps = Array.from({ length: MAJOR_EVERY }, (_, k) => (k - (MAJOR_EVERY - 1) / 2) * GRID);
  const pad = look.major;
  return (
    <>
      <defs>
        <pattern id={id} x={area.x - half} y={area.y - half} width={cell} height={cell} patternUnits="userSpaceOnUse">
          {steps.flatMap((dx) =>
            steps.map((dy) =>
              dx === 0 && dy === 0 ? (
                <circle key="major" cx={half} cy={half} r={look.major} className="grid-dot major" />
              ) : look.minor ? (
                <circle key={`${dx},${dy}`} cx={half + dx} cy={half + dy} r={look.dot} className="grid-dot" />
              ) : null,
            ),
          )}
        </pattern>
      </defs>
      {/* Rand um die Fläche, damit auch die Punkte auf der letzten Linie ganz zu sehen sind. */}
      <rect
        x={area.x - pad}
        y={area.y - pad}
        width={area.width + 2 * pad}
        height={area.height + 2 * pad}
        fill={`url(#${id})`}
        pointerEvents="none"
      />
    </>
  );
}
