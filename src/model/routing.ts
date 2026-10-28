import { getDefinition } from './library.ts';
import { portPosition, transformLocalPoint } from './diagram.ts';
import type { ComponentInstance, Connection, Diagram, Point, PortRef } from './types.ts';

/**
 * Rechtwinklige Leitungsführung im Raster.
 *
 * Leitungen verlaufen in Schaltplänen nur waagerecht und senkrecht. Eine
 * Leitung ohne Knickpunkte (`waypoints` leer) wird automatisch geroutet:
 * Sie verlässt den Anschluss senkrecht zur Bauteilkante, umgeht andere
 * Bauteile und knickt so selten wie möglich ab. Hat der Benutzer die Leitung
 * bearbeitet, sind die Knickpunkte gespeichert; verschiebt man danach ein
 * Bauteil, werden nur die Enden wieder rechtwinklig angeschlossen.
 */

export const GRID = 10;

/** Einheitsvektor einer Richtung, z. B. { x: 0, y: -1 } = nach oben. */
export type Direction = Point;

const UP: Direction = { x: 0, y: -1 };
const DOWN: Direction = { x: 0, y: 1 };
const LEFT: Direction = { x: -1, y: 0 };
const RIGHT: Direction = { x: 1, y: 0 };
const DIRECTIONS = [UP, RIGHT, DOWN, LEFT] as const;

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Umriss eines Bauteils im Schaltplan, nach Drehung und Spiegelung. */
export function componentBox(component: ComponentInstance): Box | undefined {
  const def = getDefinition(component.type);
  if (!def) return undefined;
  const a = transformLocalPoint(component, def, { x: 0, y: 0 });
  const b = transformLocalPoint(component, def, { x: def.size.width, y: def.size.height });
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

/**
 * Richtung, in die eine Leitung den Anschluss verlässt: weg von der
 * Bauteilkante, auf der der Anschluss liegt.
 */
export function portDirection(diagram: Diagram, ref: PortRef): Direction {
  const component = diagram.components.find((c) => c.id === ref.componentId);
  const def = component && getDefinition(component.type);
  const port = def?.ports.find((p) => p.id === ref.portId);
  if (!component || !def || !port) return DOWN;
  const { x, y } = port.offset;
  const { width, height } = def.size;
  const edges: [number, Direction][] = [
    [y, UP],
    [height - y, DOWN],
    [x, LEFT],
    [width - x, RIGHT],
  ];
  let dir = edges.reduce((best, e) => (e[0] < best[0] ? e : best))[1];
  let dx = component.mirrored ? -dir.x : dir.x;
  let dy = dir.y;
  for (let r = 0; r < component.rotation; r += 90) [dx, dy] = [-dy, dx];
  dir = { x: dx + 0, y: dy + 0 };
  return dir;
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Entfernt doppelte Punkte und Punkte mitten auf einer geraden Strecke. */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    if (out.length && samePoint(out[out.length - 1]!, p)) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2]!;
      const b = out[out.length - 1]!;
      if ((a.x === b.x && b.x === p.x) || (a.y === b.y && b.y === p.y)) out.pop();
    }
    out.push({ ...p });
  }
  return out;
}

/**
 * Macht einen Linienzug rechtwinklig, indem zwischen zwei Punkten, die
 * nicht auf einer Linie liegen, ein Knick eingefügt wird. Am Anfang und Ende
 * bestimmen die Anschlussrichtungen, ob zuerst waagerecht oder senkrecht
 * gefahren wird.
 */
export function orthogonalize(points: Point[], startDir?: Direction, endDir?: Direction): Point[] {
  const out: Point[] = [];
  points.forEach((p, i) => {
    if (i > 0) {
      const a = out[out.length - 1]!;
      if (a.x !== p.x && a.y !== p.y) {
        const last = i === points.length - 1;
        let vertical: boolean; // erstes Teilstück senkrecht?
        if (i === 1 && startDir) vertical = startDir.x === 0;
        else if (last && endDir) vertical = endDir.x !== 0;
        else vertical = false;
        out.push(vertical ? { x: a.x, y: p.y } : { x: p.x, y: a.y });
      }
    }
    out.push({ ...p });
  });
  return simplify(out);
}

