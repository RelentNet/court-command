import { createFileRoute } from '@tanstack/react-router'
import { SeasonDetail } from '../../../features/leagues/SeasonDetail'

export const Route = createFileRoute(
  '/$sport/leagues/$leagueId_/seasons/$seasonId',
)({
  component: RouteComponent,
})

function RouteComponent() {
  const { leagueId, seasonId } = Route.useParams()
  return <SeasonDetail leagueId={leagueId} seasonId={seasonId} />
}
