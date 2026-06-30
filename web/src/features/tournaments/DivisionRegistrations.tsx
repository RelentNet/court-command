import { useState } from 'react'
import {
  useListRegistrations,
  useBulkNoShow,
  useCreateRegistration,
  fetchAllRegistrations,
  type Registration,
  type Division,
} from './hooks'
import { usePlayerSearch } from '../registry/players/hooks'
import { useTeamSearch } from '../registry/teams/hooks'
import { useToast } from '../../components/Toast'
import { useDebounce } from '../../hooks/useDebounce'
import { usePagination } from '../../hooks/usePagination'
import { SearchInput } from '../../components/SearchInput'
import { Table } from '../../components/Table'
import { Pagination } from '../../components/Pagination'
import { Select } from '../../components/Select'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import { Button } from '../../components/Button'
import { Badge } from '../../components/Badge'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Input } from '../../components/Input'
import { Textarea } from '../../components/Textarea'
import { FormField } from '../../components/FormField'
import { formatDate } from '../../lib/formatters'
import { Users, Plus, X } from 'lucide-react'

interface DivisionRegistrationsProps {
  tournamentId: string
  divisionId: string
  division?: Division
}

export function DivisionRegistrations({
  tournamentId: _tournamentId,
  divisionId,
  division,
}: DivisionRegistrationsProps) {
  const { toast } = useToast()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)
  const [bulkNoShowOpen, setBulkNoShowOpen] = useState(false)
  const [bulkNoShowLoading, setBulkNoShowLoading] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  const { data, isLoading } = useListRegistrations(
    divisionId,
    statusFilter || undefined,
    pagination.limit,
    pagination.offset,
  )
  const bulkNoShowMutation = useBulkNoShow(divisionId)

  const registrations = data?.items ?? []
  const total = data?.total ?? 0

  // Client-side search filter over the page
  const filtered = debouncedSearch
    ? registrations.filter((r) =>
        [r.registration_notes, String(r.id)]
          .filter(Boolean)
          .some((v) => v!.toLowerCase().includes(debouncedSearch.toLowerCase())),
      )
    : registrations

  async function handleBulkNoShow() {
    setBulkNoShowLoading(true)
    try {
      // The dialog promises to mark *all* non-checked-in registrations, so we
      // must operate on the full division set, not just the current page.
      // Fetch every registration (unfiltered) before computing the id list.
      const allRegistrations = await fetchAllRegistrations(divisionId)
      const ids = allRegistrations
        .filter((r) => r.status !== 'checked_in' && r.checked_in_at == null)
        .map((r) => r.id)
      if (ids.length === 0) {
        toast('success', 'No unchecked registrations to mark')
        setBulkNoShowOpen(false)
        return
      }
      await bulkNoShowMutation.mutateAsync({ registration_ids: ids })
      toast('success', 'Marked unchecked registrations as no-show')
      setBulkNoShowOpen(false)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBulkNoShowLoading(false)
    }
  }

  const columns = [
    {
      key: 'id',
      header: 'Reg #',
      render: (r: Registration) => (
        <span className="font-mono text-(--color-text-secondary)">#{r.id}</span>
      ),
    },
    {
      key: 'entity',
      header: 'Team / Player',
      render: (r: Registration) => (
        <span className="text-(--color-text-primary)">
          {r.team_id ? `Team #${r.team_id}` : r.player_id ? `Player #${r.player_id}` : '—'}
          {r.seeking_partner && (
            <Badge variant="warning" className="ml-2">
              Seeking Partner
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r: Registration) => (
        <StatusBadge status={r.status} type="registration" />
      ),
    },
    {
      key: 'seed',
      header: 'Seed',
      render: (r: Registration) => (
        <span className="text-(--color-text-secondary)">{r.seed ?? '—'}</span>
      ),
    },
    {
      key: 'checkin',
      header: 'Checked In',
      render: (r: Registration) => (
        <span className="text-(--color-text-secondary)">
          {r.checked_in_at ? formatDate(r.checked_in_at) : '—'}
        </span>
      ),
    },
    {
      key: 'registered',
      header: 'Registered',
      render: (r: Registration) => (
        <span className="text-(--color-text-secondary)">
          {formatDate(r.registered_at)}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
  ]

  const isSingles = division?.format === 'singles'

  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search registrations..."
          className="max-w-md flex-1"
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
            pagination.setPage(1)
          }}
          className="w-48"
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="waitlisted">Waitlisted</option>
          <option value="rejected">Rejected</option>
          <option value="withdrawn">Withdrawn</option>
          <option value="checked_in">Checked In</option>
          <option value="no_show">No Show</option>
        </Select>
        <Button variant="secondary" onClick={() => setBulkNoShowOpen(true)}>
          Bulk No-Show
        </Button>
        <Button variant="primary" onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Registration
        </Button>
      </div>

      {showAddForm && (
        <AddRegistrationForm
          divisionId={divisionId}
          isSingles={isSingles}
          onClose={() => setShowAddForm(false)}
        />
      )}

      <p className="text-sm text-(--color-text-secondary) mb-3">
        {total} registration{total !== 1 ? 's' : ''}
      </p>

      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No registrations found"
          description={
            search || statusFilter
              ? 'No registrations match your filters.'
              : 'No registrations have been submitted yet.'
          }
        />
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table
              columns={columns}
              data={filtered}
              keyExtractor={(r) => String(r.id)}
            />
          </div>
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages(total)}
            onPageChange={pagination.setPage}
            className="mt-4"
          />
        </>
      )}

      <ConfirmDialog
        open={bulkNoShowOpen}
        onClose={() => setBulkNoShowOpen(false)}
        onConfirm={handleBulkNoShow}
        title="Bulk Mark No-Show"
        message="Mark all registrations that haven't checked in as no-show? This can be reversed per registration afterwards."
        confirmText="Mark No-Show"
        variant="danger"
        loading={bulkNoShowLoading || bulkNoShowMutation.isPending}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Add Registration inline form                                      */
