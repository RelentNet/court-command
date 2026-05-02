import { useEffect } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAuth } from '../../auth/useAuth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, signIn } = useAuth()
  const location = useLocation()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Trigger the OIDC sign-in flow. signIn() stashes returnTo in
      // sessionStorage; the callback route (Task 7) reads + clears it.
      signIn(location.href)
    }
  }, [isLoading, isAuthenticated, location.href, signIn])

  if (isLoading) return <div>Loading…</div>
  if (!isAuthenticated) return <div>Redirecting to sign in…</div>
  return <>{children}</>
}
