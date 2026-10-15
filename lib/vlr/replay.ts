import type { DetailedRound, MapMarker } from "./performance";
import { pointAlongPath, replayNavigation, walkingPath, type ReplayPath } from "./navigation.ts";

export type ReplayMarker = MapMarker & { dead: boolean; opacity?: number };
export type ReplayFrame = { time: number; markers: ReplayMarker[]; eventIndex: number; paths?: Record<string, ReplayPath | null> };

// Events in the same second share a keyframe. Keep all their deaths, even when
// Tracker repeats a snapshot that still shows an earlier victim as alive.
export function replayFrames(round: DetailedRound, mapId?: string): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const known = new Map<string, ReplayMarker>();
  const ordered = round.events.map((event, index) => ({ event, index })).sort((a, b) => a.event.time - b.event.time || a.index - b.index);
  for (let cursor = 0; cursor < ordered.length;) {
    const time = ordered[cursor].event.time;
    const deaths = new Set<string>();
    let eventIndex = ordered[cursor].index;
    while (cursor < ordered.length && ordered[cursor].event.time === time) {
      const { event, index } = ordered[cursor++];
      for (const marker of round.snapshots?.[index] ?? []) {
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
    frames.push({ time, eventIndex, markers: [...known.values()] });
  }
  if (mapId) {
    const grid = replayNavigation(mapId);
    frames.forEach((frame, index) => {
      frame.paths = {};
      for (const marker of frame.markers) {
        const target = frames[index + 1]?.markers.find((entry) => entry.playerId === marker.playerId);
        if (target && !marker.dead) frame.paths[marker.playerId] = grid ? walkingPath(grid, marker, target) : null;
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
    if (from.paths) {
      const route = from.paths[marker.playerId];
      // An unresolvable/off-map observation must never become a straight-line
      // flight through walls. Hold, fade, then show the next recorded position.
      if (!route) return { ...marker, opacity: 1 - Math.max(0, (progress - .8) / .2) };
      return { ...marker, ...pointAlongPath(route, progress), facing: angle };
    }
    return { ...marker, x: marker.x + (target.x - marker.x) * progress, y: marker.y + (target.y - marker.y) * progress, facing: angle };
  });
}
