import { roundTimeline } from "./stats.ts";
import type { MatchMap, RoundSide, ValorantMatch } from "./types";

const OPERATOR = "a03b24d3";
const PISTOL_ROUNDS = [1, 13];

export type RoundEvent =
  | { type: "kill"; time: number; killer: string; victim: string; weapon: string }
  | { type: "plant" | "defuse" | "explode"; time: number; player: string }
  | { type: "death"; time: number; victim: string; blast: boolean };

// Minimap position at an event: x/y from 0 to 1 over the Valorant-API minimap, facing in degrees (null for the victim).
export type MapMarker = { playerId: string; x: number; y: number; facing: number | null };

export type DetailedRound = {
  number: number;
  winnerIndex: 0 | 1;
  winnerSide?: RoundSide;
  outcome: string;
  economy: Record<string, { loadout: number; bank: number }>;
  events: RoundEvent[];
  snapshots?: MapMarker[][];
};

export type DuelMode = "all" | "first" | "operator";
export type BuyType = "eco" | "semiEco" | "semiBuy" | "fullBuy";

export type PlayerPerformance = {
  playerId: string;
  multikills: [number, number, number, number];
  clutches: [number, number, number, number, number];
  econ: number | null;
  plants: number;
  defuses: number;
};

export type TeamEconomy = { pistolWon: number; buys: Record<BuyType, { played: number; won: number }> };

export const BUY_TYPES: BuyType[] = ["eco", "semiEco", "semiBuy", "fullBuy"];

// Team loadout value bands, same as VLR: 0–5k, 5–10k, 10–20k, 20k+.
export function buyType(loadout: number): BuyType {
  return loadout < 5000 ? "eco" : loadout < 10000 ? "semiEco" : loadout < 20000 ? "semiBuy" : "fullBuy";
}

// Tracker colors (Red = Team A, Blue = Team B) are matched to our teams by agent lineup,
// then each Tracker row to the player of that team on the same agent.
function trackerMapping(match: ValorantMatch, map: MatchMap) {
  if (!map.tracker) return null;
  const teamOf = (playerId: string) => match.players.find((player) => player.id === playerId)?.teamId;
  const rows = map.tracker.players.map((line) => { const [name, color, agent] = line.split("|"); return { name, color, agent }; });
  const lineup = (agents: string[]) => [...agents].sort().join();
  const colorTeam: Record<string, string> = {};
  for (const color of ["Red", "Blue"]) {
    const agents = lineup(rows.filter((row) => row.color === color).map((row) => row.agent));
    const team = match.teams.find((entry) => lineup(map.stats.filter((row) => teamOf(row.playerId) === entry.id).map((row) => row.agent)) === agents);
    if (!team) return null;
    colorTeam[color] = team.id;
  }
  if (colorTeam.Red === colorTeam.Blue) return null;
  const ids = rows.map((row) => map.stats.find((stats) => stats.agent === row.agent && teamOf(stats.playerId) === colorTeam[row.color])?.playerId);
  return ids.every(Boolean) ? { ids: ids as string[], colorTeam } : null;
}

export function detailedRounds(match: ValorantMatch, map: MatchMap): DetailedRound[] | null {
  const mapping = trackerMapping(match, map);
  if (!mapping || !map.tracker) return null;
  const { ids, colorTeam } = mapping;
  const timeline = roundTimeline(match, map);
  return map.tracker.rounds.map((line, index) => {
    const [result, economyText, eventsText] = line.split("|");
    const [winnerLetter, outcome] = result.split(" ");
    const winner = colorTeam[winnerLetter === "A" ? "Red" : "Blue"];
    const economy = Object.fromEntries(economyText.split(",").map((pair, position) => {
      const [loadout, bank] = pair.split("/").map(Number);
      return [ids[position], { loadout, bank }];
    }));
    const tokens = eventsText ? eventsText.split(" ") : [];
    const explosions = new Set(tokens.filter((token) => token[0] === "X").map((token) => Number(token.slice(1).split(".")[0])));
    const events = tokens.map((token): RoundEvent => {
      const [time, ...rest] = token.slice(1).split(".");
      const seconds = Number(time);
      const id = (position: string) => ids[Number(position)];
      switch (token[0]) {
        case "K": return { type: "kill", time: seconds, killer: id(rest[0]), victim: id(rest[1]), weapon: rest[2] };
        case "P": return { type: "plant", time: seconds, player: id(rest[0]) };
        case "D": return { type: "defuse", time: seconds, player: id(rest[0]) };
        case "X": return { type: "explode", time: seconds, player: id(rest[0]) };
        // Spike blast deaths are left out of Tracker scoreboards; other deaths without a killer count.
        default: return { type: "death", time: seconds, victim: id(rest[0]), blast: explosions.has(seconds) };
      }
    });
    // Positions: one snapshot per event, 9 characters per player (index, x and y in thousandths, facing in tens of degrees or "--").
    const snapshots = map.tracker?.positions?.[index]?.split(" ").map((snapshot) => (snapshot.match(/.{9}/g) ?? []).map((code) => ({
      playerId: ids[Number(code[0])], x: Number(code.slice(1, 4)) / 1000, y: Number(code.slice(4, 7)) / 1000, facing: code.endsWith("--") ? null : Number(code.slice(7)) * 10,
    })));
    return { number: index + 1, winnerIndex: match.teams[0].id === winner ? 0 : 1, winnerSide: timeline[index]?.winnerSide, outcome: outcome.toLowerCase(), economy, events, snapshots: snapshots?.length === events.length ? snapshots : undefined };
  });
}

