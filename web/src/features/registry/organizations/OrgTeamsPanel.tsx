import { Link } from '@tanstack/react-router'
import { useTeamsByOrg } from '../teams/hooks'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'
import { Users2, Plus } from 'lucide-react'

import { useSport } from '../../../auth/SportContext'
interface OrgTeamsPanelProps {
  orgId: string
  canManage: boolean
}

export function OrgTeamsPanel({ orgId, canManage }: OrgTeamsPanelProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data, isLoading, error } = useTeamsByOrg(orgId)

  const teams = data?.items ?? []

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-(--color-text-primary)">
          Teams ({teams.length})
        </h2>
        {canManage && (
          <Link to="/$sport/teams/new" params={{ sport: sportSlug }}>
            <Button size="sm" variant="secondary">
              <Plus className="h-4 w-4 mr-1" />
              Create Team
            </Button>
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-500">Failed to load teams</p>
      ) : teams.length === 0 ? (
        <EmptyState
          icon={<Users2 className="h-10 w-10" />}
          title="No teams yet"
          description="This organization has no teams."
          action={
            canManage ? (
              <Link to="/$sport/teams/new" params={{ sport: sportSlug }}>
                <Button size="sm">Create Team</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-(--color-border)">
          {teams.map((team) => (
            <Link
              key={team.id}
              to="/$sport/teams/$teamId"
              params={{ sport: sportSlug, teamId: String(team.id) }}
              className="flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-(--color-bg-hover) transition-colors"
            >
              {team.primary_color ? (
                <span
                  className="inline-block h-8 w-8 rounded-full border border-(--color-border) flex-shrink-0"
                  style={{ backgroundColor: team.primary_color }}
                />
              ) : (
                <span className="inline-block h-8 w-8 rounded-full bg-(--color-bg-hover) border border-(--color-border) flex-shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium text-(--color-text-primary) truncate">
                  {team.name}
                </p>
                <p className="text-xs text-(--color-text-secondary)">
                  {team.short_name}
                  {team.city ? ` · ${team.city}` : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
