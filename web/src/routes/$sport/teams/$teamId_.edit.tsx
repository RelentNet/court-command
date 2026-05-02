import { createFileRoute } from '@tanstack/react-router'
import { TeamForm } from '../../../features/registry/teams/TeamForm'
import { useTeam } from '../../../features/registry/teams/hooks'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'

export const Route = createFileRoute('/$sport/teams/$teamId_/edit')({
  component: TeamEditPage,
})

function TeamEditPage() {
  const { teamId } = Route.useParams()
  const { data: team, isLoading, error } = useTeam(teamId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !team) {
    return (
      <EmptyState
        title="Team not found"
        description="This team may have been removed or you don't have access."
      />
    )
  }

  return <TeamForm team={team} />
}
