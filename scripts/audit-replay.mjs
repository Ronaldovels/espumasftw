import assert from "node:assert/strict";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { detailedRounds } from "../lib/vlr/performance.ts";
import { replayFrames, replayMarkers } from "../lib/vlr/replay.ts";
import { replayNavigation, samplePath, traversableSegment } from "../lib/vlr/navigation.ts";
import { unexpectedEncounter } from "../lib/vlr/replay-planner.ts";

const read = async (dir, file) => JSON.parse(await readFile(new URL(`${dir}${file}`, import.meta.url), "utf8"));
const matches = await Promise.all((await readdir(new URL("../data/vlr/", import.meta.url))).filter((file) => file.endsWith(".json")).map((file) => read("../data/vlr/", file)));
const report = { rounds: [], totals: {}, violations: [] };
for (const file of (await readdir(new URL("../data/tracker-rounds/", import.meta.url))).filter((file) => file.endsWith(".json")).sort()) {
  const tracker = await read("../data/tracker-rounds/", file);
  const match = matches.find((entry) => entry.id === tracker.matchId);
  const map = { ...match.maps.find((entry) => entry.id === tracker.map), tracker };
  const grid = replayNavigation(map.id);
  const teams = Object.fromEntries(match.players.map((player) => [player.id, player.teamId]));
  for (const round of detailedRounds(match, map)) {
    const frames = replayFrames(round, map.id, teams);
    const entry = { match: match.id, map: map.id, round: round.number, counts: {}, transitions: [] };
    for (let index = 0; index < frames.length - 1; index++) {
      const from = frames[index], to = frames[index + 1], seconds = to.time - from.time;
      const confirmed = from.markers.filter((marker) => from.observedPlayers.includes(marker.playerId) && to.observedPlayers.includes(marker.playerId));
      const duels = new Set();
      for (const event of round.events) if (event.type === "kill" && (event.time === from.time || event.time === to.time)) {
        duels.add(`${event.killer}|${event.victim}`); duels.add(`${event.victim}|${event.killer}`);
      }
      for (const [id, decision] of Object.entries(from.decisions ?? {})) {
        const start = from.markers.find((marker) => marker.playerId === id), end = to.markers.find((marker) => marker.playerId === id);
        if (Math.hypot(start.x - end.x, start.y - end.y) < .0005) continue;
        const route = decision.route;
        entry.counts[decision.reason] = (entry.counts[decision.reason] ?? 0) + 1;
        report.totals[decision.reason] = (report.totals[decision.reason] ?? 0) + 1;
        entry.transitions.push({ player: id, name: match.players.find((player) => player.id === id).name, team: teams[id], from: from.time, to: to.time, start, end, reason: decision.reason, route });
        const check = (ok, message) => { if (!ok) report.violations.push(`${file} R${round.number} ${id} ${from.time}–${to.time}: ${message}`); };
        if (!route) {
          const middle = replayMarkers(frames, (from.time + to.time) / 2).find((marker) => marker.playerId === id);
          check(middle.opacity === 0, "unknown intermediate positions must not be shown as recorded movement");
          continue;
        }
        for (let i = 1; i < route.points.length; i++) check(traversableSegment(grid, route.points[i - 1], route.points[i], route.segments[i - 1]), "invalid floor, drop or portal direction");
        check(!unexpectedEncounter(grid, id, route, confirmed, to.markers, seconds, teams, duels, from.decisions), "unsupported projected encounter remains");
        for (let sample = 1; sample < 40; sample++) {
          const point = samplePath(route, sample / 40, seconds);
          check(Number.isFinite(point.x) && Number.isFinite(point.y) && point.opacity >= 0 && point.opacity <= 1, "invalid interpolated position");
          if (point.movement === "teleport") check(route.points.some((end, i) => route.segments[i] === "teleport" && (Math.hypot(point.x - end.x, point.y - end.y) < 1e-8 || Math.hypot(point.x - route.points[i + 1].x, point.y - route.points[i + 1].y) < 1e-8)), "TP drawn as travel across the map");
        }
      }
    }
    report.rounds.push(entry);
  }
}
const output = new URL("../outputs/replay-review/", import.meta.url);
await mkdir(output, { recursive: true });
await writeFile(new URL("audit.json", output), `${JSON.stringify(report)}\n`);
const labels = { floor: "Caminhada", height: "Desnível", portal: "TP", "missing-geometry": "Geometria incerta", "missing-observation": "Registro ausente", "excessive-detour": "Volta incoerente", "insufficient-time": "Tempo insuficiente", "enemy-conflict": "Encontro não confirmado" };
const text = ["# Revisão da movimentação do replay", "", `${report.rounds.length} rounds revisados em todos os mapas com registros. A revisão verifica coerência das estimativas; os dados não contêm as trajetórias reais completas.`, "", "| Critério | Deslocamentos |", "| --- | ---: |", ...Object.entries(report.totals).map(([reason, count]) => `| ${labels[reason]} | ${count} |`), "", `Violações nos trajetos exibidos: **${report.violations.length}**. Trechos sem reconstrução confiável usam transição de posição conhecida, sem um percurso inventado.`, "", "## Round a round", "", "| Partida / mapa / round | Caminhada | Desnível | TP | Transições incertas |", "| --- | ---: | ---: | ---: | ---: |", ...report.rounds.map((round) => `| ${round.match} / ${round.map} / ${round.round} | ${round.counts.floor ?? 0} | ${round.counts.height ?? 0} | ${round.counts.portal ?? 0} | ${Object.entries(round.counts).filter(([reason]) => !["floor", "height", "portal"].includes(reason)).reduce((sum, [, count]) => sum + count, 0)} |`), ""];
await writeFile(new URL("audit.md", output), text.join("\n"));
console.log(JSON.stringify({ rounds: report.rounds.length, totals: report.totals, violations: report.violations.length, report: "outputs/replay-review/audit.md" }, null, 2));
assert.equal(report.violations.length, 0, report.violations.slice(0, 10).join("\n"));
