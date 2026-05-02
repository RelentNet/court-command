import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useVenueSearch } from './hooks'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePagination } from '../../../hooks/usePagination'
import { SearchInput } from '../../../components/SearchInput'
import { Table } from '../../../components/Table'
import { Pagination } from '../../../components/Pagination'
import { EmptyState } from '../../../components/EmptyState'
import { SkeletonTable } from '../../../components/Skeleton'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { MapView, type MapMarker } from '../../../components/MapView'
import { MapPin, Plus, List, Map } from 'lucide-react'
import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning'> = {
  draft: 'default',
  pending_review: 'warning',
  published: 'success',
  archived: 'default',
}

type ViewMode = 'list' | 'map'

export function VenueList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)
  const navigate = useNavigate()

  // For map view, fetch more results (up to 200)
  const limit = viewMode === 'map' ? 200 : pagination.limit
  const offset = viewMode === 'map' ? 0 : pagination.offset

  const { data, isLoading, error } = useVenueSearch(debouncedSearch, limit, offset)

  const venues = data?.items ?? []
  const total = data?.total ?? 0

  const mapMarkers: MapMarker[] = venues
    .filter((v) => v.latitude && v.longitude)
    .map((v) => ({
      id: v.id,
      lat: v.latitude!,
      lng: v.longitude!,
      label: v.name,
      sublabel: v.formatted_address || [v.city, v.state_province].filter(Boolean).join(', '),
    }))

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (v: (typeof venues)[0]) => (
        <Link
          to="/$sport/venues/$venueId"
          params={{ sport: sportSlug, venueId: String(v.id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          {v.name}
        </Link>
      ),
    },
    {
      key: 'city',
      header: 'City',
      render: (v: (typeof venues)[0]) => (
        <span className="text-(--color-text-secondary)">{v.city || '\u2014'}</span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'status',
      header: 'Status',
      render: (v: (typeof venues)[0]) => (
        <Badge variant={STATUS_VARIANT[v.status] ?? 'default'}>
          {v.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'court_count',
      header: 'Courts',
      render: (v: (typeof venues)[0]) => (
        <span className="text-(--color-text-secondary)">{v.court_count}</span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Venues</h1>
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
          <Link to="/$sport/venues/new" params={{ sport: sportSlug }}>
            <Button size="sm">
              <Plus className="h-4 w-4" /> Create Venue
            </Button>
          </Link>
        </div>
      </div>

      <AdSlot size="responsive-banner" slot="venues-list-top" className="mb-4" />

      <SearchInput
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          pagination.setPage(1)
        }}
        placeholder="Search venues..."
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
          title="Failed to load venues"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : venues.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-12 w-12" />}
          title="No venues found"
          description={search ? `No results for "${search}"` : 'No venues created yet.'}
          action={
            !search ? (
              <Link to="/$sport/venues/new" params={{ sport: sportSlug }}>
                <Button>Create Venue</Button>
              </Link>
            ) : undefined
          }
        />
      ) : viewMode === 'map' ? (
        <div>
          {mapMarkers.length === 0 ? (
            <EmptyState
              icon={<Map className="h-12 w-12" />}
              title="No venues with coordinates"
              description="Add addresses with Google Maps to see venues on the map."
            />
          ) : (
            <MapView
              markers={mapMarkers}
              height="500px"
              onMarkerClick={(marker) => {
                navigate({
                  to: '/$sport/venues/$venueId',
                  params: { sport: sportSlug, venueId: String(marker.id) },
                })
              }}
            />
          )}
          <p className="mt-2 text-sm text-(--color-text-muted)">
            {mapMarkers.length} of {venues.length} venues shown (with addresses)
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table columns={columns} data={venues} keyExtractor={(v) => v.id} />
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
