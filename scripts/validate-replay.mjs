import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { detailedRounds } from "../lib/vlr/performance.ts";
import { replayFrameIndex, replayFrames, replayMarkers } from "../lib/vlr/replay.ts";
import { plausibleWalkingPath, pointAlongPath, replayNavigation, samplePath, traversableSegment, walkableSegment, walkingPath } from "../lib/vlr/navigation.ts";
import { planReplayInterval } from "../lib/vlr/replay-planner.ts";

const corridor = { size: 7, walkable: new Uint8Array(49).fill(1) };
for (let y = 0; y < 5; y++) corridor.walkable[y * 7 + 3] = 0;
const left = { x: 1.5 / 7, y: 1.5 / 7 }, right = { x: 5.5 / 7, y: 1.5 / 7 };
assert(!walkableSegment(corridor, left, right), "A solid wall blocks a direct rotation");
const detour = walkingPath(corridor, left, right);
assert(detour && detour.points.some((point) => point.y > 5 / 7), "Rotation goes around the wall through its opening");
assert.deepEqual(pointAlongPath(detour, 0), left);
assert.deepEqual(pointAlongPath(detour, 1), right);
const corners = { size: 2, walkable: new Uint8Array([1, 0, 0, 1]) };
assert(!walkableSegment(corners, { x: .25, y: .25 }, { x: .75, y: .75 }), "No diagonal corner cutting");
assert.equal(walkingPath(corners, { x: .25, y: .25 }, { x: .75, y: .75 }), null, "Disconnected floors have no fabricated route");
assert.equal(walkingPath(corridor, { x: -.1, y: .2 }, right), null, "Off-map positions do not create straight-line fallbacks");
const bind = replayNavigation("bind");
const hookah = { x: .316, y: .369 }, site = { x: .309, y: .358 };
const drop = walkingPath(bind, hookah, site);
assert(drop && drop.segments.includes("drop") && drop.length < .04, "Hookah window connects to B through a short drop");
assert(!walkableSegment(bind, hookah, site), "The height ledge stays blocked for ordinary walking");
const reverseDrop = walkingPath(bind, site, hookah);
assert(reverseDrop.length > .4 && !reverseDrop.segments.includes("drop"), "A drop cannot be used as a climb in reverse");
assert(!plausibleWalkingPath(bind, reverseDrop, site, hookah, 3), "A long inferred detour cannot be compressed into three seconds");
assert(plausibleWalkingPath(bind, reverseDrop, site, hookah, 30), "Longer observed intervals can accommodate a walking detour");
assert(plausibleWalkingPath(bind, drop, hookah, site, 3));

const marker = (playerId, x, facing = 0) => ({ playerId, x, y: .5, facing });
const fixture = {
  events: [
    { type: "kill", time: 10, killer: "a", victim: "b", weapon: "ab" },
    { type: "kill", time: 20, killer: "a", victim: "c", weapon: "rifle" },
    { type: "kill", time: 20, killer: "a", victim: "d", weapon: "rifle" },
    { type: "plant", time: 30, player: "b" },
  ],
  snapshots: [
    [marker("a", .2, 350), marker("b", .3, null), marker("c", .6), marker("d", .7)],
    [marker("a", .4, 10), marker("c", .5, null), marker("d", .8)],
    [marker("a", .4, 10), marker("c", .5, null), marker("d", .8)],
    [marker("a", .6, 20), marker("b", .9, 90)],
  ],
};
const frames = replayFrames(fixture);
assert.equal(frames.length, 3, "Simultaneous events share one keyframe");
assert.equal(replayFrameIndex(frames, 19.99), 0);
assert.equal(replayFrameIndex(frames, 20), 1);
const mid = replayMarkers(frames, 15);
assert(Math.abs(mid.find((entry) => entry.playerId === "a").x - .3) < 1e-10);
assert.equal(mid.find((entry) => entry.playerId === "a").facing, 360, "Look direction takes the shortest arc");
assert.equal(mid.find((entry) => entry.playerId === "c").dead, false, "No death before its timestamp");
assert.deepEqual(replayMarkers(frames, 15, false), frames[0].markers, "Reduced motion holds recorded positions");
assert.equal(frames[1].markers.find((entry) => entry.playerId === "d").dead, true, "Repeated snapshot cannot undo a simultaneous death");
assert.equal(replayMarkers(frames, 29.99).find((entry) => entry.playerId === "b").x, .3, "Body stays still before resurrection");
assert.equal(replayMarkers(frames, 30).find((entry) => entry.playerId === "b").dead, false);
assert.deepEqual(replayMarkers(frames, 100), frames.at(-1).markers);
assert.deepEqual(replayMarkers([], 10), []);
const unresolved = replayFrames(fixture, "unknown-map");
assert.equal(replayMarkers(unresolved, 15).find((entry) => entry.playerId === "a").x, .2, "Missing geometry holds the observation instead of crossing terrain");
assert.equal(replayMarkers(unresolved, 15).find((entry) => entry.playerId === "a").opacity, 0, "An unknown middle position is not invented");
assert.equal(replayMarkers(unresolved, 19.9).find((entry) => entry.playerId === "a").x, .4, "The next observation fades in at its recorded position");

