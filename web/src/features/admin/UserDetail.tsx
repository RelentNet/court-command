import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAdminUser, useUpdateUserRole, useUpdateUserStatus, useStartImpersonation } from './hooks'
import { ALL_ROLES, ROLE_LABELS } from './types'
import type { UserRole } from './types'
import { Card } from '../../components/Card'
import { Badge } from '../../components/Badge'
import { StatusBadge } from '../../components/StatusBadge'
import { Button } from '../../components/Button'
import { Select } from '../../components/Select'
import { InfoRow } from '../../components/InfoRow'
import { Modal } from '../../components/Modal'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { ArrowLeft, Eye } from 'lucide-react'
import { useAuth } from '../../auth/useAuth'
import { formatDate, formatDateTime } from '../../lib/formatters'

import { useSport } from '../../auth/SportContext'
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

interface UserDetailProps {
  userId: string
}

export function UserDetail({ userId }: UserDetailProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const navigate = useNavigate()
  const { toast } = useToast()
  const { data: user, isLoading, error, refetch } = useAdminUser(userId)

  const updateRole = useUpdateUserRole()
  const updateStatus = useUpdateUserStatus()
  const startImpersonation = useStartImpersonation()
  const { user: currentUser, isImpersonating } = useAuth()

  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [statusAction, setStatusAction] = useState<'suspended' | 'banned' | 'active' | null>(null)
  const [reason, setReason] = useState('')

  // Sync role dropdown with loaded data
  const currentRole = selectedRole ?? user?.role ?? ''

  function handleSaveRole() {
    if (!user || !currentRole || currentRole === user.role) return
    updateRole.mutate(
      { userId: user.public_id, role: currentRole },
      {
        onSuccess: () => {
          toast('success', 'Role updated successfully.')
          setSelectedRole(null)
        },
        onError: (err) => {
          toast('error', err.message || 'Failed to update role.')
        },
      },
    )
  }

  function handleStatusConfirm() {
    if (!user || !statusAction) return
    updateStatus.mutate(
      { userId: user.public_id, status: statusAction, reason },
      {
        onSuccess: () => {
          toast('success', `User ${statusAction === 'active' ? 'reinstated' : statusAction} successfully.`)
          setStatusAction(null)
          setReason('')
        },
        onError: (err) => {
          toast('error', err.message || 'Failed to update user status.')
        },
      },
    )
  }

  function handleImpersonate() {
    if (!user) return
    startImpersonation.mutate(user.id, {
      onSuccess: () => {
        // Full reload to reset all cached state and enter impersonation mode
        window.location.href = '/dashboard'
      },
      onError: (err) => {
        toast('error', err.message || 'Failed to start impersonation.')
      },
    })
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/$sport/admin/users', params: { sport: sportSlug } })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
        </Button>
        <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-8 text-center">
          <p className="text-(--color-text-secondary) mb-4">
            {error ? 'Failed to load user.' : 'User not found.'}
          </p>
          <Button variant="secondary" onClick={() => refetch()}>Retry</Button>
        </div>
      </div>
    )
  }

  const isActive = user.status === 'active'
  const isSuspended = user.status === 'suspended'
  const isBanned = user.status === 'banned'
  const roleChanged = currentRole !== user.role

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/$sport/admin/users', params: { sport: sportSlug } })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to Users
      </Button>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-(--color-text-primary)">
          {user.first_name} {user.last_name}
        </h1>
        <Badge variant={ROLE_VARIANT[user.role] ?? 'default'}>
          {ROLE_LABELS[user.role as UserRole] ?? user.role}
        </Badge>
        <StatusBadge status={user.status} />
        {/* Impersonate button — only show if not already impersonating and not viewing self */}
        {!isImpersonating && user.status === 'active' && currentUser?.public_id !== user.public_id && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleImpersonate}
            loading={startImpersonation.isPending}
          >
            <Eye className="h-4 w-4 mr-1" />
            View as {user.first_name}
          </Button>
        )}
      </div>
      <p className="text-sm text-(--color-text-secondary)">
        <span className="font-mono">{user.public_id}</span> &middot; {user.email}
      </p>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Role Assignment (D4) */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">Role Assignment</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="role-select" className="block text-xs font-medium text-(--color-text-secondary) uppercase tracking-wider mb-1">
                Role
              </label>
              <Select
                id="role-select"
                value={currentRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                {ALL_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="primary"
              onClick={handleSaveRole}
              loading={updateRole.isPending}
              disabled={!roleChanged}
            >
              Save Role
            </Button>
          </div>
        </Card>

        {/* Status Management */}
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">Status Management</h2>
          <p className="text-xs text-(--color-text-secondary) mb-4">
            Current status: <StatusBadge status={user.status} />
          </p>
          <div className="flex flex-wrap gap-3">
            {isActive && (
              <>
                <Button variant="secondary" onClick={() => setStatusAction('suspended')}>
                  Suspend
                </Button>
                <Button variant="danger" onClick={() => setStatusAction('banned')}>
                  Ban
                </Button>
              </>
            )}
            {isSuspended && (
              <>
                <Button variant="primary" onClick={() => setStatusAction('active')}>
                  Reinstate
                </Button>
                <Button variant="danger" onClick={() => setStatusAction('banned')}>
                  Ban
                </Button>
              </>
            )}
            {isBanned && (
              <Button variant="primary" onClick={() => setStatusAction('active')}>
                Reinstate
              </Button>
            )}
          </div>
        </Card>
      </div>

      {/* User Info */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-(--color-text-primary) mb-4">User Information</h2>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoRow label="Public ID" value={<span className="font-mono text-xs">{user.public_id}</span>} />
          <InfoRow label="Email" value={user.email} />
          <InfoRow label="Display Name" value={user.display_name} />
          <InfoRow label="Date of Birth" value={user.date_of_birth ? formatDate(user.date_of_birth) : null} />
          <InfoRow label="Created" value={formatDateTime(user.created_at)} />
          <InfoRow label="Updated" value={formatDateTime(user.updated_at)} />
        </dl>
      </Card>

      {/* Status Change Modal */}
      <Modal
        open={statusAction !== null}
        onClose={() => { setStatusAction(null); setReason('') }}
        title={
          statusAction === 'active'
            ? 'Reinstate User'
            : statusAction === 'suspended'
              ? 'Suspend User'
              : 'Ban User'
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-(--color-text-secondary)">
            {statusAction === 'active'
              ? `Reinstate ${user.first_name} ${user.last_name} and restore access.`
              : `This will ${statusAction === 'suspended' ? 'suspend' : 'ban'} ${user.first_name} ${user.last_name}.`}
          </p>
          <p className="text-xs text-(--color-warning) font-medium">
            This will revoke all active sessions.
          </p>
          <div>
            <label htmlFor="status-reason" className="block text-xs font-medium text-(--color-text-secondary) uppercase tracking-wider mb-1">
              Reason (required)
            </label>
            <textarea
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Provide a reason for this action..."
              rows={3}
              className="w-full rounded-lg border border-(--color-border) bg-(--color-bg-input) px-3 py-2 text-sm text-(--color-text-primary) placeholder:text-(--color-text-secondary) focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => { setStatusAction(null); setReason('') }}>
              Cancel
            </Button>
            <Button
              variant={statusAction === 'active' ? 'primary' : 'danger'}
              onClick={handleStatusConfirm}
              loading={updateStatus.isPending}
              disabled={!reason.trim()}
            >
              {statusAction === 'active' ? 'Reinstate' : statusAction === 'suspended' ? 'Suspend' : 'Ban'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
