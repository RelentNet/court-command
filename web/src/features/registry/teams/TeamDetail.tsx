import { useState } from 'react'
import { useTeam, useDeleteTeam } from './hooks'
import { RosterPanel } from './RosterPanel'
import { Badge } from '../../../components/Badge'
import { InfoRow } from '../../../components/InfoRow'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { Button } from '../../../components/Button'
import { ConfirmDialog } from '../../../components/ConfirmDialog'
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useToast } from '../../../components/Toast'
import { formatDate } from '../../../lib/formatters'
import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
interface TeamDetailProps {
  teamId: string
}

export function TeamDetail({ teamId }: TeamDetailProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { data: team, isLoading, error } = useTeam(teamId)
  const deleteTeam = useDeleteTeam(teamId)
  const navigate = useNavigate()
  const { toast } = useToast()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error || !team) {
    return (
      <EmptyState
        title="Team not found"
        description="This team may have been removed or you don't have access."
        action={
          <Link to="/$sport/teams" params={{ sport: sportSlug }}>
            <Button variant="secondary">Back to Teams</Button>
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <Link
        to="/$sport/teams" params={{ sport: sportSlug }}
        className="inline-flex items-center gap-1 text-sm text-(--color-text-secondary) hover:text-(--color-text-primary) mb-4"
      >
        <ArrowLeft className="h-4 w-4" /> Teams
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          {team.primary_color && (
            <span
              className="inline-block h-6 w-6 rounded-full border border-(--color-border)"
              style={{ backgroundColor: team.primary_color }}
            />
          )}
          <div>
            <h1 className="text-2xl font-bold text-(--color-text-primary)">{team.name}</h1>
            <p className="text-sm text-(--color-text-secondary)">
              {team.short_name} &middot; {team.slug}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/$sport/teams/$teamId/edit" params={{ sport: sportSlug, teamId: String(team.id) }}>
            <Button variant="secondary" size="sm">
              <Pencil className="h-4 w-4 mr-1" />
              Edit
            </Button>
          </Link>
          <Button variant="danger" size="sm" onClick={() => setShowDeleteConfirm(true)}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete
          </Button>
          <Badge variant="info">{team.short_name}</Badge>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">Details</h2>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoRow label="Name" value={team.name} />
            <InfoRow label="Short Name" value={team.short_name} />
            <InfoRow label="Slug" value={team.slug} />
            <InfoRow
              label="Primary Color"
              value={
                team.primary_color ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded border border-(--color-border)"
                      style={{ backgroundColor: team.primary_color }}
                    />
                    {team.primary_color}
                  </span>
                ) : null
              }
            />
            <InfoRow
              label="Secondary Color"
              value={
                team.secondary_color ? (
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-4 w-4 rounded border border-(--color-border)"
                      style={{ backgroundColor: team.secondary_color }}
                    />
                    {team.secondary_color}
                  </span>
                ) : null
              }
            />
            <InfoRow
              label="Organization"
              value={
                team.org_name && team.org_id ? (
                  <Link
                    to="/$sport/organizations/$orgId"
                    params={{ sport: sportSlug, orgId: String(team.org_id) }}
                    className="text-cyan-400 hover:underline"
                  >
                    {team.org_name}
                  </Link>
                ) : null
              }
            />
            <InfoRow label="City" value={team.city} />
            <InfoRow
              label="Founded"
              value={team.founded_year ? String(team.founded_year) : null}
            />
            <InfoRow label="Bio" value={team.bio} />
            <InfoRow label="Created" value={formatDate(team.created_at)} />
          </dl>
        </div>

        <RosterPanel teamId={teamId} />
      </div>

      <AdSlot size="medium-rectangle" slot="team-detail-bottom" className="mt-6" />

      <ConfirmDialog
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={() => {
          deleteTeam.mutate(undefined, {
            onSuccess: () => {
              toast('success', 'Team deleted')
              navigate({ to: '/$sport/teams', params: { sport: sportSlug } })
            },
            onError: (err: unknown) => toast('error', (err as Error).message),
          })
        }}
        title="Delete Team"
        message={`Are you sure you want to delete "${team.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="danger"
        loading={deleteTeam.isPending}
      />
    </div>
  )
}
