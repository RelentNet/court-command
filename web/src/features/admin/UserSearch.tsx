import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSearchUsers, useUpdateUserStatus } from './hooks'
import { ALL_ROLES, ROLE_LABELS, USER_STATUSES } from './types'
import type { AdminUser, UserRole } from './types'
import { Table } from '../../components/Table'
import { Pagination } from '../../components/Pagination'
import { SearchInput } from '../../components/SearchInput'
import { Select } from '../../components/Select'
import { Badge } from '../../components/Badge'
import { StatusBadge } from '../../components/StatusBadge'
import { EmptyState } from '../../components/EmptyState'
import { SkeletonTable } from '../../components/Skeleton'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useToast } from '../../components/Toast'
import { Users, Trash2 } from 'lucide-react'
import { formatDate } from '../../lib/formatters'

import { useSport } from '../../auth/SportContext'
const PAGE_SIZE = 20

const ROLE_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  platform_admin: 'error',
  organization_admin: 'warning',
  league_admin: 'warning',
  tournament_director: 'info',
  head_referee: 'info',
  referee: 'info',
  scorekeeper: 'default',
  broadcast_operator: 'default',
  team_coach: 'default',
  api_readonly: 'default',
  player: 'success',
}

export function UserSearch() {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const updateStatus = useUpdateUserStatus()
  const { toast } = useToast()
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null)

  const offset = (page - 1) * PAGE_SIZE
  const { data, isLoading, error, refetch } = useSearchUsers(
    query || undefined,
    roleFilter || undefined,
    statusFilter || undefined,
    PAGE_SIZE,
    offset,
  )

  const users = data?.items ?? []
  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0

  const columns = [
    {
      key: 'public_id',
      header: 'ID',
      render: (user: AdminUser) => (
        <span className="font-mono text-xs text-(--color-text-secondary)">{user.public_id}</span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'name',
      header: 'Name',
      render: (user: AdminUser) => (
        <span className="font-medium text-(--color-text-primary)">
          {user.first_name} {user.last_name}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (user: AdminUser) => (
        <span className="text-(--color-text-secondary)">{user.email}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (user: AdminUser) => (
        <Badge variant={ROLE_VARIANT[user.role] ?? 'default'}>
          {ROLE_LABELS[user.role as UserRole] ?? user.role}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (user: AdminUser) => <StatusBadge status={user.status} />,
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (user: AdminUser) => (
        <span className="text-sm text-(--color-text-secondary)">{formatDate(user.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (user: AdminUser) =>
        user.status === 'active' && user.role !== 'platform_admin' ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setSuspendTarget(user)
            }}
            className="p-1.5 rounded-md text-(--color-text-muted) hover:text-red-500 hover:bg-red-500/10 transition-colors"
            title="Suspend user"
            aria-label={`Suspend ${user.first_name} ${user.last_name}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null,
      className: 'w-10',
    },
  ]

  function handlePageChange(newPage: number) {
    setPage(newPage)
  }

  function handleRowClick(user: AdminUser) {
    navigate({ to: '/$sport/admin/users/$userId', params: { sport: sportSlug, userId: user.public_id } })
  }

  function handleQueryChange(value: string) {
    setQuery(value)
    setPage(1)
  }

  function handleRoleChange(value: string) {
    setRoleFilter(value)
    setPage(1)
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">User Management</h1>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-8 text-center">
          <p className="text-(--color-text-secondary) mb-4">Failed to load users.</p>
          <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-(--color-text-primary)">User Management</h1>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          placeholder="Search by name or email..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="flex-1"
        />
        <Select
          value={roleFilter}
          onChange={(e) => handleRoleChange(e.target.value)}
          className="w-full sm:w-48"
        >
          <option value="">All Roles</option>
          {ALL_ROLES.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="w-full sm:w-40"
        >
          <option value="">All Statuses</option>
          {USER_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
          <SkeletonTable rows={8} />
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-12 w-12" />}
          title="No users found"
          description={query || roleFilter || statusFilter ? 'Try adjusting your search filters.' : 'No users exist yet.'}
        />
      ) : (
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) overflow-hidden">
          <Table
            columns={columns}
            data={users}
            keyExtractor={(user) => user.public_id}
            onRowClick={handleRowClick}
          />
        </div>
      )}

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPageChange={handlePageChange} />

      {/* Suspend Confirm */}
      <ConfirmDialog
        open={!!suspendTarget}
        onClose={() => setSuspendTarget(null)}
        onConfirm={() => {
          if (!suspendTarget) return
          updateStatus.mutate(
            { userId: suspendTarget.public_id, status: 'suspended', reason: 'Suspended by admin' },
            {
              onSuccess: () => {
                toast('success', `${suspendTarget.first_name} ${suspendTarget.last_name} suspended`)
                setSuspendTarget(null)
              },
              onError: () => toast('error', 'Failed to suspend user'),
            },
          )
        }}
        title="Suspend User"
        message={`Are you sure you want to suspend ${suspendTarget?.first_name} ${suspendTarget?.last_name}? They will lose access until reinstated.`}
        confirmText="Suspend"
        variant="danger"
        loading={updateStatus.isPending}
      />
    </div>
  )
}
