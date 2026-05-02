import { useVenue, useSubmitForReview, useUpdateVenueStatus, useCanManageVenue } from './hooks'
import { useAuth } from '../../../auth/useAuth'
import { useToast } from '../../../components/Toast'
import { CourtListPanel } from './CourtListPanel'
import { VenueManagersPanel } from './VenueManagersPanel'
import { Badge } from '../../../components/Badge'
import { InfoRow } from '../../../components/InfoRow'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'
import { ArrowLeft, Pencil } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { formatDate } from '../../../lib/formatters'
import { AdSlot } from '../../../components/AdSlot'

interface VenueDetailProps {
  venueId: string
}

const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning'> = {
  draft: 'default',
  pending_review: 'warning',
  published: 'success',
  archived: 'default',
}

export function VenueDetail({ venueId }: VenueDetailProps) {
  const { data: venue, isLoading, error } = useVenue(venueId)
  const { user } = useAuth()
  const { toast } = useToast()
  const submitForReview = useSubmitForReview(venueId)
  const updateStatus = useUpdateVenueStatus(venueId)
  const isAdmin = user?.role === 'platform_admin'
  const canManageQuery = useCanManageVenue(venueId)
  const canManage = canManageQuery.data?.can_manage ?? false

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !venue) {
    return (
      <EmptyState
        title="Venue not found"
        description="This venue may have been removed or you don't have access."
        action={
          <Link to="/venues">
            <Button variant="secondary">Back to Venues</Button>
          </Link>
        }
      />
    )
  }

  const address = venue.formatted_address
    || [venue.address_line_1, venue.city, venue.state_province, venue.postal_code, venue.country]
      .filter(Boolean)
      .join(', ')

  return (
    <div>
      <Link
        to="/venues"
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Venues
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">{venue.name}</h1>
          <p className="text-sm text-(--color-text-secondary)">{venue.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <Link to="/venues/$venueId/edit" params={{ venueId: String(venue.id) }}>
              <Button variant="secondary" size="sm">
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
            </Link>
          )}
          <Badge variant={STATUS_VARIANT[venue.status] ?? 'default'}>
            {venue.status.replace(/_/g, ' ')}
          </Badge>
        </div>
      </div>

      {/* Status transition actions */}
      {venue.status === 'draft' && canManage && (
        <div className="mb-6 p-4 rounded-lg border border-(--color-border) bg-(--color-bg-secondary) flex items-center gap-3">
          <span className="text-sm text-(--color-text-secondary)">This venue is in draft.</span>
          <Button
            size="sm"
            variant="secondary"
            loading={submitForReview.isPending}
            onClick={() =>
              submitForReview.mutate(undefined, {
                onSuccess: () => toast('success', 'Submitted for review'),
                onError: (err) => toast('error', (err as Error).message),
              })
            }
          >
            Submit for Review
          </Button>
          {isAdmin && (
            <Button
              size="sm"
              loading={updateStatus.isPending}
              onClick={() =>
                updateStatus.mutate('published', {
                  onSuccess: () => toast('success', 'Venue published'),
                  onError: (err) => toast('error', (err as Error).message),
                })
              }
            >
              Publish Now
            </Button>
          )}
        </div>
      )}

      {venue.status === 'pending_review' && isAdmin && (
        <div className="mb-6 p-4 rounded-lg border border-(--color-border) bg-(--color-bg-secondary) flex items-center gap-3">
          <span className="text-sm text-(--color-text-secondary)">Pending review.</span>
          <Button
            size="sm"
            loading={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate('published', {
                onSuccess: () => toast('success', 'Venue published'),
                onError: (err) => toast('error', (err as Error).message),
              })
            }
          >
            Approve & Publish
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate('draft', {
                onSuccess: () => toast('warning', 'Venue sent back to draft'),
                onError: (err) => toast('error', (err as Error).message),
              })
            }
          >
            Reject
          </Button>
        </div>
      )}

      {venue.status === 'published' && isAdmin && (
        <div className="mb-6 p-4 rounded-lg border border-(--color-border) bg-(--color-bg-secondary) flex items-center gap-3">
          <span className="text-sm text-(--color-text-secondary)">This venue is live.</span>
          <Button
            size="sm"
            variant="secondary"
            loading={updateStatus.isPending}
            onClick={() =>
              updateStatus.mutate('archived', {
                onSuccess: () => toast('warning', 'Venue archived'),
                onError: (err) => toast('error', (err as Error).message),
              })
            }
          >
            Archive
          </Button>
        </div>
      )}

      <div className="space-y-6">
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">Details</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Name" value={venue.name} />
            <InfoRow label="Address" value={address} />
            <InfoRow label="Timezone" value={venue.timezone} />
            <InfoRow label="Contact Email" value={venue.contact_email} />
            <InfoRow
              label="Website"
              value={
                venue.website_url ? (
                  <a
                    href={venue.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {venue.website_url}
                  </a>
                ) : null
              }
            />
            <InfoRow label="Court Count" value={String(venue.court_count)} />
            <InfoRow label="Bio" value={venue.bio} />
            <InfoRow label="Created" value={formatDate(venue.created_at)} />
          </dl>
        </div>

        <CourtListPanel venueId={venueId} />
        <VenueManagersPanel venueId={venueId} />
      </div>

      <AdSlot size="medium-rectangle" slot="venue-detail-bottom" className="mt-6" />
    </div>
  )
}
