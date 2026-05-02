// web/src/auth/useAuth.ts
//
// Replacement for features/auth/hooks.ts.
// Thin shim over @logto/react's useLogto(). Persists post-auth redirect
// target in sessionStorage because the Logto SDK's signIn() takes only
// a redirectUri and has no postRedirectUri option.

import { useLogto } from '@logto/react'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'

const POST_REDIRECT_KEY = 'logto_post_redirect'

export interface User {
  public_id: string
  email: string
  first_name: string
  last_name: string
  display_name: string | null
  date_of_birth: string | null
  role: string
  status: string
  created_at: string
  impersonation?: { active: boolean; impersonator_id: string } | null
}

export function stashPostAuthTarget(target: string) {
  try { sessionStorage.setItem(POST_REDIRECT_KEY, target) } catch { /* private mode */ }
}

export function consumePostAuthTarget(): string {
  try {
    const v = sessionStorage.getItem(POST_REDIRECT_KEY)
    sessionStorage.removeItem(POST_REDIRECT_KEY)
    return v ?? '/'
  } catch {
    return '/'
  }
}

export function useAuth() {
  const { isAuthenticated, isLoading: logtoLoading, signIn: logtoSignIn, signOut: logtoSignOut, getIdTokenClaims } = useLogto()

  const me = useQuery<User | null>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { apiGet } = await import('../lib/api')
      try {
        return await apiGet<User>('/api/v1/auth/me')
      } catch (err: any) {
        if (err.status === 401 || err.status === 404) return null
        throw err
      }
    },
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const signIn = useCallback((returnTo: string) => {
    stashPostAuthTarget(returnTo)
    void logtoSignIn(`${window.location.origin}/auth/callback`)
  }, [logtoSignIn])

  const signOut = useCallback((returnTo: string = '/') => {
    void logtoSignOut(`${window.location.origin}${returnTo}`)
  }, [logtoSignOut])

  return {
    user: me.data ?? null,
    isLoading: logtoLoading || me.isLoading,
    isAuthenticated: !!isAuthenticated && !!me.data,
    isImpersonating: !!me.data?.impersonation?.active,
    error: me.error,
    signIn,
    signOut,
    getIdTokenClaims,
  }
}
