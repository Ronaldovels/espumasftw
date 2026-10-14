import { aggregateMapStats } from "./stats.ts";
import type { MapPlayerStats, MatchPlayer, ValorantMatch } from "./types";

export type PlayerMapRecord = {
  matchId: string; date: string; event: string; opponent: string;
  mapId: string; mapName: string; score: [number, number]; won: boolean;
  rounds: number; stats: MapPlayerStats; sourceUrl: string;
};

export function registeredPlayers(matches: ValorantMatch[]) {
  const players = new Map<string, MatchPlayer>();
  for (const match of [...matches].sort((a, b) => b.date.localeCompare(a.date))) {
    for (const player of match.players) if (!players.has(player.id)) players.set(player.id, player);
  }
  return [...players.values()];
}

export function playerMapRecords(matches: ValorantMatch[], playerId: string): PlayerMapRecord[] {
  return matches.flatMap((match) => {
    const player = match.players.find((entry) => entry.id === playerId);
    if (!player) return [];
    const teamIndex = match.teams.findIndex((team) => team.id === player.teamId);
    if (teamIndex < 0) return [];
    return match.maps.flatMap((map) => {
      const stats = map.stats.find((entry) => entry.playerId === playerId);
      if (!stats) return [];
      const score: [number, number] = [map.score[teamIndex], map.score[1 - teamIndex]];
      return [{ matchId: match.id, date: match.date, event: match.event,
        opponent: match.teams[1 - teamIndex].name, mapId: map.id, mapName: map.name,
        score, won: score[0] > score[1], rounds: map.score[0] + map.score[1], stats,
        sourceUrl: map.sourceUrl ?? match.sourceUrl }];
    });
  }).sort((a, b) => b.date.localeCompare(a.date));
}

export function recordsInPeriod(records: PlayerMapRecord[], days: number | null, asOf: string) {
  if (days === null) return records;
  const until = Date.parse(`${asOf}T00:00:00Z`);
  const since = until - (days - 1) * 86400000;
  return records.filter((record) => { const date = Date.parse(`${record.date}T00:00:00Z`); return date >= since && date <= until; });
}

export function playerAgentRows(records: PlayerMapRecord[]) {
  const agents = [...new Set(records.map((record) => record.stats.agent))];
  return agents.map((agent) => {
    const maps = records.filter((record) => record.stats.agent === agent);
    return { agent, maps: maps.length, use: maps.length / records.length * 100,
      ...aggregateMapStats(maps)! };
  }).sort((a, b) => b.maps - a.maps || b.rounds - a.rounds || a.agent.localeCompare(b.agent));
}
