// web/src/auth/useAuth.ts
//
// Replacement for features/auth/hooks.ts.
// Thin shim over @logto/react's useLogto(). Persists post-auth redirect
// target in sessionStorage because the Logto SDK's signIn() takes only
// a redirectUri and has no postRedirectUri option.

import { useLogto } from '@logto/react'
import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useSport } from './SportContext'

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

  // Sport context determines which Logto organization the access token
  // is scoped to. apiFetch reads currentOrgID synchronously when it
  // builds the Authorization header; if /me fires BEFORE SportProvider
  // has resolved listSports() and called setCurrentSport(), the SDK
  // gets called with no orgID and Logto silently issues a resource-only
  // token (no organization_roles claim). The api then can't elevate
  // platform_admin and the admin sidebar link disappears.
  //
  // Gating enabled on !sportLoading ensures /me waits one tick for
  // sport context to settle. Including sport.slug in the queryKey
  // forces a refetch when the user navigates between sports so the
  // /me cache doesn't carry the wrong org's elevation. sport.slug is
  // empty ('') on reserved routes like / and /public/* -- React Query
  // accepts that as a stable key, and the api elevates from
  // organization_roles regardless of the slug, so platform_admin
  // shows up the moment ANY org-scoped token is minted.
  const { sport, isLoading: sportLoading } = useSport()

  const me = useQuery<User | null>({
    queryKey: ['auth', 'me', sport?.slug ?? ''],
    queryFn: async () => {
      const { apiGet } = await import('../lib/api')
      try {
        return await apiGet<User>('/api/v1/auth/me')
      } catch (err: any) {
        // 401: token rejected — treat as logged out at the SDK layer.
        // 404: user mirror missing — bridge/middleware should never
        //      let this happen for valid JWT subjects, but guard anyway.
        // Other errors (5xx, network): re-throw so React Query retries
        //      and surfaces the error rather than silently logging the
        //      user out (Phase 3 review C4).
        if (err.status === 401 || err.status === 404) return null
        throw err
      }
    },
    enabled: isAuthenticated && !sportLoading,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const signIn = useCallback((returnTo: string) => {
    stashPostAuthTarget(returnTo)
    void logtoSignIn(`${window.location.origin}/auth/callback`)
  }, [logtoSignIn])

  const signOut = useCallback((returnTo: string = '/') => {
    // Smoke 16.10: the post-logout redirect URI we hand Logto must EXACTLY
    // match a postLogoutRedirectUri registered on the SPA app, or Logto
    // refuses to redirect and parks the browser on its raw /oidc/session/end
    // page. The seeder registers the bare app origin with NO trailing slash
    // (api/logtoseed/seeder.go trimAuthCallback -> "http://localhost:5173").
    // Sending "http://localhost:5173/" (origin + "/") is a different string
    // to the OIDC spec and gets rejected. So for the common root case we
    // send the bare origin; only a non-root returnTo appends a path.
    const target = returnTo === '/' ? window.location.origin : `${window.location.origin}${returnTo}`
    void logtoSignOut(target)
  }, [logtoSignOut])

  return {
    user: me.data ?? null,
    // isLoading covers both: SDK still loading tokens, OR the /me query
    // is in flight. Either way, downstream guards should wait.
    isLoading: logtoLoading || me.isLoading,
    // Phase 3.5 fix (review C4): isAuthenticated tracks the SDK's view
    // of token validity ONLY. Previously this was `&& !!me.data`,
    // which meant a transient backend error (503, network blip) on
    // /api/v1/auth/me would flip isAuthenticated to false and bounce
    // the user through a fresh sign-in cycle even though their token
    // was still valid. The /me query now coexists as `user` data;
    // components that need user info should null-check `user` and
    // render a skeleton rather than gating on isAuthenticated.
    isAuthenticated: !!isAuthenticated,
    isImpersonating: !!me.data?.impersonation?.active,
    error: me.error,
    signIn,
    signOut,
    getIdTokenClaims,
  }
}
