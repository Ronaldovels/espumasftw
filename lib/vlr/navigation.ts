import navigation from "../../data/replay-navigation.json" with { type: "json" };

export type Point = { x: number; y: number };
export type NavigationLink = { id: string; kind: "drop"; from: number; to: number };
export type NavigationGrid = { size: number; walkable: Uint8Array; metersToMapUnits?: number; links?: NavigationLink[] };
export type ReplayPath = { points: Point[]; distances: number[]; length: number; segments: ("walk" | "drop")[] };
const grids = new Map<string, NavigationGrid>();

export function replayNavigation(mapId: string): NavigationGrid | null {
  const cached = grids.get(mapId);
  if (cached) return cached;
  const source = (navigation.maps as Record<string, { rows: string[]; metersToMapUnits: number; links?: NavigationLink[] }>)[mapId];
  if (!source) return null;
  const size = navigation.size;
  const walkable = new Uint8Array(size * size);
  source.rows.forEach((row, y) => {
    for (const span of row.split(",").filter(Boolean)) {
      const [start, end] = span.split("-").map(Number);
      walkable.fill(1, y * size + start, y * size + end + 1);
    }
  });
  const grid = { size, walkable, metersToMapUnits: source.metersToMapUnits, links: source.links };
  grids.set(mapId, grid);
  return grid;
}

// Supercover traversal checks every crossed cell, including both sides when a
// segment touches a corner. Diagonal movement must not cut through thin walls.
export function walkableSegment(grid: NavigationGrid, from: Point, to: Point): boolean {
  const { size, walkable } = grid;
  let x = Math.floor(from.x * size), y = Math.floor(from.y * size);
  const endX = Math.floor(to.x * size), endY = Math.floor(to.y * size);
  const clear = (cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < size && cy < size && walkable[cy * size + cx] === 1;
  if (!clear(x, y) || !clear(endX, endY)) return false;
  const dx = (to.x - from.x) * size, dy = (to.y - from.y) * size;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const deltaX = dx ? Math.abs(1 / dx) : Infinity, deltaY = dy ? Math.abs(1 / dy) : Infinity;
  let maxX = dx ? ((stepX > 0 ? x + 1 : x) - from.x * size) / dx : Infinity;
  let maxY = dy ? ((stepY > 0 ? y + 1 : y) - from.y * size) / dy : Infinity;
  while (x !== endX || y !== endY) {
    if (Math.abs(maxX - maxY) < 1e-10) {
      if (!clear(x + stepX, y) || !clear(x, y + stepY)) return false;
      x += stepX; y += stepY; maxX += deltaX; maxY += deltaY;
    } else if (maxX < maxY) { x += stepX; maxX += deltaX; }
    else { y += stepY; maxY += deltaY; }
    if (!clear(x, y)) return false;
  }
  return true;
}

// Tracker coordinates can land on a wall outline or crate edge. Correct only
// nearby offsets (six grid cells per axis); never snap across a large void.
function anchor(grid: NavigationGrid, point: Point): Point | null {
  const { size, walkable } = grid;
  const x = Math.floor(point.x * size), y = Math.floor(point.y * size);
  if (x < 0 || y < 0 || x >= size || y >= size) return null;
  if (walkable[y * size + x]) return point;
  for (let radius = 1; radius <= 6; radius++) {
    let best: Point | null = null, distance = Infinity;
    for (let cy = Math.max(0, y - radius); cy <= Math.min(size - 1, y + radius); cy++) {
      for (let cx = Math.max(0, x - radius); cx <= Math.min(size - 1, x + radius); cx++) {
        if (!walkable[cy * size + cx]) continue;
        const candidate = { x: (cx + .5) / size, y: (cy + .5) / size };
        const length = Math.hypot(candidate.x - point.x, candidate.y - point.y);
        if (length < distance) { best = candidate; distance = length; }
      }
    }
    if (best) return best;
  }
  return null;
}

class Frontier {
  private heap: { cell: number; score: number }[] = [];
  push(cell: number, score: number) {
    const entry = { cell, score };
    let index = this.heap.length;
    this.heap.push(entry);
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.heap[parent].score <= score) break;
      this.heap[index] = this.heap[parent]; index = parent;
    }
    this.heap[index] = entry;
  }
  pop(): number | undefined {
    const first = this.heap[0];
    const tail = this.heap.pop();
    if (!first || !tail) return undefined;
    if (this.heap.length) {
      let index = 0;
      while (index * 2 + 1 < this.heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.heap.length && this.heap[child + 1].score < this.heap[child].score) child++;
        if (this.heap[child].score >= tail.score) break;
        this.heap[index] = this.heap[child]; index = child;
      }
      this.heap[index] = tail;
    }
    return first.cell;
  }
}

function path(points: Point[], segments: ("walk" | "drop")[] = points.slice(1).map(() => "walk")): ReplayPath {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
  return { points, distances, length: distances.at(-1) ?? 0, segments };
}

