import { usePlayer } from './hooks'
import { Badge } from '../../../components/Badge'
import { InfoRow } from '../../../components/InfoRow'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'
import { ArrowLeft } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { formatDate, formatPlayerName } from '../../../lib/formatters'
import { AdSlot } from '../../../components/AdSlot'
import { NewsWidget } from '../../../components/NewsWidget'

import { useSport } from '../../../auth/SportContext'
interface PlayerDetailProps {
  playerId: string
}

export function PlayerDetail({ playerId }: PlayerDetailProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data: player, isLoading, error } = usePlayer(playerId)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !player) {
    return (
      <EmptyState
        title="Player not found"
        description="This player may have been removed or you don't have access."
        action={
          <Link to="/$sport/players" params={{ sport: sportSlug }}>
            <Button variant="secondary">Back to Players</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <Link
        to="/$sport/players" params={{ sport: sportSlug }}
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Players
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">
            {formatPlayerName(player.first_name, player.last_name, player.display_name)}
          </h1>
          <p className="text-sm text-(--color-text-secondary) font-mono">{player.public_id}</p>
        </div>
        <Badge variant={player.status === 'active' ? 'success' : 'default'}>
          {player.status}
        </Badge>
      </div>

      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">Profile</h2>
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="Name" value={`${player.first_name} ${player.last_name}`} />
          <InfoRow label="Display Name" value={player.display_name} />
          <InfoRow label="Email" value={player.email} />
          <InfoRow label="Date of Birth" value={formatDate(player.date_of_birth)} />
          <InfoRow label="Handedness" value={player.handedness} />
          <InfoRow label="DUPR ID" value={player.dupr_id} />
          <InfoRow label="VAIR ID" value={player.vair_id} />
          <InfoRow label="Gender" value={player.gender} />
          <InfoRow
            label="Location"
            value={[player.city, player.state_province, player.country]
              .filter(Boolean)
              .join(', ')}
          />
          <InfoRow
            label="Paddle"
            value={[player.paddle_brand, player.paddle_model].filter(Boolean).join(' ')}
          />
          <InfoRow label="Bio" value={player.bio} />
          <InfoRow
            label="Waiver"
            value={
              player.waiver_accepted_at
                ? `Accepted ${formatDate(player.waiver_accepted_at)}`
                : 'Not accepted'
            }
          />
          <InfoRow label="Profile Hidden" value={player.is_profile_hidden ? 'Yes' : 'No'} />
          <InfoRow label="Member Since" value={formatDate(player.created_at)} />
        </dl>
      </div>

      <div className="mt-6">
        <NewsWidget
          title="Player Headlines"
          tag={`player-${player.public_id}`}
          limit={3}
          emptyMessage="No articles mentioning this player yet"
        />
      </div>

      <AdSlot size="medium-rectangle" slot="player-detail-bottom" className="mt-6" />
    </div>
  )
}
