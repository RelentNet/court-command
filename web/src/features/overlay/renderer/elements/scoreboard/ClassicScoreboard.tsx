// web/src/features/overlay/renderer/elements/scoreboard/ClassicScoreboard.tsx
//
// Classic layout: bottom-left stacked card, two team rows with a
// hairline separator, optional extras bar (game history, timeouts,
// paused badge) and a bottom context strip.
//
// This is the original scoreboard implementation, moved behind the
// layout registry. Behavior is unchanged.
//
// Sub-components (kept colocated because they're not meaningful
// outside the classic layout):
//   - TeamRow        : color bar + short name + initials + score
//   - ServeIndicator : triangular tick next to the serving team
//   - GameHistoryDots: one dot per completed game, won-by color
//   - TimeoutPips    : remaining-timeout indicators per team
//   - MatchContextBar: division / round / match info strip
//
// Animations:
//   - Score pulse 300ms on change
//   - Match-over glow when match_status === 'completed'

import { useEffect, useRef, useState } from 'react'
import type { ElementPosition, OverlayData } from '../../../types'
import { MATCH_STATUS } from '../../../contract'
import type { ScoreboardLayoutProps } from './types'
import { originForPosition, positionClasses } from './transforms'
import { elementScaleStyle } from '../../elementScale'
import { FADE_DURATION_MS, useFadeMount } from '../../FadeMount'

const CLASSIC_DEFAULT_POSITION: ElementPosition = 'bottom-left'

export function ClassicScoreboard({ data, config }: ScoreboardLayoutProps) {
  const { mounted, opacity } = useFadeMount(Boolean(config.visible))
  if (!mounted) return null

  const servingTeam =
    data.serving_team === 1 || data.serving_team === 2 ? data.serving_team : 0
  const isCompleted = data.match_status === MATCH_STATUS.COMPLETED
  const isPaused = data.is_paused

  const effectivePosition = config.position ?? CLASSIC_DEFAULT_POSITION
  const positionClassName = positionClasses(effectivePosition)
  const scaleStyle = elementScaleStyle(config, originForPosition(effectivePosition))

  return (
    <div
      className={`${positionClassName} z-20 min-w-[320px] overflow-hidden shadow-2xl backdrop-blur-md`}
      style={{
        background: 'var(--overlay-primary)',
        color: 'var(--overlay-text)',
        borderRadius: 'var(--overlay-radius)',
        fontFamily: 'var(--overlay-font-family)',
        boxShadow: isCompleted
          ? '0 0 40px var(--overlay-accent), 0 10px 30px rgba(0,0,0,0.5)'
          : '0 10px 30px rgba(0,0,0,0.5)',
        // Combined transitions: box-shadow keeps its 600ms easing for
        // the match-over glow, opacity uses our shared fade duration.
        transition: `box-shadow 600ms ease, opacity ${FADE_DURATION_MS}ms ease-in-out`,
        opacity,
        ...scaleStyle,
      }}
      data-match-status={data.match_status}
      data-scoreboard-layout="classic"
    >
      <TeamRow
        name={data.team_1.short_name || data.team_1.name}
        color={data.team_1.color}
        players={data.team_1.players}
        score={data.team_1.score}
        serving={servingTeam === 1}
        winner={isCompleted && data.team_1.game_wins > data.team_2.game_wins}
      />
      <div
        className="h-px"
        style={{ background: 'rgba(255,255,255,0.12)' }}
        aria-hidden="true"
      />
      <TeamRow
        name={data.team_2.short_name || data.team_2.name}
        color={data.team_2.color}
        players={data.team_2.players}
        score={data.team_2.score}
        serving={servingTeam === 2}
        winner={isCompleted && data.team_2.game_wins > data.team_1.game_wins}
      />

      {(data.completed_games.length > 0 ||
        data.timeouts_remaining_1 < 2 ||
        data.timeouts_remaining_2 < 2 ||
        isPaused) && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2 text-xs"
          style={{ background: 'rgba(0,0,0,0.25)' }}
        >
          <GameHistoryDots games={data.completed_games} />
          <div className="flex items-center gap-3">
            <TimeoutPips remaining={data.timeouts_remaining_1} label="T1" />
            <TimeoutPips remaining={data.timeouts_remaining_2} label="T2" />
            {isPaused && (
              <span
                className="uppercase tracking-widest px-2 py-0.5 rounded font-semibold"
                style={{
                  background: 'var(--overlay-accent)',
                  color: 'var(--overlay-primary)',
                }}
              >
                Paused
              </span>
            )}
          </div>
        </div>
      )}

      <MatchContextBar data={data} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// TeamRow
// ---------------------------------------------------------------------------

interface TeamRowProps {
  name: string
  color: string
  // Backend may emit null when no live match is on the court (e.g. the
  // overlay control panel previewing an empty court). Treat null/undefined
  // as "no players" rather than blowing up the whole settings page.
  players: { name: string }[] | null | undefined
  score: number
  serving: boolean
  winner: boolean
}

function TeamRow({ name, color, players, score, serving, winner }: TeamRowProps) {
  const initials = (players ?? [])
    .slice(0, 2)
    .map((p) => initialsFromName(p.name))
    .filter(Boolean)
    .join(' / ')

  return (
    <div className="flex items-stretch gap-0">
      <div
        className="w-2 shrink-0"
        style={{ background: color || 'var(--overlay-accent)' }}
        aria-hidden="true"
      />
      <div className="flex-1 flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-tight truncate">
              {name}
            </span>
            {winner && (
              <span
                className="text-[10px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: 'var(--overlay-accent)',
                  color: 'var(--overlay-primary)',
                }}
              >
                Winner
              </span>
            )}
          </div>
          {initials && (
            <div className="text-xs opacity-70 truncate">{initials}</div>
          )}
        </div>
        <ServeIndicator visible={serving} />
        <AnimatedScore value={score} />
      </div>
    </div>
  )
}

