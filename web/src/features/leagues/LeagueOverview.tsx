import { useState } from 'react'
import type { League } from './hooks'
import {
  useUpdateLeagueStatus,
  useDeleteLeague,
  useListSeasons,
  useListLeagueRegistrations,
} from './hooks'
import { Card } from '../../components/Card'
import { Button } from '../../components/Button'
import { InfoRow } from '../../components/InfoRow'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { RichTextDisplay } from '../../components/RichTextDisplay'
import { useToast } from '../../components/Toast'
import { useNavigate } from '@tanstack/react-router'

import { useSport } from '../../auth/SportContext'
interface Props {
  league: League
}

const STATUS_TRANSITIONS: Record<string, { label: string; next: string; variant?: 'primary' | 'secondary' | 'danger' }[]> = {
  draft: [{ label: 'Publish', next: 'published', variant: 'primary' }],
  published: [
    { label: 'Activate', next: 'active', variant: 'primary' },
    { label: 'Cancel', next: 'cancelled', variant: 'danger' },
  ],
  active: [
    { label: 'Archive', next: 'archived' },
    { label: 'Cancel', next: 'cancelled', variant: 'danger' },
  ],
  archived: [],
  cancelled: [],
}

export function LeagueOverview({ league }: Props) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { toast } = useToast()
  const navigate = useNavigate()
  const updateStatus = useUpdateLeagueStatus(league.id)
  const deleteLeague = useDeleteLeague()
  const { data: seasons } = useListSeasons(league.id)
  const { data: regs } = useListLeagueRegistrations(league.id)

  const [confirmDelete, setConfirmDelete] = useState(false)

  const transitions = STATUS_TRANSITIONS[league.status] || []

  async function handleStatus(next: string) {
    try {
      await updateStatus.mutateAsync(next)
      toast('success', `League ${next}`)
    } catch (err) {
      toast('error', (err as Error).message || 'Failed to update status')
    }
  }

  async function handleDelete() {
    try {
      await deleteLeague.mutateAsync(league.id)
      toast('success', 'League deleted')
      navigate({ to: '/$sport/leagues', params: { sport: sportSlug } })
    } catch (err) {
      toast('error', (err as Error).message || 'Failed to delete league')
    }
  }

  const activeOrgs = regs?.filter((r) => r.status === 'active').length ?? 0

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <div className="p-4">
            <div className="text-sm text-(--color-text-secondary)">Seasons</div>
            <div className="text-2xl font-bold text-(--color-text-primary)">
              {seasons?.length ?? 0}
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-sm text-(--color-text-secondary)">Active Orgs</div>
            <div className="text-2xl font-bold text-(--color-text-primary)">
              {activeOrgs}
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4">
            <div className="text-sm text-(--color-text-secondary)">Total Registrations</div>
            <div className="text-2xl font-bold text-(--color-text-primary)">
              {regs?.length ?? 0}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-(--color-text-primary)">Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InfoRow label="Name" value={league.name} />
            <InfoRow label="Slug" value={league.slug} />
            <InfoRow label="Contact Email" value={league.contact_email} />
            <InfoRow label="Contact Phone" value={league.contact_phone} />
            <InfoRow
              label="Website"
              value={
                league.website_url ? (
                  <a
                    href={league.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                  >
                    {league.website_url}
                  </a>
                ) : null
              }
            />
            <InfoRow
              label="Location"
              value={league.formatted_address || [league.city, league.state_province, league.country].filter(Boolean).join(', ') || null}
            />
          </div>
          {league.description && (
            <div>
              <div className="text-sm text-(--color-text-secondary) mb-2">Description</div>
              <RichTextDisplay html={league.description} />
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
                  variant={t.variant === 'danger' ? 'secondary' : (t.variant || 'secondary')}
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
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
            Danger Zone
          </h2>
          <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
            Delete League
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
        title="Delete League"
        message="Are you sure you want to delete this league? This cannot be undone."
        confirmText="Delete"
        variant="danger"
        loading={deleteLeague.isPending}
      />
    </div>
  )
}
