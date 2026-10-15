"use client";

import Image from "next/image";
import { useId, useImperativeHandle, useRef, type Ref } from "react";
import type { DetailedRound } from "@/lib/vlr/performance";
import { replayMarkers, type ReplayFrame } from "@/lib/vlr/replay";
import type { RoundSide } from "@/lib/vlr/types";
import styles from "./vlr.module.css";

export type ReplayStageHandle = { draw: (time: number) => void };
export type ReplayAgent = { id: string; name: string; icon?: string; side: RoundSide };

export function ReplayStage({ ref, mapId, mapName, round, frames, players, reducedMotion }: {
  ref: Ref<ReplayStageHandle>;
  mapId: string;
  mapName: string;
  round: DetailedRound;
  frames: ReplayFrame[];
  players: ReplayAgent[];
  reducedMotion: boolean;
}) {
  const markerNodes = useRef(new Map<string, HTMLDivElement>());
  const facingNodes = useRef(new Map<string, HTMLElement>());
  const effectNodes = useRef(new Map<number, SVGGElement>());
  const pulseNodes = useRef(new Map<number, SVGCircleElement>());
  const gradientId = useId();
  const initial = replayMarkers(frames, frames[0]?.time ?? 0);

  useImperativeHandle(ref, () => ({
    draw(time) {
      const markers = replayMarkers(frames, time, !reducedMotion);
      for (const player of players) {
        const node = markerNodes.current.get(player.id);
        const marker = markers.find((entry) => entry.playerId === player.id);
        if (!node) continue;
        node.style.opacity = marker ? String(marker.opacity ?? 1) : "0";
        if (!marker) continue;
        // The wrapper fills the map, so transform percentages are map coordinates.
        node.style.transform = `translate(${marker.x * 100}%, ${marker.y * 100}%)`;
        node.dataset.dead = String(marker.dead);
        const facing = facingNodes.current.get(player.id);
        if (facing) {
          facing.style.opacity = marker.dead || marker.facing === null ? "0" : "1";
          facing.style.transform = `rotate(${marker.facing ?? 0}deg)`;
        }
      }
      for (let index = 0; index < round.events.length; index++) {
        const age = time - round.events[index].time;
        const progress = Math.max(0, Math.min(1, age / 1.2));
        const node = effectNodes.current.get(index);
        if (node) node.style.opacity = age >= 0 && age < 1.2 ? String(1 - progress) : "0";
        const pulse = pulseNodes.current.get(index);
        if (pulse) pulse.style.transform = `scale(${reducedMotion ? 1 : 1 + progress * 1.6})`;
      }
    },
  }), [frames, players, reducedMotion, round]);

  return <div className={styles.replayMap} aria-label={`Replay de ${mapName}, round ${round.number}`}>
    <Image src={`/minimaps/${mapId}.png`} alt={`Minimapa de ${mapName}`} fill sizes="(max-width: 900px) 100vw, 520px" unoptimized />
    <span className={styles.replayApproximation}>Movimento aproximado</span>
    <svg viewBox="0 0 1000 1000" className={styles.replayEffects} aria-hidden="true">
      <defs><radialGradient id={gradientId}><stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient></defs>
      {round.events.map((event, index) => {
        const recorded = round.snapshots?.[index] ?? [];
        const known = replayMarkers(frames, event.time, false);
        const locate = (id: string) => recorded.find((entry) => entry.playerId === id) ?? known.find((entry) => entry.playerId === id);
        const actor = locate(event.type === "kill" ? event.killer : event.type === "death" ? event.victim : event.player);
        const plantIndex = round.events.findLastIndex((entry, position) => position <= index && entry.type === "plant");
        const plant = round.events[plantIndex];
        const spike = plant && plant.type === "plant" ? round.snapshots?.[plantIndex]?.find((entry) => entry.playerId === plant.player)
          ?? replayMarkers(frames, plant.time, false).find((entry) => entry.playerId === plant.player) : undefined;
        const target = event.type === "kill" ? locate(event.victim) : event.type === "explode" ? spike : actor;
        if (!target) return null;
        const color = event.type === "kill" ? players.find((entry) => entry.id === event.killer)?.side === "attack" ? "#ff5e66" : "#3fdcbc"
          : event.type === "plant" ? "#ffd470" : event.type === "defuse" ? "#3fdcbc" : "#ff5e66";
        return <g key={index} ref={(node) => { if (node) effectNodes.current.set(index, node); else effectNodes.current.delete(index); }} opacity="0" stroke={color}>
          {actor && event.type === "kill" && <line x1={actor.x * 1000} y1={actor.y * 1000} x2={target.x * 1000} y2={target.y * 1000}
            strokeWidth={event.weapon === "ab" ? 7 : 4} strokeDasharray={event.weapon === "ab" ? "12 12" : undefined} />}
          <g transform={`translate(${target.x * 1000} ${target.y * 1000})`}>
            <circle ref={(node) => { if (node) pulseNodes.current.set(index, node); else pulseNodes.current.delete(index); }} r={event.type === "explode" ? 95 : 28} strokeWidth="4" fill={`url(#${gradientId})`} />
            {event.type === "plant" || event.type === "defuse" || event.type === "explode"
              ? <text y="-44" textAnchor="middle" fill={color} stroke="none" fontSize="22" fontWeight="700">{event.type === "plant" ? "PLANT" : event.type === "defuse" ? "DESARME" : "EXPLOSÃO"}</text>
              : null}
          </g>
        </g>;
      })}
    </svg>
    {players.map((player) => {
      const marker = initial.find((entry) => entry.playerId === player.id);
      return <div key={player.id} ref={(node) => { if (node) markerNodes.current.set(player.id, node); else markerNodes.current.delete(player.id); }}
        className={styles.replayPosition} data-dead={String(marker?.dead ?? false)} style={{ opacity: marker ? 1 : 0, transform: `translate(${(marker?.x ?? 0) * 100}%, ${(marker?.y ?? 0) * 100}%)` }}>
        <span className={`${styles.replayMarker} ${styles[`${player.side}Marker`]}`} title={player.name}>
          <i ref={(node) => { if (node) facingNodes.current.set(player.id, node); else facingNodes.current.delete(player.id); }} className={styles.replayFacing}
            style={{ opacity: marker?.dead || marker?.facing === null ? 0 : 1, transform: `rotate(${marker?.facing ?? 0}deg)` }} aria-hidden="true" />
          {player.icon && <Image src={player.icon} alt={player.name} width={26} height={26} />}
          <b className={styles.replayDeathMark} aria-hidden="true">✕</b>
        </span>
      </div>;
    })}
  </div>;
}
