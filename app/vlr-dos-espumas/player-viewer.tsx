"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import agents from "@/app/agents.json";
import { aggregateMapStats, formatMatchDate } from "@/lib/vlr/stats";
import { playerAgentRows, recordsInPeriod, type PlayerMapRecord } from "@/lib/vlr/player-stats";
import { PLAYER_AVATARS } from "@/lib/vlr/players";
import type { MatchPlayer } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

const agentByName = new Map(agents.map((agent) => [agent.name, agent]));
const decimal = (value: number | null, places = 2) => value === null ? "—" : value.toFixed(places);
const ratio = (value: number | null, numerator: number) => value === null ? numerator > 0 ? "∞" : "—" : value.toFixed(2);
const columns = [
  ["USE", "Mapas jogados com o agente e participação no total de mapas"],
  ["RND", "Rounds jogados"], ["R*", "Rating Espumas v1, calculado com a fórmula existente"],
  ["ACS", "Pontuação média de combate"], ["K:D", "Eliminações divididas por mortes"],
  ["KAST", "Rounds com eliminação, assistência, sobrevivência ou morte trocada"],
  ["ADR", "Dano médio por round"], ["KPR", "Eliminações por round"],
  ["APR", "Assistências por round"], ["FK:FD", "Primeiras eliminações divididas por primeiras mortes"],
  ["K", "Eliminações"], ["D", "Mortes"], ["A", "Assistências"],
  ["FK", "Primeiras eliminações"], ["FD", "Primeiras mortes"],
];

