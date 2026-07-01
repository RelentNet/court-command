import { Link } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import { Card } from '../../components/Card'
import { Badge } from '../../components/Badge'
import { EmptyState } from '../../components/EmptyState'
import { useSport } from '../../auth/SportContext'
import type { DashboardTeam } from './hooks'

interface Props {
  data: DashboardTeam[]
}

function TeamAvatar({ team }: { team: DashboardTeam }) {
  if (team.logo_url) {
    return (
      <img
        src={team.logo_url}
        alt={team.name}
        className="h-10 w-10 rounded-full object-cover"
      />
    )
  }

  const initials = team.short_name
    ? team.short_name.slice(0, 2).toUpperCase()
    : team.name.slice(0, 2).toUpperCase()

  return (
    <div
      className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
      style={{ backgroundColor: team.primary_color ?? '#6b7280' }}
    >
      {initials}
    </div>
  )
}

export function MyTeams({ data }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title="No teams"
        description="Join or create a team to see it here."
      />
    )
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {data.map((team) => (
        <Link
          key={team.id}
          to="/$sport/teams/$teamId"
          params={{ sport: sportSlug, teamId: String(team.id) }}
          className="block"
        >
          <Card className="hover:border-(--color-accent) transition-colors">
            <div className="flex items-center gap-3">
              <TeamAvatar team={team} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-(--color-text-primary) truncate">
                  {team.name}
                </p>
                <Badge variant="info">{team.roster_role}</Badge>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
