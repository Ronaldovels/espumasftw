"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import agents from "@/app/agents.json";
import { duels, playerPerformance, type DuelMode } from "@/lib/vlr/performance";
import { PLAYER_AVATARS } from "@/lib/vlr/players";
import type { MatchMap, MatchPlayer, MatchTeam, ValorantMatch } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

const agentByName = new Map(agents.map((agent) => [agent.name, agent]));
const MODES: Array<{ id: DuelMode; label: string; description: string }> = [
  { id: "all", label: "Todos os abates", description: "eliminações" },
  { id: "first", label: "Primeiros abates", description: "primeiras eliminações do round" },
  { id: "operator", label: "Abates de Operator", description: "eliminações com Operator" },
];
const signed = (value: number) => value > 0 ? `+${value}` : String(value);
const balanceClass = (value: number) => value > 0 ? styles.positive : value < 0 ? styles.negative : "";

function PlayerName({ player, team }: { player: MatchPlayer; team: MatchTeam }) {
  return <span className={styles.duelPlayer}>
    <span className={`${styles.smallCrest} ${styles[team.crest]}`} aria-hidden="true" />
    <span><Link href={`/vlr-dos-espumas/jogadores/${player.id}`}>{player.name}</Link><small>{team.tag}</small></span>
  </span>;
}

