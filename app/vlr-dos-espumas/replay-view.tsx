"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import agents from "@/app/agents.json";
import { detailedRounds, type DetailedRound, type MapMarker, type RoundEvent } from "@/lib/vlr/performance";
import type { MatchMap, RoundSide, ValorantMatch } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

const agentByName = new Map(agents.map((agent) => [agent.name, agent]));
// Weapon UUID prefixes from Valorant-API; anything else in the Tracker log is an ability or ultimate.
const WEAPONS: Record<string, string> = {
  "29a0cfab": "Classic", "42da8ccc": "Shorty", "44d4e95c": "Frenzy", "1baa85b4": "Ghost", "e336c6b8": "Sheriff",
  "f7e1b454": "Stinger", "462080d1": "Spectre", "910be174": "Bucky", "ec845bf4": "Judge", "ae3de142": "Bulldog",
  "4ade7faa": "Guardian", "ee8e8d15": "Phantom", "9c82e19d": "Vandal", "c4883e50": "Marshal", "5f0aaf7a": "Outlaw",
  "a03b24d3": "Operator", "55d8a0f4": "Ares", "63e6c2b6": "Odin", "410b2e0b": "Bandit", "2f59173c": "Faca",
};
const SIDE_LABEL: Record<RoundSide, string> = { attack: "Ataque", defense: "Defesa" };
const credits = (value: number) => value.toLocaleString("pt-BR");
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function eventPlayers(event: RoundEvent) {
  return event.type === "kill" ? [event.killer, event.victim] : event.type === "death" ? [event.victim] : [event.player];
}

// Where each player who died before the selected event fell: their victim marker, or their last known position.
function fallen(round: DetailedRound, upTo: number) {
  const positions = new Map<string, MapMarker>();
  round.events.slice(0, upTo).forEach((event, index) => {
    if (event.type !== "kill" && event.type !== "death") return;
    const snapshot = round.snapshots?.[index] ?? [];
    const marker = snapshot.find((entry) => entry.playerId === event.victim)
      ?? round.snapshots?.slice(0, index).reverse().flatMap((entry) => entry).find((entry) => entry.playerId === event.victim);
    if (marker) positions.set(event.victim, marker);
  });
  return positions;
}

