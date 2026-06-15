import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  useGetSeason,
  useUpdateSeasonStatus,
  useListSeasonConfirmations,
  useListTournamentsBySeason,
} from './hooks'
import { StandingsView } from './StandingsView'
import { Skeleton } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { StatusBadge } from '../../components/StatusBadge'
import { InfoRow } from '../../components/InfoRow'
import { Badge } from '../../components/Badge'
import { Modal } from '../../components/Modal'
import { SeasonForm } from './SeasonForm'
import { useToast } from '../../components/Toast'
import { ChevronLeft, Trophy, CheckCircle2, XCircle, BarChart3 } from 'lucide-react'
import { formatDate } from '../../lib/formatters'

import { useSport } from '../../auth/SportContext'
interface Props {
  leagueId: string
  seasonId: string
}

const STATUS_TRANSITIONS: Record<string, { label: string; next: string }[]> = {
  draft: [{ label: 'Activate', next: 'active' }],
  active: [{ label: 'Complete', next: 'completed' }],
  completed: [{ label: 'Archive', next: 'archived' }],
  archived: [],
}

export function SeasonDetail({ leagueId, seasonId }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { toast } = useToast()
  const leagueIdNum = Number(leagueId)
  const seasonIdNum = Number(seasonId)
  const { data: season, isLoading, error } = useGetSeason(leagueIdNum, seasonIdNum)
  const { data: tournaments } = useListTournamentsBySeason(seasonIdNum)
  const { data: confirmations } = useListSeasonConfirmations(
    leagueIdNum,
    seasonIdNum,
  )
  const updateStatus = useUpdateSeasonStatus(leagueIdNum, seasonIdNum)
  const [showEdit, setShowEdit] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !season) {
    return (
      <EmptyState
        title="Failed to load season"
        description={(error as Error)?.message || 'Season not found.'}
        action={
          <Link to="/$sport/leagues/$leagueId" params={{ sport: sportSlug, leagueId }}>
            <Button variant="secondary">Back to League</Button>
          </Link>
        }
      />
    )
  }

  async function handleStatus(next: string) {
    try {
      await updateStatus.mutateAsync(next)
      toast('success', `Season ${next}`)
    } catch (err) {
      toast('error', (err as Error).message || 'Failed to update status')
    }
  }

  const transitions = STATUS_TRANSITIONS[season.status] || []
  const tournamentList = tournaments?.items ?? []

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/$sport/leagues/$leagueId"
          params={{ sport: sportSlug, leagueId }}
          className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-3"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to League
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-(--color-text-primary)">
              {season.name}
            </h1>
            <StatusBadge status={season.status} type="season" />
          </div>
          <Button variant="secondary" onClick={() => setShowEdit(true)}>
            Edit Season
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
              Details
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoRow label="Start Date" value={formatDate(season.start_date)} />
              <InfoRow label="End Date" value={formatDate(season.end_date)} />
              <InfoRow
                label="Standings Method"
                value={season.standings_method.replace(/_/g, ' ')}
              />
              <InfoRow
                label="Roster Confirmation Deadline"
                value={formatDate(season.roster_confirmation_deadline)}
              />
            </div>
            {season.description && (
              <div className="mt-4">
                <div className="text-sm text-(--color-text-secondary) mb-1">
                  Description
                </div>
                <p className="text-(--color-text-primary) whitespace-pre-wrap">
                  {season.description}
                </p>
              </div>
            )}
          </div>
        </Card>

        {transitions.length > 0 && (
          <Card>
            <div className="p-6">
              <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
                Status Actions
              </h2>
              <div className="flex flex-wrap gap-2">
                {transitions.map((t) => (
                  <Button
                    key={t.next}
                    onClick={() => handleStatus(t.next)}
                    disabled={updateStatus.isPending}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        )}

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-(--color-text-primary)">
                Tournaments
              </h2>
              <Link
                to="/$sport/tournaments/create" params={{ sport: sportSlug }}
                search={{ league_id: leagueIdNum, season_id: seasonIdNum }}
              >
                <Button size="sm">Create Tournament</Button>
              </Link>
            </div>
            {tournamentList.length === 0 ? (
              <EmptyState
                icon={<Trophy className="h-12 w-12" />}
                title="No tournaments yet"
                description="Create the first tournament for this season."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tournamentList.map((t) => (
                  <Link
                    key={t.id}
                    to="/$sport/tournaments/$tournamentId"
                    params={{ sport: sportSlug, tournamentId: String(t.id) }}
                  >
                    <Card className="hover:border-cyan-400 transition-colors cursor-pointer h-full">
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-(--color-text-primary)">
                            {t.name}
                          </h3>
                          <StatusBadge status={t.status} type="tournament" />
                        </div>
                        <div className="text-sm text-(--color-text-secondary)">
                          {formatDate(t.start_date)} \u2014 {formatDate(t.end_date)}
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-5 w-5 text-(--color-text-secondary)" />
              <h2 className="text-lg font-semibold text-(--color-text-primary)">
                Standings
              </h2>
            </div>
            <StandingsView seasonId={seasonIdNum} />
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
              Season Confirmations
            </h2>
            {!confirmations || confirmations.length === 0 ? (
              <div className="text-sm text-(--color-text-secondary)">
                No team confirmations yet.
              </div>
            ) : (
              <div className="divide-y divide-(--color-border)">
                {confirmations.map((c) => (
                  <div
                    key={c.id}
                    className="py-3 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-(--color-text-primary)">
                        {c.team_name || `Team #${c.team_id}`}
                      </div>
                      <div className="text-sm text-(--color-text-secondary)">
                        {c.division_name || `Division #${c.division_id}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.confirmed ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Confirmed
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <XCircle className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                      {c.deadline && (
                        <span className="text-xs text-(--color-text-secondary)">
                          Due {formatDate(c.deadline)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit Season"
      >
        <SeasonForm
          leagueId={leagueIdNum}
          season={season}
          onClose={() => setShowEdit(false)}
        />
      </Modal>
    </div>
  )
}
