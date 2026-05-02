// web/src/features/referee/CourtGrid.tsx
import { Link } from '@tanstack/react-router'
import { Tv } from 'lucide-react'
import { Card } from '../../components/Card'
import { cn } from '../../lib/cn'
import type { CourtSummary } from '../scoring/types'

import { useSport } from '../../auth/SportContext'
export interface CourtGridProps {
  courts: CourtSummary[]
  mode: 'ref' | 'scorekeeper' | 'public'
  emptyMessage?: string
}

export function CourtGrid({ courts, mode, emptyMessage }: CourtGridProps) {
  if (courts.length === 0) {
    return (
      <div className="text-center py-8 text-(--color-text-secondary)">
        {emptyMessage ?? 'No courts available'}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {courts.map((court) => (
        <CourtCard key={court.id} court={court} mode={mode} />
      ))}
    </div>
  )
}

function CourtCard({
  court,
  mode,
}: {
  court: CourtSummary
  mode: 'ref' | 'scorekeeper' | 'public'
}) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const live = court.active_match?.status === 'in_progress'

  const linkProps =
    mode === 'public'
      ? ({
          to: '/$sport/courts/$courtId',
          params: { sport: sportSlug, courtId: String(court.id) },
        } as const)
      : court.active_match
        ? mode === 'ref'
          ? ({
              to: '/$sport/ref/matches/$publicId',
              params: { sport: sportSlug, publicId: court.active_match.public_id },
            } as const)
          : ({
              to: '/$sport/scorekeeper/matches/$publicId',
              params: { sport: sportSlug, publicId: court.active_match.public_id },
            } as const)
        : ({
            to: '/$sport/ref/courts/$courtId',
            params: { sport: sportSlug, courtId: String(court.id) },
          } as const)

  return (
    <Link
      {...linkProps}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) rounded-lg"
    >
      <Card className="h-full p-3 hover:bg-(--color-bg-hover) transition-colors">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-(--color-text-primary) truncate">
            {court.name}
          </h3>
          <div className="flex items-center gap-1">
            {court.is_show_court ? (
              <Tv
                size={14}
                className="text-(--color-text-muted)"
                aria-label="Show court"
              />
            ) : null}
            {live ? <LiveDot /> : null}
          </div>
        </div>

        {court.active_match ? (
          <div className="space-y-1">
            <div className="text-xs text-(--color-text-muted)">In progress</div>
            <div className="text-sm text-(--color-text-primary) truncate">
              {court.active_match.team_1?.name ?? 'Team 1'} vs{' '}
              {court.active_match.team_2?.name ?? 'Team 2'}
            </div>
            <div className="text-base font-bold tabular-nums text-(--color-text-primary)">
              {court.active_match.team_1_score} –{' '}
              {court.active_match.team_2_score}
              <span className="ml-2 text-xs text-(--color-text-muted) font-normal">
                G{court.active_match.current_game}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-(--color-text-muted)">Available</div>
        )}
      </Card>
    </Link>
  )
}

function LiveDot() {
  return (
    <span
      className={cn(
        'inline-block w-2 h-2 rounded-full bg-(--color-success) animate-pulse',
      )}
      aria-label="Live"
    />
  )
}
