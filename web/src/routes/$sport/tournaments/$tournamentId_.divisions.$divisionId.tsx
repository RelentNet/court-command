import { createFileRoute } from '@tanstack/react-router'
import { DivisionDetail } from '../../../features/tournaments/DivisionDetail'

export const Route = createFileRoute(
  '/$sport/tournaments/$tournamentId_/divisions/$divisionId',
)({
  component: DivisionDetailPage,
})

function DivisionDetailPage() {
  const { tournamentId, divisionId } = Route.useParams()
  return <DivisionDetail tournamentId={tournamentId} divisionId={divisionId} />
}
