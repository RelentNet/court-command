import { createFileRoute } from '@tanstack/react-router'
import { MatchScoreboardPage } from '../../../features/matches/MatchScoreboardPage'

export const Route = createFileRoute('/$sport/matches/$publicId_/scoreboard')({
  component: ScoreboardRoute,
})

function ScoreboardRoute() {
  const { publicId } = Route.useParams()
  return <MatchScoreboardPage publicId={publicId} />
}
