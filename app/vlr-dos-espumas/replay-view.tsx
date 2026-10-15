"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import agents from "@/app/agents.json";
import { detailedRounds, type RoundEvent } from "@/lib/vlr/performance";
import { replayFrameIndex, replayFrames } from "@/lib/vlr/replay";
import type { MatchMap, RoundSide, ValorantMatch } from "@/lib/vlr/types";
import { ReplayStage, type ReplayStageHandle } from "./replay-stage";
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
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
const reduceQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia(reduceQuery);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};
const motionPreference = () => window.matchMedia(reduceQuery).matches;
const serverMotionPreference = () => false;

export function ReplayView({ match, map }: { match: ValorantMatch; map: MatchMap }) {
  const rounds = useMemo(() => detailedRounds(match, map) ?? [], [match, map]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const round = rounds[roundIndex];
  const frames = useMemo(() => round ? replayFrames(round, map.id) : [], [round, map.id]);
  const startTime = frames[0]?.time ?? 0;
  const endTime = frames.at(-1)?.time ?? startTime;
  const [time, setTime] = useState(startTime);
  const playhead = useRef(startTime);
  const stage = useRef<ReplayStageHandle>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionPreference, serverMotionPreference);

  // Only the map's transforms/opacity change each frame. React's clock, event
  // log and loadouts refresh at most ~12 times a second, not on every frame.
  useEffect(() => {
    if (!playing || !round?.snapshots || !frames.length) return;
    let animation = 0;
    let previous = 0;
    let published = 0;
    const tick = (now: number) => {
      if (document.hidden) previous = 0;
      else {
        if (previous) playhead.current += Math.min((now - previous) / 1000, .25) * speed;
        previous = now;
        stage.current?.draw(playhead.current);
        if (now - published >= 80) { setTime(Math.min(endTime, playhead.current)); published = now; }
        if (playhead.current >= endTime + 1.2) {
          const next = rounds[roundIndex + 1];
          if (next?.snapshots && next.events.length) {
            const start = Math.min(...next.events.map((event) => event.time));
            playhead.current = start;
            setTime(start);
            setRoundIndex(roundIndex + 1);
          } else { setTime(endTime); setPlaying(false); }
          return;
        }
      }
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [playing, round, roundIndex, rounds, speed, endTime, frames.length]);

  useEffect(() => { stage.current?.draw(playhead.current); }, [time, frames, reducedMotion]);

  if (!round?.snapshots || !frames.length) return <p className={styles.viewNote}>O replay 2D ainda não tem posições registradas para {map.name}.</p>;

  const player = (playerId: string) => match.players.find((entry) => entry.id === playerId)!;
  const teamIndex = (playerId: string) => match.teams.findIndex((team) => team.id === player(playerId).teamId);
  const agentOf = (playerId: string) => agentByName.get(map.stats.find((stats) => stats.playerId === playerId)?.agent ?? "");
  const attackers = round.winnerSide === "attack" ? round.winnerIndex : 1 - round.winnerIndex;
  const sideOf = (playerId: string): RoundSide => teamIndex(playerId) === attackers ? "attack" : "defense";
  const score = [0, 1].map((index) => rounds.slice(0, roundIndex + (time >= endTime ? 1 : 0)).filter((entry) => entry.winnerIndex === index).length);
  const frameIndex = replayFrameIndex(frames, time);
  const frame = frames[frameIndex];
  const dead = new Set(frame.markers.filter((marker) => marker.dead).map((marker) => marker.playerId));
  const stagePlayers = match.players.filter((entry) => map.stats.some((stats) => stats.playerId === entry.id))
    .map((entry) => ({ id: entry.id, name: entry.name, icon: agentOf(entry.id)?.icon, side: sideOf(entry.id) }));

  function seek(value: number) {
    const next = Math.max(startTime, Math.min(endTime, value));
    setPlaying(false);
    playhead.current = next;
    setTime(next);
    stage.current?.draw(next);
  }
  function selectRound(index: number) {
    setPlaying(false);
    playhead.current = Math.min(...rounds[index].events.map((event) => event.time));
    setTime(playhead.current);
    setRoundIndex(index);
  }
  function togglePlayback() {
    if (!playing && playhead.current >= endTime) { playhead.current = startTime; setTime(startTime); }
    setPlaying(!playing);
  }
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
        return <li key={stats.playerId} className={dead.has(stats.playerId) ? styles.replayDead : ""}>
          {agentOf(stats.playerId) && <Image src={agentOf(stats.playerId)!.icon} alt="" width={22} height={22} />}<span>{player(stats.playerId).name}</span>
          <small title="Valor do equipamento">{credits(economy?.loadout ?? 0)}</small><small title="Créditos restantes">{credits(economy?.bank ?? 0)}</small>
        </li>;
      })}</ul>
    </div>)}</div>

    <div className={styles.replayTransport}>
      <div className={styles.replayControls}>
        <button type="button" onClick={() => seek(frames[frameIndex - 1].time)} disabled={frameIndex === 0} aria-label="Evento anterior">‹</button>
        <button type="button" onClick={togglePlayback} aria-pressed={playing}>{playing ? "Pausar" : "Reproduzir"}</button>
        <button type="button" onClick={() => seek(frames[frameIndex + 1].time)} disabled={frameIndex === frames.length - 1} aria-label="Próximo evento">›</button>
      </div>
      <label className={styles.replaySpeed}>Velocidade <select aria-label="Velocidade do replay" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
        {[.5, 1, 2, 4].map((value) => <option key={value} value={value}>{value.toLocaleString("pt-BR")}×</option>)}
      </select></label>
      <time className={styles.replayClock}>{clock(time)} / {clock(endTime)}</time>
      <div className={styles.replayScrubber}>
        <input type="range" aria-label="Tempo do round" aria-valuetext={`${clock(time)} de ${clock(endTime)}`} min={startTime} max={endTime} step="0.05" value={time} onChange={(event) => seek(Number(event.target.value))} disabled={startTime === endTime} />
        <div aria-hidden="true">{frames.map((entry) => <i key={entry.time} style={{ left: `${(entry.time - startTime) / (endTime - startTime || 1) * 100}%` }} />)}</div>
      </div>
    </div>

    <div className={styles.replayStage}>
      <ReplayStage key={round.number} ref={stage} mapId={map.id} mapName={map.name} round={round} frames={frames} players={stagePlayers} reducedMotion={reducedMotion} />

      <div className={styles.replayEvents}>
        <h5 className={styles.replayLogHeading}>Eventos do round <span>{clock(startTime)}–{clock(endTime)}</span></h5>
        <ol aria-label={`Eventos do round ${round.number}`}>{round.events.map((entry, index) => <li key={index}>
          <button type="button" aria-current={entry.time === frame.time ? "step" : undefined} className={entry.time === frame.time ? styles.currentEvent : ""} onClick={() => seek(entry.time)} aria-label={`${clock(entry.time)} · ${text(entry)}`}>
            <time>{clock(entry.time)}</time><span className={styles.replayEventText}>{describe(entry)}</span>
          </button>
        </li>)}</ol>
      </div>
    </div>
    <p className={styles.viewNote}>Posições registradas pelo Tracker nos eventos; as rotas entre elas são estimadas pelas passagens do minimapa e não mostram o caminho exato. A reprodução começa no primeiro registro do round. Linhas tracejadas indicam abates por habilidade sem identificação do efeito. ✕ marca mortes; vermelho é ataque e verde-água, defesa.{reducedMotion ? " Movimento reduzido ativo: posições exibidas por evento." : ""}</p>
  </div>;
}
