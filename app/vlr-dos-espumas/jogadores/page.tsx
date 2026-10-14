import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { matches } from "@/lib/vlr/matches";
import { playerMapRecords, registeredPlayers } from "@/lib/vlr/player-stats";
import { aggregateMapStats } from "@/lib/vlr/stats";
import styles from "../vlr.module.css";

export const metadata: Metadata = { title: "Jogadores — VLR dos Espumas" };
export default function PlayersPage() {
  const players = registeredPlayers(matches).filter((player) => player.teamId === "espumas");
  return <div className={styles.page}><SiteHeader active="vlr" /><main className={styles.container}>
    <div className={styles.pageHeading}><div><h1>Jogadores dos Espumas</h1><p>Perfis, agentes e estatísticas de todo o histórico registrado.</p></div><Link className={styles.backLink} href="/vlr-dos-espumas">Voltar às partidas</Link></div>
    <div className={styles.playerCards}>{players.map((player) => { const records = playerMapRecords(matches, player.id); const totals = aggregateMapStats(records)!; return <Link key={player.id} href={`/vlr-dos-espumas/jogadores/${player.id}`} className={styles.playerCard}>
      <span className={styles.cardAvatar}>{player.name.slice(0, 2).toUpperCase()}</span><h2>{player.name}</h2><p>{player.riotId}</p>
      <dl><div><dt>Rating</dt><dd>{totals.rating.toFixed(2)}</dd></div><div><dt>K/D/A</dt><dd>{totals.kills}/{totals.deaths}/{totals.assists}</dd></div><div><dt>Mapas</dt><dd>{records.length}</dd></div></dl><span className={styles.cardProfileLink}>Ver perfil e agentes →</span>
    </Link>; })}</div>
  </main></div>;
}