const teamIndex = (match: ValorantMatch, playerId: string) => match.teams.findIndex((team) => team.id === match.players.find((player) => player.id === playerId)?.teamId);
const enemyKills = (match: ValorantMatch, round: DetailedRound) => round.events.filter((event): event is Extract<RoundEvent, { type: "kill" }> => event.type === "kill" && teamIndex(match, event.killer) !== teamIndex(match, event.victim));

function mapsWithRounds(match: ValorantMatch, maps: MatchMap[]) {
  return maps.flatMap((map) => { const rounds = detailedRounds(match, map); return rounds ? [{ map, rounds }] : []; });
}

export function hasRoundDetails(match: ValorantMatch, maps: MatchMap[]) {
  return mapsWithRounds(match, maps).length === maps.length && maps.length > 0;
}

// count(killer, victim) for the head-to-head grid.
export function duels(match: ValorantMatch, maps: MatchMap[], mode: DuelMode) {
  const counts = new Map<string, number>();
  for (const { rounds } of mapsWithRounds(match, maps)) {
    for (const round of rounds) {
      const kills = enemyKills(match, round);
      for (const kill of mode === "first" ? kills.slice(0, 1) : mode === "operator" ? kills.filter((entry) => entry.weapon === OPERATOR) : kills) {
        const key = `${kill.killer}:${kill.victim}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return (killer: string, victim: string) => counts.get(`${killer}:${victim}`) ?? 0;
}

export function playerPerformance(match: ValorantMatch, maps: MatchMap[]): PlayerPerformance[] {
  const totals = new Map<string, PlayerPerformance & { damage: number; loadout: number }>();
  const entry = (playerId: string) => {
    if (!totals.has(playerId)) totals.set(playerId, { playerId, multikills: [0, 0, 0, 0], clutches: [0, 0, 0, 0, 0], econ: null, plants: 0, defuses: 0, damage: 0, loadout: 0 });
    return totals.get(playerId)!;
  };
  for (const { map, rounds } of mapsWithRounds(match, maps)) {
    for (const stats of map.stats) entry(stats.playerId).damage += stats.adr * (map.score[0] + map.score[1]);
    for (const round of rounds) {
      for (const [playerId, { loadout }] of Object.entries(round.economy)) entry(playerId).loadout += loadout;
      const kills = new Map<string, number>();
      for (const kill of enemyKills(match, round)) kills.set(kill.killer, (kills.get(kill.killer) ?? 0) + 1);
      for (const [playerId, count] of kills) if (count >= 2) entry(playerId).multikills[Math.min(count, 5) - 2]++;
      for (const event of round.events) {
        if (event.type === "plant") entry(event.player).plants++;
        if (event.type === "defuse") entry(event.player).defuses++;
      }
      // A clutch starts when a player becomes the last one alive; it counts if the team wins with them still standing.
      const alive = match.teams.map((team) => new Set(map.stats.filter((stats) => teamIndex(match, stats.playerId) === match.teams.indexOf(team)).map((stats) => stats.playerId)));
      const clutch: Array<{ playerId: string; opponents: number } | undefined> = [undefined, undefined];
      for (const event of round.events) {
        if (event.type !== "kill" && event.type !== "death") continue;
        alive.forEach((team) => team.delete(event.victim));
        alive.forEach((team, index) => {
          if (!clutch[index] && team.size === 1 && alive[1 - index].size > 0) clutch[index] = { playerId: [...team][0], opponents: alive[1 - index].size };
        });
      }
      const won = clutch[round.winnerIndex];
      if (won && alive[round.winnerIndex].has(won.playerId)) entry(won.playerId).clutches[Math.min(won.opponents, 5) - 1]++;
    }
  }
  return [...totals.values()].map(({ damage, loadout, ...rest }) => ({ ...rest, econ: loadout ? Math.round(damage / (loadout / 1000)) : null }));
}

export type EconomyRound = DetailedRound & { teams: [{ loadout: number; bank: number; type: BuyType }, { loadout: number; bank: number; type: BuyType }] };

export function economyRounds(match: ValorantMatch, map: MatchMap): EconomyRound[] {
  return (detailedRounds(match, map) ?? []).map((round) => {
    const team = (index: number) => {
      const players = Object.entries(round.economy).filter(([playerId]) => teamIndex(match, playerId) === index).map(([, value]) => value);
      const loadout = players.reduce((sum, player) => sum + player.loadout, 0);
      return { loadout, bank: players.reduce((sum, player) => sum + player.bank, 0), type: buyType(loadout) };
    };
    return { ...round, teams: [team(0), team(1)] };
  });
}

export function economySummary(match: ValorantMatch, maps: MatchMap[]): [TeamEconomy, TeamEconomy] {
  const summary = () => ({ pistolWon: 0, buys: Object.fromEntries(BUY_TYPES.map((type) => [type, { played: 0, won: 0 }])) as TeamEconomy["buys"] });
  const result: [TeamEconomy, TeamEconomy] = [summary(), summary()];
  for (const map of maps) {
    for (const round of economyRounds(match, map)) {
      round.teams.forEach((team, index) => {
        const won = round.winnerIndex === index;
        result[index].buys[team.type].played++;
        if (won) result[index].buys[team.type].won++;
        if (won && PISTOL_ROUNDS.includes(round.number)) result[index].pistolWon++;
      });
    }
  }
  return result;
}
