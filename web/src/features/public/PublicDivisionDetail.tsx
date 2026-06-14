import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  ArrowLeft,
  Trophy,
  Users,
  Swords,
  BarChart3,
  Calendar,
} from 'lucide-react'
import {
  usePublicDivision,
  usePublicDivisionBracket,
  usePublicDivisionStandings,
  usePublicDivisionMatches,
  type LiveMatch,
  type PublicStandingsEntry,
} from './hooks'
import { Card } from '../../components/Card'
import { InfoRow } from '../../components/InfoRow'
import { StatusBadge } from '../../components/StatusBadge'
import { AdSlot } from '../../components/AdSlot'
import { SkeletonRow, Skeleton } from '../../components/Skeleton'
import { TabLayout } from '../../components/TabLayout'
import { EmptyState } from '../../components/EmptyState'
import { Badge } from '../../components/Badge'
import { usePageTitle } from '../../hooks/usePageTitle'
import { cn } from '../../lib/cn'

interface PublicDivisionDetailProps {
  divisionId: string
}

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function PublicDivisionDetail({ divisionId }: PublicDivisionDetailProps) {
  const { data: division, isLoading, isError } = usePublicDivision(divisionId)
  const [activeTab, setActiveTab] = useState('overview')
  usePageTitle(division?.name ?? 'Division')

  const { data: bracket, isLoading: bracketLoading } =
    usePublicDivisionBracket(divisionId)
  const { data: standings, isLoading: standingsLoading } =
    usePublicDivisionStandings(divisionId)
  const { data: matches, isLoading: matchesLoading } =
    usePublicDivisionMatches(divisionId)

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      </div>
    )
  }

  if (isError || !division) {
    return (
      <div className="space-y-4">
        <Link
          to={'/public/tournaments' as string}
          className="inline-flex items-center gap-1 text-sm text-(--color-accent) hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tournaments
        </Link>
        <Card>
          <p className="text-sm text-(--color-status-error)">
            {isError
              ? 'Failed to load division details. Please try again later.'
              : 'Division not found.'}
          </p>
        </Card>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'bracket', label: 'Bracket', count: bracket?.length },
    { id: 'standings', label: 'Standings', count: standings?.length },
    { id: 'matches', label: 'Matches', count: matches?.length },
  ]

  return (
    <div className="space-y-6">
      <Link
        to={'/public/tournaments/$slug' as string}
        params={{ slug: division.tournament.slug } as Record<string, string>}
        className="inline-flex items-center gap-1 text-sm text-(--color-accent) hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        {division.tournament.name}
      </Link>

      {/* Header */}
      <Card>
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-(--color-bg-hover) flex-shrink-0">
            <Swords className="h-8 w-8 text-(--color-text-muted)" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-(--color-text-primary)">
                {division.name}
              </h1>
              <StatusBadge status={division.status} type="division" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-(--color-text-muted)">
              <span>{formatLabel(division.format)}</span>
              <span>{formatLabel(division.bracket_format)}</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-4 w-4" />
                {division.counts.registrations} teams
              </span>
              {division.current_phase && (
                <span className="text-(--color-accent)">
                  {formatLabel(division.current_phase)}
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'overview' && <OverviewTab division={division} />}
        {activeTab === 'bracket' && (
          <BracketTab
            matches={bracket ?? []}
            isLoading={bracketLoading}
            bracketFormat={division.bracket_format}
          />
        )}
        {activeTab === 'standings' && (
          <StandingsTab
            entries={standings ?? []}
            isLoading={standingsLoading}
          />
        )}
        {activeTab === 'matches' && (
          <MatchesTab matches={matches ?? []} isLoading={matchesLoading} />
        )}
      </TabLayout>

      <AdSlot size="medium-rectangle" slot="division-detail-bottom" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  division,
}: {
  division: {
    format: string
    bracket_format: string
    status: string
    current_phase?: string
    counts: { registrations: number; matches: number }
    tournament: { slug: string; name: string }
  }
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          Details
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Format" value={formatLabel(division.format)} />
          <InfoRow
            label="Bracket"
            value={formatLabel(division.bracket_format)}
          />
          <InfoRow
            label="Status"
            value={<StatusBadge status={division.status} type="division" />}
          />
          {division.current_phase && (
            <InfoRow
              label="Current Phase"
              value={formatLabel(division.current_phase)}
            />
          )}
          <InfoRow
            label="Teams Registered"
            value={String(division.counts.registrations)}
          />
          <InfoRow
            label="Matches"
            value={String(division.counts.matches)}
          />
        </dl>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-(--color-text-muted)">
            Part of{' '}
            <span className="font-medium text-(--color-text-primary)">
              {division.tournament.name}
            </span>
          </p>
          <Link
            to={'/public/tournaments/$slug' as string}
            params={
              { slug: division.tournament.slug } as Record<string, string>
            }
            className="inline-flex items-center gap-1 text-sm text-(--color-accent) hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to tournament
          </Link>
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bracket Tab — read-only bracket rendered from the public bracket endpoint
// ---------------------------------------------------------------------------

function getRoundLabel(
  round: number,
  totalRounds: number,
  roundName?: string | null,
): string {
  if (roundName) return roundName
  const remaining = totalRounds - round
  if (remaining === 0) return 'Finals'
  if (remaining === 1) return 'Semifinals'
  if (remaining === 2) return 'Quarterfinals'
  return `Round ${round}`
}

function teamDisplayName(
  team: LiveMatch['team_1'],
  seed: number | null | undefined,
): string {
  const seedStr = seed != null ? `(${seed}) ` : ''
  if (team?.short_name) return `${seedStr}${team.short_name}`
  if (team?.name) return `${seedStr}${team.name}`
  return 'TBD'
}

function BracketTab({
  matches,
  isLoading,
  bracketFormat,
}: {
  matches: LiveMatch[]
  isLoading: boolean
  bracketFormat: string
}) {
  if (isLoading) {
    return <Skeleton className="h-64 w-full" />
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<Trophy size={32} />}
        title="No bracket yet"
        description="The bracket will appear here once it has been generated."
      />
    )
  }

  const isRoundRobin =
    bracketFormat === 'round_robin' || bracketFormat === 'pool_play'

  if (isRoundRobin) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          {formatLabel(bracketFormat)} · {matches.length} matches
        </h2>
        <Card>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {matches.map((m) => (
              <BracketMatchCard key={m.id} match={m} isLastRound={false} />
            ))}
          </div>
        </Card>
      </div>
    )
  }

  // Group matches by round for the elimination layout
  const rounds: Record<number, LiveMatch[]> = {}
  for (const m of matches) {
    const r = m.round ?? 1
    if (!rounds[r]) rounds[r] = []
    rounds[r].push(m)
  }
  const roundKeys = Object.keys(rounds)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
  const totalRounds = roundKeys.length

  const MATCH_HEIGHT = 76
  const MATCH_GAP = 12

  return (
    <div>
      <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
        {formatLabel(bracketFormat)} · {matches.length} matches
      </h2>
      <div className="overflow-x-auto pb-4">
        <div className="flex items-start min-w-max">
          {roundKeys.map((round, roundIdx) => {
            const roundMatches = rounds[round]
              .slice()
              .sort((a, b) => (a.match_number ?? 0) - (b.match_number ?? 0))
            const isLast = roundIdx === roundKeys.length - 1
            const showConnectors = !isLast && roundMatches.length > 1

            return (
              <div key={round} className="flex items-start">
                <div className="flex flex-col">
                  <h3 className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-3 px-1">
                    {getRoundLabel(
                      round,
                      totalRounds,
                      rounds[round][0]?.round_name,
                    )}
                  </h3>
                  <div
                    className="flex flex-col justify-around"
                    style={{
                      gap: `${MATCH_GAP}px`,
                      minHeight:
                        roundIdx === 0
                          ? undefined
                          : `${rounds[roundKeys[0]].length * (MATCH_HEIGHT + MATCH_GAP) - MATCH_GAP}px`,
                    }}
                  >
                    {roundMatches.map((m) => (
                      <BracketMatchCard
                        key={m.id}
                        match={m}
                        isLastRound={isLast}
                      />
                    ))}
                  </div>
                </div>

                {showConnectors && (
                  <div
                    className="flex items-start"
                    style={{ paddingTop: '28px' }}
                  >
                    <BracketConnectors
                      sourceCount={roundMatches.length}
                      matchHeight={MATCH_HEIGHT}
                      gap={MATCH_GAP}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function BracketMatchCard({
  match,
  isLastRound,
}: {
  match: LiveMatch
  isLastRound: boolean
}) {
  const isComplete = match.status === 'completed'
  const team1Won = isComplete && match.team_1_score > match.team_2_score
  const team2Won = isComplete && match.team_2_score > match.team_1_score
  const inner = (
    <div className="bracket-match relative rounded-lg border border-(--color-border) bg-(--color-bg-primary) min-w-[200px] shadow-sm transition-colors hover:border-(--color-accent)/30">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-(--color-border) bg-(--color-bg-secondary) rounded-t-lg">
        <span className="text-[11px] font-medium text-(--color-text-muted) uppercase tracking-wider">
          {match.match_number != null ? `M${match.match_number}` : ''}
        </span>
        <div className="flex items-center gap-1.5">
          {match.court_name && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-(--color-accent)/10 text-(--color-accent) font-medium">
              {match.court_name}
            </span>
          )}
          {isComplete && isLastRound && (
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
          )}
        </div>
      </div>

      {/* Team 1 */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 text-sm transition-colors',
          team1Won
            ? 'bg-(--color-accent)/8 font-semibold text-(--color-text-primary)'
            : team2Won
              ? 'text-(--color-text-muted)'
              : 'text-(--color-text-secondary)',
        )}
      >
        <span className="truncate max-w-[140px]">
          {teamDisplayName(match.team_1, match.team_1_seed)}
        </span>
        <span className="ml-2 tabular-nums font-medium">
          {match.status !== 'scheduled' ? match.team_1_score : ''}
        </span>
      </div>

      <div className="border-t border-(--color-border)" />

      {/* Team 2 */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 text-sm rounded-b-lg transition-colors',
          team2Won
            ? 'bg-(--color-accent)/8 font-semibold text-(--color-text-primary)'
            : team1Won
              ? 'text-(--color-text-muted)'
              : 'text-(--color-text-secondary)',
        )}
      >
        <span className="truncate max-w-[140px]">
          {teamDisplayName(match.team_2, match.team_2_seed)}
        </span>
        <span className="ml-2 tabular-nums font-medium">
          {match.status !== 'scheduled' ? match.team_2_score : ''}
        </span>
      </div>
    </div>
  )

  // Spectators can drill into the public match page
  if (match.public_id) {
    return (
      <Link
        to={'/matches/$publicId' as string}
        params={{ publicId: match.public_id } as Record<string, string>}
      >
        {inner}
      </Link>
    )
  }
  return inner
}

/**
 * SVG connector lines between adjacent bracket rounds. Mirrors the authed
 * DivisionBracket connectors so the read-only spectator bracket lines up.
 */
function BracketConnectors({
  sourceCount,
  matchHeight,
  gap,
}: {
  sourceCount: number
  matchHeight: number
  gap: number
}) {
  const pairCount = Math.ceil(sourceCount / 2)
  const step = matchHeight + gap
  const svgWidth = 32
  const connectors: React.ReactNode[] = []

  for (let i = 0; i < pairCount; i++) {
    const topIdx = i * 2
    const botIdx = i * 2 + 1
    if (botIdx >= sourceCount) break

    const topY = topIdx * step + matchHeight / 2
    const botY = botIdx * step + matchHeight / 2
    const midY = (topY + botY) / 2

    connectors.push(
      <g key={i}>
        <line x1={0} y1={topY} x2={svgWidth / 2} y2={topY} stroke="var(--color-border)" strokeWidth={1.5} />
        <line x1={0} y1={botY} x2={svgWidth / 2} y2={botY} stroke="var(--color-border)" strokeWidth={1.5} />
        <line x1={svgWidth / 2} y1={topY} x2={svgWidth / 2} y2={botY} stroke="var(--color-border)" strokeWidth={1.5} />
        <line x1={svgWidth / 2} y1={midY} x2={svgWidth} y2={midY} stroke="var(--color-border)" strokeWidth={1.5} />
      </g>,
    )
  }

  const totalHeight = sourceCount * step - gap
  return (
    <svg width={svgWidth} height={totalHeight} className="flex-shrink-0 self-start">
      {connectors}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Standings Tab
// ---------------------------------------------------------------------------

function StandingsTab({
  entries,
  isLoading,
}: {
  entries: PublicStandingsEntry[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={32} />}
        title="No standings yet"
        description="Standings will appear here once matches are completed."
      />
    )
  }

  const sorted = entries.slice().sort((a, b) => a.rank - b.rank)

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--color-border) text-(--color-text-secondary)">
              <th className="py-2 px-3 text-left font-medium w-12">#</th>
              <th className="py-2 px-3 text-left font-medium">Team</th>
              <th className="py-2 px-3 text-center font-medium">W</th>
              <th className="py-2 px-3 text-center font-medium">L</th>
              <th className="py-2 px-3 text-center font-medium">D</th>
              <th className="py-2 px-3 text-center font-medium">PF</th>
              <th className="py-2 px-3 text-center font-medium">PA</th>
              <th className="py-2 px-3 text-center font-medium">+/-</th>
              <th className="py-2 px-3 text-center font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((entry) => (
              <StandingsRow key={entry.id} entry={entry} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function StandingsRow({ entry }: { entry: PublicStandingsEntry }) {
  return (
    <tr
      className={cn(
        'border-b border-(--color-border) last:border-b-0',
        entry.is_withdrawn && 'opacity-50',
      )}
    >
      <td className="py-2 px-3 text-(--color-text-secondary) font-medium">
        {entry.rank}
      </td>
      <td className="py-2 px-3 text-(--color-text-primary) font-medium">
        <span className="flex items-center gap-2">
          {entry.team?.name ?? `Team #${entry.team_id}`}
          {entry.is_withdrawn && <Badge variant="error">Withdrawn</Badge>}
        </span>
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-primary)">
        {entry.wins}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-primary)">
        {entry.losses}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-primary)">
        {entry.draws}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-secondary)">
        {entry.points_for}
      </td>
      <td className="py-2 px-3 text-center text-(--color-text-secondary)">
        {entry.points_against}
      </td>
      <td
        className={cn(
          'py-2 px-3 text-center font-medium',
          entry.point_differential > 0
            ? 'text-emerald-500'
            : entry.point_differential < 0
              ? 'text-red-500'
              : 'text-(--color-text-secondary)',
        )}
      >
        {entry.point_differential > 0 ? '+' : ''}
        {entry.point_differential}
      </td>
      <td className="py-2 px-3 text-center font-bold text-(--color-text-primary)">
        {entry.standing_points}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// Matches Tab — flat match list grouped by round
// ---------------------------------------------------------------------------

function MatchesTab({
  matches,
  isLoading,
}: {
  matches: LiveMatch[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <SkeletonRow />
          </Card>
        ))}
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<Calendar size={32} />}
        title="No matches yet"
        description="Matches will appear here once the bracket is generated."
      />
    )
  }

  // Group by round
  const byRound = new Map<string, LiveMatch[]>()
  for (const match of matches) {
    const key =
      match.round_name ?? (match.round ? `Round ${match.round}` : 'Unassigned')
    const group = byRound.get(key) ?? []
    group.push(match)
    byRound.set(key, group)
  }

  return (
    <div className="space-y-4">
      {Array.from(byRound.entries()).map(([round, roundMatches]) => (
        <div key={round}>
          <h3 className="text-xs font-semibold text-(--color-text-muted) uppercase tracking-wider mb-2">
            {round}
          </h3>
          <div className="space-y-2">
            {roundMatches.map((match) => (
              <MatchRow key={match.id} match={match} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function MatchRow({ match }: { match: LiveMatch }) {
  const isLive = match.status === 'in_progress'
  const isDone = ['completed', 'forfeited', 'cancelled'].includes(match.status)

  const card = (
    <Card
      className={cn(
        'transition-colors',
        match.public_id && 'hover:border-(--color-accent)/30',
        isLive && 'border-green-500/30',
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          {isLive ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
            </span>
          ) : isDone ? (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-(--color-text-muted)/40" />
          ) : (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-sm">
            <TeamLabel team={match.team_1} seed={match.team_1_seed} />
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                isLive
                  ? 'text-(--color-text-primary) font-semibold'
                  : 'text-(--color-text-muted)',
              )}
            >
              {match.status !== 'scheduled' ? match.team_1_score : ''}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm mt-0.5">
            <TeamLabel team={match.team_2} seed={match.team_2_seed} />
            <span
              className={cn(
                'font-mono text-sm tabular-nums',
                isLive
                  ? 'text-(--color-text-primary) font-semibold'
                  : 'text-(--color-text-muted)',
              )}
            >
              {match.status !== 'scheduled' ? match.team_2_score : ''}
            </span>
          </div>
        </div>

        {match.court_name && (
          <span className="text-xs text-(--color-text-muted) flex-shrink-0">
            {match.court_name}
          </span>
        )}
      </div>
    </Card>
  )

  if (match.public_id) {
    return (
      <Link
        to={'/matches/$publicId' as string}
        params={{ publicId: match.public_id } as Record<string, string>}
        className="block"
      >
        {card}
      </Link>
    )
  }
  return card
}

function TeamLabel({
  team,
  seed,
}: {
  team?: { name: string; primary_color?: string } | null
  seed?: number | null
}) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      {team?.primary_color && (
        <span
          className="h-2.5 w-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: team.primary_color }}
        />
      )}
      {seed && (
        <span className="text-xs text-(--color-text-muted) flex-shrink-0">
          [{seed}]
        </span>
      )}
      <span className="truncate text-(--color-text-primary)">
        {team?.name ?? 'TBD'}
      </span>
    </div>
  )
}
