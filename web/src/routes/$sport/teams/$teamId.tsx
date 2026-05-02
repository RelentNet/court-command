import { createFileRoute } from '@tanstack/react-router'
import { TeamDetail } from '../../../features/registry/teams/TeamDetail'

export const Route = createFileRoute('/$sport/teams/$teamId')({
  component: TeamDetailPage,
})

function TeamDetailPage() {
  const { teamId } = Route.useParams()
  return <TeamDetail teamId={teamId} />
}
