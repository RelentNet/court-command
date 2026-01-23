import { createFileRoute } from '@tanstack/react-router'
import { MatchContainer } from '../components/MatchContainer'

export const Route = createFileRoute('/match/$matchId')({
  component: MatchDebugConsole,
})

function MatchDebugConsole() {
  const { matchId } = Route.useParams()
  return <MatchContainer matchId={matchId} readonly={true} />
}
