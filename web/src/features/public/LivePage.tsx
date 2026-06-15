import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Radio, Circle, Clock, Users } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Card } from '../../components/Card'
import { AdSlot } from '../../components/AdSlot'
import { EmptyState } from '../../components/EmptyState'
import { Skeleton } from '../../components/Skeleton'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useLiveMatches, type LiveMatch } from './hooks'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusLabel(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'Live'
    case 'warmup':
      return 'Warmup'
    case 'paused':
      return 'Paused'
    default:
      return status.replace(/_/g, ' ')
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'text-green-400'
    case 'warmup':
      return 'text-yellow-400'
    case 'paused':
      return 'text-orange-400'
    default:
      return 'text-(--color-text-secondary)'
  }
}

function StatusDot({ status }: { status: string }) {
  const isLive = status === 'in_progress'
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold uppercase', statusColor(status))}>
      {isLive ? (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
      ) : (
        <Circle className="h-2 w-2 fill-current" />
      )}
      {statusLabel(status)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Match Card
// ---------------------------------------------------------------------------

function LiveMatchCard({ match }: { match: LiveMatch }) {
  const team1 = match.team_1
  const team2 = match.team_2

  return (
    // TODO(phase3-task10): backend should expose sport_slug on LiveMatch so
    // this resolves to the actual sport instead of defaulting to pickleball.
    <Link
      to="/$sport/matches/$publicId"
      params={{ sport: 'pickleball', publicId: match.public_id }}
      className="block"
    >
      <Card className="hover:border-(--color-accent) transition-colors">
        {/* Header row: status + context */}
        <div className="mb-3 flex items-center justify-between">
          <StatusDot status={match.status} />
          <div className="flex items-center gap-2 text-xs text-(--color-text-secondary)">
            {match.court_name && (
              <span className="truncate max-w-[120px]">{match.court_name}</span>
            )}
            {match.round_name && (
              <>
                <span aria-hidden="true">·</span>
                <span className="truncate max-w-[100px]">{match.round_name}</span>
              </>
            )}
          </div>
        </div>

        {/* Score display */}
        <div className="space-y-2">
          <TeamRow
            name={team1?.name ?? 'TBD'}
            color={team1?.primary_color}
            score={match.team_1_score}
            gamesWon={match.team_1_games_won}
            isServing={match.serving_team === 1}
            setsToWin={match.sets_to_win}
          />
          <TeamRow
            name={team2?.name ?? 'TBD'}
            color={team2?.primary_color}
            score={match.team_2_score}
            gamesWon={match.team_2_games_won}
            isServing={match.serving_team === 2}
            setsToWin={match.sets_to_win}
          />
        </div>

        {/* Footer: tournament + set info */}
        <div className="mt-3 flex items-center justify-between text-xs text-(--color-text-secondary)">
          <span className="truncate max-w-[200px]">
            {match.tournament_name ?? 'Quick Match'}
          </span>
          {match.sets_to_win > 1 && (
            <span>
              Set {match.current_set} of {match.best_of}
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
}

function TeamRow({
  name,
  color,
  score,
  gamesWon,
  isServing,
  setsToWin,
}: {
  name: string
  color?: string
  score: number
  gamesWon: number
  isServing: boolean
  setsToWin: number
}) {
  return (
    <div className="flex items-center gap-3">
      {/* Color swatch */}
      <div
        className="h-6 w-1 rounded-full flex-shrink-0"
        style={{ backgroundColor: color || 'var(--color-border)' }}
      />
      {/* Team name + serving indicator */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className="text-sm font-medium text-(--color-text-primary) truncate">
          {name}
        </span>
        {isServing && (
          <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 flex-shrink-0" title="Serving" />
        )}
      </div>
      {/* Games won (if multi-set) */}
      {setsToWin > 1 && (
        <span className="text-xs text-(--color-text-secondary) w-4 text-center">
          {gamesWon}
        </span>
      )}
      {/* Current score */}
      <span className="text-lg font-bold text-(--color-text-primary) w-8 text-right tabular-nums">
        {score}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function LiveSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-1 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-8" />
            </div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-1 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-8" />
            </div>
          </div>
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Group matches by tournament
// ---------------------------------------------------------------------------

function groupByTournament(matches: LiveMatch[]) {
  const groups = new Map<string, LiveMatch[]>()
  for (const match of matches) {
    const key = match.tournament_name ?? 'Quick Matches'
    const group = groups.get(key) ?? []
    group.push(match)
    groups.set(key, group)
  }
  return groups
}

// ---------------------------------------------------------------------------
// LivePage
// ---------------------------------------------------------------------------

export function LivePage() {
  usePageTitle('Live Matches')
  const [limit] = useState(50)
  const { data, isLoading, isError } = useLiveMatches({ limit, offset: 0 })

  const matches = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10">
          <Radio className="h-5 w-5 text-red-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-(--color-text-primary)">Live Matches</h1>
          <p className="text-sm text-(--color-text-secondary)">
            {isLoading
              ? 'Loading...'
              : total > 0
                ? `${total} match${total !== 1 ? 'es' : ''} in progress`
                : 'No matches in progress right now'}
          </p>
        </div>
      </div>

      <AdSlot size="responsive-banner" className="mb-6" />

      {/* Content */}
      {isLoading ? (
        <LiveSkeleton />
      ) : isError ? (
        <EmptyState
          icon={<Radio className="h-10 w-10" />}
          title="Unable to load live matches"
          description="Please try again later."
        />
      ) : matches.length === 0 ? (
        <EmptyState
          icon={<Clock className="h-10 w-10" />}
          title="No live matches right now"
          description="Check back during an active tournament to see live scores."
        />
      ) : (
        <div className="space-y-8">
          {Array.from(groupByTournament(matches)).map(([tournamentName, group]) => (
            <section key={tournamentName}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wider">
                <Users className="h-4 w-4" />
                {tournamentName}
                <span className="ml-auto text-xs font-normal lowercase">
                  {group.length} match{group.length !== 1 ? 'es' : ''}
                </span>
              </h2>
              <div className="space-y-3">
                {group.map((match) => (
                  <LiveMatchCard key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <AdSlot size="medium-rectangle" className="mt-8" />
    </div>
  )
}
