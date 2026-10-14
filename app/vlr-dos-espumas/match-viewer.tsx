"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import agents from "@/app/agents.json";
import { displayScore, formatDuration, formatMatchDate, leaderboardRows, totalRounds } from "@/lib/vlr/stats";
import { RATING_VALIDATION } from "@/lib/vlr/rating.mjs";
import type { LeaderboardRow, MatchTeam, SortColumn, ValorantMatch } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

const agentByName = new Map(agents.map((agent) => [agent.name, agent]));
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
const balanceClass = (value: number) => value > 0 ? styles.positive : value < 0 ? styles.negative : "";

function Crest({ team }: { team: MatchTeam }) {
  return <span className={`${styles.crest} ${styles[team.crest]}`} role="img" aria-label={`Escudo do time ${team.name}`} />;
}

function AgentPortraits({ row }: { row: LeaderboardRow }) {
  return <div className={styles.agentPortraits}>{row.agents.map((name) => {
    const agent = agentByName.get(name);
    return agent ? <Image key={name} src={agent.icon} alt={name} title={name} width={23} height={26} /> : <span key={name}>{name}</span>;
  })}</div>;
}

export function MatchViewer({ match }: { match: ValorantMatch }) {
  const [activeMap, setActiveMap] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({ column: "rating", direction: "desc" });
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const score = displayScore(match);
  const selectedMap = match.maps.find((map) => map.id === activeMap);
  const rows = leaderboardRows(match, activeMap);
  const mapTabs = [{ id: "all", label: "Todos os mapas" }, ...match.maps.map((map, index) => ({ id: map.id, label: `${index + 1} ${map.name}` }))];
  const rounds = selectedMap ? selectedMap.score[0] + selectedMap.score[1] : totalRounds(match);
  const title = selectedMap?.name ?? "Todos os mapas";

  function sortBy(column: SortColumn) {
    setSort((current) => ({ column, direction: current.column === column && current.direction === "desc" ? "asc" : "desc" }));
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % mapTabs.length
      : event.key === "ArrowLeft" ? (index + mapTabs.length - 1) % mapTabs.length
      : event.key === "Home" ? 0 : event.key === "End" ? mapTabs.length - 1 : -1;
    if (nextIndex < 0) return;
    event.preventDefault();
    const next = mapTabs[nextIndex].id;
    setActiveMap(next);
    tabRefs.current[next]?.focus();
  }

  function column(key: SortColumn, label: string, description: string) {
    const active = sort.column === key;
    return <th scope="col" aria-sort={active ? sort.direction === "desc" ? "descending" : "ascending" : "none"}>
      <button type="button" onClick={() => sortBy(key)} title={description} aria-label={`Ordenar por ${description}`} className={active ? styles.sortedColumn : ""}>{label}<span aria-hidden="true">{active ? sort.direction === "desc" ? "↓" : "↑" : ""}</span></button>
    </th>;
  }

  return <>
    <section className={styles.matchHeader} aria-labelledby="match-title">
      <div className={styles.matchMeta}><div><h2 id="match-title">{match.teams[0].name} vs. {match.teams[1].name}</h2><span>{match.event} · VALORANT</span></div><div className={styles.matchDate}><time dateTime={match.date}>{formatMatchDate(match.date)}</time><span>{match.maps.length} {match.maps.length === 1 ? "mapa disputado" : "mapas disputados"} · {totalRounds(match)} rounds</span></div></div>
      <div className={styles.matchScore}>
        <div className={`${styles.teamIdentity} ${styles.leftTeam}`}><strong>{match.teams[0].name}</strong><Crest team={match.teams[0]} /></div>
        <div className={styles.scoreCenter}><span className={styles.final}>Final</span><div className={styles.scoreDigits}><b className={balanceClass(score[0] - score[1])}>{score[0]}</b><span>:</span><b className={balanceClass(score[1] - score[0])}>{score[1]}</b></div><small>{match.maps.length === 1 ? match.format ?? "Partida" : `Série de ${match.maps.length} mapas`}</small></div>
        <div className={`${styles.teamIdentity} ${styles.rightTeam}`}><Crest team={match.teams[1]} /><strong>{match.teams[1].name}</strong></div>
      </div>
      <div className={styles.mapResults} aria-label="Placares dos mapas">{match.maps.map((map) => <button type="button" key={map.id} onClick={() => setActiveMap(map.id)} title={`Ver estatísticas de ${map.name}`}><span>{map.name}</span><b className={balanceClass(map.score[0] - map.score[1])}>{map.score[0]}</b><span className={styles.scoreSeparator}>–</span><b className={balanceClass(map.score[1] - map.score[0])}>{map.score[1]}</b>{map.score[0] + map.score[1] > 24 && <small>OT</small>}</button>)}</div>
    </section>

    <section className={styles.statsSection} aria-label="Estatísticas da partida">
      <div className={styles.sectionLabel}>Mapas e estatísticas</div>
      <div className={styles.statsCard}>
        <div className={styles.mapTabs} style={{ gridTemplateColumns: `repeat(${mapTabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Mapa da leaderboard">{mapTabs.map((tab, index) => <button key={tab.id} ref={(element) => { tabRefs.current[tab.id] = element; }} id={`map-tab-${tab.id}`} type="button" role="tab" aria-selected={activeMap === tab.id} aria-controls="match-stats-panel" tabIndex={activeMap === tab.id ? 0 : -1} className={activeMap === tab.id ? styles.activeTab : ""} onClick={() => setActiveMap(tab.id)} onKeyDown={(event) => onTabKey(event, index)}>{tab.label}</button>)}</div>
        <div id="match-stats-panel" role="tabpanel" aria-labelledby={`map-tab-${activeMap}`} tabIndex={0}>
          {selectedMap && <div className={styles.mapBanner}>
            <Image src={`/maps/${selectedMap.id}.webp`} alt="" fill sizes="(max-width: 900px) 100vw, 900px" className={styles.mapBannerImage} />
            <div className={styles.mapBannerContent}><div><span>Mapa {match.maps.indexOf(selectedMap) + 1}</span><h3>{selectedMap.name}</h3><small>{formatDuration(selectedMap.durationSeconds)} · {rounds} rounds{rounds > 24 ? " · Prorrogação" : ""}</small></div><div className={styles.mapBannerScore}><span>{match.teams[0].tag}</span><strong>{selectedMap.score[0]} <em>:</em> {selectedMap.score[1]}</strong><span>{match.teams[1].tag}</span></div></div>
          </div>}
          <div className={styles.tableToolbar}><div aria-live="polite"><strong>{title}</strong><span>{rounds} rounds{activeMap === "all" ? " · Estatísticas consolidadas" : ""}</span></div><div className={styles.teamFilter} role="group" aria-label="Filtrar equipe">{[{ id: "all", name: "Todos" }, ...match.teams.map((team) => ({ id: team.id, name: team.name }))].map((filter) => <button type="button" key={filter.id} aria-pressed={teamFilter === filter.id} className={teamFilter === filter.id ? styles.activeFilter : ""} onClick={() => setTeamFilter(filter.id)}>{filter.name}</button>)}</div></div>
          {match.teams.filter((team) => teamFilter === "all" || teamFilter === team.id).map((team) => {
            const players = rows.filter((row) => row.teamId === team.id).sort((a, b) => (sort.direction === "desc" ? b[sort.column] - a[sort.column] : a[sort.column] - b[sort.column]) || b.rating - a.rating || a.name.localeCompare(b.name));
            return <div key={team.id} className={styles.teamTable}>
              <div className={`${styles.tableTeamHeading} ${styles[`${team.crest}Heading`]}`}><span className={`${styles.smallCrest} ${styles[team.crest]}`} aria-hidden="true" /><h3>{team.name}</h3><span>{team.tag}</span></div>
              <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`Leaderboard ${team.name} em ${title}`}>
                <table className={styles.statsTable}>
                  <caption className={styles.srOnly}>{team.name} · {title} · {rounds} rounds</caption>
                  <thead><tr><th scope="col" className={styles.playerColumn}>Jogador</th><th scope="col" className={styles.agentColumn}>Agentes</th>{column("rating", "R*", "rating estimado")}{column("acs", "ACS", "pontuação média de combate")}{column("kills", "K", "eliminações")}{column("deaths", "D", "mortes")}{column("assists", "A", "assistências")}{column("diff", "+/−", "saldo de eliminações e mortes")}{column("kast", "KAST", "KAST")}{column("adr", "ADR", "dano médio por round")}<th scope="col" title={activeMap === "all" ? `HS% de cada mapa, na ordem ${match.maps.map((map) => map.name).join(" / ")}` : "Percentual de headshots"}>HS%</th>{column("fk", "FK", "primeiras eliminações")}{column("fd", "FD", "primeiras mortes")}{column("openingDiff", "+/−", "saldo de primeiras eliminações e mortes")}</tr></thead>
                  <tbody>{players.map((row) => <tr key={row.id}>
                    <th scope="row" className={styles.playerCell}><Link href={`/vlr-dos-espumas/jogadores/${row.id}`} title={row.riotId ? `${row.name} · ${row.riotId}` : row.name}><strong>{row.name}</strong></Link><small>{team.tag}</small></th>
                    <td className={styles.agentsCell}><AgentPortraits row={row} /></td>
                    <td><span className={`${styles.statValue} ${styles.rating} ${row.rating >= 1.2 ? styles.highRating : row.rating < 0.85 ? styles.lowRating : ""}`}>{row.rating.toFixed(2)}</span></td>
                    <td><span className={styles.statValue}>{row.acs}</span></td>
                    <td><span className={styles.statValue}>{row.kills}</span></td>
                    <td><span className={styles.statValue}>{row.deaths}</span></td>
                    <td><span className={styles.statValue}>{row.assists}</span></td>
                    <td><span className={`${styles.statValue} ${balanceClass(row.diff)}`}>{signed(row.diff)}</span></td>
                    <td><span className={styles.statValue}>{row.kast}%</span></td>
                    <td><span className={styles.statValue}>{row.adr}</span></td>
                    <td><span className={`${styles.statValue} ${styles.headshots}`} title={row.headshots.map((entry) => `${entry.map}: ${entry.value}%`).join(" · ")}>{row.headshots.map((entry) => entry.value).join("/")}{row.headshots.length === 1 ? "%" : ""}</span></td>
                    <td><span className={styles.statValue}>{row.fk}</span></td>
                    <td><span className={styles.statValue}>{row.fd}</span></td>
                    <td><span className={`${styles.statValue} ${balanceClass(row.openingDiff)}`}>{signed(row.openingDiff)}</span></td>
                  </tr>)}</tbody>
                </table>
              </div>
            </div>;
          })}
          <div className={styles.tableNotes}><p><strong>* R:</strong> Rating Espumas v1, estimativa calibrada com o VLR 2.0. Não é o rating oficial.</p>{activeMap === "all" && <p><strong>HS%:</strong> {match.maps.map((map) => map.name).join(" / ")}, na mesma ordem. Médias gerais por round.</p>}<p className={styles.mobileHint}>Deslize a tabela para ver todas as colunas.</p></div>
        </div>
      </div>
    </section>

    <details className={styles.methodology}><summary>Como ler as estatísticas</summary><div><p>{match.ratingNote}</p><p>A fórmula foi calibrada em {RATING_VALIDATION.trainMaps} mapas do Champions 2025 e testada separadamente em {RATING_VALIDATION.testMaps} mapas do Champions 2026. Nesse teste, a diferença média para o rating oficial foi de {RATING_VALIDATION.mae.toFixed(3).replace(".", ",")} ponto; {(RATING_VALIDATION.within010 * 100).toFixed(1).replace(".", ",")}% das estimativas ficaram a até 0,10 ponto. Esses resultados são de partidas profissionais e não garantem o mesmo erro nos jogos registrados aqui.</p><p>As estatísticas foram conferidas no Tracker, incluindo o ADR com uma casa decimal usado no cálculo. As médias gerais são ponderadas pelos rounds; quando há médias consolidadas registradas, mantemos os valores de exibição originais. Eliminações, mortes, assistências, FK e FD são somados entre os mapas.</p><p><a href={match.sourceUrl} target="_blank" rel="noreferrer">Consultar partida no Tracker ↗</a></p>{match.maps.flatMap((map) => map.uncreditedDeaths?.map((entry) => <p key={`${map.id}:${entry.playerId}`}>{map.name}: {entry.reason} Esse evento explica a diferença entre mortes do time e eliminações adversárias.</p>) ?? [])}<dl><div><dt>ACS</dt><dd>Pontuação média de combate.</dd></div><div><dt>K / D / A</dt><dd>Eliminações / mortes / assistências.</dd></div><div><dt>KAST</dt><dd>Percentual de rounds com eliminação, assistência, sobrevivência ou troca. Exibido na tabela; não entra nesta fórmula.</dd></div><div><dt>ADR</dt><dd>Dano médio causado por round.</dd></div><div><dt>HS%</dt><dd>Percentual de acertos na cabeça. No geral, cada valor corresponde a um mapa.</dd></div><div><dt>FK / FD</dt><dd>Primeira eliminação / primeira morte do round. A última coluna mostra esse saldo.</dd></div></dl></div></details>
  </>;
}
