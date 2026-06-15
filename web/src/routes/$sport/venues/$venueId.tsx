import { createFileRoute } from '@tanstack/react-router'
import { VenueDetail } from '../../../features/registry/venues/VenueDetail'

export const Route = createFileRoute('/$sport/venues/$venueId')({
  component: VenueDetailPage,
})

function VenueDetailPage() {
  const { venueId } = Route.useParams()
  return <VenueDetail venueId={venueId} />
}
