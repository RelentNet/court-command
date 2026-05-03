import { useEffect, useRef } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useAuth } from '../../auth/useAuth'

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, signIn } = useAuth()
  const location = useLocation()

  // The Logto SDK's signIn does a full-page navigation, so the second
  // redirect (if any) wins benignly. But on slow connections + React
  // StrictMode dev double-render, signIn can fire twice with different
  // sessionStorage stash targets, leaving the user back at '/' instead
  // of the route they were trying to reach. Guard with a ref so each
  // mount triggers signIn at most once.
  const redirectingRef = useRef(false)

  useEffect(() => {
    if (redirectingRef.current) return
    if (!isLoading && !isAuthenticated) {
      redirectingRef.current = true
      // Trigger the OIDC sign-in flow. signIn() stashes returnTo in
      // sessionStorage; the callback route (Task 7) reads + clears it.
      signIn(location.href)
    }
  }, [isLoading, isAuthenticated, location.href, signIn])

  if (isLoading) return <div>Loading…</div>
  if (!isAuthenticated) return <div>Redirecting to sign in…</div>
  return <>{children}</>
}
