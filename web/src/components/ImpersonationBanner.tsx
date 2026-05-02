import { useAuth } from '../auth/useAuth'
import { useStopImpersonation } from '../features/admin/hooks'
import { useToast } from './Toast'
import { Eye, X } from 'lucide-react'

/**
 * Shows a fixed banner at the top of the screen when an admin is impersonating another user.
 * Provides a one-click "Stop Impersonating" action to restore the admin's own session.
 */
export function ImpersonationBanner() {
  const { user, isImpersonating } = useAuth()
  const stopImpersonation = useStopImpersonation()
  const { toast } = useToast()

  if (!isImpersonating || !user) return null

  function handleStop() {
    stopImpersonation.mutate(undefined, {
      onSuccess: () => {
        toast('success', 'Returned to your admin account.')
        // Force a full page reload to reset all cached state
        window.location.href = '/admin/users'
      },
      onError: (err) => {
        toast('error', err.message || 'Failed to stop impersonation.')
      },
    })
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-black px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-lg">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <strong>{user.first_name} {user.last_name}</strong> ({user.public_id}) &middot; Role: {user.role}
      </span>
      <button
        onClick={handleStop}
        disabled={stopImpersonation.isPending}
        className="ml-2 inline-flex items-center gap-1 rounded-md bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-wider hover:bg-black/30 transition-colors disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        {stopImpersonation.isPending ? 'Restoring...' : 'Stop Impersonating'}
      </button>
    </div>
  )
}
