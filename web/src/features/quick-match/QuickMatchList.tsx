// web/src/features/quick-match/QuickMatchList.tsx
import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '../../components/Button'
import { EmptyState } from '../../components/EmptyState'
import { Skeleton } from '../../components/Skeleton'
import { useMyQuickMatches } from './hooks'
import { QuickMatchCard } from './QuickMatchCard'

import { useSport } from '../../auth/SportContext'
export function QuickMatchList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data, isLoading, isError } = useMyQuickMatches()

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">
          Quick Matches
        </h1>
        <Link to="/$sport/quick-match/new" params={{ sport: sportSlug }}>
          <Button variant="primary">
            <Plus size={16} className="mr-1 inline-block" />
            New Quick Match
          </Button>
        </Link>
      </div>

      <p className="text-xs text-(--color-text-muted)">
        Quick matches expire automatically 24 hours after creation.
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : isError ? (
        <div className="text-red-500" role="alert">Failed to load quick matches.</div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          title="No active quick matches"
          description="Start a casual match in seconds — no tournament needed."
          action={
            <Link to="/$sport/quick-match/new" params={{ sport: sportSlug }}>
              <Button variant="primary">
                <Plus size={16} className="mr-1 inline-block" />
                New Quick Match
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          {data.map((m) => (
            <QuickMatchCard key={m.public_id} match={m} />
          ))}
        </div>
      )}
    </div>
  )
}