// --- Automatisches Routing (A* im Raster mit Knickstrafe) ---

const BEND_COST = 4;
/** Kosten je Rasterpunkt auf einer fremden Leitung: Kreuzen geht, längs darauf laufen kaum. */
const OCCUPIED_COST = 6;
const MARGIN = 6; // Rasterschritte Spielraum um alle Bauteile herum

class MinHeap<T> {
  private items: { key: number; value: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(key: number, value: T) {
    const a = this.items;
    a.push({ key, value });
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (a[parent]!.key <= a[i]!.key) break;
      [a[parent], a[i]] = [a[i]!, a[parent]!];
      i = parent;
    }
  }
  pop(): T {
    const a = this.items;
    const top = a[0]!;
    const end = a.pop()!;
    if (a.length) {
      a[0] = end;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.key < a[m]!.key) m = l;
        if (r < a.length && a[r]!.key < a[m]!.key) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top.value;
  }
}

export interface RouteRequest {
  start: Point;
  startDir: Direction;
  end: Point;
  /** Richtung, in die der Zielanschluss zeigt; fehlt sie, ist jede Ankunft erlaubt. */
  endDir?: Direction;
  /** Bauteile, die die Leitung nicht durchqueren soll. */
  obstacles: Box[];
  /** Rasterpunkte (`"x,y"`) fremder Leitungen; darüber zu laufen kostet extra. */
  occupied?: ReadonlySet<string>;
}

/**
 * Sucht einen rechtwinkligen Weg mit möglichst wenigen Knicken, der nicht
 * durch Bauteile führt. Liefert die Eckpunkte inklusive Start und Ende.
 */
export function route({ start, startDir, end, endDir, obstacles, occupied }: RouteRequest): Point[] {
  const onGrid = (p: Point) => p.x % GRID === 0 && p.y % GRID === 0;
  if (!onGrid(start) || !onGrid(end)) return fallbackRoute(start, startDir, end, endDir);

  const gx = (v: number) => Math.round(v / GRID);
  const s = { x: gx(start.x), y: gx(start.y) };
  const e = { x: gx(end.x), y: gx(end.y) };

  let minX = Math.min(s.x, e.x);
  let minY = Math.min(s.y, e.y);
  let maxX = Math.max(s.x, e.x);
  let maxY = Math.max(s.y, e.y);
  for (const b of obstacles) {
    minX = Math.min(minX, Math.floor(b.minX / GRID));
    minY = Math.min(minY, Math.floor(b.minY / GRID));
    maxX = Math.max(maxX, Math.ceil(b.maxX / GRID));
    maxY = Math.max(maxY, Math.ceil(b.maxY / GRID));
  }
  minX -= MARGIN;
  minY -= MARGIN;
  maxX += MARGIN;
  maxY += MARGIN;
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;

  // Gesperrt sind alle Rasterpunkte innerhalb oder auf dem Rand eines Bauteils.
  const blocked = new Uint8Array(w * h);
  for (const b of obstacles) {
    for (let y = Math.ceil(b.minY / GRID); y <= Math.floor(b.maxY / GRID); y++) {
      for (let x = Math.ceil(b.minX / GRID); x <= Math.floor(b.maxX / GRID); x++) {
        blocked[(y - minY) * w + (x - minX)] = 1;
      }
    }
  }
  const cell = (x: number, y: number) => (y - minY) * w + (x - minX);
  blocked[cell(s.x, s.y)] = 0;
  blocked[cell(e.x, e.y)] = 0;

  // Zustand = Rasterpunkt × Richtung, aus der man gekommen ist.
  const state = (x: number, y: number, d: number) => cell(x, y) * 4 + d;
  const cost = new Float64Array(w * h * 4).fill(Infinity);
  const prev = new Int32Array(w * h * 4).fill(-1);
  const heap = new MinHeap<number>();
  const heuristic = (x: number, y: number) => Math.abs(x - e.x) + Math.abs(y - e.y);

  const d0 = DIRECTIONS.findIndex((d) => d.x === startDir.x && d.y === startDir.y);
  const first = { x: s.x + startDir.x, y: s.y + startDir.y };
  const endArrival = endDir ? DIRECTIONS.findIndex((d) => d.x === -endDir.x && d.y === -endDir.y) : -1;
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;

  if (d0 < 0 || !inside(first.x, first.y)) return fallbackRoute(start, startDir, end, endDir);
  // Der erste Schritt führt immer senkrecht vom Bauteil weg.
  const firstState = state(first.x, first.y, d0);
  cost[firstState] = 1;
  prev[firstState] = -2; // markiert den Anfang
  heap.push(1 + heuristic(first.x, first.y), firstState);

  let found = -1;
  if (samePoint(first, e) && (endArrival < 0 || endArrival === d0)) found = firstState;

  while (found < 0 && heap.size) {
    const cur = heap.pop();
    const d = cur % 4;
    const c = (cur - d) / 4;
    const x = (c % w) + minX;
    const y = Math.floor(c / w) + minY;
    if (x === e.x && y === e.y) {
      if (endArrival < 0 || d === endArrival) {
        found = cur;
        break;
      }
      continue; // falsche Ankunftsrichtung, nicht durch den Anschluss hindurch weiter
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // nicht umkehren
      const nx = x + DIRECTIONS[nd]!.x;
      const ny = y + DIRECTIONS[nd]!.y;
      if (!inside(nx, ny) || blocked[cell(nx, ny)]) continue;
      const ns = state(nx, ny, nd);
      const busy = occupied?.has(`${nx * GRID},${ny * GRID}`) ? OCCUPIED_COST : 0;
      const nc = cost[cur]! + 1 + (nd === d ? 0 : BEND_COST) + busy;
      if (nc < cost[ns]!) {
        cost[ns] = nc;
        prev[ns] = cur;
        heap.push(nc + heuristic(nx, ny), ns);
      }
    }
  }

  if (found < 0) return fallbackRoute(start, startDir, end, endDir);

  const path: Point[] = [];
  for (let st = found; st >= 0; st = prev[st]!) {
    const c = (st - (st % 4)) / 4;
    path.push({ x: ((c % w) + minX) * GRID, y: (Math.floor(c / w) + minY) * GRID });
  }
  path.push({ ...start });
  return simplify(path.reverse());
}