export function ReplayView({ match, map }: { match: ValorantMatch; map: MatchMap }) {
  const rounds = detailedRounds(match, map) ?? [];
  const [roundIndex, setRoundIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const round = rounds[roundIndex];

  useEffect(() => {
    if (!playing || !round) return;
    const timer = setTimeout(() => {
      if (eventIndex < round.events.length - 1) setEventIndex(eventIndex + 1);
      else if (roundIndex < rounds.length - 1) { setRoundIndex(roundIndex + 1); setEventIndex(0); }
      else setPlaying(false);
    }, eventIndex === round.events.length - 1 ? 2200 : 1300);
    return () => clearTimeout(timer);
  }, [playing, round, roundIndex, eventIndex, rounds.length]);

  if (!round?.snapshots) return <p className={styles.viewNote}>O replay 2D ainda não tem posições registradas para {map.name}.</p>;

  const player = (playerId: string) => match.players.find((entry) => entry.id === playerId)!;
  const teamIndex = (playerId: string) => match.teams.findIndex((team) => team.id === player(playerId).teamId);
  const agentOf = (playerId: string) => agentByName.get(map.stats.find((stats) => stats.playerId === playerId)?.agent ?? "");
  const attackers = round.winnerSide === "attack" ? round.winnerIndex : 1 - round.winnerIndex;
  const sideOf = (playerId: string): RoundSide => teamIndex(playerId) === attackers ? "attack" : "defense";
  const score = [0, 1].map((index) => rounds.slice(0, roundIndex + 1).filter((entry) => entry.winnerIndex === index).length);
  const event = round.events[eventIndex];
  const snapshot = round.snapshots[eventIndex] ?? [];
  const dead = fallen(round, eventIndex);
  const focus = new Set(eventPlayers(event));
  const killer = event.type === "kill" ? snapshot.find((entry) => entry.playerId === event.killer) : undefined;
  const victim = event.type === "kill" || event.type === "death" ? snapshot.find((entry) => entry.playerId === event.victim) ?? dead.get(event.victim) : undefined;

  function selectRound(index: number) { setRoundIndex(index); setEventIndex(0); }
  function chip(playerId: string) {
    const agent = agentOf(playerId);
    return <span className={`${styles.replayChip} ${styles[`${sideOf(playerId)}Chip`]}`}>{agent && <Image src={agent.icon} alt="" width={20} height={20} />}{player(playerId).name}</span>;
  }
  function describe(entry: RoundEvent) {
    if (entry.type === "kill") return <>{chip(entry.killer)}<span className={styles.replayWeapon}>{WEAPONS[entry.weapon] ?? "Habilidade"}</span>{chip(entry.victim)}</>;
    if (entry.type === "death") return <>{chip(entry.victim)}<span className={styles.replayWeapon}>{entry.blast ? "morreu na explosão" : "morreu sem autor"}</span></>;
    if (entry.type === "plant") return <>Spike plantada por {chip(entry.player)}</>;
    if (entry.type === "defuse") return <>Spike desarmada por {chip(entry.player)}</>;
    return <>Spike detonada</>;
  }
  const text = (entry: RoundEvent) => entry.type === "kill" ? `${player(entry.killer).name} eliminou ${player(entry.victim).name} com ${WEAPONS[entry.weapon] ?? "habilidade"}`
    : entry.type === "death" ? `${player(entry.victim).name} morreu`
    : entry.type === "plant" ? `Spike plantada por ${player(entry.player).name}` : entry.type === "defuse" ? `Spike desarmada por ${player(entry.player).name}` : "Spike detonada";

  return <div className={styles.replayView}>
    <div className={styles.timelineScroll} tabIndex={0} role="region" aria-label="Escolher round">
      <div className={styles.replayRounds} role="group" aria-label="Rounds">{rounds.map((entry, index) => <button key={entry.number} type="button" aria-pressed={index === roundIndex} onClick={() => selectRound(index)} title={`Round ${entry.number}: ${match.teams[entry.winnerIndex].name} venceu`}
        className={`${styles.replayRound} ${entry.winnerSide ? styles[`${entry.winnerSide}Buy`] : styles.buyWin} ${index === roundIndex ? styles.currentRound : ""} ${index === 12 || index === 24 ? styles.halfStart : ""}`}>
        <span className={styles.replayRoundTeam}>{match.teams[entry.winnerIndex].tag}</span>{entry.number}
      </button>)}</div>
    </div>

    <div className={styles.replayHeader}>
      <button type="button" onClick={() => selectRound(roundIndex - 1)} disabled={roundIndex === 0} aria-label="Round anterior">‹</button>
      <div><strong>{match.teams[0].tag} <b>{score[0]}</b></strong><span>Round {round.number} / {rounds.length}</span><strong><b>{score[1]}</b> {match.teams[1].tag}</strong></div>
      <button type="button" onClick={() => selectRound(roundIndex + 1)} disabled={roundIndex === rounds.length - 1} aria-label="Próximo round">›</button>
    </div>

    <div className={styles.replayLoadouts}>{match.teams.map((team, index) => <div key={team.id}>
      <h5><span className={`${styles.smallCrest} ${styles[team.crest]}`} aria-hidden="true" />{team.name}<span className={styles[`${index === attackers ? "attack" : "defense"}Text`]}>{SIDE_LABEL[index === attackers ? "attack" : "defense"]}</span></h5>
      <ul>{map.stats.filter((stats) => teamIndex(stats.playerId) === index).map((stats) => {
        const economy = round.economy[stats.playerId];
        return <li key={stats.playerId} className={dead.has(stats.playerId) || (focus.has(stats.playerId) && victim?.playerId === stats.playerId) ? styles.replayDead : ""}>
          {agentOf(stats.playerId) && <Image src={agentOf(stats.playerId)!.icon} alt="" width={22} height={22} />}<span>{player(stats.playerId).name}</span>
          <small title="Valor do equipamento">{credits(economy?.loadout ?? 0)}</small><small title="Créditos restantes">{credits(economy?.bank ?? 0)}</small>
        </li>;
      })}</ul>
    </div>)}</div>

    <div className={styles.replayStage}>
      <div className={styles.replayMap}>
        <Image src={`/minimaps/${map.id}.png`} alt={`Minimapa de ${map.name}`} fill sizes="(max-width: 900px) 100vw, 520px" unoptimized />
        <svg viewBox="0 0 1000 1000" className={styles.replayLines} aria-hidden="true">
          {killer && victim && <line x1={killer.x * 1000} y1={killer.y * 1000} x2={victim.x * 1000} y2={victim.y * 1000} className={styles[`${sideOf(killer.playerId)}Line`]} />}
        </svg>
        {[...dead.values()].filter((marker) => !snapshot.some((entry) => entry.playerId === marker.playerId)).map((marker) => <span key={`dead-${marker.playerId}`} className={styles.replayCorpse} style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }} title={`${player(marker.playerId).name} (morto)`}>✕</span>)}
        {snapshot.map((marker) => {
          const agent = agentOf(marker.playerId);
          const isVictim = marker.facing === null;
          return <span key={marker.playerId} className={`${styles.replayMarker} ${styles[`${sideOf(marker.playerId)}Marker`]} ${isVictim ? styles.victimMarker : ""} ${focus.has(marker.playerId) ? styles.focusMarker : ""}`} style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }} title={player(marker.playerId).name}>
            {marker.facing !== null && <i className={styles.replayFacing} style={{ transform: `rotate(${marker.facing}deg)` }} aria-hidden="true" />}
            {agent && <Image src={agent.icon} alt="" width={26} height={26} />}
          </span>;
        })}
      </div>

      <div className={styles.replayEvents}>
        <div className={styles.replayControls}>
          <button type="button" onClick={() => setEventIndex(Math.max(0, eventIndex - 1))} disabled={eventIndex === 0} aria-label="Evento anterior">‹</button>
          <button type="button" onClick={() => setPlaying(!playing)} aria-pressed={playing}>{playing ? "Pausar" : "Reproduzir"}</button>
          <button type="button" onClick={() => setEventIndex(Math.min(round.events.length - 1, eventIndex + 1))} disabled={eventIndex === round.events.length - 1} aria-label="Próximo evento">›</button>
        </div>
        <ol aria-label={`Eventos do round ${round.number}`}>{round.events.map((entry, index) => <li key={index}>
          <button type="button" aria-current={index === eventIndex ? "step" : undefined} className={index === eventIndex ? styles.currentEvent : ""} onClick={() => { setEventIndex(index); setPlaying(false); }} aria-label={`${clock(entry.time)} · ${text(entry)}`}>
            <time>{clock(entry.time)}</time><span className={styles.replayEventText}>{describe(entry)}</span>
          </button>
        </li>)}</ol>
      </div>
    </div>
    <p className={styles.viewNote}>Posições do Tracker no instante de cada evento. A seta indica para onde o jogador olhava; ✕ marca quem já morreu. Cores pelo lado no round: vermelho no ataque, verde-água na defesa. Abates no mesmo segundo podem repetir a mesma foto.</p>
  </div>;
}
