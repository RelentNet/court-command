import { createFileRoute } from '@tanstack/react-router'
import { TournamentDetail } from '../../../features/tournaments/TournamentDetail'

export const Route = createFileRoute('/$sport/tournaments/$tournamentId')({
  component: TournamentDetailPage,
})

function TournamentDetailPage() {
  const { tournamentId } = Route.useParams()
  return <TournamentDetail tournamentId={tournamentId} />
}
