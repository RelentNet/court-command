import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  Building2,
  MapPin,
  ArrowLeft,
  Monitor,
  Radio,
  ChevronRight,
} from 'lucide-react'
import {
  usePublicVenueBySlug,
  usePublicVenueCourts,
  type PublicCourt,
} from './hooks'
import { Card } from '../../components/Card'
import { InfoRow } from '../../components/InfoRow'
import { AdSlot } from '../../components/AdSlot'
import { SkeletonRow } from '../../components/Skeleton'
import { TabLayout } from '../../components/TabLayout'
import { StreamEmbed } from '../../components/StreamEmbed'
import { EmptyState } from '../../components/EmptyState'
import { usePageTitle } from '../../hooks/usePageTitle'
import { useSport } from '../../auth/SportContext'
import { cn } from '../../lib/cn'

interface PublicVenueDetailProps {
  slug: string
}

export function PublicVenueDetail({ slug }: PublicVenueDetailProps) {
  const { data: venue, isLoading, isError } = usePublicVenueBySlug(slug)
  const [activeTab, setActiveTab] = useState('overview')
  usePageTitle(venue?.name ?? 'Venue')

  const {
    data: courts,
    isLoading: courtsLoading,
  } = usePublicVenueCourts(slug)

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

  if (isError || !venue) {
    return (
      <div className="space-y-4">
        <Link
          to={'/public/venues' as string}
          className="inline-flex items-center gap-1 text-sm text-(--color-accent) hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Venues
        </Link>
        <Card>
          <p className="text-sm text-(--color-status-error)">
            {isError
              ? 'Failed to load venue details. Please try again later.'
              : 'Venue not found.'}
          </p>
        </Card>
      </div>
    )
  }

  const activeCourts = courts?.filter((c) => c.active_match) ?? []

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'courts', label: 'Courts', count: courts?.length },
  ]

  return (
    <div className="space-y-6">
      <Link
        to={'/public/venues' as string}
        className="inline-flex items-center gap-1 text-sm text-(--color-accent) hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Venues
      </Link>

      {/* Header */}
      <Card>
        <div className="flex items-start gap-4">
          {venue.photo_url ? (
            <img
              src={venue.photo_url}
              alt={`${venue.name} photo`}
              className="h-20 w-20 rounded-xl object-cover flex-shrink-0"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-(--color-bg-hover) flex-shrink-0">
              <Building2 className="h-10 w-10 text-(--color-text-muted)" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-(--color-text-primary)">
              {venue.name}
            </h1>
            {(venue.city || venue.state_province) && (
              <div className="mt-2 flex items-center gap-1 text-sm text-(--color-text-muted)">
                <MapPin className="h-4 w-4" />
                <span>
                  {[venue.city, venue.state_province, venue.country]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </div>
            )}
            {activeCourts.length > 0 && (
              <div className="mt-1 flex items-center gap-1 text-sm text-green-400">
                <Radio className="h-4 w-4" />
                <span>
                  {activeCourts.length} active match
                  {activeCourts.length !== 1 ? 'es' : ''}
                </span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Photo banner */}
      {venue.photo_url && (
        <div className="overflow-hidden rounded-xl border border-(--color-border)">
          <img
            src={venue.photo_url}
            alt={venue.name}
            className="w-full h-48 object-cover"
          />
        </div>
      )}

      {/* Tabs */}
      <TabLayout tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab}>
        {activeTab === 'overview' && <OverviewTab venue={venue} />}
        {activeTab === 'courts' && (
          <CourtsTab
            courts={courts ?? []}
            isLoading={courtsLoading}
          />
        )}
      </TabLayout>

      <AdSlot size="medium-rectangle" slot="venue-detail-bottom" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------

function OverviewTab({
  venue,
}: {
  venue: {
    city?: string
    state_province?: string
    country?: string
    court_count?: number
  }
}) {
  return (
    <Card>
      <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
        Details
      </h2>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <InfoRow
          label="Location"
          value={
            [venue.city, venue.state_province, venue.country]
              .filter(Boolean)
              .join(', ') || null
          }
        />
        <InfoRow
          label="Courts"
          value={
            venue.court_count != null
              ? `${venue.court_count} court${venue.court_count !== 1 ? 's' : ''}`
              : null
          }
        />
      </dl>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Courts Tab
// ---------------------------------------------------------------------------

function CourtsTab({
  courts,
  isLoading,
}: {
  courts: PublicCourt[]
  isLoading: boolean
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
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
        title="No courts listed"
        description="Courts will appear here when added to this venue."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {courts.map((court) => (
        <VenueCourtCard key={court.id} court={court} />
      ))}
    </div>
  )
}

function VenueCourtCard({ court }: { court: PublicCourt }) {
  const { sport } = useSport()
  // Public detail pages live under /public/* so there's no sport in context;
  // default to pickleball (the only seeded sport today). Resolving from
  // context first keeps this forward-compatible once these pages move under
  // a sport-scoped route.
  const sportSlug = sport?.slug ?? 'pickleball'

  const hasLive = court.active_match?.status === 'in_progress'
  const hasStream = court.stream_url && court.stream_is_live
  // The card drills into whichever match the court is actually showing. An
  // active match always wins; an on-deck match is the destination only when
  // no match is live. A court with neither has no destination — see below.
  const targetMatch = court.active_match ?? court.on_deck_match

  const body = (
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
          {targetMatch && (
            <ChevronRight className="h-4 w-4 text-(--color-text-muted) group-hover:text-(--color-accent) transition-colors flex-shrink-0" />
          )}
        </div>
      </div>

      {/* Surface type */}
      {court.surface_type && (
        <span className="text-xs text-(--color-text-muted)">
          {court.surface_type}
        </span>
      )}

      {/* Active match */}
      {court.active_match && (
        <div className="bg-(--color-bg-hover) rounded-lg p-2.5">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className={cn(
              'font-medium',
              hasLive ? 'text-green-400' : 'text-(--color-text-muted)',
            )}>
              {hasLive ? 'LIVE' : court.active_match.status.replace(/_/g, ' ').toUpperCase()}
            </span>
            {court.active_match.tournament_name && (
              <span className="text-(--color-text-muted) truncate ml-2">
                {court.active_match.tournament_name}
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
    </div>
  )

  // A court with no match is a static info card — no hover accent, no chevron,
  // nothing that implies it navigates. A quiet court is allowed to be quiet.
  if (!targetMatch) {
    return (
      <Card className={cn('transition-colors', hasLive && 'border-green-500/30')}>
        {body}
      </Card>
    )
  }

  // A court with a match drills into that match's public page. The whole card
  // is the click target so the affordance (hover accent + chevron) matches
  // the destination.
  return (
    <Link
      to={'/$sport/matches/$publicId' as string}
      params={
        { sport: sportSlug, publicId: targetMatch.public_id } as Record<
          string,
          string
        >
      }
      className="block"
    >
      <Card className={cn(
        'group transition-colors hover:border-(--color-accent)/30',
        hasLive && 'border-green-500/30',
      )}>
        {body}
      </Card>
    </Link>
  )
}
