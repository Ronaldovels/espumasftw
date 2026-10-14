import firstMatch from "@/data/vlr/espumas-esponjas-2026-10-07.json";
import buchas from "@/data/vlr/espumas-buchas-2026-10-13.json";
import loucas from "@/data/vlr/espumas-loucas-2026-10-13.json";
import molhados from "@/data/vlr/espumas-molhados-2026-10-13.json";
import type { ValorantMatch } from "./types";

export const matches: ValorantMatch[] = [molhados, loucas, buchas, firstMatch].map((match) => match as unknown as ValorantMatch).sort((a, b) => b.date.localeCompare(a.date));

export { formatDuration, formatMatchDate, leaderboardRows, seriesScore, totalRounds } from "./stats";