const portalGrid = { size: 10, walkable: new Uint8Array(100).fill(1), links: [{ id: "one-way", kind: "teleport", from: 21, to: 87 }] };
portalGrid.walkable.fill(0, 40, 50);
const portalPath = walkingPath(portalGrid, { x: .15, y: .25 }, { x: .75, y: .85 });
assert(portalPath.segments.includes("teleport"));
assert.equal(walkingPath(portalGrid, { x: .75, y: .85 }, { x: .15, y: .25 }), null, "One-way TPs cannot run backwards");
for (let i = 0; i <= 200; i++) {
  const point = samplePath(portalPath, i / 200, 10);
  assert(point.y < .4 || point.y > .5, "Teleportation never interpolates across the void");
}
const encounterGrid = { size: 10, walkable: new Uint8Array(100).fill(1), metersToMapUnits: .05 };
const encounterFrom = [{ ...marker("a", .1), dead: false }, { ...marker("e", .5), dead: false }];
const encounterTo = [{ ...marker("a", .9), dead: false }, encounterFrom[1]];
assert.equal(planReplayInterval(encounterGrid, encounterFrom, encounterTo, 10, { a: "one", e: "two" }, new Set()).a.reason, "enemy-conflict", "An unrecorded mid-journey enemy pass-through is uncertain");
assert(planReplayInterval(encounterGrid, encounterFrom, encounterTo, 10, { a: "one", e: "two" }, new Set(["a|e"])).a.route, "A recorded duel can legitimately bring enemies together");
assert(planReplayInterval(encounterGrid, encounterFrom, encounterTo, 10, { a: "one", e: "one" }, new Set()).a.route, "Teammates can cross paths");

