import type { DetailedRound, MapMarker } from "./performance";
import { replayNavigation, samplePath, type MovementKind, type ReplayPath } from "./navigation.ts";
import { planReplayInterval, type RouteDecision } from "./replay-planner.ts";

export type ReplayMarker = MapMarker & { dead: boolean; opacity?: number; movement?: MovementKind | "unknown" };
export type ReplayFrame = { time: number; markers: ReplayMarker[]; eventIndex: number; paths?: Record<string, ReplayPath | null>; decisions?: Record<string, RouteDecision>; observedPlayers: string[] };

// Events in the same second share a keyframe. Keep all their deaths, even when
// Tracker repeats a snapshot that still shows an earlier victim as alive.
export function replayFrames(round: DetailedRound, mapId?: string, teams: Record<string, string> = {}): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const known = new Map<string, ReplayMarker>();
  const ordered = round.events.map((event, index) => ({ event, index })).sort((a, b) => a.event.time - b.event.time || a.index - b.index);
  for (let cursor = 0; cursor < ordered.length;) {
    const time = ordered[cursor].event.time;
    const deaths = new Set<string>();
    const observed = new Set<string>();
    let eventIndex = ordered[cursor].index;
    while (cursor < ordered.length && ordered[cursor].event.time === time) {
      const { event, index } = ordered[cursor++];
      for (const marker of round.snapshots?.[index] ?? []) {
        observed.add(marker.playerId);
        // A later live observation can represent a resurrection (e.g. Clove).
        known.set(marker.playerId, { ...marker, dead: marker.facing === null });
      }
      if (event.type === "kill" || event.type === "death") deaths.add(event.victim);
      eventIndex = index;
    }
    for (const id of deaths) {
      const marker = known.get(id);
      if (marker) known.set(id, { ...marker, dead: true, facing: null });
    }
    frames.push({ time, eventIndex, markers: [...known.values()], observedPlayers: [...observed] });
  }
  if (mapId) {
    const grid = replayNavigation(mapId);
    frames.forEach((frame, index) => {
      frame.paths = {};
      const next = frames[index + 1];
      if (!next) return;
      const duels = new Set<string>();
      for (const event of round.events) if (event.type === "kill" && (event.time === frame.time || event.time === next.time)) {
        duels.add(`${event.killer}|${event.victim}`); duels.add(`${event.victim}|${event.killer}`);
      }
      const confirmed = frame.markers.filter((marker) => frame.observedPlayers.includes(marker.playerId) && next.observedPlayers.includes(marker.playerId));
      frame.decisions = grid ? planReplayInterval(grid, confirmed, next.markers, next.time - frame.time, teams, duels) : {};
      for (const marker of frame.markers) if (!marker.dead && next.markers.some((entry) => entry.playerId === marker.playerId)) {
        if (!frame.decisions[marker.playerId]) frame.decisions[marker.playerId] = { reason: grid ? "missing-observation" : "missing-geometry", route: null };
        frame.paths[marker.playerId] = frame.decisions[marker.playerId]?.route ?? null;
      }
    });
  }
  return frames;
}

export function replayFrameIndex(frames: ReplayFrame[], time: number): number {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].time <= time) low = mid;
    else high = mid - 1;
  }
  return low;
}

export function replayMarkers(frames: ReplayFrame[], time: number, smooth = true): ReplayMarker[] {
  if (!frames.length) return [];
  const index = replayFrameIndex(frames, time);
  const from = frames[index];
  const to = frames[index + 1];
  if (!smooth || !to || time <= from.time) return from.markers;
  const progress = Math.min(1, (time - from.time) / (to.time - from.time));
  return from.markers.map((marker) => {
    const target = to.markers.find((entry) => entry.playerId === marker.playerId);
    // Bodies stay where they fell. Revivals and newly observed players appear
    // only at the next recorded instant, never in anticipation of that event.
    if (!target || marker.dead) return marker;
    const angle = marker.facing !== null && target.facing !== null
      ? marker.facing + (((target.facing - marker.facing + 540) % 360) - 180) * progress
      : marker.facing;
    if (Math.hypot(target.x - marker.x, target.y - marker.y) < .0005 && target.dead === marker.dead) return { ...marker, facing: angle };
    if (from.paths) {
      const route = from.paths[marker.playerId];
      // Uncertain gaps are not animations of a made-up route. Fade the last
      // observation, then reveal the next one without advancing death state.
      if (!route) {
        const elapsed = time - from.time, remaining = to.time - time;
        const fade = Math.min(.6, (to.time - from.time) / 3);
        const arrival = remaining < fade;
        return { ...marker, x: arrival ? target.x : marker.x, y: arrival ? target.y : marker.y, movement: "unknown", opacity: arrival ? 1 - remaining / fade : Math.max(0, 1 - elapsed / fade) };
      }
      return { ...marker, ...samplePath(route, progress, to.time - from.time), facing: angle };
    }
    return { ...marker, x: marker.x + (target.x - marker.x) * progress, y: marker.y + (target.y - marker.y) * progress, facing: angle };
  });
}
