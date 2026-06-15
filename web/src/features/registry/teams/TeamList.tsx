import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTeamSearch } from './hooks'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePagination } from '../../../hooks/usePagination'
import { SearchInput } from '../../../components/SearchInput'
import { Table } from '../../../components/Table'
import { Pagination } from '../../../components/Pagination'
import { EmptyState } from '../../../components/EmptyState'
import { SkeletonTable } from '../../../components/Skeleton'
import { Button } from '../../../components/Button'
import { Users2, Plus } from 'lucide-react'

import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
export function TeamList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)

  const { data, isLoading, error } = useTeamSearch(
    debouncedSearch,
    pagination.limit,
    pagination.offset,
  )

  const teams = data?.items ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (t: (typeof teams)[0]) => (
        <Link
          to="/$sport/teams/$teamId"
          params={{ sport: sportSlug, teamId: String(t.id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          <span className="flex items-center gap-2">
            {t.primary_color && (
              <span
                className="inline-block h-3 w-3 rounded-full border border-(--color-border)"
                style={{ backgroundColor: t.primary_color }}
              />
            )}
            {t.name}
          </span>
        </Link>
      ),
    },
    {
      key: 'short_name',
      header: 'Short',
      render: (t: (typeof teams)[0]) => (
        <span className="text-(--color-text-secondary) font-mono text-xs uppercase">
          {t.short_name}
        </span>
      ),
    },
    {
      key: 'org_name',
      header: 'Organization',
      render: (t: (typeof teams)[0]) =>
        t.org_name ? (
          <Link
            to="/$sport/organizations/$orgId"
            params={{ sport: sportSlug, orgId: String(t.org_id) }}
            className="text-cyan-400 hover:underline"
          >
            {t.org_name}
          </Link>
        ) : (
          <span className="text-(--color-text-muted)">&mdash;</span>
        ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'city',
      header: 'City',
      render: (t: (typeof teams)[0]) => (
        <span className="text-(--color-text-secondary)">{t.city || '\u2014'}</span>
      ),
      className: 'hidden lg:table-cell',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Teams</h1>
        <Link to="/$sport/teams/new" params={{ sport: sportSlug }}>
          <Button size="sm">
            <Plus className="h-4 w-4" /> Create Team
          </Button>
        </Link>
      </div>

      <AdSlot size="responsive-banner" slot="teams-list-top" className="mb-4" />

      <SearchInput
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          pagination.setPage(1)
        }}
        placeholder="Search teams by name..."
        className="mb-4 max-w-md"
      />

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <EmptyState
          title="Failed to load teams"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-12 w-12" />}
          title="No teams found"
          description={search ? `No results for "${search}"` : 'No teams created yet.'}
          action={
            !search ? (
              <Link to="/$sport/teams/new" params={{ sport: sportSlug }}>
                <Button>Create Team</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table columns={columns} data={teams} keyExtractor={(t) => t.id} />
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
