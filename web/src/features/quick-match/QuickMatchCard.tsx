// web/src/features/quick-match/QuickMatchCard.tsx
import { Link } from '@tanstack/react-router'
import { Card } from '../../components/Card'
import type { Match } from '../scoring/types'

import { useSport } from '../../auth/SportContext'
export interface QuickMatchCardProps {
  match: Match
}

function formatExpiresAt(iso: string | null | undefined): string {
  if (!iso) return ''
  const expires = new Date(iso).getTime()
  if (Number.isNaN(expires)) return ''
  const now = Date.now()
  const remainingMs = expires - now
  if (remainingMs <= 0) return 'expired'
  const hrs = Math.floor(remainingMs / 3_600_000)
  const mins = Math.floor((remainingMs % 3_600_000) / 60_000)
  if (hrs > 0) return `expires in ${hrs}h ${mins}m`
  return `expires in ${mins}m`
}

export function QuickMatchCard({ match }: QuickMatchCardProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const expiresLabel = formatExpiresAt(match.expires_at)

  return (
    <Link
      to="/$sport/ref/matches/$publicId"
      params={{ sport: sportSlug, publicId: match.public_id }}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 rounded-lg"
    >
      <Card className="p-3 hover:bg-(--color-bg-hover) transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-(--color-text-primary) truncate">
              {match.team_1?.name ?? 'Team 1'} vs {match.team_2?.name ?? 'Team 2'}
            </div>
            <div className="text-xs text-(--color-text-muted)">
              {match.scoring_type === 'rally' ? 'Rally' : 'Side-out'} · to {match.points_to_win} · best of {match.best_of}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold tabular-nums text-(--color-text-primary)">
              {match.team_1_score} – {match.team_2_score}
            </div>
            {expiresLabel && (
              <div className="text-xs text-amber-500">{expiresLabel}</div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  )
}
