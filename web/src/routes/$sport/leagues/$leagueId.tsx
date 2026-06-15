import { createFileRoute } from '@tanstack/react-router'
import { LeagueDetail } from '../../../features/leagues/LeagueDetail'

export const Route = createFileRoute('/$sport/leagues/$leagueId')({
  component: RouteComponent,
})

function RouteComponent() {
  const { leagueId } = Route.useParams()
  return <LeagueDetail leagueId={leagueId} />
}
