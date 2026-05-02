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
  const { getAccessToken } = useLogto()
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
  return <>{children}</>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return (
    <LogtoProvider config={logtoConfig}>
      <TokenWiring>{children}</TokenWiring>
    </LogtoProvider>
  )
}
