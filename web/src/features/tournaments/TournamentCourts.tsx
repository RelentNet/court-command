import { useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'
import { Skeleton } from '../../components/Skeleton'
import { EmptyState } from '../../components/EmptyState'
import { Button } from '../../components/Button'
import { Input } from '../../components/Input'
import { Select } from '../../components/Select'
import { FormField } from '../../components/FormField'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { CourtGrid } from '../referee/CourtGrid'
import { useCourtsForTournament } from '../scoring/hooks'
import { useVenueCourts } from '../registry/venues/hooks'
import {
  useAssignCourtToTournament,
  useCreateTempTournamentCourt,
  useUnassignCourtFromTournament,
} from './hooks'
import { Plus, MapPin, X } from 'lucide-react'

import { useSport } from '../../auth/SportContext'
export interface TournamentCourtsProps {
  tournamentId: number
  venueId: number | null
}

export function TournamentCourts({ tournamentId, venueId }: TournamentCourtsProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { toast } = useToast()
  const courts = useCourtsForTournament(tournamentId)
  const venueCourts = useVenueCourts(venueId ? String(venueId) : '')
  const assignCourt = useAssignCourtToTournament(tournamentId)
  const createTemp = useCreateTempTournamentCourt(tournamentId)
  const unassignCourt = useUnassignCourtFromTournament(tournamentId)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [courtName, setCourtName] = useState('')
  const [surfaceType, setSurfaceType] = useState('')

  const assignedList = courts.data ?? []
  const venueList = venueCourts.data ?? []

  // Courts from venue that aren't yet assigned to this tournament
  const assignedIds = new Set(assignedList.map((c) => c.id))
  const availableVenueCourts = venueList.filter((c) => !assignedIds.has(c.id))

  function handleCreateCourt(e: FormEvent) {
    e.preventDefault()
    if (!courtName.trim()) return
    createTemp.mutate(
      {
        name: courtName.trim(),
        surface_type: surfaceType || undefined,
      },
      {
        onSuccess: () => {
          toast('success', 'Temporary court created')
          setShowCreateModal(false)
          setCourtName('')
          setSurfaceType('')
        },
        onError: () => toast('error', 'Failed to create court'),
      },
    )
  }

  function handleAssignCourt(courtId: number) {
    assignCourt.mutate(courtId, {
      onSuccess: () => toast('success', 'Court assigned to tournament'),
      onError: () => toast('error', 'Failed to assign court'),
    })
  }

  function handleUnassignCourt(courtId: number) {
    unassignCourt.mutate(courtId, {
      onSuccess: () => toast('success', 'Court removed from tournament'),
      onError: () => toast('error', 'Failed to remove court'),
    })
  }

  if (courts.isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-(--color-text-secondary)">
          {assignedList.length} court{assignedList.length === 1 ? '' : 's'} assigned
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={16} className="mr-1" /> Create Temporary Court
          </Button>
          <Link
            to="/$sport/ref" params={{ sport: sportSlug }}
            className="text-sm text-(--color-accent) hover:underline self-center"
          >
            Open Ref Home
          </Link>
        </div>
      </div>

      {/* Assigned courts (with active matches) */}
      {assignedList.length > 0 ? (
        <div className="space-y-3">
          <CourtGrid courts={assignedList} mode="public" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {assignedList.map((court) => (
              <div
                key={court.id}
                className="flex items-center justify-between text-xs rounded border border-(--color-border) px-2 py-1"
              >
                <span className="text-(--color-text-secondary)">{court.name}</span>
                <button
                  type="button"
                  className="text-(--color-text-muted) hover:text-red-400 ml-2"
                  title="Remove from tournament"
                  onClick={() => handleUnassignCourt(court.id)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No courts assigned yet"
          description="Assign venue courts below or create a temporary court for this event."
        />
      )}

      {/* Available venue courts */}
      {venueId && availableVenueCourts.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-(--color-text-secondary) flex items-center gap-1.5">
            <MapPin size={14} />
            Available Venue Courts ({availableVenueCourts.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {availableVenueCourts.map((court) => (
              <div
                key={court.id}
                className="rounded-lg border border-(--color-border) p-3 bg-(--color-bg-secondary) flex flex-col gap-2"
              >
                <p className="font-medium text-sm text-(--color-text-primary)">
                  {court.name}
                </p>
                {court.surface_type && (
                  <p className="text-xs text-(--color-text-muted)">
                    {court.surface_type.replace(/_/g, ' ')}
                  </p>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  loading={assignCourt.isPending}
                  onClick={() => handleAssignCourt(court.id)}
                >
                  <Plus size={14} className="mr-1" /> Assign
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No venue hint */}
      {!venueId && assignedList.length === 0 && (
        <p className="text-sm text-(--color-text-muted)">
          No venue assigned. You can still create temporary courts for this tournament.
        </p>
      )}

      {/* Create Temporary Court Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Temporary Court"
      >
        <form onSubmit={handleCreateCourt} className="space-y-4">
          <FormField label="Court Name" htmlFor="court-name" required>
            <Input
              id="court-name"
              value={courtName}
              onChange={(e) => setCourtName(e.target.value)}
              placeholder="Court 5"
              required
            />
          </FormField>
          <FormField label="Surface Type" htmlFor="surface-type">
            <Select
              id="surface-type"
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
            >
              <option value="">Any / Unknown</option>
              <option value="indoor_hard">Indoor Hard</option>
              <option value="outdoor_concrete">Outdoor Concrete</option>
              <option value="outdoor_sport_court">Outdoor Sport Court</option>
              <option value="outdoor_wood">Outdoor Wood</option>
              <option value="temporary">Temporary</option>
              <option value="other">Other</option>
            </Select>
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setShowCreateModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" loading={createTemp.isPending}>
              Create Court
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
