import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useListLeagues } from './hooks'
import { useDebounce } from '../../hooks/useDebounce'
import { usePagination } from '../../hooks/usePagination'
import { SearchInput } from '../../components/SearchInput'
import { Table } from '../../components/Table'
import { Pagination } from '../../components/Pagination'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import { Button } from '../../components/Button'
import { StatusBadge } from '../../components/StatusBadge'
import { AdSlot } from '../../components/AdSlot'
import { Calendar } from 'lucide-react'

import { useSport } from '../../auth/SportContext'
export function LeagueList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)

  const { data, isLoading, error } = useListLeagues(
    debouncedSearch || undefined,
    pagination.limit,
    pagination.offset,
  )

  const leagues = data?.items ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (l: (typeof leagues)[0]) => (
        <Link
          to="/$sport/leagues/$leagueId"
          params={{ sport: sportSlug, leagueId: String(l.id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          {l.name}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (l: (typeof leagues)[0]) => (
        <StatusBadge status={l.status} type="league" />
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: (l: (typeof leagues)[0]) => (
        <span className="text-(--color-text-secondary)">
          {[l.city, l.state_province].filter(Boolean).join(', ') || '\u2014'}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (l: (typeof leagues)[0]) => (
        <span className="text-(--color-text-secondary)">
          {l.contact_email || '\u2014'}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Leagues</h1>
        <Link to="/$sport/leagues/create" params={{ sport: sportSlug }}>
          <Button>Create League</Button>
        </Link>
      </div>

      <AdSlot size="responsive-banner" slot="leagues-list-top" className="mb-4" />

      <div className="mb-4">
        <SearchInput
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            pagination.setPage(1)
          }}
          placeholder="Search leagues..."
          className="max-w-md"
        />
      </div>

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <EmptyState
          title="Failed to load leagues"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : leagues.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title="No leagues found"
          description={
            search
              ? 'No leagues match your search.'
              : 'No leagues created yet.'
          }
          action={
            !search ? (
              <Link to="/$sport/leagues/create" params={{ sport: sportSlug }}>
                <Button>Create Your First League</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table
              columns={columns}
              data={leagues}
              keyExtractor={(l) => l.id}
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
