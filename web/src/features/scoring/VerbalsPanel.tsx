// web/src/features/scoring/VerbalsPanel.tsx
import { useState } from 'react'
import { Hand, RefreshCw, Flag, Ruler, Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useToast } from '../../components/Toast'
import { useRecordMatchEvent } from './hooks'
import type { EventType, Match } from './types'

export interface VerbalsPanelProps {
  match: Match
  /** Disabled while the websocket is down or the match isn't in progress. */
  disabled?: boolean
  className?: string
}

interface VerbalCall {
  type: Extract<EventType, 'let' | 're_do' | 'fault' | 'line_call'>
  label: string
  Icon: typeof Hand
  /** Tailwind color token for the icon, matching the events timeline. */
  color: string
  hint: string
}

// Mirrors EVENT_META in EventsTimeline.tsx so a call recorded here shows the
// same icon/label in the log beside it.
const CALLS: VerbalCall[] = [
  {
    type: 'let',
    label: 'Let',
    Icon: Hand,
    color: 'text-(--color-warning)',
    hint: 'Replay the point — no fault',
  },
  {
    type: 're_do',
    label: 'Re-do',
    Icon: RefreshCw,
    color: 'text-(--color-warning)',
    hint: 'Replay the rally',
  },
  {
    type: 'fault',
    label: 'Fault',
    Icon: Flag,
    color: 'text-(--color-error)',
    hint: 'Service or foot fault',
  },
  {
    type: 'line_call',
    label: 'Line call',
    Icon: Ruler,
    color: 'text-(--color-accent)',
    hint: 'In / out ruling',
  },
]

/**
 * VerbalsPanel — referee-only controls for recording verbal officiating calls
 * (let / re-do / fault / line call) onto the match timeline.
 *
 * These are annotations: they record a `match_event` of the matching type but
 * do NOT mutate the score (the backend's RecordEvent only advances score for
 * point/side_out events). An optional team attribution is attached to the
 * event payload so the log can read "Fault — Team 1".
 */
export function VerbalsPanel({ match, disabled, className }: VerbalsPanelProps) {
  const { toast } = useToast()
  const recordEvent = useRecordMatchEvent()
  const [team, setTeam] = useState<1 | 2 | null>(null)
  // Track which call is mid-flight so only its button shows a spinner.
  const [pendingType, setPendingType] = useState<EventType | null>(null)

  const team1Name = match.team_1?.name ?? 'Team 1'
  const team2Name = match.team_2?.name ?? 'Team 2'

  function record(call: VerbalCall) {
    setPendingType(call.type)
    recordEvent.mutate(
      {
        matchId: match.id,
        publicId: match.public_id,
        eventType: call.type,
        payload: team ? { team } : {},
      },
      {
        onSuccess: () => {
          toast(
            'success',
            team ? `${call.label} — Team ${team}` : `${call.label} recorded`,
          )
          // Reset attribution so the next call starts neutral.
          setTeam(null)
        },
        onError: (err) =>
          toast(
            'error',
            err instanceof Error
              ? err.message
              : `Failed to record ${call.label.toLowerCase()}`,
          ),
        onSettled: () => setPendingType(null),
      },
    )
  }

  return (
    <section
      className={cn(
        'rounded-lg border border-(--color-border) bg-(--color-bg-secondary)',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 p-3 border-b border-(--color-border)">
        <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide">
          Verbal calls
        </h2>
      </header>

      <div className="p-3 space-y-3">
        {/* Optional team attribution — applied to the next call recorded. */}
        <div>
          <span className="block text-xs text-(--color-text-muted) mb-1.5">
            Attribute to
          </span>
          <div
            role="radiogroup"
            aria-label="Attribute call to team"
            className="grid grid-cols-3 gap-1.5"
          >
            <TeamToggle
              active={team === null}
              onClick={() => setTeam(null)}
              label="None"
              title="No team attribution"
            />
            <TeamToggle
              active={team === 1}
              onClick={() => setTeam(team === 1 ? null : 1)}
              label={team1Name}
              title={team1Name}
            />
            <TeamToggle
              active={team === 2}
              onClick={() => setTeam(team === 2 ? null : 2)}
              label={team2Name}
              title={team2Name}
            />
          </div>
        </div>

        {/* Call buttons. */}
        <div className="grid grid-cols-2 gap-2">
          {CALLS.map((call) => {
            const isPending = pendingType === call.type
            return (
              <button
                key={call.type}
                type="button"
                onClick={() => record(call)}
                disabled={disabled || recordEvent.isPending}
                title={call.hint}
                aria-label={`Record ${call.label}${team ? ` for team ${team}` : ''}`}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-lg border p-3',
                  'border-(--color-border) bg-(--color-bg-primary) text-(--color-text-primary)',
                  'transition-colors hover:bg-(--color-bg-hover) hover:border-(--color-text-muted)',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)',
                  'disabled:opacity-50 disabled:pointer-events-none',
                )}
              >
                <span className={cn('shrink-0', call.color)}>
                  {isPending ? (
                    <Loader2 size={20} className="animate-spin" />
                  ) : (
                    <call.Icon size={20} />
                  )}
                </span>
                <span className="text-sm font-medium">{call.label}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function TeamToggle({
  active,
  onClick,
  label,
  title,
}: {
  active: boolean
  onClick: () => void
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      title={title}
      className={cn(
        'truncate rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-(--color-accent) bg-(--color-accent) text-white'
          : 'border-(--color-border) bg-(--color-bg-primary) text-(--color-text-secondary) hover:bg-(--color-bg-hover)',
      )}
    >
      {label}
    </button>
  )
}
