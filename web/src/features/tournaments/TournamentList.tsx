import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useListTournaments } from './hooks'
import { useDebounce } from '../../hooks/useDebounce'
import { usePagination } from '../../hooks/usePagination'
import { SearchInput } from '../../components/SearchInput'
import { Select } from '../../components/Select'
import { Table } from '../../components/Table'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { AdSlot } from '../../components/AdSlot'
import { Trophy } from 'lucide-react'
import { formatDate } from '../../lib/formatters'

import { useSport } from '../../auth/SportContext'
const TOURNAMENT_STATUSES = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'registration_open', label: 'Registration Open' },
  { value: 'registration_closed', label: 'Registration Closed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'cancelled', label: 'Cancelled' },
]

interface TournamentListProps {
  leagueId?: string
}

export function TournamentList({ leagueId }: TournamentListProps = {}) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)

  const { data, isLoading, error } = useListTournaments(
    debouncedSearch || undefined,
    statusFilter || undefined,
    pagination.limit,
    pagination.offset,
    leagueId,
  )

  const tournaments = data?.items ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (t: (typeof tournaments)[0]) => (
        <Link
          to="/$sport/tournaments/$tournamentId"
          params={{ sport: sportSlug, tournamentId: String(t.id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          {t.name}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (t: (typeof tournaments)[0]) => (
        <StatusBadge status={t.status} type="tournament" />
      ),
    },
    {
      key: 'start_date',
      header: 'Start Date',
      render: (t: (typeof tournaments)[0]) => (
        <span className="text-(--color-text-secondary)">{formatDate(t.start_date)}</span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'end_date',
      header: 'End Date',
      render: (t: (typeof tournaments)[0]) => (
        <span className="text-(--color-text-secondary)">{formatDate(t.end_date)}</span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'venue',
      header: 'Venue',
      render: (t: (typeof tournaments)[0]) => (
        <span className="text-(--color-text-secondary)">
          {t.venue_id ? `Venue #${t.venue_id}` : '\u2014'}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Tournaments</h1>
        <Link to="/$sport/tournaments/create" params={{ sport: sportSlug }}>
          <Button>Create Tournament</Button>
        </Link>
      </div>

      <AdSlot size="responsive-banner" slot="tournaments-list-top" className="mb-4" />

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            pagination.setPage(1)
          }}
          placeholder="Search tournaments..."
          className="max-w-md flex-1"
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            pagination.setPage(1)
          }}
          className="w-48"
        >
          {TOURNAMENT_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </div>

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <EmptyState
          title="Failed to load tournaments"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : tournaments.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-12 w-12" />}
          title="No tournaments found"
          description={
            search || statusFilter
              ? 'No tournaments match your filters.'
              : 'No tournaments created yet.'
          }
          action={
            !search && !statusFilter ? (
              <Link to="/$sport/tournaments/create" params={{ sport: sportSlug }}>
                <Button>Create Your First Tournament</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table
              columns={columns}
              data={tournaments}
              keyExtractor={(t) => t.id}
            />
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages(total)}
            onPageChange={pagination.setPage}
            className="mt-4"
          />
        </>
      )}
    </div>
  )
}
