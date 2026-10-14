import firstMatch from "@/data/vlr/espumas-esponjas-2026-10-07.json";
import buchas from "@/data/vlr/espumas-buchas-2026-10-13.json";
import loucas from "@/data/vlr/espumas-loucas-2026-10-13.json";
import molhados from "@/data/vlr/espumas-molhados-2026-10-13.json";
import ascentRounds from "@/data/tracker-rounds/ascent-2026-10-07.json";
import splitRounds from "@/data/tracker-rounds/split-2026-10-07.json";
import summitRounds from "@/data/tracker-rounds/summit-2026-10-07.json";
import lotusRounds from "@/data/tracker-rounds/lotus-2026-10-13.json";
import havenRounds from "@/data/tracker-rounds/haven-2026-10-13.json";
import abyssRounds from "@/data/tracker-rounds/abyss-2026-10-13.json";
import type { TrackerRounds, ValorantMatch } from "./types";

export const matches: ValorantMatch[] = [molhados, loucas, buchas, firstMatch].map((match) => match as unknown as ValorantMatch).sort((a, b) => b.date.localeCompare(a.date));

const trackerRounds: TrackerRounds[] = [ascentRounds, splitRounds, summitRounds, lotusRounds, havenRounds, abyssRounds];

// Round-by-round Tracker data is only needed on the match page, so it is attached there.
export function withTrackerRounds(match: ValorantMatch): ValorantMatch {
  return { ...match, maps: match.maps.map((map) => ({ ...map, tracker: trackerRounds.find((entry) => entry.matchId === match.id && entry.map === map.id) })) };
}

export { formatDuration, formatMatchDate, leaderboardRows, seriesScore, totalRounds } from "./stats";
