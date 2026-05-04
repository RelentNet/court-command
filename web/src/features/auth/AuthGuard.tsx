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

  // Once we've shown children at least once for an authenticated user,
  // keep them mounted as long as isAuthenticated stays true -- even if
  // isLoading transiently flips true (the Logto SDK's isLoading flips
  // during getAccessToken refreshes inside apiFetch, and unmounting
  // children mid-mutation kills in-flight onSuccess setState calls,
  // causing form state to revert on remount; smoke 5.3 / 5.7).
  const shownRef = useRef(false)
  if (isAuthenticated && !isLoading) {
    shownRef.current = true
  }

  useEffect(() => {
    if (redirectingRef.current) return
    if (!isLoading && !isAuthenticated) {
      redirectingRef.current = true
      // Trigger the OIDC sign-in flow. signIn() stashes returnTo in
      // sessionStorage; the callback route (Task 7) reads + clears it.
      signIn(location.href)
    }
  }, [isLoading, isAuthenticated, location.href, signIn])

  // First load: still loading and never shown children -> spinner.
  if (isLoading && !shownRef.current) return <div>Loading…</div>
  // Truly unauthenticated -> redirect copy while signIn navigates away.
  if (!isAuthenticated) return <div>Redirecting to sign in…</div>
  // Authenticated (or transient isLoading after first show) -> children.
  return <>{children}</>
}
