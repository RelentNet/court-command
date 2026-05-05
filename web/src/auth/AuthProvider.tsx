// web/src/auth/AuthProvider.tsx
//
// Top-level auth provider. Wraps the entire app in <LogtoProvider> and
// nests a TokenWiring component that binds the SDK's getAccessToken to
// the api module's token fetcher (so apiFetch can attach Bearer tokens).

import { LogtoProvider, useLogto } from '@logto/react'
import { useEffect, type ReactNode } from 'react'
import { logtoConfig } from './LogtoConfig'
import { setGetAccessTokenFn } from '../lib/api'

function TokenWiring({ children }: { children: ReactNode }) {
  const { getAccessToken, signOut, isAuthenticated } = useLogto()
  useEffect(() => {
    setGetAccessTokenFn(async (resource, organizationID) => {
      try {
        // Two-arg form requests an org+resource scoped token. If
        // organizationID is undefined, this is the resource-only path
        // used by public routes / pre-sport-pick.
        return (await getAccessToken(resource, organizationID)) ?? null
      } catch {
        return null
      }
    })
    return () => setGetAccessTokenFn(null)
  }, [getAccessToken])

  // Smoke 17.4: when a sibling tab signs out (or the token is revoked
  // server-side), apiFetch sees a 401 and emits cc:auth-expired. Tear
  // down the local SDK state and bounce to / so the stale tab doesn't
  // keep hitting protected endpoints with a dead token. We only act
  // when the SDK still thinks we're authenticated -- avoids redirect
  // loops on routes that are already public.
  useEffect(() => {
    function onExpired() {
      if (!isAuthenticated) return
      void signOut(`${window.location.origin}/`)
    }
    window.addEventListener('cc:auth-expired', onExpired)
    return () => window.removeEventListener('cc:auth-expired', onExpired)
  }, [isAuthenticated, signOut])

  return <>{children}</>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <LogtoProvider config={logtoConfig}>
      <TokenWiring>{children}</TokenWiring>
    </LogtoProvider>
  )
}
