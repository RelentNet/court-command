// web/src/features/scoring/EventsTimeline.tsx
import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Trophy,
  Repeat,
  Pause,
  Play,
  RotateCcw,
  Settings,
  AlertOctagon,
  Award,
  Square,
  ArrowDownLeft,
  Edit3,
  PlayCircle,
  Hand,
  RefreshCw,
  Flag,
  Ruler,
} from 'lucide-react'
import { cn } from '../../lib/cn'
import type { EventType, MatchEvent } from './types'

export interface EventsTimelineProps {
  events: MatchEvent[]
  initialOrder?: 'newest' | 'oldest'
  initialCompact?: boolean
}

export interface IconSpec {
  Icon: typeof Trophy
  color: string
}

/** Color token → left-border class for the events timeline rail. */
const BORDER_FROM_COLOR: Record<string, string> = {
  'text-(--color-success)': 'border-l-(--color-success)',
  'text-(--color-warning)': 'border-l-(--color-warning)',
  'text-(--color-error)': 'border-l-(--color-error)',
  'text-(--color-accent)': 'border-l-(--color-accent)',
  'text-(--color-text-secondary)': 'border-l-(--color-border)',
}

export const EVENT_META: Record<EventType, { label: string; icon: IconSpec }> = {
  match_started: {
    label: 'Match started',
    icon: { Icon: PlayCircle, color: 'text-(--color-accent)' },
  },
  match_paused: {
    label: 'Match paused',
    icon: { Icon: Pause, color: 'text-(--color-warning)' },
  },
  match_resumed: {
    label: 'Match resumed',
    icon: { Icon: Play, color: 'text-(--color-text-secondary)' },
  },
  match_complete: {
    label: 'Match complete',
    icon: { Icon: Award, color: 'text-(--color-accent)' },
  },
  match_reset: {
    label: 'Match reset',
    icon: { Icon: RotateCcw, color: 'text-(--color-warning)' },
  },
  match_configured: {
    label: 'Match configured',
    icon: { Icon: Settings, color: 'text-(--color-text-secondary)' },
  },
  point_team1: {
    label: 'Point — Team 1',
    icon: { Icon: Trophy, color: 'text-(--color-success)' },
  },
  point_team2: {
    label: 'Point — Team 2',
    icon: { Icon: Trophy, color: 'text-(--color-success)' },
  },
  point_removed: {
    label: 'Point removed',
    icon: { Icon: ArrowDownLeft, color: 'text-(--color-warning)' },
  },
  side_out: {
    label: 'Side out',
    icon: { Icon: Repeat, color: 'text-(--color-text-secondary)' },
  },
  undo: {
    label: 'Undo',
    icon: { Icon: RotateCcw, color: 'text-(--color-warning)' },
  },
  game_complete: {
    label: 'Game complete',
    icon: { Icon: Award, color: 'text-(--color-accent)' },
  },
  confirm_game_over: {
    label: 'Game confirmed',
    icon: { Icon: Award, color: 'text-(--color-accent)' },
  },
  confirm_match_over: {
    label: 'Match confirmed',
    icon: { Icon: Award, color: 'text-(--color-accent)' },
  },
  timeout: {
    label: 'Timeout called',
    icon: { Icon: Pause, color: 'text-(--color-warning)' },
  },
  timeout_ended: {
    label: 'Timeout ended',
    icon: { Icon: Play, color: 'text-(--color-text-secondary)' },
  },
  end_change: {
    label: 'End change',
    icon: { Icon: Repeat, color: 'text-(--color-text-secondary)' },
  },
  substitution: {
    label: 'Substitution',
    icon: { Icon: Repeat, color: 'text-(--color-text-secondary)' },
  },
  score_override: {
    label: 'Score override',
    icon: { Icon: Edit3, color: 'text-(--color-warning)' },
  },
  forfeit_declared: {
    label: 'Forfeit declared',
    icon: { Icon: AlertOctagon, color: 'text-(--color-error)' },
  },
  let: {
    label: 'Let',
    icon: { Icon: Hand, color: 'text-(--color-warning)' },
  },
  re_do: {
    label: 'Re-do',
    icon: { Icon: RefreshCw, color: 'text-(--color-warning)' },
  },
  fault: {
    label: 'Fault',
    icon: { Icon: Flag, color: 'text-(--color-error)' },
  },
  line_call: {
    label: 'Line call',
    icon: { Icon: Ruler, color: 'text-(--color-accent)' },
  },
}

export function formatEventTime(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return ts
  }
}

export function summarizeEvent(e: MatchEvent): string {
  const p = e.payload
  switch (e.event_type) {
    case 'point_team1':
      return 'Point to team 1'
    case 'point_team2':
      return 'Point to team 2'
    case 'point_removed': {
      const team = (p as { team?: number }).team
      return team ? `Point removed from team ${team}` : 'Point removed'
    }
    case 'timeout': {
      const team = (p as { team?: number }).team
      return team ? `Team ${team} timeout` : 'Timeout'
    }
    case 'score_override': {
      const reason = (p as { reason?: string }).reason
      return reason ? `Override: ${reason}` : 'Score override'
    }
    case 'forfeit_declared': {
      const team = (p as { forfeiting_team?: number }).forfeiting_team
      return team ? `Team ${team} forfeit` : 'Forfeit'
    }
    case 'let':
    case 're_do':
    case 'fault':
    case 'line_call': {
      const team = (p as { team?: number }).team
      const note = (p as { note?: string }).note
      const parts: string[] = []
      if (team) parts.push(`Team ${team}`)
      if (note) parts.push(note)
      return parts.join(' — ')
    }
    default:
      return ''
  }
}

