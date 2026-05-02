import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { usePlayerSearch } from './hooks'
import { useDebounce } from '../../../hooks/useDebounce'
import { usePagination } from '../../../hooks/usePagination'
import { SearchInput } from '../../../components/SearchInput'
import { Table } from '../../../components/Table'
import { Pagination } from '../../../components/Pagination'
import { EmptyState } from '../../../components/EmptyState'
import { SkeletonTable } from '../../../components/Skeleton'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { DateInput } from '../../../components/DateInput'
import { FormField } from '../../../components/FormField'
import { Modal } from '../../../components/Modal'
import { useToast } from '../../../components/Toast'
import { useAuth } from '../../../auth/useAuth'
import { apiPost } from '../../../lib/api'
import { Users, UserPlus } from 'lucide-react'
import { formatPlayerName } from '../../../lib/formatters'
import { AdSlot } from '../../../components/AdSlot'

import { useSport } from '../../../auth/SportContext'
export function PlayerList() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newFirst, setNewFirst] = useState('')
  const [newLast, setNewLast] = useState('')
  const [newDob, setNewDob] = useState('')
  const debouncedSearch = useDebounce(search)
  const pagination = usePagination(20)
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const isAdmin = user?.role === 'platform_admin' || user?.role === 'tournament_director' || user?.role === 'league_admin'

  const createPlayer = useMutation({
    mutationFn: (data: { first_name: string; last_name: string; date_of_birth: string }) =>
      apiPost('/api/v1/admin/users/create-player', data),
    onSuccess: () => {
      toast('success', 'Player created')
      setShowCreate(false)
      setNewFirst('')
      setNewLast('')
      setNewDob('')
      queryClient.invalidateQueries({ queryKey: ['players'] })
    },
    onError: (err) => toast('error', err instanceof Error ? err.message : 'Failed to create player'),
  })

  const { data, isLoading, error } = usePlayerSearch(
    debouncedSearch,
    pagination.limit,
    pagination.offset,
  )

  const players = data?.items ?? []
  const total = data?.total ?? 0

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (p: (typeof players)[0]) => (
        <Link
          to="/$sport/players/$playerId"
          params={{ sport: sportSlug, playerId: String(p.public_id) }}
          className="font-medium text-(--color-text-primary) hover:text-cyan-400"
        >
          {formatPlayerName(p.first_name, p.last_name, p.display_name)}
        </Link>
      ),
    },
    {
      key: 'public_id',
      header: 'ID',
      render: (p: (typeof players)[0]) => (
        <span className="text-(--color-text-secondary) font-mono text-xs">{p.public_id}</span>
      ),
    },
    {
      key: 'handedness',
      header: 'Hand',
      render: (p: (typeof players)[0]) => (
        <span className="text-(--color-text-secondary) capitalize">{p.handedness || '\u2014'}</span>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'location',
      header: 'Location',
      render: (p: (typeof players)[0]) => (
        <span className="text-(--color-text-secondary)">
          {[p.city, p.state_province].filter(Boolean).join(', ') || '\u2014'}
        </span>
      ),
      className: 'hidden lg:table-cell',
    },
    {
      key: 'dupr',
      header: 'DUPR',
      render: (p: (typeof players)[0]) => (
        <span className="text-(--color-text-secondary)">
          {p.dupr_id ?? '\u2014'}
        </span>
      ),
      className: 'hidden md:table-cell',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">Players</h1>
        {isAdmin && (
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Create Player
          </Button>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Player (Unclaimed)">
        <p className="text-sm text-(--color-text-secondary) mb-4">
          Creates an unclaimed account. The player can claim it later by registering with matching name and DOB.
        </p>
        <div className="flex flex-col gap-3">
          <FormField label="First Name" htmlFor="cp-first" required>
            <Input id="cp-first" value={newFirst} onChange={(e) => setNewFirst(e.target.value)} placeholder="First name" />
          </FormField>
          <FormField label="Last Name" htmlFor="cp-last" required>
            <Input id="cp-last" value={newLast} onChange={(e) => setNewLast(e.target.value)} placeholder="Last name" />
          </FormField>
          <FormField label="Date of Birth" htmlFor="cp-dob" required>
            <DateInput id="cp-dob" value={newDob} onChange={(e) => setNewDob(e.target.value)} />
          </FormField>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              variant="primary"
              loading={createPlayer.isPending}
              disabled={!newFirst.trim() || !newLast.trim() || !newDob}
              onClick={() => createPlayer.mutate({ first_name: newFirst.trim(), last_name: newLast.trim(), date_of_birth: newDob })}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      <AdSlot size="responsive-banner" slot="players-list-top" className="mb-4" />

      <SearchInput
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          pagination.setPage(1)
        }}
        placeholder="Search players by name..."
        className="mb-4 max-w-md"
      />

      {isLoading ? (
        <SkeletonTable rows={8} />
      ) : error ? (
        <EmptyState
          title="Failed to load players"
          description={(error as Error).message}
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : players.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No players found"
          description={search ? `No results for "${search}"` : 'No players registered yet.'}
        />
      ) : (
        <>
          <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
            <Table
              columns={columns}
              data={players}
              keyExtractor={(p) => p.public_id}
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
    </div>
  )
}
