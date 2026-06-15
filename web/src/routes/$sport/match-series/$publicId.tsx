import { createFileRoute } from '@tanstack/react-router'
import { MatchSeriesDetail } from '../../../features/match-series/MatchSeriesDetail'

export const Route = createFileRoute('/$sport/match-series/$publicId')({
  component: MatchSeriesRoute,
})

function MatchSeriesRoute() {
  const { publicId } = Route.useParams()
  return <MatchSeriesDetail publicId={publicId} />
}
