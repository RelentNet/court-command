import { createFileRoute } from '@tanstack/react-router'
import { PlayerDetail } from '../../../features/registry/players/PlayerDetail'

export const Route = createFileRoute('/$sport/players/$playerId')({
  component: PlayerDetailPage,
})

function PlayerDetailPage() {
  const { playerId } = Route.useParams()
  return <PlayerDetail playerId={playerId} />
}
