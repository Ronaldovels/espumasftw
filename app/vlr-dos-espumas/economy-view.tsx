import { BUY_TYPES, economyRounds, economySummary, type BuyType, type EconomyRound } from "@/lib/vlr/performance";
import type { MatchMap, ValorantMatch } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

const BUYS: Record<BuyType, { symbol: string; label: string; range: string }> = {
  eco: { symbol: "", label: "Eco", range: "0–5k" },
  semiEco: { symbol: "$", label: "Semi-eco", range: "5–10k" },
  semiBuy: { symbol: "$$", label: "Semi-buy", range: "10–20k" },
  fullBuy: { symbol: "$$$", label: "Full buy", range: "20k+" },
};
const credits = (value: number) => `${(value / 1000).toFixed(1).replace(".", ",")}k`;

function segments(rounds: EconomyRound[]) {
  return [rounds.slice(0, 12), rounds.slice(12, 24), rounds.slice(24)].filter((segment) => segment.length);
}

function EconomyRounds({ match, map, showTitle }: { match: ValorantMatch; map: MatchMap; showTitle: boolean }) {
  const rounds = economyRounds(match, map);
  if (!rounds.length) return null;
  return <div className={styles.economyMap}>
    {showTitle && <h5>{map.name} <span>{map.score[0]}–{map.score[1]}</span></h5>}
    <div className={styles.timelineScroll} tabIndex={0} role="region" aria-label={`Economia por round em ${map.name}`}>
      <div className={styles.timelineGrid}>
        <div className={styles.economyTeams} aria-hidden="true">
          <small>Banco</small>
          {match.teams.map((team) => <div key={team.id} className={styles.timelineTeam}><span className={`${styles.smallCrest} ${styles[team.crest]}`} /><strong>{team.tag}</strong></div>)}
          <small>Banco</small>
        </div>
        {segments(rounds).map((segment) => <ol key={segment[0].number} className={`${styles.roundList} ${styles.economySegment}`} start={segment[0].number}>{segment.map((round) => {
          const describe = (index: 0 | 1) => `${match.teams[index].name}: ${BUYS[round.teams[index].type].label}, equipamento ${credits(round.teams[index].loadout)}, banco ${credits(round.teams[index].bank)}`;
          const description = `Round ${round.number} · ${describe(0)} · ${describe(1)} · ${match.teams[round.winnerIndex].name} venceu`;
          return <li key={round.number} className={styles.economyColumn} title={description} aria-label={description}>
            <small aria-hidden="true">{credits(round.teams[0].bank)}</small>
            {round.teams.map((team, index) => <span key={index} aria-hidden="true" className={`${styles.buyCell} ${index === round.winnerIndex ? `${styles.buyWin} ${round.winnerSide ? styles[`${round.winnerSide}Buy`] : ""}` : ""}`}>{BUYS[team.type].symbol}</span>)}
            <small aria-hidden="true">{credits(round.teams[1].bank)}</small>
            <b aria-hidden="true">{round.number}</b>
          </li>;
        })}</ol>)}
      </div>
    </div>
  </div>;
}

export function EconomyView({ match, maps }: { match: ValorantMatch; maps: MatchMap[] }) {
  const summary = economySummary(match, maps);
  return <div className={styles.economyView}>
    <div className={styles.viewToolbar}><h4 id="economy-title">Compras por tipo</h4></div>
    <div className={styles.tableScroll} tabIndex={0} role="region" aria-labelledby="economy-title">
      <table className={`${styles.statsTable} ${styles.economyTable}`}>
        <caption className={styles.srOnly}>Rounds jogados por tipo de compra, com vitórias entre parênteses</caption>
        <thead><tr><th scope="col" className={styles.playerColumn}>Time</th><th scope="col">Pistolas vencidas</th>{BUY_TYPES.map((type) => <th scope="col" key={type} title={`${BUYS[type].label}: ${BUYS[type].range}`}>{type === "eco" ? "Eco" : BUYS[type].symbol} (vitórias)</th>)}</tr></thead>
        <tbody>{match.teams.map((team, index) => <tr key={team.id}>
          <th scope="row" className={styles.playerCell}><div className={styles.playerIdentity}><span className={`${styles.smallCrest} ${styles[team.crest]}`} aria-hidden="true" /><strong>{team.tag}</strong></div></th>
          <td><span className={styles.statValue}>{summary[index].pistolWon}</span></td>
          {BUY_TYPES.map((type) => <td key={type}><span className={styles.statValue}>{summary[index].buys[type].played} ({summary[index].buys[type].won})</span></td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <ul className={styles.buyLegend} aria-label="Faixas de compra">{BUY_TYPES.map((type) => <li key={type}><b>{BUYS[type].symbol || BUYS[type].label}</b>{BUYS[type].symbol ? ` ${BUYS[type].label}` : ""}: {BUYS[type].range}</li>)}</ul>
    {maps.map((map) => <EconomyRounds key={map.id} match={match} map={map} showTitle={maps.length > 1} />)}
    <p className={styles.viewNote}>Faixas pelo valor do equipamento somado do time no round. O banco é o crédito que sobrou após as compras. Células destacadas marcam o vencedor do round, em vermelho no ataque e verde-água na defesa.</p>
  </div>;
}
