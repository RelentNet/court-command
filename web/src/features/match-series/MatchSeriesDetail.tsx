// web/src/features/match-series/MatchSeriesDetail.tsx
import { Link } from '@tanstack/react-router'
import { Skeleton } from '../../components/Skeleton'
import { Card } from '../../components/Card'
import { useMatchSeries } from '../scoring/hooks'

import { useSport } from '../../auth/SportContext'
export interface MatchSeriesDetailProps {
  publicId: string
}

export function MatchSeriesDetail({ publicId }: MatchSeriesDetailProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const seriesQuery = useMatchSeries(publicId)

  if (seriesQuery.isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <Skeleton className="h-32 mb-4" />
        <Skeleton className="h-16 mb-2" />
        <Skeleton className="h-16 mb-2" />
        <Skeleton className="h-16" />
      </div>
    )
  }
  if (seriesQuery.isError || !seriesQuery.data) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-(--color-error)">
        Series not found.
      </div>
    )
  }

  const s = seriesQuery.data

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <Card className="p-6">
        <div className="text-xs uppercase text-(--color-text-muted) mb-2">
          Match series
        </div>
        <div className="grid grid-cols-3 items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-(--color-text-muted)">Team 1</div>
            <div className="text-lg font-bold text-(--color-text-primary)">
              {s.team1?.name ?? 'Team 1'}
            </div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-extrabold tabular-nums text-(--color-text-primary)">
              {s.team1_wins} – {s.team2_wins}
            </div>
            <div className="text-xs text-(--color-text-muted) mt-1">
              First to {s.games_to_win} · {s.status}
            </div>
          </div>
          <div className="text-left">
            <div className="text-xs text-(--color-text-muted)">Team 2</div>
            <div className="text-lg font-bold text-(--color-text-primary)">
              {s.team2?.name ?? 'Team 2'}
            </div>
          </div>
        </div>
      </Card>

      <section>
        <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide mb-2">
          Matches in this series
        </h2>
        {s.matches.length === 0 ? (
          <div className="text-(--color-text-secondary) text-sm">
            No matches yet.
          </div>
        ) : (
          <div className="space-y-2">
            {s.matches.map((m) => (
              <Link
                key={m.public_id}
                to="/$sport/matches/$publicId"
                params={{ sport: sportSlug, publicId: m.public_id }}
                className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded"
              >
                <Card className="flex items-center justify-between p-3 hover:bg-(--color-bg-hover) transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm text-(--color-text-primary) truncate">
                      {m.team_1?.name ?? 'Team 1'} vs {m.team_2?.name ?? 'Team 2'}
                    </div>
                    <div className="text-xs text-(--color-text-muted)">
                      {m.status === 'in_progress'
                        ? `${m.team_1_score}–${m.team_2_score} · G${m.current_game}`
                        : m.status === 'completed'
                          ? `Final ${m.team_1_score}–${m.team_2_score}`
                          : m.status}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
