import { Link } from '@tanstack/react-router'
import { Calendar, Swords } from 'lucide-react'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDateTime } from '../../lib/formatters'
import { useSport } from '../../auth/SportContext'
import type { DashboardMatch } from './hooks'

interface Props {
  data: DashboardMatch[]
}

export function UpcomingMatches({ data }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Swords className="h-8 w-8" />}
        title="No upcoming matches"
        description="When you have scheduled matches, they'll appear here."
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
                <p className="text-sm font-medium text-(--color-text-primary) truncate">
                  {match.match_type === 'quick_match'
                    ? 'Quick Match'
                    : `Match #${match.match_number ?? match.id}`}
                </p>
                {match.round_name && (
                  <p className="text-xs text-(--color-text-muted) mt-0.5">
                    {match.round_name}
                  </p>
                )}
                {match.scheduled_at && (
                  <p className="text-xs text-(--color-text-muted) mt-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDateTime(match.scheduled_at)}
                  </p>
                )}
              </div>
              <StatusBadge status={match.status} />
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
