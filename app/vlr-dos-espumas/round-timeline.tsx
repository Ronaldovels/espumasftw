import Image from "next/image";
import { Hourglass } from "lucide-react";
import { roundTimeline } from "@/lib/vlr/stats";
import type { MatchMap, RoundOutcome, RoundSide, TimelineRound, ValorantMatch } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

// Detonations only happen on attack; defuses and timeouts only on defense.
const OUTCOMES: Record<RoundOutcome, { label: string; side?: RoundSide }> = {
  elimination: { label: "Eliminação" },
  detonate: { label: "Spike detonada", side: "attack" },
  defuse: { label: "Spike desarmada", side: "defense" },
  time: { label: "Tempo esgotado", side: "defense" },
};
const SIDES: Record<RoundSide, { label: string; short: string; color: string }> = {
  attack: { label: "no ataque", short: "ATQ", color: "red" },
  defense: { label: "na defesa", short: "DEF", color: "teal" },
};

// Tracker icons come in red / teal; the color shows the winner's side, gray when it is unknown.
function OutcomeIcon({ outcome, side, size }: { outcome: RoundOutcome; side?: RoundSide; size: number }) {
  if (outcome === "time") return <Hourglass aria-hidden="true" size={size - 4} strokeWidth={2.4} className={side ? styles[`${side}Text`] : styles.neutralIcon} />;
  return <Image src={`/rounds/${outcome}-${SIDES[side ?? "defense"].color}.png`} alt="" width={size} height={size} unoptimized className={side ? undefined : styles.neutralIcon} />;
}

function segments(rounds: TimelineRound[]) {
  return [
    { label: "1º tempo", rounds: rounds.slice(0, 12) },
    { label: "2º tempo", rounds: rounds.slice(12, 24) },
    { label: "Prorrogação", rounds: rounds.slice(24) },
  ].filter((segment) => segment.rounds.length);
}

export function RoundTimeline({ match, map }: { match: ValorantMatch; map: MatchMap }) {
  const rounds = roundTimeline(match, map);
  if (!rounds.length) return null;
  const hasSides = rounds.some((round) => round.winnerSide);
  const outcomes = (Object.keys(OUTCOMES) as RoundOutcome[]).filter((outcome) => rounds.some((round) => round.outcome === outcome));
  const wins = (list: TimelineRound[], index: number, side?: RoundSide) => list.filter((round) => round.winnerIndex === index && (!side || round.winnerSide === side)).length;

  return <section className={styles.roundTimeline} aria-labelledby="round-timeline-title">
    <div className={styles.timelineHeader}>
      <h4 id="round-timeline-title">Linha do tempo</h4>
      <ul className={styles.timelineLegend} aria-label="Legenda">
        {hasSides && (Object.keys(SIDES) as RoundSide[]).map((side) => <li key={side}><span className={`${styles.legendSwatch} ${styles[side]}`} aria-hidden="true" />Vitória {SIDES[side].label}</li>)}
        {outcomes.map((outcome) => <li key={outcome}><OutcomeIcon outcome={outcome} side={OUTCOMES[outcome].side} size={14} />{OUTCOMES[outcome].label}</li>)}
      </ul>
    </div>
    <div className={styles.timelineScroll} tabIndex={0} role="region" aria-label={`Rounds de ${map.name}`}>
      <div className={styles.timelineGrid}>
        <div className={styles.timelineTeams}>{match.teams.map((team, index) => <div key={team.id} className={styles.timelineTeam}>
          <span className={`${styles.smallCrest} ${styles[team.crest]}`} aria-hidden="true" />
          <strong title={team.name}>{team.tag}</strong>
          {hasSides && <small>{(Object.keys(SIDES) as RoundSide[]).map((side) => <span key={side} className={styles[`${side}Text`]} title={`Rounds vencidos por ${team.name} ${SIDES[side].label}`}>{SIDES[side].short} {wins(rounds, index, side)}</span>)}</small>}
        </div>)}</div>
        {segments(rounds).map((segment) => <div key={segment.label} className={styles.timelineSegment}>
          <span className={styles.segmentLabel}>{segment.label}<b>{wins(segment.rounds, 0)}–{wins(segment.rounds, 1)}</b></span>
          <ol className={styles.roundList} start={segment.rounds[0].number}>{segment.rounds.map((round) => {
            const description = `Round ${round.number}: ${match.teams[round.winnerIndex].name} venceu${round.winnerSide ? ` ${SIDES[round.winnerSide].label}` : ""} · ${OUTCOMES[round.outcome].label}`;
            return <li key={round.number} className={styles.roundColumn} title={description} aria-label={description}>
              {match.teams.map((team, index) => index === round.winnerIndex
                ? <span key={team.id} className={styles.roundWin} aria-hidden="true"><OutcomeIcon outcome={round.outcome} side={round.winnerSide} size={18} /></span>
                : <span key={team.id} className={styles.roundLoss} aria-hidden="true" />)}
              <small aria-hidden="true">{round.number}</small>
            </li>;
          })}</ol>
        </div>)}
      </div>
    </div>
  </section>;
}
