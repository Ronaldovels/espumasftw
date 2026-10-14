export type MatchTeam = {
  id: string;
  name: string;
  tag: string;
  crest: "espumas" | "esponjas" | "buchas" | "loucas" | "molhados";
};

export type MatchPlayer = {
  id: string;
  name: string;
  teamId: string;
  riotId?: string;
};

export type MapPlayerStats = {
  playerId: string;
  agent: string;
  acs: number;
  kills: number;
  deaths: number;
  assists: number;
  kast: number;
  adr: number;
  hs: number;
  fk: number;
  fd: number;
};

export type MatchMap = {
  id: string;
  name: string;
  score: [number, number];
  durationSeconds: number;
  stats: MapPlayerStats[];
  sourceUrl?: string;
  uncreditedDeaths?: Array<{ playerId: string; count: number; reason: string }>;
};

export type ValorantMatch = {
  id: string;
  date: string;
  event: string;
  format?: "Competitiva" | "Personalizada";
  sourceUrl: string;
  contextUrl: string;
  ratingNote: string;
  seriesStats?: Record<string, Pick<MapPlayerStats, "acs" | "adr" | "kast">>;
  teams: [MatchTeam, MatchTeam];
  players: MatchPlayer[];
  maps: MatchMap[];
};

export type LeaderboardRow = MatchPlayer & Omit<MapPlayerStats, "playerId" | "agent" | "hs"> & {
  rating: number;
  agents: string[];
  headshots: Array<{ map: string; value: number }>;
  diff: number;
  openingDiff: number;
};

export type SortColumn = "rating" | "acs" | "kills" | "deaths" | "assists" | "diff" | "kast" | "adr" | "fk" | "fd" | "openingDiff";
