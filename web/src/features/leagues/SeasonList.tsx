import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useListSeasons } from './hooks'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { EmptyState } from '../../components/EmptyState'
import { Skeleton } from '../../components/Skeleton'
import { StatusBadge } from '../../components/StatusBadge'
import { SeasonForm } from './SeasonForm'
import { Calendar } from 'lucide-react'
import { formatDate } from '../../lib/formatters'

import { useSport } from '../../auth/SportContext'
interface Props {
  leagueId: number
}

export function SeasonList({ leagueId }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data: seasons, isLoading, error } = useListSeasons(leagueId)
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-(--color-text-primary)">Seasons</h2>
        <Button onClick={() => setShowCreate(true)}>Create Season</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : error ? (
        <EmptyState
          title="Failed to load seasons"
          description={(error as Error).message}
        />
      ) : !seasons || seasons.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-12 w-12" />}
          title="No seasons yet"
          description="Create the first season for this league."
          action={<Button onClick={() => setShowCreate(true)}>Create Season</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {seasons.map((season) => (
            <Link
              key={season.id}
              to="/$sport/leagues/$leagueId/seasons/$seasonId"
              params={{ sport: sportSlug, leagueId: String(leagueId),
                seasonId: String(season.id), }}
              className="block"
            >
              <Card className="hover:border-cyan-400 transition-colors cursor-pointer h-full">
                <div className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-(--color-text-primary)">
                      {season.name}
                    </h3>
                    <StatusBadge status={season.status} type="season" />
                  </div>
                  <div className="text-sm text-(--color-text-secondary) space-y-1">
                    {(season.start_date || season.end_date) && (
                      <div>
                        {formatDate(season.start_date)} \u2014 {formatDate(season.end_date)}
                      </div>
                    )}
                    <div>
                      Standings:{' '}
                      {season.standings_method.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Season"
      >
        <SeasonForm leagueId={leagueId} onClose={() => setShowCreate(false)} />
      </Modal>
    </div>
  )
}