export function PerformanceView({ match, maps }: { match: ValorantMatch; maps: MatchMap[] }) {
  const [mode, setMode] = useState<DuelMode>("all");
  const count = duels(match, maps, mode);
  const performance = playerPerformance(match, maps);
  const playersOf = (team: MatchTeam) => match.players.filter((player) => player.teamId === team.id && maps.some((map) => map.stats.some((stats) => stats.playerId === player.id)));
  const [rowTeam, columnTeam] = match.teams;
  const modeLabel = MODES.find((entry) => entry.id === mode)!;
  const teamOf = (player: MatchPlayer) => match.teams.find((team) => team.id === player.teamId)!;
  const agentsOf = (playerId: string) => [...new Set(maps.flatMap((map) => map.stats.filter((stats) => stats.playerId === playerId).map((stats) => stats.agent)))];
  const tiers = (values: number[], kind: "multi" | "clutch") => values.map((value, index) => <td key={index}><span className={`${styles.statValue} ${value ? `${styles.tierCell} ${styles[`${kind}Tier${index}`]}` : ""}`}>{value || ""}</span></td>);

  return <div className={styles.performanceView}>
    <section className={styles.duelSection} aria-labelledby="duels-title">
      <div className={styles.viewToolbar}>
        <h4 id="duels-title">Confrontos diretos</h4>
        <div className={styles.teamFilter} role="group" aria-label="Tipo de abate">{MODES.map((entry) => <button type="button" key={entry.id} aria-pressed={mode === entry.id} className={mode === entry.id ? styles.activeFilter : ""} onClick={() => setMode(entry.id)}>{entry.label}</button>)}</div>
      </div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`Confrontos: ${modeLabel.label}`}>
        <table className={styles.duelTable}>
          <caption className={styles.srOnly}>{modeLabel.label}: em cada célula, {modeLabel.description} do jogador da linha sobre o da coluna, do jogador da coluna sobre o da linha e o saldo.</caption>
          <thead><tr><td />{playersOf(columnTeam).map((player) => <th scope="col" key={player.id}><PlayerName player={player} team={columnTeam} /></th>)}</tr></thead>
          <tbody>{playersOf(rowTeam).map((rowPlayer) => <tr key={rowPlayer.id}>
            <th scope="row"><PlayerName player={rowPlayer} team={rowTeam} /></th>
            {playersOf(columnTeam).map((columnPlayer) => {
              const won = count(rowPlayer.id, columnPlayer.id), lost = count(columnPlayer.id, rowPlayer.id);
              const empty = !won && !lost && mode !== "all";
              return <td key={columnPlayer.id} title={`${rowPlayer.name} ${won} × ${lost} ${columnPlayer.name}`}>
                <div className={styles.duelCell}>
                  <span className={styles.duelFor}>{empty ? "" : won}</span><span className={styles.duelAgainst}>{empty ? "" : lost}</span>
                  <span className={`${styles.duelDiff} ${balanceClass(won - lost)}`}>{empty ? "" : signed(won - lost)}</span>
                </div>
              </td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
      <p className={styles.viewNote}>Cada célula: abates de {rowTeam.name} (linha) · abates de {columnTeam.name} (coluna) · saldo.</p>
    </section>

    <section className={styles.duelSection} aria-labelledby="highlights-title">
      <div className={styles.viewToolbar}><h4 id="highlights-title">Multikills, clutches e economia</h4></div>
      <div className={styles.tableScroll} tabIndex={0} role="region" aria-label="Multikills, clutches e economia por jogador">
        <table className={`${styles.statsTable} ${styles.highlightsTable}`}>
          <caption className={styles.srOnly}>Rounds com 2 a 5 abates, clutches vencidos de 1v1 a 1v5, ECON, plantas e desarmes</caption>
          <thead><tr>
            <th scope="col" className={styles.playerColumn}>Jogador</th><th scope="col" className={styles.agentColumn}>Agentes</th>
            {["2K", "3K", "4K", "5K"].map((label, index) => <th scope="col" key={label} title={`Rounds com ${index + 2} abates`} className={index === 0 ? styles.groupStart : ""}>{label}</th>)}
            {["1v1", "1v2", "1v3", "1v4", "1v5"].map((label, index) => <th scope="col" key={label} title={`Clutches vencidos contra ${index + 1}`} className={index === 0 ? styles.groupStart : ""}>{label}</th>)}
            <th scope="col" className={styles.groupStart} title="Dano causado a cada 1.000 créditos de equipamento">ECON</th><th scope="col" title="Spikes plantadas">PL</th><th scope="col" title="Spikes desarmadas">DE</th>
          </tr></thead>
          <tbody>{match.teams.flatMap((team) => playersOf(team).map((player) => {
            const entry = performance.find((row) => row.playerId === player.id);
            if (!entry) return null;
            return <tr key={player.id}>
              <th scope="row" className={styles.playerCell}><div className={styles.playerIdentity}>
                {PLAYER_AVATARS[player.id] ? <Image src={PLAYER_AVATARS[player.id]} alt="" width={36} height={36} unoptimized className={styles.leaderboardAvatar} /> : <span className={`${styles.smallCrest} ${styles[teamOf(player).crest]}`} aria-hidden="true" />}
                <div><Link href={`/vlr-dos-espumas/jogadores/${player.id}`}><strong>{player.name}</strong></Link><small>{team.tag}</small></div>
              </div></th>
              <td className={styles.agentsCell}><div className={styles.agentPortraits}>{agentsOf(player.id).map((name) => { const agent = agentByName.get(name); return agent ? <Image key={name} src={agent.icon} alt={name} title={name} width={23} height={26} /> : <span key={name}>{name}</span>; })}</div></td>
              {tiers(entry.multikills, "multi")}
              {tiers(entry.clutches, "clutch")}
              <td><span className={styles.statValue}>{entry.econ ?? "–"}</span></td>
              <td><span className={styles.statValue}>{entry.plants}</span></td>
              <td><span className={styles.statValue}>{entry.defuses}</span></td>
            </tr>;
          }))}</tbody>
        </table>
      </div>
      <p className={styles.viewNote}><strong>2K–5K:</strong> rounds com esse número de abates. <strong>1v1–1v5:</strong> clutches vencidos, contados quando o jogador fica sozinho contra esse número de adversários e o time vence com ele vivo. <strong>ECON:</strong> dano causado a cada 1.000 créditos do equipamento usado no round. <strong>PL / DE:</strong> spikes plantadas / desarmadas.</p>
    </section>
  </div>;
}
