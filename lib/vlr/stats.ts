import type { LeaderboardRow, MapPlayerStats, ValorantMatch } from "./types";
import { rawRating } from "./rating.mjs";

export function seriesScore(match: ValorantMatch): [number, number] {
  return match.maps.reduce<[number, number]>((score, map) => {
    if (map.score[0] > map.score[1]) score[0]++;
    if (map.score[1] > map.score[0]) score[1]++;
    return score;
  }, [0, 0]);
}

export function totalRounds(match: ValorantMatch): number {
  return match.maps.reduce((sum, map) => sum + map.score[0] + map.score[1], 0);
}

export function displayScore(match: ValorantMatch): [number, number] {
  return match.maps.length === 1 ? match.maps[0].score : seriesScore(match);
}

export type StatEntry = { stats: MapPlayerStats; rounds: number };

// Keep full map precision and weight raw contributions before rounding once.
export function aggregateMapStats(entries: StatEntry[]) {
  const rounds = entries.reduce((sum, entry) => sum + entry.rounds, 0);
  if (!rounds) return null;
  const sum = (key: "kills" | "deaths" | "assists" | "fk" | "fd") => entries.reduce((total, { stats }) => total + stats[key], 0);
  const weighted = (key: "acs" | "adr" | "kast") => entries.reduce((total, entry) => total + entry.stats[key] * entry.rounds, 0) / rounds;
  const raw = entries.reduce((total, entry) => total + rawRating({ ...entry.stats, rounds: entry.rounds }) * entry.rounds, 0) / rounds;
  const kills = sum("kills"), deaths = sum("deaths"), assists = sum("assists"), fk = sum("fk"), fd = sum("fd");
  return { rounds, kills, deaths, assists, fk, fd, rating: Math.round(Math.max(0, raw) * 100) / 100,
    acs: weighted("acs"), adr: weighted("adr"), kast: weighted("kast"),
    kd: deaths ? kills / deaths : null, kpr: kills / rounds, apr: assists / rounds, fkfd: fd ? fk / fd : null };
}

export function formatMatchDate(date: string, short = false): string {
  return new Intl.DateTimeFormat("pt-BR", short
    ? { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }
    : { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }
  ).format(new Date(`${date}T12:00:00Z`));
}

export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

// Prefer recorded display averages; rating always uses precise map inputs.
// Average raw contributions by rounds, then clamp / round only once.
// HS% stays separate per map because hit counts are not available.
export function leaderboardRows(match: ValorantMatch, mapId = "all"): LeaderboardRow[] {
  const maps = mapId === "all" ? match.maps : match.maps.filter((map) => map.id === mapId);
  return match.players.flatMap((player) => {
    const entries = maps.flatMap((map) => {
      const stats = map.stats.find((entry) => entry.playerId === player.id);
      return stats ? [{ stats, map, rounds: map.score[0] + map.score[1] }] : [];
    });
    if (!entries.length) return [];
    const aggregate = aggregateMapStats(entries)!;
    const recorded = mapId === "all" ? match.seriesStats?.[player.id] : undefined;
    const { kills, deaths, assists, fk, fd } = aggregate;
    return [{
      ...player,
      agents: [...new Set(entries.map(({ stats }) => stats.agent))],
      headshots: entries.map(({ stats, map }) => ({ map: map.name, value: stats.hs })),
      rating: aggregate.rating,
      acs: recorded?.acs ?? Math.round(aggregate.acs),
      kills, deaths, assists, diff: kills - deaths,
      kast: recorded?.kast ?? Math.round(aggregate.kast), adr: recorded?.adr ?? Math.round(aggregate.adr),
      fk, fd, openingDiff: fk - fd,
    }];
  });
}