/** Einfacher Weg ohne Hindernisprüfung: kurzer Stich aus jedem Anschluss, dazwischen ein Knick. */
function fallbackRoute(start: Point, startDir: Direction, end: Point, endDir?: Direction): Point[] {
  const a = { x: start.x + startDir.x * 2 * GRID, y: start.y + startDir.y * 2 * GRID };
  const b = endDir ? { x: end.x + endDir.x * 2 * GRID, y: end.y + endDir.y * 2 * GRID } : end;
  return orthogonalize([start, a, b, end], startDir, endDir);
}

/** Hindernisse für eine Leitung: alle Bauteile im Schaltplan. */
export function obstaclesOf(diagram: Diagram): Box[] {
  return diagram.components.map(componentBox).filter((b): b is Box => b !== undefined);
}

/** Tatsächlicher Verlauf einer Leitung als Eckpunkte vom Start- zum Zielanschluss. */
export function connectionPath(
  diagram: Diagram,
  connection: Connection,
  obstacles = obstaclesOf(diagram),
  occupied?: ReadonlySet<string>,
): Point[] {
  const start = portPosition(diagram, connection.from);
  const end = portPosition(diagram, connection.to);
  const startDir = portDirection(diagram, connection.from);
  const endDir = portDirection(diagram, connection.to);
  if (connection.waypoints.length === 0) return route({ start, startDir, end, endDir, obstacles, occupied });
  return orthogonalize([start, ...connection.waypoints, end], startDir, endDir);
}

const portKey = (r: PortRef) => `${r.componentId}/${r.portId}`;

/**
 * Verlauf aller Leitungen. Selbst geführte Leitungen kommen zuerst, die
 * automatischen weichen danach den bereits gezogenen Leitungen aus, damit
 * sich fremde Leitungen nicht überdecken und verbunden aussehen.
 */