/* ------------------------------------------------------------------ */

interface AddRegistrationFormProps {
  divisionId: string
  isSingles: boolean
  onClose: () => void
}

function AddRegistrationForm({
  divisionId,
  isSingles,
  onClose,
}: AddRegistrationFormProps) {
  const { toast } = useToast()
  const createReg = useCreateRegistration(divisionId)

  // Entity search
  const [entitySearch, setEntitySearch] = useState('')
  const debouncedEntitySearch = useDebounce(entitySearch, 300)
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null)
  const [selectedEntityName, setSelectedEntityName] = useState('')

  // Optional fields
  const [notes, setNotes] = useState('')
  const [seekingPartner, setSeekingPartner] = useState(false)

  const playerResults = usePlayerSearch(
    isSingles ? debouncedEntitySearch : '',
    10,
    0,
  )
  const teamResults = useTeamSearch(
    !isSingles ? debouncedEntitySearch : '',
    10,
    0,
  )

  const searchResults = isSingles
    ? (playerResults.data?.items ?? []).map((p) => ({
        id: p.id,
        label: p.display_name || `${p.first_name} ${p.last_name}`,
        sub: p.public_id,
      }))
    : (teamResults.data?.items ?? []).map((t) => ({
        id: t.id,
        label: t.name,
        sub: t.short_name,
      }))

  const isSearching = isSingles
    ? playerResults.isLoading
    : teamResults.isLoading

  function handleSelect(id: number, label: string) {
    setSelectedEntityId(id)
    setSelectedEntityName(label)
    setEntitySearch('')
  }

  function handleClearSelection() {
    setSelectedEntityId(null)
    setSelectedEntityName('')
  }

  async function handleSubmit() {
    if (!selectedEntityId) {
      toast('error', isSingles ? 'Select a player' : 'Select a team')
      return
    }

    try {
      await createReg.mutateAsync({
        ...(isSingles
          ? { player_id: selectedEntityId }
          : { team_id: selectedEntityId }),
        registration_notes: notes || null,
        seeking_partner: seekingPartner,
      })
      toast('success', 'Registration added')
      onClose()
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  return (
    <div className="mb-6 rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-(--color-text-primary)">
          Add Registration
        </h3>
        <button
          onClick={onClose}
          className="text-(--color-text-secondary) hover:text-(--color-text-primary)"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4">
        {/* Entity picker */}
        <FormField label={isSingles ? 'Player' : 'Team'} required>
          {selectedEntityId ? (
            <div className="flex items-center gap-2 p-2 rounded-lg border border-(--color-border) bg-(--color-bg-primary)">
              <span className="text-sm text-(--color-text-primary) flex-1">
                {selectedEntityName}
              </span>
              <button
                onClick={handleClearSelection}
                className="text-(--color-text-secondary) hover:text-(--color-text-primary)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder={
                  isSingles ? 'Search players...' : 'Search teams...'
                }
              />
              {debouncedEntitySearch.length > 0 && (
                <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border border-(--color-border) bg-(--color-bg-secondary) shadow-lg">
                  {isSearching ? (
                    <p className="p-3 text-sm text-(--color-text-secondary)">
                      Searching...
                    </p>
                  ) : searchResults.length === 0 ? (
                    <p className="p-3 text-sm text-(--color-text-secondary)">
                      No results found
                    </p>
                  ) : (
                    searchResults.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelect(r.id, r.label)}
                        className="w-full text-left px-3 py-2 hover:bg-(--color-bg-tertiary) transition-colors"
                      >
                        <span className="text-sm text-(--color-text-primary)">
                          {r.label}
                        </span>
                        {r.sub && (
                          <span className="ml-2 text-xs text-(--color-text-secondary)">
                            {r.sub}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </FormField>

        {/* Notes */}
        <FormField label="Registration Notes">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
          />
        </FormField>

        {/* Seeking partner (for doubles/mixed) */}
        {!isSingles && (
          <label className="flex items-center gap-2 text-sm text-(--color-text-primary) cursor-pointer">
            <input
              type="checkbox"
              checked={seekingPartner}
              onChange={(e) => setSeekingPartner(e.target.checked)}
              className="rounded border-(--color-border)"
            />
            Seeking partner
          </label>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!selectedEntityId || createReg.isPending}
          >
            {createReg.isPending ? 'Adding...' : 'Add Registration'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
