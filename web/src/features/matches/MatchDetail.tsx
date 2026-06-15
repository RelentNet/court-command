// web/src/features/matches/MatchDetail.tsx
import { useState } from 'react'
import { Maximize2 } from 'lucide-react'
import { AdSlot } from '../../components/AdSlot'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Skeleton } from '../../components/Skeleton'
import { useAuth } from '../../auth/useAuth'
import { useSport } from '../../auth/SportContext'
import { EventsTimeline } from '../scoring/EventsTimeline'
import { ScoreOverrideModal } from '../scoring/ScoreOverrideModal'
import { useMatch, useMatchEvents } from '../scoring/hooks'
import { useMatchWebSocket } from '../scoring/useMatchWebSocket'
import { MatchDetailHero } from './MatchDetailHero'
import { MatchInfoPanel } from './MatchInfoPanel'

// Roles that can perform score overrides (see RefMatchConsole for rationale).
const PRIVILEGED_ROLES = new Set([
  'platform_admin',
  'tournament_director',
  'head_referee',
])

export interface MatchDetailProps {
  publicId: string
}

export function MatchDetail({ publicId }: MatchDetailProps) {
  // Public route — auth optional. WS still works without auth (server allows
  // anonymous read).
  useMatchWebSocket(publicId)
  const matchQuery = useMatch(publicId)
  const eventsQuery = useMatchEvents(publicId)
  const auth = useAuth()
  const { sport, sports } = useSport()
  // Smoke 9.3: scoreboard fullscreen lives at
  // /<sport>/matches/<publicId>/scoreboard. The fullscreen route is
  // sport-prefixed; fall back to the first known sport when accessed
  // from a public path that doesn't carry a slug.
  const sportSlug = sport?.slug ?? sports[0]?.slug ?? ''
  const [showEvents, setShowEvents] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const canOverride = !!auth.user && PRIVILEGED_ROLES.has(auth.user.role)

  if (matchQuery.isLoading) {
    return (
      <div className="max-w-5xl mx-auto p-4 space-y-4">
        <Skeleton className="h-40" />
        <div className="grid md:grid-cols-3 gap-4">
          <Skeleton className="h-48 md:col-span-2" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  if (matchQuery.isError || !matchQuery.data) {
    return (
      <div className="max-w-5xl mx-auto p-4 text-(--color-error)">
        Match not found.
      </div>
    )
  }

  const match = matchQuery.data

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      {/* Smoke 9.3: fullscreen scoreboard link. Opens in a new tab so
          the user can drop it on a TV/projector without losing the
          detail page. */}
      {sportSlug && (
        <div className="flex justify-end">
          <a
            href={`/${sportSlug}/matches/${publicId}/scoreboard`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) underline-offset-4 hover:underline"
          >
            <Maximize2 className="h-4 w-4" />
            Open fullscreen scoreboard
          </a>
        </div>
      )}
      <MatchDetailHero match={match} />

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide mb-3">
              Rosters
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <RosterColumn
                label={match.team_1?.name ?? 'Team 1'}
                players={match.team_1?.players ?? []}
              />
              <RosterColumn
                label={match.team_2?.name ?? 'Team 2'}
                players={match.team_2?.players ?? []}
              />
            </div>
          </Card>

          {(match.set_scores?.length ?? 0) > 0 && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide mb-3">
                Games
              </h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-(--color-text-muted) text-xs uppercase">
                    <th className="text-left py-1">Game</th>
                    <th className="text-right py-1">
                      {match.team_1?.short_name ?? 'T1'}
                    </th>
                    <th className="text-right py-1">
                      {match.team_2?.short_name ?? 'T2'}
                    </th>
                    <th className="text-right py-1">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {(match.set_scores ?? []).map((g) => (
                    <tr
                      key={g.game_num}
                      className="border-t border-(--color-border)"
                    >
                      <td className="py-1.5 text-(--color-text-primary)">
                        Game {g.game_num}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-(--color-text-primary)">
                        {g.team_one_score}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-(--color-text-primary)">
                        {g.team_two_score}
                      </td>
                      <td className="py-1.5 text-right text-(--color-accent)">
                        T{g.winner}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <MatchInfoPanel match={match} />
        </div>
      </div>

      <AdSlot size="medium-rectangle" />

      {canOverride && (
        <div className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary) p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide">
              Admin actions
            </h2>
            <p className="text-xs text-(--color-text-muted) mt-1">
              Adjust the recorded score with an audit-logged override.
            </p>
          </div>
          <Button
            variant="secondary"
            onClick={() => setOverrideOpen(true)}
            className="shrink-0"
          >
            Override Score
          </Button>
        </div>
      )}

      <details
        open={showEvents}
        onToggle={(e) =>
          setShowEvents((e.currentTarget as HTMLDetailsElement).open)
        }
        className="rounded-lg border border-(--color-border) bg-(--color-bg-secondary)"
      >
        <summary className="cursor-pointer p-3 text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide">
          Event log {eventsQuery.data ? `(${eventsQuery.data.length})` : ''}
        </summary>
        {eventsQuery.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-4 mb-2" />
            <Skeleton className="h-4 mb-2" />
            <Skeleton className="h-4" />
          </div>
        ) : eventsQuery.isError ? (
          <div className="p-4 text-red-500" role="alert">Failed to load events.</div>
        ) : (
          <EventsTimeline events={eventsQuery.data ?? []} />
        )}
      </details>

      {canOverride && (
        <ScoreOverrideModal
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
          match={match}
        />
      )}
    </div>
  )
}

function RosterColumn({
  label,
  players,
}: {
  label: string
  players: { id: number; display_name: string }[]
}) {
  return (
    <div>
      <div className="text-xs text-(--color-text-muted) uppercase mb-1">
        {label}
      </div>
      {players.length === 0 ? (
        <div className="text-xs text-(--color-text-muted)">—</div>
      ) : (
        <ul className="text-sm text-(--color-text-primary) space-y-0.5">
          {players.map((p) => (
            <li key={p.id}>{p.display_name}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