export function routeAll(diagram: Diagram): Map<string, Point[]> {
  const obstacles = obstaclesOf(diagram);
  const paths = new Map<string, Point[]>();
  const ordered = [...diagram.connections].sort((a, b) => b.waypoints.length - a.waypoints.length);
  for (const l of ordered) {
    const mine = new Set([portKey(l.from), portKey(l.to)]);
    const occupied = new Set<string>();
    for (const other of ordered) {
      const path = paths.get(other.id);
      if (!path || mine.has(portKey(other.from)) || mine.has(portKey(other.to))) continue;
      for (const p of gridSteps(path)) occupied.add(`${p.x},${p.y}`);
    }
    paths.set(l.id, connectionPath(diagram, l, obstacles, occupied));
  }
  return paths;
}

/**
 * Verschiebt das Teilstück `index` (zwischen path[index] und path[index+1])
 * quer zu seiner Richtung. Hängt es an einem Anschluss, wird dort ein kurzer
 * Stich eingefügt, damit die Leitung am Anschluss bleibt.
 * Gibt die neuen Knickpunkte (ohne Start und Ende) zurück.
 */
export function moveSegment(path: Point[], index: number, offset: number): Point[] {
  const pts = path.map((p) => ({ ...p }));
  // Ein Rasterschritt Stich vom Anschluss `p` in Richtung `toward`.
  const stub = (p: Point, toward: Point): Point => {
    const len = Math.abs(toward.x - p.x) + Math.abs(toward.y - p.y);
    if (len <= GRID) return { ...p };
    return { x: p.x + (Math.sign(toward.x - p.x) * GRID), y: p.y + (Math.sign(toward.y - p.y) * GRID) };
  };
  let i = index;
  // Hängt das Teilstück am Anschluss, bleibt der Stich stehen und eine Kopie
  // seines Endpunkts wandert mit.
  if (i === 0) {
    const s = stub(pts[0]!, pts[1]!);
    pts.splice(1, 0, s, { ...s });
    i = 2;
  }
  if (i + 1 === pts.length - 1) {
    const s = stub(pts[pts.length - 1]!, pts[pts.length - 2]!);
    pts.splice(pts.length - 1, 0, { ...s }, s);
  }
  const a = pts[i]!;
  const b = pts[i + 1]!;
  if (a.y === b.y) {
    a.y += offset;
    b.y += offset;
  } else {
    a.x += offset;
    b.x += offset;
  }
  return simplify(pts).slice(1, -1);
}

/** Zerlegt einen rechtwinkligen Linienzug in einzelne Rasterpunkte. */
function gridSteps(path: Point[]): Point[] {
  const out: Point[] = path.length ? [{ ...path[0]! }] : [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const n = Math.max(1, Math.round((Math.abs(b.x - a.x) + Math.abs(b.y - a.y)) / GRID));
    for (let k = 1; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/**
 * Verzweigungspunkte: Gehen zwei Leitungen vom selben Anschluss aus und laufen
 * ein Stück gemeinsam, bekommt die Stelle, an der sie sich trennen, einen
 * Verbindungspunkt (ISO 1219-1).
 */
export function junctions(connections: Connection[], paths: Map<string, Point[]>): Point[] {
  const found = new Map<string, Point>();
  for (let i = 0; i < connections.length; i++) {
    for (let j = i + 1; j < connections.length; j++) {
      const a = connections[i]!;
      const b = connections[j]!;
      for (const [ea, eb] of [
        ['from', 'from'],
        ['from', 'to'],
        ['to', 'from'],
        ['to', 'to'],
      ] as const) {
        if (portKey(a[ea]) !== portKey(b[eb])) continue;
        const pa = gridSteps(ea === 'from' ? paths.get(a.id)! : [...paths.get(a.id)!].reverse());
        const pb = gridSteps(eb === 'from' ? paths.get(b.id)! : [...paths.get(b.id)!].reverse());
        let k = 0;
        while (k + 1 < pa.length && k + 1 < pb.length && samePoint(pa[k + 1]!, pb[k + 1]!)) k++;
        if (k > 0 && k + 1 < pa.length && k + 1 < pb.length) found.set(`${pa[k]!.x},${pa[k]!.y}`, pa[k]!);
      }
    }
  }
  return [...found.values()];
}
