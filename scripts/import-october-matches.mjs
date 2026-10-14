import { writeFile } from "node:fs/promises";

// Transcription of the visible Tracker scoreboards reviewed for the 13/10 report.
// Columns: player, Riot ID, agent, ACS, K, D, A, KAST%, ADR, HS%, FK, FD.
const espumasIds = { intertwined: "intertwined", vls: "vls", Maopyk: "maopyk", lsz: "laszo", Felpao: "felpao" };
const sessions = [
  {
    team: "buchas", name: "Buchas", tag: "BUC", map: "lotus", mapName: "Lotus", score: [13, 9], duration: 1948,
    source: "https://tracker.gg/valorant/match/1bd9f7bd-399b-4a51-83d4-77be0fe290b6",
    rows: [
      ["intertwined", "intertwined#anaju", "Chamber", 378, 31, 8, 3, 86, 233.6, 49, 6, 3],
      ["vls", "vls#det", "Neon", 272, 22, 14, 5, 86, 158.9, 27, 3, 0],
      ["Maopyk", "Maopyk#piru", "Omen", 203, 14, 13, 13, 82, 127.0, 29, 1, 2],
      ["Felpao", "Felpao#000", "Breach", 184, 16, 12, 10, 82, 117.9, 28, 1, 2],
      ["lsz", "lsz#333", "Fade", 125, 9, 13, 12, 73, 82.6, 19, 2, 2],
      ["mikumero", "mikumero#fort", "Waylay", 210, 15, 19, 4, 55, 131.9, 29, 4, 6],
      ["TЯEXX", "TЯEXX#7777", "Chamber", 199, 16, 17, 2, 59, 125.5, 27, 3, 1],
      ["Maquina de HS", "Maquina de HS#MAT", "Omen", 194, 17, 18, 4, 68, 123.5, 45, 1, 2],
      ["Henricão", "Henricão#Newba", "Fade", 111, 8, 18, 7, 59, 84.3, 15, 0, 0],
      ["CaioTM", "CaioTM#6969", "Phoenix", 92, 4, 20, 7, 45, 69.0, 18, 1, 4],
    ],
  },
  {
    team: "loucas", name: "Louças", tag: "LOU", map: "haven", mapName: "Haven", score: [13, 5], duration: 1628,
    source: "https://tracker.gg/valorant/match/9a24b53c-8225-4d87-b30b-6ced77fd572d",
    rows: [
      ["intertwined", "intertwined#anaju", "Chamber", 363, 24, 10, 2, 83, 218.3, 34, 7, 2],
      ["Maopyk", "Maopyk#piru", "Omen", 259, 18, 8, 8, 83, 171.3, 28, 1, 0],
      ["vls", "vls#det", "Neon", 243, 14, 13, 7, 67, 169.1, 17, 1, 2],
      ["lsz", "lsz#333", "Sova", 135, 9, 11, 4, 67, 101.5, 26, 1, 1],
      ["Felpao", "Felpao#000", "Breach", 120, 7, 9, 5, 72, 81.3, 21, 1, 2],
      ["黒足 Kuro Ashi", "黒足 Kuro Ashi#Sanji", "Neon", 263, 16, 14, 4, 61, 172.9, 30, 2, 2],
      ["Lukzツ", "Lukzツ#1907", "Chamber", 205, 12, 13, 4, 61, 126.7, 23, 4, 3],
      ["PROFETA", "PROFETA#GGWP", "Sova", 171, 12, 15, 3, 67, 102.5, 20, 0, 2],
      ["Chrome", "Chrome#kun", "Cypher", 111, 6, 15, 5, 50, 80.2, 10, 1, 3],
      ["Okita", "Okita#Sojin", "Omen", 73, 5, 15, 5, 44, 45.2, 19, 0, 1],
    ],
  },
  {
    team: "molhados", name: "Molhados", tag: "MOL", map: "abyss", mapName: "Abyss", score: [15, 13], duration: 2807,
    source: "https://tracker.gg/valorant/match/98f02482-427c-42f2-9707-b895f125b275",
    rows: [
      ["intertwined", "intertwined#anaju", "Chamber", 268, 27, 15, 7, 82, 182.8, 29, 3, 2],
      ["Maopyk", "Maopyk#piru", "Omen", 245, 22, 18, 14, 82, 168.6, 31, 2, 5],
      ["Felpao", "Felpao#000", "KAY/O", 218, 23, 17, 9, 79, 129.0, 29, 1, 3],
      ["vls", "vls#det", "Neon", 181, 17, 22, 5, 64, 112.2, 20, 5, 3],
      ["lsz", "lsz#333", "Sova", 161, 16, 19, 8, 71, 112.6, 26, 1, 3],
      ["sangras", "sangras#069", "Jett", 255, 23, 26, 6, 64, 163.0, 20, 7, 5],
      ["Mete Reb0lando", "Mete Reb0lando#Aaah", "Sova", 215, 20, 19, 12, 75, 156.0, 22, 5, 2],
      ["gordin rebaixado", "gordin rebaixado#690", "Miks", 170, 14, 21, 11, 71, 121.8, 21, 1, 3],
      ["as bebê quer gin", "as bebê quer gin#000", "Chamber", 159, 17, 18, 2, 64, 112.8, 33, 3, 1],
      ["kakashisempai", "kakashisempai#0069", "Fade", 146, 16, 21, 6, 57, 96.1, 12, 0, 1],
    ],
  },
];

for (const entry of sessions) {
  const id = `espumas-${entry.team}-2026-10-13`;
  const players = entry.rows.map(([name, riotId], index) => ({
    id: index < 5 ? espumasIds[name] : `${entry.team}-${index - 4}`,
    name, riotId, teamId: index < 5 ? "espumas" : entry.team,
  }));
  const stats = entry.rows.map(([, , agent, acs, kills, deaths, assists, kast, adr, hs, fk, fd], index) => ({
    playerId: players[index].id, agent, acs, kills, deaths, assists, kast, adr, hs, fk, fd,
  }));
  const match = {
    id, date: "2026-10-13", event: `Competitiva · ${entry.mapName}`, format: "Competitiva",
    sourceUrl: entry.source,
    contextUrl: "https://tracker.gg/valorant/profile/riot/intertwined%23anaju/overview?platform=pc&playlist=competitive&season=d816f426-48ea-f052-117f-9697a155b319",
    ratingNote: "Rating Espumas v1: estimativa calibrada com ratings VLR 2.0. Usa kills, deaths, assistências e primeiras mortes por round, ADR e ACS. O mesmo modelo é usado no perfil de cada jogador; contribuições brutas são ponderadas pelos rounds antes do arredondamento final.",
    teams: [{ id: "espumas", name: "Espumas", tag: "ESP", crest: "espumas" }, { id: entry.team, name: entry.name, tag: entry.tag, crest: entry.team }],
    players,
    maps: [{ id: entry.map, name: entry.mapName, score: entry.score, durationSeconds: entry.duration, sourceUrl: entry.source, stats,
      ...(entry.map === "abyss" ? { uncreditedDeaths: [{ playerId: "vls", count: 1, reason: "Morte sem eliminação adversária no round 23, conferida no log do Tracker." }] } : {}),
    }],
  };
  await writeFile(new URL(`../data/vlr/${id}.json`, import.meta.url), JSON.stringify(match, null, 2) + "\n");
  console.log(`Imported ${id}: ${entry.mapName} ${entry.score.join('-')}, 10 players.`);
}