const read = async (directory, file) => JSON.parse(await readFile(new URL(`${directory}${file}`, import.meta.url), "utf8"));
const matches = await Promise.all((await readdir(new URL("../data/vlr/", import.meta.url))).filter((file) => file.endsWith(".json")).map((file) => read("../data/vlr/", file)));
let count = 0;
let paths = 0;
for (const file of (await readdir(new URL("../data/tracker-rounds/", import.meta.url))).filter((file) => file.endsWith(".json"))) {
  const tracker = await read("../data/tracker-rounds/", file);
  const match = matches.find((entry) => entry.id === tracker.matchId);
  const map = { ...match.maps.find((entry) => entry.id === tracker.map), tracker };
  for (const round of detailedRounds(match, map)) {
    const timeline = replayFrames(round, map.id, Object.fromEntries(match.players.map((player) => [player.id, player.teamId])));
    const grid = replayNavigation(map.id);
    assert(grid, `${file}: navigation is available`);
    if (map.id === "bind" && round.number === 1) {
      const start = timeline.find((frame) => frame.time === 13);
      const end = timeline.find((frame) => frame.time === 27);
      for (const player of ["i-wonder-why", "gusta"]) {
        const from = start.markers.find((entry) => entry.playerId === player);
        const to = end.markers.find((entry) => entry.playerId === player);
        const route = start.paths[player];
        assert(!walkableSegment(grid, from, to), `${player}: video regression crosses the central Bind void in a straight line`);
        assert(route && route.length > Math.hypot(to.x - from.x, to.y - from.y) * 1.2, `${player}: rotation follows the longer real corridor`);
      }
      const beforeDeath = timeline.find((frame) => frame.time === 33);
      const death = timeline.find((frame) => frame.time === 36);
      const brimstone = beforeDeath.paths.maopyk;
      assert(brimstone && brimstone.segments.includes("drop") && brimstone.length < .04, "Brimstone video regression: Hookah drop instead of running around B");
      assert(death.markers.find((entry) => entry.playerId === "maopyk").dead, "Brimstone still dies at the recorded instant");
      assert(!replayMarkers(timeline, 35.99).find((entry) => entry.playerId === "maopyk").dead, "The drop does not anticipate the death");
    }
    if (map.id === "bind" && round.number === 16) {
      assert(timeline.find((frame) => frame.time === 26).paths["israel-games"].segments.includes("teleport"), "Phoenix rotates through the map TP instead of the defenders' route");
      assert(timeline.find((frame) => frame.time === 45).paths["persa-faz-22"].segments.includes("drop"), "Chamber leaves A Heaven through its drop");
    }
    if (map.id === "bind" && round.number === 17) assert(timeline.find((frame) => frame.time === 69).paths["i-wonder-why"].segments.includes("teleport"), "Clove reaches A Bath through the TP instead of walking through Fade");
    for (const [index, frame] of timeline.entries()) {
      for (const route of Object.values(frame.paths)) if (route) {
        for (let i = 1; i < route.points.length; i++) assert(traversableSegment(grid, route.points[i - 1], route.points[i], route.segments[i - 1]), `${file} R${round.number}: only walking floors or explicitly mapped directional drops`);
        paths++;
      }
      assert.deepEqual(replayMarkers(timeline, frame.time), frame.markers, `${file} R${round.number}: exact recorded instant`);
      for (const event of round.events.filter((event) => event.time === frame.time && (event.type === "kill" || event.type === "death"))) {
        const victim = frame.markers.find((entry) => entry.playerId === event.victim);
        if (victim) assert(victim.dead, `${file} R${round.number}: recorded victim is dead`);
      }
      const nextTime = timeline[index + 1]?.time ?? frame.time;
      for (const entry of replayMarkers(timeline, (frame.time + nextTime) / 2)) {
        assert(Number.isFinite(entry.x) && Number.isFinite(entry.y));
        assert(entry.x > 0 && entry.x < 1 && entry.y > 0 && entry.y < 1);
        if (entry.dead) assert.deepEqual(entry, frame.markers.find((other) => other.playerId === entry.playerId), "No moving bodies");
        else if (frame.paths[entry.playerId] && !walkableSegment(grid, entry, entry)) {
          const route = frame.paths[entry.playerId];
          if (route.length === 0) continue; // Unchanged recorded position, not an inferred displacement.
          assert(route.points.slice(1).some((to, i) => {
            const from = route.points[i];
            return route.segments[i] === "drop" && Math.abs(Math.hypot(entry.x - from.x, entry.y - from.y) + Math.hypot(entry.x - to.x, entry.y - to.y) - Math.hypot(to.x - from.x, to.y - from.y)) < 1e-8;
          }), `${file}: a player off the walking floor must be on a mapped drop`);
        }
      }
    }
    count++;
  }
}
console.log(`Replay: ${count} rounds, ${paths} routes verified; directed TPs, Heaven/Hookah drops, unknown gaps, encounter coherence, timing, deaths and reduced motion passed.`);
