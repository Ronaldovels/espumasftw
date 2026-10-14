import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { detailedRounds, duels, economySummary, playerPerformance } from "../lib/vlr/performance.ts";

const read = async (directory, file) => JSON.parse(await readFile(new URL(`${directory}${file}`, import.meta.url), "utf8"));
const matchFiles = (await readdir(new URL("../data/vlr/", import.meta.url))).filter((file) => file.endsWith(".json"));
const matches = await Promise.all(matchFiles.map((file) => read("../data/vlr/", file)));

for (const file of (await readdir(new URL("../data/tracker-rounds/", import.meta.url))).filter((name) => name.endsWith(".json"))) {
  const tracker = await read("../data/tracker-rounds/", file);
  const match = matches.find((entry) => entry.id === tracker.matchId);
  const map = match?.maps.find((entry) => entry.id === tracker.map);
  assert(map, `${file}: partida ou mapa desconhecido`);
  const rounds = detailedRounds(match, { ...map, tracker });
  assert(rounds, `${file}: jogadores do Tracker não correspondem aos agentes do placar`);
  assert.equal(rounds.length, map.score[0] + map.score[1], `${file}: um registro por round`);
  rounds.forEach((round, index) => {
    assert.equal(match.teams[round.winnerIndex].id, map.rounds[index].winner, `${file} round ${index + 1}: vencedor diferente da linha do tempo`);
    assert.equal(round.outcome, map.rounds[index].outcome, `${file} round ${index + 1}: desfecho diferente da linha do tempo`);
    assert.equal(Object.keys(round.economy).length, 10, `${file} round ${index + 1}: economia dos dez jogadores`);
    for (const event of round.events) for (const key of ["killer", "victim", "player"]) if (key in event) assert(event[key], `${file} round ${index + 1}: evento sem jogador`);
  });
  const teamOf = (playerId) => match.players.find((player) => player.id === playerId).teamId;
  for (const stats of map.stats) {
    const kills = rounds.flatMap((round) => round.events).filter((event) => event.type === "kill" && event.killer === stats.playerId && teamOf(event.victim) !== teamOf(event.killer)).length;
    const deaths = rounds.flatMap((round) => round.events).filter((event) => (event.type === "kill" || (event.type === "death" && !event.blast)) && event.victim === stats.playerId).length;
    const firstKills = rounds.map((round) => round.events.find((event) => event.type === "kill"));
    assert.equal(kills, stats.kills, `${file} ${stats.playerId}: eliminações do log`);
    assert.equal(deaths, stats.deaths, `${file} ${stats.playerId}: mortes do log`);
    assert.equal(firstKills.filter((event) => event?.killer === stats.playerId).length, stats.fk, `${file} ${stats.playerId}: FK do log`);
    assert.equal(firstKills.filter((event) => event?.victim === stats.playerId).length, stats.fd, `${file} ${stats.playerId}: FD do log`);
  }
  const mapView = { ...map, tracker };
  const count = duels(match, [mapView], "all");
  for (const stats of map.stats) assert.equal(map.stats.reduce((sum, other) => sum + count(stats.playerId, other.playerId), 0), stats.kills, `${file} ${stats.playerId}: duelos somam as eliminações`);
  const economy = economySummary(match, [mapView]);
  economy.forEach((team, index) => {
    assert.equal(Object.values(team.buys).reduce((sum, entry) => sum + entry.played, 0), rounds.length, `${file}: cada round tem um tipo de compra`);
    assert.equal(Object.values(team.buys).reduce((sum, entry) => sum + entry.won, 0), map.score[index], `${file}: vitórias por compra somam o placar`);
  });
  assert(tracker.positions, `${file}: posições do replay 2D`);
  rounds.forEach((round, index) => {
    assert(round.snapshots, `${file} round ${index + 1}: uma foto de posições por evento`);
    round.events.forEach((event, position) => {
      const markers = round.snapshots[position];
      assert(markers.every((marker) => marker.playerId && marker.x > 0 && marker.x < 1 && marker.y > 0 && marker.y < 1), `${file} round ${index + 1} evento ${position + 1}: posições dentro do minimapa`);
      // Kills in the same second share one Tracker snapshot, which only marks the first victim.
      const sameSecond = position > 0 && round.events[position - 1].time === event.time;
      if (event.type === "kill" && !sameSecond) assert(markers.some((marker) => marker.playerId === event.victim && marker.facing === null), `${file} round ${index + 1} evento ${position + 1}: vítima marcada no mapa`);
    });
  });
  const performance = playerPerformance(match, [mapView]);
  assert.equal(performance.length, 10);
  const plants = rounds.flatMap((round) => round.events).filter((event) => event.type === "plant").length;
  assert.equal(performance.reduce((sum, entry) => sum + entry.plants, 0), plants);
  console.log(`${file}: ${rounds.length} rounds; abates, mortes, FK/FD, vencedores, economia e posições conferidos.`);
}
