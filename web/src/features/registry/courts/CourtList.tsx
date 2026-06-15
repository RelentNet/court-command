import { Link } from '@tanstack/react-router'
import { useFloatingCourts } from './hooks'
import { usePagination } from '../../../hooks/usePagination'
import { Table } from '../../../components/Table'
import { Pagination } from '../../../components/Pagination'
import { EmptyState } from '../../../components/EmptyState'
import { SkeletonTable } from '../../../components/Skeleton'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { LayoutGrid } from 'lucide-react'
import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
const STREAM_VARIANTS: Record<string, 'error' | 'info' | 'success' | 'default'> = {
  youtube: 'error',
  twitch: 'info',
  vimeo: 'info',
  hls: 'success',
}

export function CourtList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const pagination = usePagination(20)

  const { data, isLoading, error } = useFloatingCourts(pagination.limit, pagination.offset)

  const courts = data?.items ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (c: (typeof courts)[0]) => (
        <Link
          to="/$sport/courts/$courtId"
          params={{ sport: sportSlug, courtId: String(c.id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: 'surface_type',
      header: 'Surface Type',
      render: (c: (typeof courts)[0]) => (
        <span className="text-(--color-text-secondary) capitalize">
          {c.surface_type?.replace(/_/g, ' ') || '\u2014'}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'is_show_court',
      header: 'Show Court',
      render: (c: (typeof courts)[0]) =>
        c.is_show_court ? (
          <Badge variant="success">Yes</Badge>
        ) : (
          <Badge variant="default">No</Badge>
        ),
    },
    {
      key: 'is_active',
      header: 'Active',
      render: (c: (typeof courts)[0]) =>
        c.is_active ? (
          <Badge variant="success">Active</Badge>
        ) : (
          <Badge variant="default">Inactive</Badge>
        ),
    },
    {
      key: 'stream_type',
      header: 'Stream',
      render: (c: (typeof courts)[0]) => {
        if (!c.stream_type) return <span className="text-(--color-text-secondary)">{'\u2014'}</span>
        return (
          <Badge variant={STREAM_VARIANTS[c.stream_type] ?? 'default'}>
            {c.stream_type}
          </Badge>
        )
      },
      className: 'hidden lg:table-cell',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Floating Courts</h1>
      </div>

      <AdSlot size="responsive-banner" slot="courts-list-top" className="mb-4" />

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <EmptyState
          title="Failed to load courts"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : courts.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="h-12 w-12" />}
          title="No floating courts"
          description="No standalone courts exist yet."
        />
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table columns={columns} data={courts} keyExtractor={(c) => c.id} />
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
