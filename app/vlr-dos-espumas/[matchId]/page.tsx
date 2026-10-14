import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { matches, formatMatchDate, withTrackerRounds } from "@/lib/vlr/matches";
import { MatchPage } from "../match-page";

export function generateStaticParams() {
  return matches.map((match) => ({ matchId: match.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ matchId: string }> }): Promise<Metadata> {
  const { matchId } = await params;
  const match = matches.find((entry) => entry.id === matchId);
  return { title: match ? `${match.teams[0].name} vs. ${match.teams[1].name} · ${formatMatchDate(match.date, true)} — VLR dos Espumas` : "Partida não encontrada — VLR dos Espumas" };
}

export default async function MatchDetailPage({ params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const match = matches.find((entry) => entry.id === matchId);
  if (!match) notFound();
  return <MatchPage match={withTrackerRounds(match)} />;
}
