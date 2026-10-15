import { plausibleWalkingPath, pointAlongPath, walkableSegment, walkingPath, type NavigationGrid, type ReplayPath } from "./navigation.ts";
import type { ReplayMarker } from "./replay";

export type RouteReason = "floor" | "height" | "portal" | "missing-geometry" | "missing-observation" | "excessive-detour" | "insufficient-time" | "enemy-conflict";
export type RouteDecision = { reason: RouteReason; route: ReplayPath | null };

function reason(route: ReplayPath): RouteReason {
  return route.segments.includes("teleport") ? "portal" : route.segments.includes("drop") ? "height" : "floor";
}

function valid(grid: NavigationGrid, route: ReplayPath, from: ReplayMarker, to: ReplayMarker, seconds: number): RouteDecision {
  const direct = Math.hypot(to.x - from.x, to.y - from.y);
  const meter = grid.metersToMapUnits ?? .007;
  // Tiny observed shifts across an unmapped ledge/crate must not become a lap
  // around the site, even if a sparse event log leaves enough time for one.
  if (!route.segments.includes("teleport") && direct < meter * 9 && route.length > Math.max(meter * 18, direct * 4)) return { reason: "excessive-detour", route: null };
  if (!plausibleWalkingPath(grid, route, from, to, seconds) || (route.length > meter * 3 && route.length > meter * 8 * seconds)) return { reason: "insufficient-time", route: null };
  return { reason: reason(route), route };
}

export function unexpectedEncounter(grid: NavigationGrid, id: string, route: ReplayPath, from: ReplayMarker[], to: ReplayMarker[], seconds: number, teams: Record<string, string>, duels: Set<string>, baseline: Record<string, RouteDecision>): boolean {
  const meter = grid.metersToMapUnits ?? .007;
  const start = from.find((entry) => entry.playerId === id)!;
  const end = to.find((entry) => entry.playerId === id)!;
  if (route.length < meter * 6) return false;
  for (const enemy of from) {
    if (enemy.dead || !teams[id] || !teams[enemy.playerId] || teams[id] === teams[enemy.playerId] || duels.has(`${id}|${enemy.playerId}`)) continue;
    const enemyEnd = to.find((entry) => entry.playerId === enemy.playerId);
    if (!enemyEnd) continue;
    const enemyRoute = baseline[enemy.playerId]?.route;
    if (!enemyRoute && Math.hypot(enemy.x - enemyEnd.x, enemy.y - enemyEnd.y) > meter * 2) continue;
    const samples = Math.min(100, Math.max(12, Math.ceil(seconds * 4)));
    for (let sample = 1; sample < samples; sample++) {
      const progress = sample / samples;
      const point = pointAlongPath(route, progress, seconds);
      // Contacts at observed endpoints can be real fights; only reject
      // unsupported pass-throughs in the middle of an inferred journey.
      if (Math.hypot(point.x - start.x, point.y - start.y) < meter * 3 || Math.hypot(point.x - end.x, point.y - end.y) < meter * 3) continue;
      const other = enemyRoute ? pointAlongPath(enemyRoute, progress, seconds) : enemy;
      if (Math.hypot(point.x - other.x, point.y - other.y) < meter * 2 && walkableSegment(grid, point, other)) return true;
    }
  }
  return false;
}

export function planReplayInterval(grid: NavigationGrid, from: ReplayMarker[], to: ReplayMarker[], seconds: number, teams: Record<string, string>, duels: Set<string>): Record<string, RouteDecision> {
  const decisions: Record<string, RouteDecision> = {};
  const alternatives: Record<string, ReplayPath> = {};
  const hasPortals = grid.links?.some((link) => link.kind === "teleport");
  for (const marker of from) {
    const target = to.find((entry) => entry.playerId === marker.playerId);
    if (!target || marker.dead) continue;
    const walk = walkingPath(grid, marker, target, false);
    const fastest = hasPortals ? walkingPath(grid, marker, target) : walk;
    const walking = walk ? valid(grid, walk, marker, target, seconds) : { reason: "missing-geometry" as const, route: null };
    const portal = fastest?.segments.includes("teleport") ? valid(grid, fastest, marker, target, seconds) : null;
    if (portal?.route) alternatives[marker.playerId] = portal.route;
    // Do not assume a TP just because it exists. Prefer it when the observed
    // endpoints strongly favour it, or walking cannot fit the recorded time.
    decisions[marker.playerId] = portal?.route && (!walking.route || portal.route.length < walking.route.length * .7) ? portal : walking;
  }

  let baseline = { ...decisions };
  const conflict = (id: string, route: ReplayPath) => unexpectedEncounter(grid, id, route, from, to, seconds, teams, duels, baseline);
  // A TP alternative can change another player's projected encounter. Settle
  // the joint reconstruction, demoting any remaining conflicts to unknown.
  for (let pass = 0; pass <= from.length * 2; pass++) {
    baseline = { ...decisions };
    let changed = false;
    for (const [id, decision] of Object.entries(decisions)) {
      if (!decision.route || !conflict(id, decision.route)) continue;
      const alternative = alternatives[id];
      decisions[id] = alternative && !conflict(id, alternative) ? { reason: "portal", route: alternative } : { reason: "enemy-conflict", route: null };
      changed = true;
    }
    if (!changed) break;
  }
  return decisions;
}
