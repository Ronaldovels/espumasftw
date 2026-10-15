import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { detailedRounds } from "../lib/vlr/performance.ts";
import { replayFrameIndex, replayFrames, replayMarkers } from "../lib/vlr/replay.ts";

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

const read = async (directory, file) => JSON.parse(await readFile(new URL(`${directory}${file}`, import.meta.url), "utf8"));
const matches = await Promise.all((await readdir(new URL("../data/vlr/", import.meta.url))).filter((file) => file.endsWith(".json")).map((file) => read("../data/vlr/", file)));
let count = 0;
for (const file of (await readdir(new URL("../data/tracker-rounds/", import.meta.url))).filter((file) => file.endsWith(".json"))) {
  const tracker = await read("../data/tracker-rounds/", file);
  const match = matches.find((entry) => entry.id === tracker.matchId);
  const map = { ...match.maps.find((entry) => entry.id === tracker.map), tracker };
  for (const round of detailedRounds(match, map)) {
    const timeline = replayFrames(round);
    for (const [index, frame] of timeline.entries()) {
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
      }
    }
    count++;
  }
}
console.log(`Replay: ${count} rounds verified; interpolation, event timing, simultaneous deaths, resurrection and reduced motion passed.`);
