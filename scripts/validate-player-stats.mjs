import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { aggregateMapStats, displayScore } from "../lib/vlr/stats.ts";
import { playerMapRecords, playerAgentRows, recordsInPeriod, registeredPlayers } from "../lib/vlr/player-stats.ts";
import { rawRating } from "../lib/vlr/rating.mjs";

const dir = new URL("../data/vlr/", import.meta.url);
const matches = await Promise.all((await readdir(dir)).filter((file) => file.endsWith(".json")).map(async (file) => JSON.parse(await readFile(new URL(file, dir), "utf8"))));
const originalMatches = matches.filter((match) => match.date <= "2026-10-13");
const players = registeredPlayers(matches).filter((player) => player.teamId === "espumas");
assert.equal(players.length, 5, "Nome novo do mesmo jogador não deve duplicar o perfil");
assert.equal(players.find((player) => player.id === "laszo").name, "lsz");
const recent = matches.filter((match) => match.date === "2026-10-13");
assert.equal(recent.length, 3);
for (const match of recent) assert.deepEqual(displayScore(match), match.maps[0].score, "Jogo de um mapa deve exibir rounds no placar");
assert.deepEqual(displayScore(matches.find((match) => match.date === "2026-10-07")), [3, 0]);
for (const player of players) {
  const records = playerMapRecords(matches, player.id);
  const expectedMaps = matches.flatMap((match) => match.maps.filter((map) => map.stats.some((stats) => stats.playerId === player.id)));
  assert.equal(records.length, expectedMaps.length);
  assert.equal(aggregateMapStats(records).rounds, expectedMaps.reduce((sum, map) => sum + map.score[0] + map.score[1], 0));
  const originalRecords = playerMapRecords(originalMatches, player.id);
  assert.equal(originalRecords.length, 6);
  assert.equal(aggregateMapStats(originalRecords).rounds, 139);
  const groups = playerAgentRows(records);
  assert.equal(groups.reduce((sum, row) => sum + row.maps, 0), records.length);
  for (const key of ["rounds", "kills", "deaths", "assists", "fk", "fd"]) {
    assert.equal(groups.reduce((sum, row) => sum + row[key], 0), aggregateMapStats(records)[key], `${player.id}: totais por agente preservados`);
  }
  for (const group of groups) {
    const entries = records.filter((record) => record.stats.agent === group.agent);
    const expected = Math.round(Math.max(0, entries.reduce((sum, record) => sum + rawRating({ ...record.stats, rounds: record.rounds }) * record.rounds, 0) / group.rounds) * 100) / 100;
    assert.equal(group.rating, expected, "Usar rating bruto ponderado por rounds, sem média de ratings arredondados");
  }
}
const intertwined = aggregateMapStats(playerMapRecords(recent, "intertwined"));
assert.deepEqual([intertwined.kills, intertwined.deaths, intertwined.assists, intertwined.rounds], [82, 33, 12, 68]);
assert.equal(playerAgentRows(playerMapRecords(originalMatches, "vls")).find((row) => row.agent === "Jett").maps, 1);
assert.equal(playerAgentRows(playerMapRecords(originalMatches, "laszo")).find((row) => row.agent === "Sova").maps, 3);
const fixture = playerMapRecords(matches, "intertwined")[0];
assert.equal(recordsInPeriod([{ ...fixture, date: "2026-09-14" }, { ...fixture, date: "2026-09-15" }, { ...fixture, date: "2026-10-15" }], 30, "2026-10-14").length, 1, "Limite do período e datas futuras");
assert.equal(aggregateMapStats([]), null, "Período vazio sem divisões por zero");
const zero = aggregateMapStats([{ ...fixture, stats: { ...fixture.stats, kills: 0, deaths: 0, assists: 0, fk: 0, fd: 0 } }]);
assert.equal(zero.kd, null);
assert.equal(zero.fkfd, null);
assert.equal(zero.kpr, 0);
console.log("Player profiles: five identities, all imported maps, original fixtures, exact round weighting, agent totals, filters and zero denominators verified.");