export function PlayerViewer({ player, records, asOf }: { player: MatchPlayer; records: PlayerMapRecord[]; asOf: string }) {
  const [tab, setTab] = useState<"overview" | "matches">("overview");
  const [days, setDays] = useState<number | null>(null);
  const filtered = recordsInPeriod(records, days, asOf);
  const rows = playerAgentRows(filtered);
  const overall = aggregateMapStats(filtered);
  const matchCount = new Set(filtered.map((record) => record.matchId)).size;
  const wins = filtered.filter((record) => record.won).length;

  return <>
    <section className={styles.profileHeader} aria-labelledby="player-title">
      <div className={styles.playerAvatar} aria-hidden="true">{PLAYER_AVATARS[player.id]
        ? <Image src={PLAYER_AVATARS[player.id]} alt="" width={94} height={110} unoptimized className={styles.avatarImage} />
        : player.name.slice(0, 2).toUpperCase()}</div>
      <div><span className={styles.profileEyebrow}>{player.teamId === "espumas" ? "ESPUMAS" : "JOGADOR REGISTRADO"}</span><h1 id="player-title">{player.name}</h1>
        {player.riotId && <><p className={styles.riotId}>{player.riotId}</p><a className={styles.trackerLink} href={`https://tracker.gg/valorant/profile/riot/${encodeURIComponent(player.riotId)}/overview`} target="_blank" rel="noreferrer">Perfil no Tracker ↗</a></>}
        <p className={styles.profileContext}>{records.length} mapas no histórico · Último jogo em {formatMatchDate(records[0].date, true)}</p>
      </div>
    </section>
    <div className={styles.profileTabs} role="tablist" aria-label="Estatísticas do jogador">
      <button id="player-overview-tab" role="tab" aria-selected={tab === "overview"} aria-controls="player-overview-panel" className={tab === "overview" ? styles.currentProfileTab : ""} onClick={() => setTab("overview")}>Visão geral</button>
      <button id="player-matches-tab" role="tab" aria-selected={tab === "matches"} aria-controls="player-matches-panel" className={tab === "matches" ? styles.currentProfileTab : ""} onClick={() => setTab("matches")}>Partidas</button>
    </div>
    <section className={styles.playerStatsSection}>
      <div className={styles.profileToolbar}><h2>{tab === "overview" ? "AGENTES" : "HISTÓRICO POR MAPA"}</h2><div className={styles.periodFilter} role="group" aria-label="Período das estatísticas"><span>PERÍODO:</span>{[30, 60, 90, null].map((value) => <button key={value ?? "all"} aria-pressed={days === value} className={days === value ? styles.selectedPeriod : ""} onClick={() => setDays(value)}>{value === null ? "Todos" : `${value}d`}</button>)}</div></div>
      {overall ? <>
        <div className={styles.profileSummary} aria-label="Estatísticas do período">
          <div><strong>{overall.rating.toFixed(2)}</strong><span>RATING ESPUMAS v1</span></div>
          <div><strong>{overall.kills}/{overall.deaths}/{overall.assists}</strong><span>K / D / A</span></div>
          <div><strong>{overall.rounds}</strong><span>ROUNDS · {filtered.length} MAPAS</span></div>
          <div><strong>{wins}/{filtered.length}</strong><span>MAPAS VENCIDOS · {matchCount} PARTIDAS</span></div>
        </div>
        {tab === "overview" ? <div id="player-overview-panel" role="tabpanel" aria-labelledby="player-overview-tab">
          <div className={styles.profileTableScroll} tabIndex={0} role="region" aria-label={`Estatísticas por agente de ${player.name}`}>
            <table className={styles.profileTable}><caption className={styles.srOnly}>Agentes de {player.name}, {days === null ? "todo o histórico" : `últimos ${days} dias`}</caption>
              <thead><tr><th scope="col">Agente</th>{columns.map(([label, title]) => <th scope="col" key={label} title={title}>{label}</th>)}</tr></thead>
              <tbody>{rows.map((row) => { const agent = agentByName.get(row.agent); return <tr key={row.agent}>
                <th scope="row" className={styles.profileAgent}>{agent && <Image src={agent.icon} width={30} height={34} alt="" />}<span>{row.agent}</span></th>
                <td>({row.maps}) {Math.round(row.use)}%</td><td>{row.rounds}</td><td className={styles.profileRating}>{row.rating.toFixed(2)}</td><td>{decimal(row.acs, 1)}</td><td>{ratio(row.kd, row.kills)}</td><td>{Math.round(row.kast)}%</td><td>{decimal(row.adr, 1)}</td><td>{decimal(row.kpr)}</td><td>{decimal(row.apr)}</td><td>{ratio(row.fkfd, row.fk)}</td><td>{row.kills}</td><td>{row.deaths}</td><td>{row.assists}</td><td>{row.fk}</td><td>{row.fd}</td>
              </tr>; })}</tbody>
              <tfoot><tr><th scope="row">Todos</th><td>({filtered.length}) 100%</td><td>{overall.rounds}</td><td>{overall.rating.toFixed(2)}</td><td>{decimal(overall.acs, 1)}</td><td>{ratio(overall.kd, overall.kills)}</td><td>{Math.round(overall.kast)}%</td><td>{decimal(overall.adr, 1)}</td><td>{decimal(overall.kpr)}</td><td>{decimal(overall.apr)}</td><td>{ratio(overall.fkfd, overall.fk)}</td><td>{overall.kills}</td><td>{overall.deaths}</td><td>{overall.assists}</td><td>{overall.fk}</td><td>{overall.fd}</td></tr></tfoot>
            </table>
          </div>
        </div> : <div id="player-matches-panel" role="tabpanel" aria-labelledby="player-matches-tab" className={styles.profileMatchList}>
          {filtered.map((record) => { const agent = agentByName.get(record.stats.agent); const rating = aggregateMapStats([record])!.rating; return <Link href={`/vlr-dos-espumas/${record.matchId}`} key={`${record.matchId}:${record.mapId}`} className={styles.profileMatchRow}>
            <time dateTime={record.date}>{formatMatchDate(record.date, true)}</time>
            <span className={styles.profileMatchAgent}>{agent && <Image src={agent.icon} width={29} height={33} alt={record.stats.agent} />}<span><strong>{record.mapName}</strong><small>{record.event}</small></span></span>
            <span className={styles.profileOpponent}>vs. {record.opponent}</span>
            <strong className={record.won ? styles.positive : styles.negative}>{record.score[0]} : {record.score[1]}</strong>
            <span>{record.stats.kills}/{record.stats.deaths}/{record.stats.assists}<small>K / D / A</small></span><span><b>{rating.toFixed(2)}</b><small>R*</small></span>
          </Link>; })}
        </div>}
        <div className={styles.profileNotes}><p><strong>* R:</strong> mesma fórmula Rating Espumas v1 dos placares, calculada por mapa e ponderada pelos rounds. Estimativa calibrada com o VLR 2.0.</p><p>ACS, ADR e KAST ponderados pelos rounds. USE conta mapas; KPR = K/RND, APR = A/RND. Sem mortes no denominador: ∞ quando o numerador é positivo; — quando ambos são zero.</p><p>As estatísticas incluem somente os jogos registrados no VLR dos Espumas. O perfil reúne os nomes atuais e anteriores do mesmo jogador.</p></div>
      </> : <div className={styles.emptyProfile}>Nenhum jogo registrado neste período. Selecione Todos para consultar o histórico.</div>}
    </section>
  </>;
}
