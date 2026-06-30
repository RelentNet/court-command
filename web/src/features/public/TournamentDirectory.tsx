import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Trophy, Calendar, MapPin } from 'lucide-react'
import { usePublicTournaments, type PublicTournament } from './hooks'
import { DirectoryFilters } from './DirectoryFilters'
import { Card } from '../../components/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { Pagination } from '../../components/Pagination'
import { SkeletonRow } from '../../components/Skeleton'
import { AdSlot } from '../../components/AdSlot'
import { EmptyState } from '../../components/EmptyState'
import { usePagination } from '../../hooks/usePagination'
import { usePageTitle } from '../../hooks/usePageTitle'
import { formatDate } from '../../lib/formatters'

const TOURNAMENT_STATUS_OPTIONS = [
  { value: 'published', label: 'Published' },
  { value: 'registration_open', label: 'Registration Open' },
  { value: 'registration_closed', label: 'Registration Closed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
]

export function TournamentDirectory() {
  usePageTitle('Tournaments')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const pagination = usePagination(12)

  const { data, isLoading, isError } = usePublicTournaments({
    limit: pagination.limit,
    offset: pagination.offset,
    status: status || undefined,
  })

  const tournaments = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = pagination.totalPages(total)

  // Client-side name filter (backend doesn't support search param on public tournaments)
  const filtered = query
    ? tournaments.filter((t) =>
        t.name.toLowerCase().includes(query.toLowerCase()),
      )
    : tournaments

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-(--color-text-primary)">
          Tournaments
        </h1>
        <p className="mt-1 text-sm text-(--color-text-muted)">
          Browse upcoming and past pickleball tournaments
        </p>
      </div>

      <AdSlot size="responsive-banner" slot="tournament-dir-top" />

      <DirectoryFilters
        query={query}
        onQueryChange={setQuery}
        statusOptions={TOURNAMENT_STATUS_OPTIONS}
        selectedStatus={status}
        onStatusChange={(v) => {
          setStatus(v)
          pagination.setPage(1)
        }}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <SkeletonRow />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <p className="text-sm text-(--color-status-error)">
          Failed to load tournaments. Please try again later.
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-10 w-10" />}
          title="No tournaments found"
          description={
            query || status
              ? 'Try adjusting your filters'
              : 'Check back soon for upcoming tournaments'
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
          <Pagination
            page={pagination.page}
            totalPages={totalPages}
            onPageChange={pagination.setPage}
          />
        </>
      )}
    </div>
  )
}

function TournamentCard({ tournament }: { tournament: PublicTournament }) {
  return (
    <Link
      to={'/public/tournaments/$slug' as string}
      params={{ slug: tournament.slug } as Record<string, string>}
      className="block"
    >
      <Card className="h-full hover:border-(--color-accent) transition-colors">
        <div className="flex items-start gap-3">
          {tournament.logo_url ? (
            <img
              src={tournament.logo_url}
              alt={`${tournament.name} logo`}
              className="h-12 w-12 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-(--color-bg-hover) flex-shrink-0">
              <Trophy className="h-6 w-6 text-(--color-text-muted)" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-(--color-text-primary) truncate">
              {tournament.name}
            </h3>
            <div className="mt-1 flex items-center gap-1 text-xs text-(--color-text-muted)">
              <Calendar className="h-3 w-3 flex-shrink-0" />
              <span>
                {formatDate(tournament.start_date)}
                {tournament.end_date &&
                  tournament.end_date !== tournament.start_date &&
                  ` – ${formatDate(tournament.end_date)}`}
              </span>
            </div>
            {(tournament.city || tournament.venue_name) && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-(--color-text-muted)">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">
                  {[tournament.venue_name, tournament.city]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
            <div className="mt-2">
              <StatusBadge status={tournament.status} type="tournament" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
