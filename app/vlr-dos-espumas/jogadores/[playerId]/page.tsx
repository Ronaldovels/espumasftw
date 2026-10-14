import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { matches } from "@/lib/vlr/matches";
import { playerMapRecords, registeredPlayers } from "@/lib/vlr/player-stats";
import { PlayerViewer } from "../../player-viewer";
import styles from "../../vlr.module.css";

const players = registeredPlayers(matches);
export const revalidate = 3600;
export function generateStaticParams() { return players.map((player) => ({ playerId: player.id })); }
export async function generateMetadata({ params }: { params: Promise<{ playerId: string }> }): Promise<Metadata> {
  const { playerId } = await params;
  const player = players.find((entry) => entry.id === playerId);
  return { title: player ? `${player.name} · Estatísticas por agente — VLR dos Espumas` : "Jogador não encontrado" };
}

export default async function PlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await params;
  const player = players.find((entry) => entry.id === playerId);
  if (!player) notFound();
  const asOf = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return <div className={styles.page}><SiteHeader active="vlr" /><div className={styles.container}>
    <div className={styles.pageHeading}><div><h2>VLR dos Espumas</h2><p>Estatísticas individuais e histórico por agente.</p></div><Link className={styles.backLink} href="/vlr-dos-espumas">Voltar às partidas</Link></div>
    <nav className={styles.playerNavigation} aria-label="Jogadores dos Espumas">{players.filter((entry) => entry.teamId === "espumas").map((entry) => <Link key={entry.id} href={`/vlr-dos-espumas/jogadores/${entry.id}`} aria-current={entry.id === player.id ? "page" : undefined}>{entry.name}</Link>)}</nav>
    <PlayerViewer player={player} records={playerMapRecords(matches, player.id)} asOf={asOf} />
    <footer className={styles.footer}>VLR dos Espumas · Estatísticas dos jogos registrados.</footer>
  </div></div>;
}
