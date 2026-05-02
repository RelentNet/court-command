import { useState } from 'react'
import { useVenueManagers, useAddVenueManager, useRemoveVenueManager, useUpdateVenueManagerRole } from './hooks'
import { usePlayerSearch, type Player } from '../players/hooks'
import { useDebounce } from '../../../hooks/useDebounce'
import { useAuth } from '../../../auth/useAuth'
import { useToast } from '../../../components/Toast'
import { Button } from '../../../components/Button'
import { Input } from '../../../components/Input'
import { Select } from '../../../components/Select'
import { Badge } from '../../../components/Badge'
import { Skeleton } from '../../../components/Skeleton'
import { EmptyState } from '../../../components/EmptyState'
import { UserPlus, Trash2, Shield, ShieldCheck } from 'lucide-react'

interface VenueManagersPanelProps {
  venueId: string
}

export function VenueManagersPanel({ venueId }: VenueManagersPanelProps) {
  const { user } = useAuth()
  const { toast } = useToast()
  const { data: managers, isLoading } = useVenueManagers(venueId)
  const addManager = useAddVenueManager(venueId)
  const removeManager = useRemoveVenueManager(venueId)
  const updateRole = useUpdateVenueManagerRole(venueId)

  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const { data: searchResults } = usePlayerSearch(debouncedSearch, 20, 0)

  // Check if current user is an admin of this venue (by matching public_id since User has no numeric id)
  const isAdmin = user?.role === 'platform_admin' ||
    managers?.some(m => m.public_id === user?.public_id && m.role === 'admin')

  function handleAdd(player: Player) {
    addManager.mutate(
      { user_id: player.id, role: 'manager' },
      {
        onSuccess: () => {
          toast('success', 'Manager added')
          setSearch('')
          setShowAdd(false)
        },
        onError: () => toast('error', 'Failed to add manager'),
      },
    )
  }

  function handleRemove(userId: number, name: string) {
    if (!confirm(`Remove ${name} as a manager?`)) return
    removeManager.mutate(userId, {
      onSuccess: () => toast('success', 'Manager removed'),
      onError: () => toast('error', 'Failed to remove manager'),
    })
  }

  function handleToggleRole(userId: number, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'manager' : 'admin'
    updateRole.mutate(
      { userId, role: newRole },
      {
        onSuccess: () => toast('success', `Role updated to ${newRole}`),
        onError: () => toast('error', 'Failed to update role'),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-12 w-full mb-2" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-(--color-border) bg-(--color-bg-secondary) p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-(--color-text-primary)">
          Managers ({managers?.length ?? 0})
        </h2>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowAdd(!showAdd)}>
            <UserPlus className="h-4 w-4 mr-1" />
            Add Manager
          </Button>
        )}
      </div>

      {showAdd && (
        <div className="mb-4 p-4 rounded-lg border border-(--color-border) bg-(--color-bg-primary)">
          <Input
            placeholder="Search players by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-2"
          />
          {debouncedSearch.length >= 2 && searchResults?.items && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {searchResults.items.map((p: Player) => {
                const alreadyManager = managers?.some(m => m.user_id === p.id)
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between p-2 rounded hover:bg-(--color-bg-hover)"
                  >
                    <span className="text-sm text-(--color-text-primary)">
                      {p.first_name} {p.last_name}
                      <span className="ml-2 text-(--color-text-secondary) text-xs">{p.public_id}</span>
                    </span>
                    {alreadyManager ? (
                      <Badge variant="default">Already manager</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleAdd(p)}
                        disabled={addManager.isPending}
                      >
                        Add
                      </Button>
                    )}
                  </div>
                )
              })}
              {searchResults.items.length === 0 && (
                <p className="text-sm text-(--color-text-secondary) p-2">No players found</p>
              )}
            </div>
          )}
        </div>
      )}

      {(!managers || managers.length === 0) ? (
        <EmptyState title="No managers" description="Add managers to control who can edit this venue." />
      ) : (
        <div className="space-y-2">
          {managers.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 rounded-lg border border-(--color-border) bg-(--color-bg-primary)"
            >
              <div className="flex items-center gap-3">
                {m.role === 'admin' ? (
                  <ShieldCheck className="h-5 w-5 text-cyan-400" />
                ) : (
                  <Shield className="h-5 w-5 text-(--color-text-secondary)" />
                )}
                <div>
                  <p className="text-sm font-medium text-(--color-text-primary)">
                    {m.display_name || `${m.first_name} ${m.last_name}`}
                  </p>
                  <p className="text-xs text-(--color-text-secondary)">{m.public_id}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={m.role === 'admin' ? 'info' : 'default'}>
                  {m.role}
                </Badge>
                {isAdmin && m.public_id !== user?.public_id && (
                  <>
                    <Select
                      value={m.role}
                      onChange={() => handleToggleRole(m.user_id, m.role)}
                      className="text-xs w-24"
                    >
                      <option value="manager">Manager</option>
                      <option value="admin">Admin</option>
                    </Select>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => handleRemove(m.user_id, m.display_name || `${m.first_name} ${m.last_name}`)}
                      disabled={removeManager.isPending}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
