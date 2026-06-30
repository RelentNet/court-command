import { Link } from '@tanstack/react-router'
import { Trophy } from 'lucide-react'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { formatDate } from '../../lib/formatters'
import { useSport } from '../../auth/SportContext'
import type { DashboardMatch } from './hooks'

interface Props {
  data: DashboardMatch[]
}

export function RecentResults({ data }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Trophy className="h-8 w-8" />}
        title="No recent results"
        description="Completed match results will appear here."
      />
    )
  }

  return (
    <div className="space-y-3">
      {data.map((match) => (
        <Link
          key={match.id}
          to="/$sport/matches/$publicId"
          params={{ sport: sportSlug, publicId: match.public_id }}
          className="block"
        >
          <Card className="hover:border-(--color-accent) transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-(--color-text-primary)">
                    {match.team1_score}
                  </span>
                  <span className="text-xs text-(--color-text-muted)">vs</span>
                  <span className="text-sm font-semibold text-(--color-text-primary)">
                    {match.team2_score}
                  </span>
                </div>
                {match.round_name && (
                  <p className="text-xs text-(--color-text-muted) mt-0.5">
                    {match.round_name}
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                {match.winner_team_id && (
                  <p className="text-xs font-medium text-green-500">
                    Completed
                  </p>
                )}
                {match.completed_at && (
                  <p className="text-xs text-(--color-text-muted) mt-0.5">
                    {formatDate(match.completed_at)}
                  </p>
                )}
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