export function walkingPath(grid: NavigationGrid, source: Point, destination: Point): ReplayPath | null {
  const from = anchor(grid, source), to = anchor(grid, destination);
  if (!from || !to) return null;
  if (walkableSegment(grid, from, to)) return path([from, to]);
  const { size, walkable } = grid;
  const start = Math.floor(from.y * size) * size + Math.floor(from.x * size);
  const end = Math.floor(to.y * size) * size + Math.floor(to.x * size);
  const costs = new Float64Array(walkable.length).fill(Infinity);
  const previous = new Int32Array(walkable.length).fill(-1);
  const previousLink = new Int16Array(walkable.length).fill(-1);
  const closed = new Uint8Array(walkable.length);
  const heuristic = (cell: number) => {
    const dx = Math.abs(cell % size - end % size), dy = Math.abs(Math.floor(cell / size) - Math.floor(end / size));
    return Math.hypot(dx, dy);
  };
  const frontier = new Frontier();
  costs[start] = 0;
  frontier.push(start, heuristic(start));
  let cell: number | undefined;
  while ((cell = frontier.pop()) !== undefined) {
    if (closed[cell]) continue;
    if (cell === end) break;
    closed[cell] = 1;
    const x = cell % size, y = Math.floor(cell / size);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || x + dx < 0 || y + dy < 0 || x + dx >= size || y + dy >= size) continue;
      const next = cell + dy * size + dx;
      if (!walkable[next] || closed[next]) continue;
      if (dx && dy && (!walkable[cell + dx] || !walkable[cell + dy * size])) continue;
      const cost = costs[cell] + (dx && dy ? Math.SQRT2 : 1);
      if (cost >= costs[next]) continue;
      costs[next] = cost; previous[next] = cell; previousLink[next] = -1;
      frontier.push(next, cost + heuristic(next));
    }
    // Ledges/windows connect floors at different heights. These edges are
    // directional; adding a drop does not make its wall climbable in reverse.
    for (const [index, link] of (grid.links ?? []).entries()) {
      if (link.from !== cell || closed[link.to]) continue;
      const cost = costs[cell] + Math.hypot(link.to % size - x, Math.floor(link.to / size) - y);
      if (cost >= costs[link.to]) continue;
      costs[link.to] = cost; previous[link.to] = cell; previousLink[link.to] = index;
      frontier.push(link.to, cost + heuristic(link.to));
    }
  }
  if (previous[end] < 0) return null;
  const cells = [end];
  while (cells.at(-1) !== start) cells.push(previous[cells.at(-1)!]);
  cells.reverse();
  const points = cells.map((entry) => ({ x: (entry % size + .5) / size, y: (Math.floor(entry / size) + .5) / size }));
  const drops = cells.slice(1).map((entry) => previousLink[entry] >= 0);
  points[0] = from; points[points.length - 1] = to;
  // Remove grid stair-steps only when the shortcut is itself collision-free.
  const simplified = [points[0]];
  const segments: ("walk" | "drop")[] = [];
  for (let index = 0; index < points.length - 1;) {
    if (drops[index]) {
      simplified.push(points[index + 1]); segments.push("drop"); index++;
      continue;
    }
    let next = index + 1;
    while (next + 1 < points.length && !drops[next] && walkableSegment(grid, points[index], points[next + 1])) next++;
    simplified.push(points[next]); segments.push("walk"); index = next;
  }
  return path(simplified, segments);
}

export function traversableSegment(grid: NavigationGrid, from: Point, to: Point, kind: "walk" | "drop"): boolean {
  if (kind === "walk") return walkableSegment(grid, from, to);
  const cell = (point: Point) => Math.floor(point.y * grid.size) * grid.size + Math.floor(point.x * grid.size);
  return grid.links?.some((link) => link.from === cell(from) && link.to === cell(to)) ?? false;
}

// Only inferred detours are rejected. A short observed displacement should not
// become a sprint around the map when a height connection is not yet mapped.
export function plausibleWalkingPath(grid: NavigationGrid, route: ReplayPath, from: Point, to: Point, seconds: number): boolean {
  const direct = Math.hypot(to.x - from.x, to.y - from.y);
  if (!grid.metersToMapUnits || route.length - direct < grid.metersToMapUnits * 5) return true;
  // A generous 8m/s reconstruction budget, not a claim about an agent's speed.
  return route.length <= grid.metersToMapUnits * 8 * seconds;
}

export function pointAlongPath(route: ReplayPath, progress: number): Point {
  if (progress <= 0) return route.points[0];
  if (progress >= 1) return route.points[route.points.length - 1];
  const distance = Math.max(0, Math.min(1, progress)) * route.length;
  let index = 1;
  while (index < route.points.length - 1 && route.distances[index] < distance) index++;
  const from = route.points[index - 1], to = route.points[index];
  const amount = (distance - route.distances[index - 1]) / (route.distances[index] - route.distances[index - 1] || 1);
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}