export function EventsTimeline({
  events,
  initialOrder = 'newest',
  initialCompact = false,
}: EventsTimelineProps) {
  const [order, setOrder] = useState<'newest' | 'oldest'>(initialOrder)
  const [compact, setCompact] = useState(initialCompact)
  const [filter, setFilter] = useState<Set<EventType>>(new Set())
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const filtered = useMemo(() => {
    const sorted = [...events].sort((a, b) =>
      order === 'newest'
        ? b.sequence_id - a.sequence_id
        : a.sequence_id - b.sequence_id,
    )
    if (filter.size === 0) return sorted
    return sorted.filter((e) => filter.has(e.event_type))
  }, [events, order, filter])

  const allTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.event_type))),
    [events],
  )

  function toggleType(t: EventType) {
    setFilter((prev) => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary)">
      <header className="flex flex-wrap items-center justify-between gap-2 p-3 border-b border-(--color-border)">
        <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide">
          Events
        </h2>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setOrder(order === 'newest' ? 'oldest' : 'newest')}
            className="px-2 py-1 rounded border border-(--color-border) text-(--color-text-primary) hover:bg-(--color-bg-hover)"
          >
            {order === 'newest' ? 'Newest first' : 'Oldest first'}
          </button>
          <button
            type="button"
            onClick={() => setCompact(!compact)}
            className="px-2 py-1 rounded border border-(--color-border) text-(--color-text-primary) hover:bg-(--color-bg-hover)"
          >
            {compact ? 'Detailed' : 'Compact'}
          </button>
        </div>
      </header>

      {allTypes.length > 1 && (
        <div className="flex flex-wrap gap-1 p-2 border-b border-(--color-border)">
          {allTypes.map((t) => {
            const meta = EVENT_META[t]
            const active = filter.has(t)
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleType(t)}
                className={cn(
                  'px-2 py-0.5 rounded-full text-xs',
                  active
                    ? 'bg-(--color-accent) text-white'
                    : 'bg-(--color-bg-hover) text-(--color-text-secondary)',
                )}
                aria-pressed={active}
              >
                {meta?.label ?? t}
              </button>
            )
          })}
          {filter.size > 0 && (
            <button
              type="button"
              onClick={() => setFilter(new Set())}
              className="px-2 py-0.5 rounded-full text-xs underline text-(--color-text-secondary)"
            >
              clear
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="p-4 text-center text-(--color-text-secondary)">
          No events to display.
        </div>
      ) : (
        <ul className="divide-y divide-(--color-border)">
          {filtered.map((e) => {
            const meta = EVENT_META[e.event_type]
            const isOpen = expanded.has(e.id)
            const Icon = meta?.icon.Icon ?? Square
            const summary = summarizeEvent(e)
            const borderClass =
              BORDER_FROM_COLOR[meta?.icon.color ?? ''] ??
              'border-l-(--color-border)'
            return (
              <li
                key={e.id}
                className={cn('p-3 border-l-4 pl-3', borderClass)}
              >
                <button
                  type="button"
                  onClick={() => !compact && toggleExpanded(e.id)}
                  className="w-full flex items-start gap-3 text-left"
                  aria-expanded={isOpen}
                  aria-disabled={compact}
                >
                  <span
                    className={cn(
                      'shrink-0 mt-0.5',
                      meta?.icon.color ?? 'text-(--color-text-secondary)',
                    )}
                  >
                    <Icon size={16} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-(--color-text-primary)">
                        {meta?.label ?? e.event_type}
                      </span>
                      <span className="text-xs text-(--color-text-muted) tabular-nums">
                        {formatEventTime(e.timestamp)}
                      </span>
                    </span>
                    {summary && (
                      <span className="block text-xs text-(--color-text-secondary) mt-0.5">
                        {summary}
                      </span>
                    )}
                  </span>
                  {!compact && (
                    <span className="shrink-0 text-(--color-text-muted) mt-1">
                      {isOpen ? (
                        <ChevronDown size={16} />
                      ) : (
                        <ChevronRight size={16} />
                      )}
                    </span>
                  )}
                </button>
                {!compact && isOpen && (
                  <div className="mt-2 ml-7 text-xs">
                    <details>
                      <summary className="cursor-pointer text-(--color-text-secondary)">
                        Payload
                      </summary>
                      <pre className="mt-1 p-2 rounded bg-(--color-bg-primary) overflow-auto text-(--color-text-primary)">
                        {JSON.stringify(e.payload, null, 2)}
                      </pre>
                    </details>
                    {e.score_snapshot &&
                      Object.keys(e.score_snapshot).length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-(--color-text-secondary)">
                            Score snapshot
                          </summary>
                          <pre className="mt-1 p-2 rounded bg-(--color-bg-primary) overflow-auto text-(--color-text-primary)">
                            {JSON.stringify(e.score_snapshot, null, 2)}
                          </pre>
                        </details>
                      )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
