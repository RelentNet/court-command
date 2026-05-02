import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '../../auth/useAuth'
import {
  useUpdateDivisionStatus,
  useDeleteDivision,
  useListRegistrations,
  type Division,
} from './hooks'
import { useToast } from '../../components/Toast'
import { InfoRow } from '../../components/InfoRow'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { AdSlot } from '../../components/AdSlot'
import { DivisionForm } from './DivisionForm'

import { useSport } from '../../auth/SportContext'
interface DivisionOverviewProps {
  tournamentId: string
  divisionId: string
  division: Division
}

const DIVISION_STATUS_TRANSITIONS: Record<
  string,
  { label: string; next: string }[]
> = {
  draft: [{ label: 'Open Registration', next: 'registration_open' }],
  registration_open: [
    { label: 'Close Registration', next: 'registration_closed' },
  ],
  registration_closed: [{ label: 'Start Seeding', next: 'seeding' }],
  seeding: [{ label: 'Start Play', next: 'in_progress' }],
  in_progress: [{ label: 'Complete', next: 'completed' }],
}

export function DivisionOverview({
  tournamentId,
  divisionId,
  division,
}: DivisionOverviewProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { user } = useAuth()
  // TODO: replace with scoped authorization (Batch I) once that lands.
  const isAdmin =
    user?.role === 'platform_admin' || user?.role === 'tournament_director'
  const { toast } = useToast()
  const statusMutation = useUpdateDivisionStatus(tournamentId, divisionId)
  const deleteMutation = useDeleteDivision(tournamentId, divisionId)
  const { data: registrations } = useListRegistrations(divisionId, undefined, 1)

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const regCount = registrations?.total ?? 0
  const canDelete = regCount === 0

  async function handleStatus(next: string) {
    try {
      await statusMutation.mutateAsync({ status: next })
      toast('success', `Division status updated to ${next.replace(/_/g, ' ')}`)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  async function handleDelete() {
    try {
      await deleteMutation.mutateAsync()
      toast('success', 'Division deleted')
      navigate({ to: '/$sport/tournaments/$tournamentId', params: { sport: sportSlug, tournamentId } })
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const transitions = DIVISION_STATUS_TRANSITIONS[division.status] ?? []

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
          Configuration
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoRow label="Format" value={division.format.replace(/_/g, ' ')} />
          <InfoRow
            label="Bracket"
            value={division.bracket_format.replace(/_/g, ' ')}
          />
          <InfoRow
            label="Gender"
            value={division.gender_restriction?.replace(/_/g, ' ') ?? 'Open'}
          />
          <InfoRow
            label="Registration Mode"
            value={division.registration_mode ?? 'open'}
          />
          <InfoRow
            label="Auto-Approve"
            value={division.auto_approve === false ? 'No' : 'Yes'}
          />
          <InfoRow
            label="Seed Method"
            value={division.seed_method ?? '—'}
          />
          <InfoRow label="Max Teams" value={division.max_teams ?? '—'} />
          <InfoRow
            label="Max Roster"
            value={division.max_roster_size ?? '—'}
          />
          <InfoRow
            label="Entry Fee"
            value={
              division.entry_fee_amount != null
                ? `${division.entry_fee_amount} ${division.entry_fee_currency ?? 'USD'}`
                : '—'
            }
          />
          <InfoRow
            label="Status"
            value={<StatusBadge status={division.status} type="division" />}
          />
        </div>
      </Card>

      {isAdmin && (
        <Card>
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">
            Actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {transitions.map((t) => (
              <Button
                key={t.next}
                onClick={() => handleStatus(t.next)}
                loading={statusMutation.isPending}
              >
                {t.label}
              </Button>
            ))}
            <Button variant="secondary" onClick={() => setEditOpen(true)}>
              Edit Division
            </Button>
            <Button
              variant="danger"
              onClick={() => setDeleteOpen(true)}
              disabled={!canDelete}
              title={!canDelete ? 'Cannot delete division with registrations' : ''}
            >
              Delete Division
            </Button>
          </div>
          {!canDelete && (
            <p className="text-xs text-(--color-text-secondary) mt-3">
              Division has {regCount} registration{regCount !== 1 ? 's' : ''}.
              Remove all registrations before deleting.
            </p>
          )}
        </Card>
      )}

      <AdSlot size="medium-rectangle" slot="division-detail" className="mt-6" />

      {isAdmin && (
        <Modal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          title="Edit Division"
          className="max-w-2xl"
        >
          <DivisionForm
            tournamentId={tournamentId}
            division={division}
            onSuccess={() => setEditOpen(false)}
            onCancel={() => setEditOpen(false)}
          />
        </Modal>
      )}

      {isAdmin && (
        <ConfirmDialog
          open={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Delete Division"
          message="Are you sure you want to delete this division? This action cannot be undone."
          confirmText="Delete"
          variant="danger"
          loading={deleteMutation.isPending}
        />
      )}
    </div>
  )
}
