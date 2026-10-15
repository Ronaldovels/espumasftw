import navigation from "../../data/replay-navigation.json" with { type: "json" };

export type Point = { x: number; y: number };
export type MovementKind = "walk" | "drop" | "teleport";
export type NavigationLink = { id: string; kind: "drop" | "teleport"; from: number; to: number };
export type NavigationGrid = { size: number; walkable: Uint8Array; metersToMapUnits?: number; links?: NavigationLink[] };
export type ReplayPath = { points: Point[]; distances: number[]; length: number; segments: MovementKind[] };
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

function path(points: Point[], segments: MovementKind[] = points.slice(1).map(() => "walk"), teleportWeight = .009): ReplayPath {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + (segments[i - 1] === "teleport" ? teleportWeight : Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)));
  return { points, distances, length: distances.at(-1) ?? 0, segments };
}

export function walkingPath(grid: NavigationGrid, source: Point, destination: Point, allowTeleport = true): ReplayPath | null {
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
  const teleportCost = (grid.metersToMapUnits ?? .006) * 1.5 * size;
  const portals = allowTeleport ? (grid.links ?? []).filter((link) => link.kind === "teleport") : [];
  const distanceBetween = (a: number, b: number) => Math.hypot(a % size - b % size, Math.floor(a / size) - Math.floor(b / size));
  // Relaxed portal graph supplies an admissible heuristic even when a path
  // uses two one-way teleporters. Euclidean distance alone overestimates it.
  const portalBounds = portals.map((link) => teleportCost + distanceBetween(link.to, end));
  for (let pass = 0; pass < portals.length; pass++) portals.forEach((link, i) => {
    portals.forEach((next, j) => { portalBounds[i] = Math.min(portalBounds[i], teleportCost + distanceBetween(link.to, next.from) + portalBounds[j]); });
  });
  const heuristic = (cell: number) => {
    let cost = distanceBetween(cell, end);
    portals.forEach((link, i) => { cost = Math.min(cost, distanceBetween(cell, link.from) + portalBounds[i]); });
    return cost;
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
      if (link.from !== cell || closed[link.to] || (!allowTeleport && link.kind === "teleport")) continue;
      const cost = costs[cell] + (link.kind === "teleport" ? teleportCost : Math.hypot(link.to % size - x, Math.floor(link.to / size) - y));
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
  const links = cells.slice(1).map((entry) => previousLink[entry] >= 0 ? grid.links![previousLink[entry]].kind : null);
  points[0] = from; points[points.length - 1] = to;
  // Remove grid stair-steps only when the shortcut is itself collision-free.
  const simplified = [points[0]];
  const segments: MovementKind[] = [];
  for (let index = 0; index < points.length - 1;) {
    if (links[index]) {
      simplified.push(points[index + 1]); segments.push(links[index]!); index++;
      continue;
    }
    let next = index + 1;
    while (next + 1 < points.length && !links[next] && walkableSegment(grid, points[index], points[next + 1])) next++;
    simplified.push(points[next]); segments.push("walk"); index = next;
  }
  return path(simplified, segments, teleportCost / size);
}

export function traversableSegment(grid: NavigationGrid, from: Point, to: Point, kind: MovementKind): boolean {
  if (kind === "walk") return walkableSegment(grid, from, to);
  const cell = (point: Point) => Math.floor(point.y * grid.size) * grid.size + Math.floor(point.x * grid.size);
  return grid.links?.some((link) => link.kind === kind && link.from === cell(from) && link.to === cell(to)) ?? false;
}

// Only inferred detours are rejected. A short observed displacement should not
// become a sprint around the map when a height connection is not yet mapped.
export function plausibleWalkingPath(grid: NavigationGrid, route: ReplayPath, from: Point, to: Point, seconds: number): boolean {
  const direct = Math.hypot(to.x - from.x, to.y - from.y);
  if (!grid.metersToMapUnits || route.length - direct < grid.metersToMapUnits * 5) return true;
  // A generous 8m/s reconstruction budget, not a claim about an agent's speed.
  return route.length <= grid.metersToMapUnits * 8 * seconds;
}

export function samplePath(route: ReplayPath, progress: number, seconds = 1): Point & { opacity: number; movement: MovementKind } {
  if (progress <= 0) return { x: route.points[0].x, y: route.points[0].y, opacity: 1, movement: route.segments[0] ?? "walk" };
  if (progress >= 1) return { x: route.points.at(-1)!.x, y: route.points.at(-1)!.y, opacity: 1, movement: route.segments.at(-1) ?? "walk" };
  const teleports = route.segments.filter((kind) => kind === "teleport").length;
  const portalTime = Math.min(.35, seconds / (teleports + 1));
  const walkingLength = route.segments.reduce((sum, kind, i) => sum + (kind === "teleport" ? 0 : route.distances[i + 1] - route.distances[i]), 0);
  const walkingTime = Math.max(0, seconds - portalTime * teleports);
  let elapsed = progress * seconds;
  for (let i = 0; i < route.segments.length; i++) {
    const kind = route.segments[i];
    const duration = kind === "teleport" ? portalTime : walkingTime * (route.distances[i + 1] - route.distances[i]) / (walkingLength || 1);
    if (elapsed > duration && i < route.segments.length - 1) { elapsed -= duration; continue; }
    const amount = Math.max(0, Math.min(1, elapsed / (duration || 1)));
    const from = route.points[i], to = route.points[i + 1];
    if (kind === "teleport") return { x: amount < .5 ? from.x : to.x, y: amount < .5 ? from.y : to.y, opacity: Math.abs(amount * 2 - 1), movement: kind };
    return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount, opacity: 1, movement: kind };
  }
  return { x: route.points.at(-1)!.x, y: route.points.at(-1)!.y, opacity: 1, movement: "walk" };
}

export function pointAlongPath(route: ReplayPath, progress: number, seconds = 1): Point {
  const { x, y } = samplePath(route, progress, seconds);
  return { x, y };
}
