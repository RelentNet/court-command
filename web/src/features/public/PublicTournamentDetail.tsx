import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Trophy,
  Calendar,
  MapPin,
  ArrowLeft,
  Users,
  LogIn,
  Swords,
  Monitor,
  Radio,
  ChevronRight,
} from 'lucide-react'
import {
  usePublicTournamentBySlug,
  usePublicTournamentDivisions,
  usePublicTournamentMatches,
  usePublicTournamentCourts,
  type PublicDivision,
  type PublicCourt,
  type LiveMatch,
} from './hooks'
import { Card } from '../../components/Card'
import { InfoRow } from '../../components/InfoRow'
import { StatusBadge } from '../../components/StatusBadge'
import { RichTextDisplay } from '../../components/RichTextDisplay'
import { AdSlot } from '../../components/AdSlot'
import { SkeletonRow } from '../../components/Skeleton'
import { TabLayout } from '../../components/TabLayout'
import { StreamEmbed } from '../../components/StreamEmbed'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { useAuth } from '../../auth/useAuth'
import { usePageTitle } from '../../hooks/usePageTitle'
import { formatDate } from '../../lib/formatters'
import { cn } from '../../lib/cn'

interface PublicTournamentDetailProps {
  slug: string
}

export function PublicTournamentDetail({ slug }: PublicTournamentDetailProps) {
  const { data: tournament, isLoading, isError } = usePublicTournamentBySlug(slug)
  const { isAuthenticated } = useAuth()
  const [activeTab, setActiveTab] = useState('overview')
  usePageTitle(tournament?.name ?? 'Tournament')

  const {
    data: divisions,
    isLoading: divisionsLoading,
  } = usePublicTournamentDivisions(slug)

  const {
    data: matches,
    isLoading: matchesLoading,
  } = usePublicTournamentMatches(slug, { limit: 100, offset: 0 })

  const {
    data: courts,
    isLoading: courtsLoading,
  } = usePublicTournamentCourts(slug)

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

  if (isError || !tournament) {
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
              ? 'Failed to load tournament details. Please try again later.'
              : 'Tournament not found.'}
          </p>
        </Card>
      </div>
    )
  }

  const isRegistrationOpen = tournament.status === 'registration_open'
  const liveMatches = matches?.filter((m) => m.status === 'in_progress') ?? []
  const activeCourts = courts?.filter((c) => c.active_match) ?? []

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'divisions', label: 'Divisions', count: divisions?.length },
    { id: 'schedule', label: 'Schedule', count: matches?.length },
    { id: 'courts', label: 'Courts', count: courts?.length },
  ]

  return (
    <div className="space-y-6">
      <Link
        to={'/public/tournaments' as string}
        className="inline-flex items-center gap-1 text-sm text-(--color-accent) hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tournaments
      </Link>

      {/* Header */}
      <Card>
        <div className="flex items-start gap-4">
          {tournament.logo_url ? (
            <img
              src={tournament.logo_url}
              alt={`${tournament.name} logo`}
              className="h-16 w-16 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-(--color-bg-hover) flex-shrink-0">
              <Trophy className="h-8 w-8 text-(--color-text-muted)" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-xl font-bold text-(--color-text-primary)">
                {tournament.name}
              </h1>
              <StatusBadge status={tournament.status} type="tournament" />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-(--color-text-muted)">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(tournament.start_date)}
                {tournament.end_date &&
                  tournament.end_date !== tournament.start_date &&
                  ` – ${formatDate(tournament.end_date)}`}
              </span>
              {(tournament.venue_name || tournament.city) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {[tournament.venue_name, tournament.city]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              )}
              {liveMatches.length > 0 && (
                <span className="inline-flex items-center gap-1 text-green-400">
                  <Radio className="h-4 w-4" />
                  {liveMatches.length} live
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Registration CTA */}
      {isRegistrationOpen && (
        <Card>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-(--color-accent)" />
              <p className="text-sm font-medium text-(--color-text-primary)">
                Registration is open for this tournament
              </p>
            </div>
            {isAuthenticated ? (
              <Link
                to={'/tournaments/$id' as string}
                params={{ id: String(tournament.id) } as Record<string, string>}
              >
                <Button variant="primary" size="sm">
                  Register Now
                </Button>
              </Link>
            ) : (
              <Link
                to="/login"
                search={{ redirect: `/public/tournaments/${tournament.slug}` }}
              >
                <Button variant="primary" size="sm">
                  <LogIn className="h-4 w-4 mr-1" />
                  Sign In to Register
                </Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Tabs */}
      <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'overview' && (
          <OverviewTab tournament={tournament} />
        )}
        {activeTab === 'divisions' && (
          <DivisionsTab
            divisions={divisions ?? []}
            isLoading={divisionsLoading}
          />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab
            matches={matches ?? []}
            isLoading={matchesLoading}
          />
        )}
        {activeTab === 'courts' && (
          <CourtsTab
            courts={courts ?? []}
            isLoading={courtsLoading}
            activeCourts={activeCourts}
          />
        )}
      </TabLayout>

      <AdSlot size="medium-rectangle" slot="tournament-detail-bottom" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  tournament,
}: {
  tournament: {
    start_date: string
    end_date?: string
    venue_name?: string
    city?: string
    state_province?: string
    division_count?: number
    registration_count?: number
    description?: string | null
  }
}) {
  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          Details
        </h2>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Start Date" value={formatDate(tournament.start_date)} />
          <InfoRow
            label="End Date"
            value={tournament.end_date ? formatDate(tournament.end_date) : null}
          />
          <InfoRow label="Venue" value={tournament.venue_name} />
          <InfoRow
            label="Location"
            value={
              [tournament.city, tournament.state_province]
                .filter(Boolean)
                .join(', ') || null
            }
          />
          {tournament.division_count != null && (
            <InfoRow label="Divisions" value={String(tournament.division_count)} />
          )}
          {tournament.registration_count != null && (
            <InfoRow
              label="Registrations"
              value={String(tournament.registration_count)}
            />
          )}
        </dl>
      </Card>

      {tournament.description && (
        <Card>
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3">
            About
          </h2>
          <RichTextDisplay html={tournament.description} />
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Divisions Tab
// ---------------------------------------------------------------------------

function DivisionsTab({
  divisions,
  isLoading,
}: {
  divisions: PublicDivision[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <SkeletonRow />
          </Card>
        ))}
      </div>
    )
  }

  if (divisions.length === 0) {
    return (
      <EmptyState
        icon={<Swords size={32} />}
        title="No divisions yet"
        description="Divisions will appear here once the tournament is set up."
      />
    )
  }

  return (
    <div className="space-y-3">
      {divisions.map((division) => (
        <DivisionCard key={division.id} division={division} />
      ))}
    </div>
  )
}

function DivisionCard({
  division,
}: {
  division: PublicDivision
}) {
  const formatLabel = (s: string) =>
    s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

  return (
    <Card className="group hover:border-(--color-accent)/30 transition-colors">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-(--color-text-primary) truncate">
              {division.name}
            </h3>
            <StatusBadge status={division.status} type="division" />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--color-text-muted)">
            <span>{formatLabel(division.format)}</span>
            <span>{formatLabel(division.bracket_format)}</span>
            {division.max_teams && (
              <span>Max {division.max_teams} teams</span>
            )}
            {division.gender_restriction && (
              <span>{formatLabel(division.gender_restriction)}</span>
            )}
            {division.skill_min != null && division.skill_max != null && (
              <span>
                Skill {division.skill_min}–{division.skill_max}
              </span>
            )}
            {division.current_phase && (
              <span className="text-(--color-accent)">
                {formatLabel(division.current_phase)}
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-(--color-text-muted) group-hover:text-(--color-accent) transition-colors flex-shrink-0" />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Schedule Tab
// ---------------------------------------------------------------------------

function ScheduleTab({
  matches,
  isLoading,
}: {
  matches: LiveMatch[]
  isLoading: boolean
}) {
  const [filter, setFilter] = useState<'all' | 'live' | 'upcoming' | 'completed'>('all')

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
        title="No matches scheduled"
        description="Matches will appear here once the bracket is generated."
      />
    )
  }

  const filtered = matches.filter((m) => {
    if (filter === 'live') return ['in_progress', 'warmup', 'paused'].includes(m.status)
    if (filter === 'upcoming') return m.status === 'scheduled'
    if (filter === 'completed') return ['completed', 'forfeited', 'cancelled'].includes(m.status)
    return true
  })

  // Group by round
  const byRound = new Map<string, LiveMatch[]>()
  for (const match of filtered) {
    const key = match.round_name ?? (match.round ? `Round ${match.round}` : 'Unassigned')
    const group = byRound.get(key) ?? []
    group.push(match)
    byRound.set(key, group)
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(['all', 'live', 'upcoming', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
              filter === f
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'bg-(--color-bg-hover) text-(--color-text-secondary) hover:text-(--color-text-primary)',
            )}
          >
            {f === 'all' ? 'All' : f === 'live' ? 'Live' : f === 'upcoming' ? 'Upcoming' : 'Completed'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-(--color-text-muted) text-center py-8">
          No matches match this filter.
        </p>
      ) : (
        Array.from(byRound.entries()).map(([round, roundMatches]) => (
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
        ))
      )}
    </div>
  )
}

function MatchRow({ match }: { match: LiveMatch }) {
  const isLive = match.status === 'in_progress'
  const isDone = ['completed', 'forfeited', 'cancelled'].includes(match.status)

  return (
    <Link
      to="/matches/$publicId"
      params={{ publicId: match.public_id }}
      className="block"
    >
      <Card className={cn(
        'hover:border-(--color-accent)/30 transition-colors',
        isLive && 'border-green-500/30',
      )}>
        <div className="flex items-center gap-3">
          {/* Status indicator */}
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

          {/* Teams + scores */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between text-sm">
              <TeamLabel team={match.team_1} seed={match.team_1_seed} />
              <span className={cn(
                'font-mono text-sm tabular-nums',
                isLive ? 'text-(--color-text-primary) font-semibold' : 'text-(--color-text-muted)',
              )}>
                {match.team_1_score}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm mt-0.5">
              <TeamLabel team={match.team_2} seed={match.team_2_seed} />
              <span className={cn(
                'font-mono text-sm tabular-nums',
                isLive ? 'text-(--color-text-primary) font-semibold' : 'text-(--color-text-muted)',
              )}>
                {match.team_2_score}
              </span>
            </div>
          </div>

          {/* Court */}
          {match.court_name && (
            <span className="text-xs text-(--color-text-muted) flex-shrink-0">
              {match.court_name}
            </span>
          )}
        </div>
      </Card>
    </Link>
  )
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

// ---------------------------------------------------------------------------
// Courts Tab
// ---------------------------------------------------------------------------

function CourtsTab({
  courts,
  isLoading,
  activeCourts,
}: {
  courts: PublicCourt[]
  isLoading: boolean
  activeCourts: PublicCourt[]
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <SkeletonRow />
          </Card>
        ))}
      </div>
    )
  }

  if (courts.length === 0) {
    return (
      <EmptyState
        icon={<Monitor size={32} />}
        title="No courts assigned"
        description="Courts will appear here once they are assigned to this tournament."
      />
    )
  }

  return (
    <div className="space-y-4">
      {activeCourts.length > 0 && (
        <p className="text-sm text-(--color-text-muted)">
          {activeCourts.length} court{activeCourts.length !== 1 ? 's' : ''} with active matches
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {courts.map((court) => (
          <CourtCard key={court.id} court={court} />
        ))}
      </div>
    </div>
  )
}

function CourtCard({ court }: { court: PublicCourt }) {
  const hasLive = court.active_match?.status === 'in_progress'
  const hasStream = court.stream_url && court.stream_is_live

  return (
    <Card className={cn(
      'transition-colors',
      hasLive && 'border-green-500/30',
    )}>
      <div className="space-y-3">
        {/* Court header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-(--color-text-primary)">
            {court.name}
          </h3>
          <div className="flex items-center gap-1.5">
            {court.is_show_court && (
              <span className="text-xs bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded">
                Show Court
              </span>
            )}
            {hasLive && (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
            )}
          </div>
        </div>

        {/* Active match */}
        {court.active_match && (
          <Link
            to="/matches/$publicId"
            params={{ publicId: court.active_match.public_id }}
            className="block"
          >
            <div className="bg-(--color-bg-hover) rounded-lg p-2.5 hover:bg-(--color-bg-hover)/80 transition-colors">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={cn(
                  'font-medium',
                  hasLive ? 'text-green-400' : 'text-(--color-text-muted)',
                )}>
                  {hasLive ? 'LIVE' : court.active_match.status.replace(/_/g, ' ').toUpperCase()}
                </span>
                {court.active_match.round_name && (
                  <span className="text-(--color-text-muted)">
                    {court.active_match.round_name}
                  </span>
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-(--color-text-primary)">
                    {court.active_match.team_1?.name ?? 'TBD'}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-(--color-text-primary)">
                    {court.active_match.team_1_score}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate text-(--color-text-primary)">
                    {court.active_match.team_2?.name ?? 'TBD'}
                  </span>
                  <span className="font-mono tabular-nums font-semibold text-(--color-text-primary)">
                    {court.active_match.team_2_score}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        )}

        {/* On-deck match */}
        {court.on_deck_match && !court.active_match && (
          <div className="text-xs text-(--color-text-muted)">
            <span className="font-medium">On deck:</span>{' '}
            {court.on_deck_match.team_1?.name ?? 'TBD'} vs{' '}
            {court.on_deck_match.team_2?.name ?? 'TBD'}
          </div>
        )}

        {/* Stream */}
        {hasStream && court.stream_url && (
          <StreamEmbed url={court.stream_url} type={court.stream_type ?? null} title={court.stream_title ?? court.name} />
        )}

        {/* Surface type */}
        {court.surface_type && (
          <span className="text-xs text-(--color-text-muted)">
            {court.surface_type}
          </span>
        )}
      </div>
    </Card>
  )
}
