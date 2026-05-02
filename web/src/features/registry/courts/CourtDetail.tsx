import { useState } from 'react'
import { useCourt } from './hooks'
import { useCourtMatches } from '../../scoring/hooks'
import { useAuth } from '../../../auth/useAuth'
import { Badge } from '../../../components/Badge'
import { InfoRow } from '../../../components/InfoRow'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { Modal } from '../../../components/Modal'
import { StreamEmbed } from '../../../components/StreamEmbed'
import { AdSlot } from '../../../components/AdSlot'
import { CourtEditForm } from './CourtEditForm'
import { ArrowLeft, Pencil, Tv, Radio, Calendar, Clock } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { formatDate } from '../../../lib/formatters'
import type { Match } from '../../scoring/types'

interface CourtDetailProps {
  courtId: string
}

const STREAM_VARIANTS: Record<string, 'error' | 'info' | 'success' | 'default'> = {
  youtube: 'error',
  twitch: 'info',
  vimeo: 'info',
  hls: 'success',
}

export function CourtDetail({ courtId }: CourtDetailProps) {
  const { data: court, isLoading, error, refetch } = useCourt(courtId)
  const matches = useCourtMatches(court?.id)
  const { user } = useAuth()
  const [showEdit, setShowEdit] = useState(false)

  const isAdmin = user?.role === 'platform_admin'

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error || !court) {
    return (
      <EmptyState
        title="Court not found"
        description="This court may have been removed or you don't have access."
        action={
          <Link to="/courts">
            <Button variant="secondary">Back to Courts</Button>
          </Link>
        }
      />
    )
  }

  const allMatches = matches.data ?? []
  const activeMatch = allMatches.find((m) => m.status === 'in_progress')
  const scheduledMatches = allMatches.filter((m) => m.status === 'scheduled')
  const completedMatches = allMatches.filter((m) => m.status === 'completed').slice(0, 5)

  return (
    <div className="max-w-4xl mx-auto">
      <Link
        to="/courts"
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-(--color-text-primary)">{court.name}</h1>
          <p className="text-sm text-(--color-text-secondary) mt-1">
            {court.surface_type?.replace(/_/g, ' ') ?? 'Court'}
          </p>
        </div>
        <div className="flex gap-2 items-center flex-shrink-0">
          {court.stream_is_live && (
            <Badge variant="error">
              <Radio size={12} className="mr-1" /> Live
            </Badge>
          )}
          {court.is_show_court && (
            <Badge variant="info">
              <Tv size={12} className="mr-1" /> Show Court
            </Badge>
          )}
          {court.is_active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="default">Inactive</Badge>
          )}
          {isAdmin && (
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              <Pencil size={14} className="mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {/* Stream embed */}
        {court.stream_url && (
          <StreamEmbed
            url={court.stream_url}
            type={court.stream_type}
            title={court.stream_title}
            isLive={court.stream_is_live}
          />
        )}

        {/* Active Match */}
        {activeMatch && (
          <Card className="p-6 border-2 border-(--color-accent)">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-(--color-text-primary) flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Now Playing
              </h2>
              <Link
                to="/matches/$publicId"
                params={{ publicId: activeMatch.public_id }}
                className="text-sm text-(--color-accent) hover:underline"
              >
                View Match
              </Link>
            </div>
            <MatchCard match={activeMatch} />
          </Card>
        )}

        {!activeMatch && !court.stream_url && (
          <Card className="p-8 text-center">
            <p className="text-(--color-text-secondary)">
              No match currently in progress on this court.
            </p>
          </Card>
        )}

        {/* Upcoming Matches */}
        {scheduledMatches.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3 flex items-center gap-2">
              <Calendar size={18} />
              Upcoming Matches ({scheduledMatches.length})
            </h2>
            <div className="space-y-2">
              {scheduledMatches.map((match) => (
                <Link
                  key={match.id}
                  to="/matches/$publicId"
                  params={{ publicId: match.public_id }}
                  className="block"
                >
                  <Card className="p-4 hover:bg-(--color-bg-hover) transition-colors cursor-pointer">
                    <MatchCard match={match} compact />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent Results */}
        {completedMatches.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-(--color-text-primary) mb-3 flex items-center gap-2">
              <Clock size={18} />
              Recent Results
            </h2>
            <div className="space-y-2">
              {completedMatches.map((match) => (
                <Link
                  key={match.id}
                  to="/matches/$publicId"
                  params={{ publicId: match.public_id }}
                  className="block"
                >
                  <Card className="p-4 hover:bg-(--color-bg-hover) transition-colors cursor-pointer">
                    <MatchCard match={match} compact />
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Court Info */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
            Court Details
          </h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Surface" value={court.surface_type?.replace(/_/g, ' ')} />
            <InfoRow label="Show Court" value={court.is_show_court ? 'Yes' : 'No'} />
            {court.stream_type && (
              <InfoRow
                label="Stream Platform"
                value={
                  <Badge variant={STREAM_VARIANTS[court.stream_type] ?? 'default'}>
                    {court.stream_type.charAt(0).toUpperCase() + court.stream_type.slice(1)}
                  </Badge>
                }
              />
            )}
            {court.stream_title && <InfoRow label="Stream Title" value={court.stream_title} />}
            {court.notes && <InfoRow label="Notes" value={court.notes} />}
            <InfoRow label="Created" value={formatDate(court.created_at)} />
          </dl>
        </Card>
      </div>

      <AdSlot size="medium-rectangle" slot="court-detail-bottom" className="mt-6" />

      {/* Edit Modal */}
      {court && (
        <Modal
          open={showEdit}
          onClose={() => setShowEdit(false)}
          title={`Edit ${court.name}`}
          className="max-w-2xl"
        >
          <CourtEditForm
            court={court}
            onSuccess={() => {
              setShowEdit(false)
              refetch()
            }}
            onCancel={() => setShowEdit(false)}
          />
        </Modal>
      )}
    </div>
  )
}

function MatchCard({ match, compact }: { match: Match; compact?: boolean }) {
  const team1 = match.team_1?.name ?? 'Team 1'
  const team2 = match.team_2?.name ?? 'Team 2'
  const isLive = match.status === 'in_progress'
  const isComplete = match.status === 'completed'

  return (
    <div className={compact ? 'flex items-center justify-between' : ''}>
      <div className={compact ? 'flex items-center gap-4 flex-1 min-w-0' : 'space-y-2'}>
        <div className={compact ? 'flex items-center gap-2 text-sm' : 'flex items-center justify-between'}>
          <span className="font-medium text-(--color-text-primary) truncate">{team1}</span>
          {!compact && (
            <span className="text-2xl font-bold tabular-nums text-(--color-text-primary)">
              {match.team_1_score}
            </span>
          )}
        </div>
        {compact && <span className="text-(--color-text-muted)">vs</span>}
        <div className={compact ? 'flex items-center gap-2 text-sm' : 'flex items-center justify-between'}>
          <span className="font-medium text-(--color-text-primary) truncate">{team2}</span>
          {!compact && (
            <span className="text-2xl font-bold tabular-nums text-(--color-text-primary)">
              {match.team_2_score}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {compact && isLive && (
          <span className="text-sm font-bold tabular-nums text-(--color-text-primary)">
            {match.team_1_score} - {match.team_2_score}
          </span>
        )}
        {compact && (
          <Badge variant={isLive ? 'success' : isComplete ? 'default' : 'info'}>
            {isLive ? 'Live' : isComplete ? 'Final' : 'Upcoming'}
          </Badge>
        )}
        {!compact && match.division_name && (
          <p className="text-xs text-(--color-text-secondary) mt-1">
            {match.division_name}
          </p>
        )}
      </div>
    </div>
  )
}
