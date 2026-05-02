import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useOrgSearch } from './hooks'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePagination } from '../../../hooks/usePagination'
import { SearchInput } from '../../../components/SearchInput'
import { Table } from '../../../components/Table'
import { Pagination } from '../../../components/Pagination'
import { EmptyState } from '../../../components/EmptyState'
import { SkeletonTable } from '../../../components/Skeleton'
import { Button } from '../../../components/Button'
import { MapView, type MapMarker } from '../../../components/MapView'
import { Building2, Plus, List, Map } from 'lucide-react'
import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
type ViewMode = 'list' | 'map'

export function OrgList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)
  const navigate = useNavigate()

  const limit = viewMode === 'map' ? 200 : pagination.limit
  const offset = viewMode === 'map' ? 0 : pagination.offset

  const { data, isLoading, error } = useOrgSearch(debouncedSearch, limit, offset)

  const orgs = data?.items ?? []
  const total = data?.total ?? 0

  const mapMarkers: MapMarker[] = orgs
    .filter((o) => o.latitude && o.longitude)
    .map((o) => ({
      id: o.id,
      lat: o.latitude!,
      lng: o.longitude!,
      label: o.name,
      sublabel: o.formatted_address || [o.city, o.state_province].filter(Boolean).join(', '),
    }))

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (o: (typeof orgs)[0]) => (
        <Link
          to="/$sport/organizations/$orgId"
          params={{ sport: sportSlug, orgId: String(o.id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          {o.name}
        </Link>
      ),
    },
    {
      key: 'location',
      header: 'City / State',
      render: (o: (typeof orgs)[0]) => (
        <span className="text-(--color-text-secondary)">
          {[o.city, o.state_province].filter(Boolean).join(', ') || '\u2014'}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'contact_email',
      header: 'Contact Email',
      render: (o: (typeof orgs)[0]) => (
        <span className="text-(--color-text-secondary)">{o.contact_email || '\u2014'}</span>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'founded_year',
      header: 'Founded',
      render: (o: (typeof orgs)[0]) => (
        <span className="text-(--color-text-secondary)">
          {o.founded_year ? String(o.founded_year) : '\u2014'}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Organizations</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-(--color-border) overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-(--color-bg-hover) text-(--color-text-primary)' : 'text-(--color-text-muted) hover:bg-(--color-bg-hover)'}`}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('map')}
              className={`p-2 ${viewMode === 'map' ? 'bg-(--color-bg-hover) text-(--color-text-primary)' : 'text-(--color-text-muted) hover:bg-(--color-bg-hover)'}`}
              aria-label="Map view"
            >
              <Map className="h-4 w-4" />
            </button>
          </div>
          <Link to="/$sport/organizations/new" params={{ sport: sportSlug }}>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Create Organization
            </Button>
          </Link>
        </div>
      </div>

      <AdSlot size="responsive-banner" slot="orgs-list-top" className="mb-4" />

      <SearchInput
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          pagination.setPage(1)
        }}
        placeholder="Search organizations..."
        className="mb-4 max-w-md"
      />

      {isLoading ? (
        viewMode === 'map' ? (
          <div className="h-[500px] rounded-lg bg-(--color-bg-secondary) animate-pulse" />
        ) : (
          <SkeletonTable rows={8} />
        )
      ) : error ? (
        <EmptyState
          title="Failed to load organizations"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : orgs.length === 0 ? (
        <EmptyState
          icon={<Building2 className="h-12 w-12" />}
          title="No organizations found"
          description={
            search ? `No results for "${search}"` : 'No organizations created yet.'
          }
          action={
            !search ? (
              <Link to="/$sport/organizations/new" params={{ sport: sportSlug }}>
                <Button>Create Organization</Button>
              </Link>
            ) : undefined
          }
        />
      ) : viewMode === 'map' ? (
        <div>
          {mapMarkers.length === 0 ? (
            <EmptyState
              icon={<Map className="h-12 w-12" />}
              title="No organizations with coordinates"
              description="Add addresses with Google Maps to see organizations on the map."
            />
          ) : (
            <MapView
              markers={mapMarkers}
              height="500px"
              onMarkerClick={(marker) => {
                navigate({
                  to: '/$sport/organizations/$orgId',
                  params: { sport: sportSlug, orgId: String(marker.id) },
                })
              }}
            />
          )}
          <p className="mt-2 text-sm text-(--color-text-muted)">
            {mapMarkers.length} of {orgs.length} organizations shown (with addresses)
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table columns={columns} data={orgs} keyExtractor={(o) => o.id} />
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
