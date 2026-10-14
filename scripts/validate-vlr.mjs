import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { firstHalfAttackers, leaderboardRows, roundTimeline, seriesScore, totalRounds } from "../lib/vlr/stats.ts";

const directory = new URL("../data/vlr/", import.meta.url);
const agents = JSON.parse(await readFile(new URL("../app/agents.json", import.meta.url), "utf8"));
const agentNames = new Set(agents.map((agent) => agent.name));
const registeredIds = new Set();
for (const file of (await readdir(directory)).filter((file) => file.endsWith(".json"))) {
  const match = JSON.parse(await readFile(new URL(file, directory), "utf8"));
  assert(!registeredIds.has(match.id), `Partida duplicada: ${match.id}`);
  registeredIds.add(match.id);
  assert.equal(match.teams.length, 2);
  assert.equal(match.players.length, 10);
  assert.equal(new Set(match.players.map((player) => player.id)).size, 10);
  for (const team of match.teams) assert.equal(match.players.filter((player) => player.teamId === team.id).length, 5);
  for (const map of match.maps) {
    assert.equal(map.stats.length, 10, `${map.name}: dez jogadores`);
    assert.equal(new Set(map.stats.map((row) => row.playerId)).size, 10, `${map.name}: sem duplicatas`);
    assert.equal(map.score.length, 2);
    assert.notEqual(map.score[0], map.score[1]);
    assert(map.score.every((value) => Number.isInteger(value) && value >= 0));
    assert(Number.isInteger(map.durationSeconds) && map.durationSeconds > 0);
    for (const row of map.stats) {
      assert(match.players.some((player) => player.id === row.playerId), `Jogador desconhecido: ${row.playerId}`);
      assert(agentNames.has(row.agent), `Agente desconhecido: ${row.agent}`);
      for (const key of ["acs", "kills", "deaths", "assists", "kast", "adr", "hs", "fk", "fd"]) assert(Number.isFinite(row[key]) && row[key] >= 0, `${map.name} ${row.playerId}: ${key}`);
      assert(!("rating" in row), "Rating calculado não deve ser duplicado nos dados de entrada");
      assert(row.kast <= 100 && row.hs <= 100);
    }
    if (map.rounds) {
      assert.equal(map.rounds.length, map.score[0] + map.score[1], `${map.name}: um registro por round`);
      const running = [0, 0];
      map.rounds.forEach((round, index) => {
        const winner = match.teams.findIndex((team) => team.id === round.winner);
        assert(winner >= 0, `${map.name} round ${index + 1}: vencedor desconhecido`);
        assert(["elimination", "defuse", "detonate", "time"].includes(round.outcome), `${map.name} round ${index + 1}: desfecho desconhecido`);
        running[winner]++;
        const decided = Math.max(...running) >= 13 && Math.abs(running[0] - running[1]) >= 2;
        assert.equal(decided, index === map.rounds.length - 1, `${map.name} round ${index + 1}: o mapa só termina no último round`);
      });
      assert.deepEqual(running, map.score, `${map.name}: rounds batem com o placar`);
      assert(firstHalfAttackers(match, map).size <= 1, `${map.name}: plantas e desarmes indicam lados consistentes`);
    }
    const teamStats = match.teams.map((team) => map.stats.filter((row) => match.players.find((player) => player.id === row.playerId).teamId === team.id));
    const uncredited = map.uncreditedDeaths ?? [];
    assert.equal(new Set(uncredited.map((entry) => entry.playerId)).size, uncredited.length, "Sem duplicar mortes sem crédito");
    for (const entry of uncredited) {
      const playerStats = map.stats.find((row) => row.playerId === entry.playerId);
      assert(playerStats && Number.isInteger(entry.count) && entry.count > 0 && entry.count <= playerStats.deaths, "Morte sem crédito exige jogador e quantidade válidos");
      assert(typeof entry.reason === "string" && entry.reason.length > 0, "Documentar no log a morte sem crédito");
    }
    for (const index of [0, 1]) {
      const enemyIds = new Set(teamStats[1 - index].map((row) => row.playerId));
      const noCredit = uncredited.filter((entry) => enemyIds.has(entry.playerId)).reduce((sum, entry) => sum + entry.count, 0);
      assert.equal(teamStats[index].reduce((sum, row) => sum + row.kills, 0), teamStats[1 - index].reduce((sum, row) => sum + row.deaths, 0) - noCredit, `${map.name}: eliminações e mortes entre os times, descontando apenas eventos documentados`);
    }
  }
  const rows = leaderboardRows(match);
  assert.equal(rows.length, 10);
  if (match.id === "espumas-esponjas-2026-10-07") {
    assert.deepEqual(seriesScore(match), [3, 0]);
    assert.equal(totalRounds(match), 71);
    const intertwined = rows.find((row) => row.id === "intertwined");
    assert.deepEqual([intertwined.kills, intertwined.deaths, intertwined.assists, intertwined.diff, intertwined.rating, intertwined.acs, intertwined.adr, intertwined.kast], [74, 45, 7, 29, 1.38, 281, 174, 75]);
    assert.deepEqual(intertwined.headshots.map((entry) => entry.value), [28, 31, 27]);
    assert.equal(rows.find((row) => row.id === "felpao").rating, 0.48, "Calcular rating a partir das estatísticas, sem rating manual");
    assert.deepEqual([rows.find((row) => row.id === "gusta").adr, rows.find((row) => row.id === "willy-wonka").adr, rows.find((row) => row.id === "willy-wonka").kast], [120, 90, 63], "Preservar médias gerais do relatório antes do arredondamento por mapa");
    for (const [mapId, playerId, agent] of [["ascent", "vls", "Jett"], ["split", "persa-faz-22", "Raze"], ["summit", "israel-games", "Breach"]]) {
      assert.deepEqual(leaderboardRows(match, mapId).find((row) => row.id === playerId).agents, [agent]);
    }
    const [ascent, split, summit] = match.maps.map((map) => roundTimeline(match, map));
    assert.deepEqual([ascent[0].winnerSide, ascent[12].winner, ascent[12].winnerSide], ["attack", "espumas", "defense"], "Espumas começou no ataque em Ascent");
    assert.deepEqual([split[2].winner, split[2].outcome, split[2].winnerSide], ["esponjas", "detonate", "attack"]);
    assert.deepEqual(summit.slice(24).map((round) => round.winnerSide), ["defense", "defense", "defense", "attack"], "Prorrogação alterna os lados a cada round");
  }
  console.log(`${match.id}: dados, agentes, placares e totais conferidos.`);
}
