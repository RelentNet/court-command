// web/src/features/referee/RefCourtView.tsx
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Card } from '../../components/Card'
import { EmptyState } from '../../components/EmptyState'
import { Skeleton } from '../../components/Skeleton'
import { useCourtMatches } from '../scoring/hooks'
import type { Match } from '../scoring/types'

import { useSport } from '../../auth/SportContext'
export interface RefCourtViewProps {
  courtId: number
}

export function RefCourtView({ courtId }: RefCourtViewProps) {
  const matches = useCourtMatches(courtId)

  if (matches.isLoading) {
    return (
      <div className="p-4 space-y-2">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    )
  }

  if (matches.isError) {
    return (
      <div className="p-4 text-(--color-error)">
        Failed to load court matches.
      </div>
    )
  }

  const list = matches.data ?? []
  const grouped = groupByStatus(list)

  if (list.length === 0) {
    return (
      <div className="p-4">
        <EmptyState
          title="No matches on this court"
          description="When a match is assigned to this court it will appear here."
        />
      </div>
    )
  }

  return (
    <div className="p-4 space-y-6">
      <Section title="In Progress" matches={grouped.in_progress} />
      <Section title="Scheduled" matches={grouped.scheduled} />
      <Section title="Recently Completed" matches={grouped.completed} />
    </div>
  )
}

function Section({ title, matches }: { title: string; matches: Match[] }) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  if (matches.length === 0) return null
  return (
    <section>
      <h2 className="text-sm font-semibold text-(--color-text-secondary) uppercase tracking-wide mb-2">
        {title}
      </h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <Link
            key={m.public_id}
            to="/$sport/ref/matches/$publicId"
            params={{ sport: sportSlug, publicId: m.public_id }}
            className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded-lg"
          >
            <Card className="flex items-center justify-between p-3 hover:bg-(--color-bg-hover) transition-colors">
              <div className="min-w-0">
                <div className="text-sm text-(--color-text-primary) truncate">
                  {m.team_1?.name ?? 'Team 1'} vs {m.team_2?.name ?? 'Team 2'}
                </div>
                <div className="text-xs text-(--color-text-muted)">
                  {m.division_name ?? 'Match'}
                  {m.status === 'in_progress'
                    ? ` · ${m.team_1_score}–${m.team_2_score} G${m.current_game}`
                    : ''}
                </div>
              </div>
              <ChevronRight
                size={20}
                className="text-(--color-text-muted) shrink-0"
              />
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

function groupByStatus(list: Match[]): {
  in_progress: Match[]
  scheduled: Match[]
  completed: Match[]
} {
  const out = {
    in_progress: [] as Match[],
    scheduled: [] as Match[],
    completed: [] as Match[],
  }
  for (const m of list) {
    if (m.status === 'in_progress') out.in_progress.push(m)
    else if (m.status === 'scheduled') out.scheduled.push(m)
    else if (m.status === 'completed') out.completed.push(m)
  }
  return out
}
