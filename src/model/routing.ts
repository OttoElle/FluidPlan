import { definitionOf } from './library.ts';
import { endpointKey, endpointPosition, isJunctionRef, transformLocalPoint } from './diagram.ts';
import type { ComponentInstance, Connection, Diagram, Endpoint, Point, PortRef } from './types.ts';

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
  const def = definitionOf(component);
  if (!def) return undefined;
  const a = transformLocalPoint(component, def, { x: 0, y: 0 });
  const b = transformLocalPoint(component, def, { x: def.size.width, y: def.size.height });
  return { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
}

/**
 * Richtung, in die eine Leitung den Anschluss verlässt: weg von der
 * Bauteilkante, auf der der Anschluss liegt.
 */
function portDirection(diagram: Diagram, ref: PortRef): Direction {
  const component = diagram.components.find((c) => c.id === ref.componentId);
  const def = component && definitionOf(component);
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

/** Wie portDirection; an einem Abzweigpunkt ist jede Richtung möglich (undefined). */
export function endpointDirection(diagram: Diagram, ref: Endpoint): Direction | undefined {
  return isJunctionRef(ref) ? undefined : portDirection(diagram, ref);
}

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Entfernt doppelte Punkte und Punkte mitten auf einer geraden Strecke. */
function simplify(points: Point[]): Point[] {
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
  /** Richtung, in die der Startanschluss zeigt; fehlt sie (Abzweig), ist jede erlaubt. */
  startDir?: Direction;
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

  const endArrival = endDir ? DIRECTIONS.findIndex((d) => d.x === -endDir.x && d.y === -endDir.y) : -1;
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;

  // Der erste Schritt führt immer senkrecht vom Bauteil weg; an einem Abzweig in jede freie Richtung.
  const firstDirs = startDir
    ? [DIRECTIONS.findIndex((d) => d.x === startDir.x && d.y === startDir.y)]
    : [0, 1, 2, 3];
  let found = -1;
  for (const d0 of firstDirs) {
    if (d0 < 0) continue;
    const first = { x: s.x + DIRECTIONS[d0]!.x, y: s.y + DIRECTIONS[d0]!.y };
    if (!inside(first.x, first.y) || blocked[cell(first.x, first.y)]) continue;
    const firstState = state(first.x, first.y, d0);
    const c = 1 + (occupied?.has(`${first.x * GRID},${first.y * GRID}`) ? OCCUPIED_COST : 0);
    cost[firstState] = c;
    prev[firstState] = -2; // markiert den Anfang
    heap.push(c + heuristic(first.x, first.y), firstState);
    if (samePoint(first, e) && (endArrival < 0 || endArrival === d0)) found = firstState;
  }

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

  if (found < 0) {
    // Kein Weg um die Bauteile herum (z. B. weil sie sich berühren): lieber
    // quer durch als falsch herum an einen Anschluss.
    if (obstacles.length) return route({ start, startDir, end, endDir, obstacles: [], occupied });
    return fallbackRoute(start, startDir, end, endDir);
  }

  const path: Point[] = [];
  for (let st = found; st >= 0; st = prev[st]!) {
    const c = (st - (st % 4)) / 4;
    path.push({ x: ((c % w) + minX) * GRID, y: (Math.floor(c / w) + minY) * GRID });
  }
  path.push({ ...start });
  return simplify(path.reverse());
}

/** Einfacher Weg ohne Hindernisprüfung: kurzer Stich aus jedem Anschluss, dazwischen ein Knick. */
function fallbackRoute(start: Point, startDir: Direction | undefined, end: Point, endDir?: Direction): Point[] {
  const a = startDir ? { x: start.x + startDir.x * 2 * GRID, y: start.y + startDir.y * 2 * GRID } : start;
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
  const start = endpointPosition(diagram, connection.from);
  const end = endpointPosition(diagram, connection.to);
  const startDir = endpointDirection(diagram, connection.from);
  const endDir = endpointDirection(diagram, connection.to);
  if (connection.waypoints.length === 0) return route({ start, startDir, end, endDir, obstacles, occupied });
  return orthogonalize([start, ...connection.waypoints, end], startDir, endDir);
}

/** Schlüssel eines Bauteilanschlusses; Abzweigpunkte zählen hier nicht (undefined). */
const portKey = (r: Endpoint) => (isJunctionRef(r) ? undefined : endpointKey(r));

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
    // Leitungen am selben Anschluss dürfen ein Stück gemeinsam laufen (Verbindungspunkt),
    // an einem Abzweigpunkt dagegen muss jede Leitung in eine eigene Richtung gehen.
    const mine = new Set([portKey(l.from), portKey(l.to)].filter((k) => k !== undefined));
    const occupied = new Set<string>();
    for (const other of ordered) {
      const path = paths.get(other.id);
      const shares = [other.from, other.to].some((e) => {
        const k = portKey(e);
        return k !== undefined && mine.has(k);
      });
      if (!path || shares) continue;
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
export function branchDots(connections: Connection[], paths: Map<string, Point[]>): Point[] {
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
        const key = portKey(a[ea]);
        if (key === undefined || key !== portKey(b[eb])) continue;
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

/** Radius eines Leitungssprungs. */
const JUMP_RADIUS = 4;

/**
 * Kreuzungen ohne Verbindung: Stellen, an denen ein waagerechtes Teilstück
 * einer Leitung ein senkrechtes einer anderen Leitung schneidet. Je Leitung
 * die Kreuzungspunkte auf ihren waagerechten Teilstücken; dort springt sie.
 */
export function crossings(paths: Map<string, Point[]>): Map<string, Point[]> {
  const horizontal: { id: string; y: number; x1: number; x2: number }[] = [];
  const vertical: { id: string; x: number; y1: number; y2: number }[] = [];
  for (const [id, path] of paths) {
    path.slice(1).forEach((b, i) => {
      const a = path[i]!;
      if (a.y === b.y && a.x !== b.x) horizontal.push({ id, y: a.y, x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x) });
      else if (a.x === b.x && a.y !== b.y) vertical.push({ id, x: a.x, y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y) });
    });
  }
  const out = new Map<string, Point[]>();
  for (const h of horizontal) {
    for (const v of vertical) {
      if (v.id === h.id) continue;
      // Nur echte Kreuzungen, mit Platz für den Bogen; T-Stöße und Ecken zählen nicht.
      if (v.x - JUMP_RADIUS < h.x1 || v.x + JUMP_RADIUS > h.x2 || h.y <= v.y1 || h.y >= v.y2) continue;
      const list = out.get(h.id) ?? [];
      list.push({ x: v.x, y: h.y });
      out.set(h.id, list);
    }
  }
  return out;
}

/**
 * SVG-Pfad eines Linienzugs; an den Punkten in `jumps` (auf waagerechten
 * Teilstücken) wird ein kleiner Bogen nach oben gezeichnet.
 */
export function linePathData(path: Point[], jumps: Point[] = []): string {
  if (path.length === 0) return '';
  let d = `M${path[0]!.x},${path[0]!.y}`;
  path.slice(1).forEach((b, i) => {
    const a = path[i]!;
    if (a.y === b.y && jumps.length) {
      const dir = Math.sign(b.x - a.x);
      const here = jumps
        .filter((p) => p.y === a.y && (p.x - a.x) * dir > 0 && (b.x - p.x) * dir > 0)
        .sort((p, q) => (p.x - q.x) * dir);
      for (const p of here) {
        d += ` L${p.x - dir * JUMP_RADIUS},${p.y} A${JUMP_RADIUS},${JUMP_RADIUS} 0 0 ${dir > 0 ? 1 : 0} ${p.x + dir * JUMP_RADIUS},${p.y}`;
      }
    }
    d += ` L${b.x},${b.y}`;
  });
  return d;
}

// --- Leitungen beim Verschieben mitführen ------------------------------------

/**
 * Knickpunkte, die genau `path` beschreiben. Eine gerade Leitung bekommt
 * einen Punkt in der Mitte, damit sie als selbst geführt gilt (leere Liste
 * hieße „automatisch führen“).
 */
function waypointsFor(path: Point[]): Point[] {
  const inner = path.slice(1, -1).map((p) => ({ ...p }));
  if (inner.length || path.length < 2) return inner;
  const a = path[0]!;
  const b = path[path.length - 1]!;
  if (samePoint(a, b)) return [];
  const snap = (v: number) => Math.round(v / GRID) * GRID;
  return [{ x: a.x === b.x ? a.x : snap((a.x + b.x) / 2), y: a.y === b.y ? a.y : snap((a.y + b.y) / 2) }];
}

/** Die Rasterschritte eines Verlaufs als Kanten, z. B. "10,20-20,20". */
function unitEdges(path: Point[]): string[] {
  const steps = gridSteps(path);
  return steps.slice(1).map((b, i) => {
    const a = steps[i]!;
    const [p, q] = a.x < b.x || (a.x === b.x && a.y < b.y) ? [a, b] : [b, a];
    return `${p.x},${p.y}-${q.x},${q.y}`;
  });
}

/**
 * Läuft der Verlauf durch ein Bauteil oder an dessen Rand entlang? Wie beim
 * Routing zählen alle Rasterpunkte außer den beiden Enden.
 */
function hitsComponent(path: Point[], boxes: Box[]): boolean {
  return gridSteps(path)
    .slice(1, -1)
    .some((p) => boxes.some((b) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY));
}

const isOrthogonal = (path: Point[]) => path.slice(1).every((b, i) => path[i]!.x === b.x || path[i]!.y === b.y);

/** Verlässt die Leitung den Anschluss in seiner Richtung, mindestens einen Rasterschritt weit? */
function leavesProperly(path: Point[], dir: Direction | undefined): boolean {
  if (!dir || path.length < 2) return true;
  const a = path[0]!;
  const b = path[1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sign(dx) === dir.x && Math.sign(dy) === dir.y && Math.abs(dx) + Math.abs(dy) >= GRID;
}

/**
 * Führt den Anfang eines Verlaufs an die neue Anschlusslage `start` nach und
 * lässt den Rest stehen: Das erste Teilstück wandert quer mit, das zweite
 * wird dafür länger oder kürzer. Liefert undefined, wenn das nicht sauber geht.
 */
function followStart(
  path: Point[],
  start: Point,
  dir: Direction | undefined,
  endDir: Direction | undefined,
  avoid: Box[],
  taken: ReadonlySet<string>,
): Point[] | undefined {
  let p = path.map((q) => ({ ...q }));
  const old = p[0]!;
  if (p.length === 2 && !samePoint(old, start)) {
    // Gerade Leitung: in der Mitte zwei Knicke einfügen, damit sie quer nachgeben kann.
    const [a, b] = p as [Point, Point];
    const snap = (v: number) => Math.round(v / GRID) * GRID;
    p =
      a.x === b.x
        ? [a, { x: a.x, y: snap((a.y + b.y) / 2) }, { x: b.x, y: snap((a.y + b.y) / 2) }, b]
        : [a, { x: snap((a.x + b.x) / 2), y: a.y }, { x: snap((a.x + b.x) / 2), y: b.y }, b];
  }
  const dx = start.x - old.x;
  const dy = start.y - old.y;
  const vertical = p[0]!.x === p[1]!.x;
  p[0] = { ...start };
  if (vertical) p[1]!.x += dx;
  else p[1]!.y += dy;
  const ok = (q: Point[]) =>
    q.length >= 2 &&
    isOrthogonal(q) &&
    leavesProperly(q, dir) &&
    leavesProperly([...q].reverse(), endDir) &&
    !hitsComponent(q, avoid) &&
    !unitEdges(q).some((e) => taken.has(e));
  let result = simplify(p);
  if (ok(result)) return result;
  // Der Anschluss ist über den ersten Knick hinausgewandert: kurzer Stich aus
  // dem Anschluss, dann auf kürzestem Weg zurück auf den alten Verlauf.
  if (dir && p.length > 2) {
    const stub = { x: start.x + dir.x * GRID, y: start.y + dir.y * GRID };
    result = orthogonalize([start, stub, ...p.slice(2)], dir);
    if (ok(result)) return result;
  }
  return undefined;
}

/**
 * Hält die Leitungen ruhig, nachdem Bauteile oder Abzweige verschoben,
 * gedreht oder gespiegelt wurden (`before` → `after`).
 *
 * - Leitungen in `internal` wandern als Ganzes mit (`map` auf jeden Punkt).
 * - An Leitungen, deren Ende sich bewegt hat, werden nur die Teilstücke am
 *   Ende nachgeführt; der übrige Verlauf samt Knickpunkten bleibt. Geht das
 *   nicht sauber (Leitung liefe rückwärts oder durch das Bauteil), wird nur
 *   diese Leitung neu geführt.
 * - Alle übrigen automatisch geführten Leitungen behalten ihren bisherigen
 *   Verlauf, statt wegen des verschobenen Bauteils auszuweichen.
 */
export function keepRoutes(
  before: Diagram,
  after: Diagram,
  internal: ReadonlySet<string> = new Set(),
  map: (p: Point) => Point = (p) => p,
): Diagram {
  const oldPaths = routeAll(before);
  const obstacles = obstaclesOf(after);
  const paths = new Map(oldPaths);
  const waypoints = new Map<string, Point[]>();
  const pending: Connection[] = [];
  const sameDir = (a?: Direction, b?: Direction) => a?.x === b?.x && a?.y === b?.y;

  for (const l of after.connections) {
    const oldPath = oldPaths.get(l.id);
    if (!oldPath) continue;
    if (internal.has(l.id)) {
      const mapped = oldPath.map(map);
      paths.set(l.id, mapped);
      waypoints.set(l.id, l.waypoints.length ? l.waypoints.map(map) : waypointsFor(mapped));
      continue;
    }
    const endsMoved = ([l.from, l.to] as const).some(
      (e, i) =>
        !samePoint(endpointPosition(after, e), oldPath[i === 0 ? 0 : oldPath.length - 1]!) ||
        !sameDir(endpointDirection(after, e), endpointDirection(before, e)),
    );
    if (endsMoved) pending.push(l);
    else if (l.waypoints.length === 0) waypoints.set(l.id, waypointsFor(oldPath));
  }

  // Leitungen mit verschobenem Ende einzeln nachführen; keine darf dabei auf
  // einer fremden Leitung zu liegen kommen (sähe verbunden aus).
  const pendingIds = new Set(pending.map((l) => l.id));
  const done = new Set<string>();
  for (const l of pending) {
    done.add(l.id);
    const oldPath = oldPaths.get(l.id)!;
    const start = endpointPosition(after, l.from);
    const end = endpointPosition(after, l.to);
    const startDir = endpointDirection(after, l.from);
    const endDir = endpointDirection(after, l.to);
    const mine = new Set([portKey(l.from), portKey(l.to)].filter((k) => k !== undefined));
    const taken = new Set<string>();
    const occupied = new Set<string>();
    for (const other of after.connections) {
      const path = paths.get(other.id);
      const shares = [other.from, other.to].some((e) => {
        const k = portKey(e);
        return k !== undefined && mine.has(k);
      });
      // Noch nicht nachgeführte Leitungen liegen gleich woanders; sie zählen nicht.
      if (other.id === l.id || !path || shares || (pendingIds.has(other.id) && !done.has(other.id))) continue;
      for (const e of unitEdges(path)) taken.add(e);
      for (const p of gridSteps(path)) occupied.add(`${p.x},${p.y}`);
    }
    const startMoved = !samePoint(start, oldPath[0]!) || !sameDir(startDir, endpointDirection(before, l.from));
    let path: Point[] | undefined = oldPath;
    // Beim ersten Ende darf das andere noch an der alten Stelle hängen; der zweite
    // Schritt führt das andere Ende nach (falls nötig) und prüft den ganzen Verlauf.
    if (startMoved) path = followStart(path, start, startDir, undefined, obstacles, new Set());
    if (path) path = followStart([...path].reverse(), end, endDir, startDir, obstacles, taken)?.reverse();
    // Nicht sauber nachführbar: nur diese Leitung neu führen.
    path ??= route({ start, startDir, end, endDir, obstacles, occupied });
    paths.set(l.id, path);
    waypoints.set(l.id, waypointsFor(path));
  }

  if (waypoints.size === 0) return after;
  return {
    ...after,
    connections: after.connections.map((l) => (waypoints.has(l.id) ? { ...l, waypoints: waypoints.get(l.id)! } : l)),
  };
}