function initialsFromName(name: string): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase()
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

// ---------------------------------------------------------------------------
// ServeIndicator
// ---------------------------------------------------------------------------

function ServeIndicator({ visible }: { visible: boolean }) {
  return (
    <span
      aria-label={visible ? 'Serving' : undefined}
      className="inline-block transition-opacity duration-200"
      style={{
        width: 0,
        height: 0,
        borderTop: '8px solid transparent',
        borderBottom: '8px solid transparent',
        borderRight: `10px solid ${visible ? 'var(--overlay-accent)' : 'transparent'}`,
        opacity: visible ? 1 : 0,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// AnimatedScore — pulses for 300ms whenever value changes
// ---------------------------------------------------------------------------

function AnimatedScore({ value }: { value: number }) {
  const [pulse, setPulse] = useState(false)
  const prevRef = useRef(value)

  useEffect(() => {
    if (prevRef.current !== value) {
      setPulse(true)
      const t = setTimeout(() => setPulse(false), 300)
      prevRef.current = value
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <span
      className="text-4xl font-black tabular-nums leading-none min-w-[2ch] text-right"
      style={{
        transform: pulse ? 'scale(1.15)' : 'scale(1)',
        transition: 'transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        color: pulse ? 'var(--overlay-accent)' : 'var(--overlay-text)',
      }}
    >
      {value}
    </span>
  )
}

// ---------------------------------------------------------------------------
// GameHistoryDots
// ---------------------------------------------------------------------------

interface GameHistoryDotsProps {
  games: OverlayData['completed_games']
}

function GameHistoryDots({ games }: GameHistoryDotsProps) {
  if (!games.length) {
    return <span className="opacity-0 select-none">—</span>
  }
  return (
    <div className="flex items-center gap-1.5">
      {games.map((g) => (
        <span
          key={g.game_num}
          title={`Game ${g.game_num}: ${g.score_team_1}-${g.score_team_2}`}
          className="block w-2.5 h-2.5 rounded-full"
          style={{
            background:
              g.winner === 1
                ? 'var(--overlay-accent)'
                : 'rgba(255,255,255,0.35)',
          }}
        />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TimeoutPips — vertical pips per remaining timeout (max 2 shown)
// ---------------------------------------------------------------------------

function TimeoutPips({ remaining, label }: { remaining: number; label: string }) {
  const shown = Math.max(0, Math.min(2, remaining))
  return (
    <span className="inline-flex items-center gap-1" title={`${label} timeouts: ${remaining}`}>
      <span className="text-[10px] uppercase tracking-wider opacity-60 font-semibold">
        {label}
      </span>
      <span className="inline-flex gap-0.5">
        {[0, 1].map((i) => (
          <span
            key={i}
            className="inline-block w-1 h-3 rounded-sm"
            style={{
              background:
                i < shown
                  ? 'var(--overlay-accent)'
                  : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// MatchContextBar
// ---------------------------------------------------------------------------

function MatchContextBar({ data }: { data: OverlayData }) {
  const parts = [data.division_name, data.round_label, data.match_info].filter(
    Boolean,
  )
  if (!parts.length) return null
  return (
    <div
      className="px-4 py-1.5 text-[11px] uppercase tracking-widest font-semibold truncate"
      style={{
        background: 'var(--overlay-secondary, rgba(0,0,0,0.4))',
        color: 'var(--overlay-text)',
        opacity: 0.85,
      }}
    >
      {parts.join(' · ')}
    </div>
  )
}
