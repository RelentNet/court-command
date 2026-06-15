// web/src/auth/impersonation.ts
//
// Logto-native admin impersonation via OAuth 2.0 Token Exchange (RFC 8693).
//
// Flow (see docs/FEATURES.md §20):
//   1. Backend POST /api/v1/admin/users/:id/impersonate -> subject_token.
//   2. exchangeSubjectToken() POSTs that subject token to Logto's /oidc/token
//      with grant_type=token-exchange + the admin's own access token as the
//      actor_token. Logto returns an access token whose sub=<target> and
//      act.sub=<admin>.
//   3. We store that impersonation access token SEPARATELY from the admin's
//      SDK-managed token (the @logto/react SDK keeps the admin token; we never
//      overwrite it). api.ts buildHeaders() then PREFERS the impersonation
//      token while it is present.
//   4. Stopping impersonation = clearImpersonationToken() (the admin token is
//      untouched, so the next request reverts to it automatically).
//
// The impersonation token lives in sessionStorage (per-tab, cleared on tab
// close) rather than localStorage so an abandoned tab can't silently keep an
// impersonation session alive across browser restarts.

const STORAGE_KEY = 'cc_impersonation_token'

const TOKEN_EXCHANGE_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange'
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token'

const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT
const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE

/** Returns the stored impersonation access token, or null when not impersonating. */
export function getImpersonationToken(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

export function setImpersonationToken(token: string) {
  try {
    sessionStorage.setItem(STORAGE_KEY, token)
  } catch {
    /* private mode — impersonation simply won't persist across reloads */
  }
}

export function clearImpersonationToken() {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    /* no-op */
  }
}

export function isImpersonating(): boolean {
  return getImpersonationToken() !== null
}

/** Minimal decoded shape of an impersonation access token. */
export interface ActorClaims {
  /** sub claim — the impersonated (target) user's Logto id. */
  sub?: string
  /** act.sub — the impersonating admin's Logto id (RFC 8693 actor claim). */
  actorSub?: string
}

/**
 * Decodes the JWT payload of the current impersonation token (no signature
 * verification — purely to read sub / act.sub for UI display; the backend is
 * the authority that validates the token on every request).
 */
export function decodeImpersonationClaims(): ActorClaims | null {
  const token = getImpersonationToken()
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(
      decodeURIComponent(
        atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join(''),
      ),
    )
    return {
      sub: typeof json.sub === 'string' ? json.sub : undefined,
      actorSub: json.act && typeof json.act.sub === 'string' ? json.act.sub : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Exchanges a backend-minted subject token for an impersonation access token at
 * Logto's /oidc/token endpoint (RFC 8693). actorToken is the impersonating
 * admin's own access token; Logto records it as the act claim on the issued
 * token. organizationID, when provided, scopes the impersonation token to the
 * same Logto org the admin is currently operating in so the backend's
 * sport-scoped checks continue to pass.
 *
 * Returns the impersonation access token string.
 */
export async function exchangeSubjectToken(
  subjectToken: string,
  actorToken: string,
  organizationID?: string,
): Promise<string> {
  if (!endpoint || !apiResource) {
    throw new Error('Missing Logto config for token exchange')
  }
  const body = new URLSearchParams({
    grant_type: TOKEN_EXCHANGE_GRANT,
    subject_token: subjectToken,
    subject_token_type: ACCESS_TOKEN_TYPE,
    actor_token: actorToken,
    actor_token_type: ACCESS_TOKEN_TYPE,
    resource: apiResource,
  })
  if (organizationID) {
    // Logto uses the organization_id form param to scope the exchanged token
    // to a specific organization (mirrors the org-scoped access-token flow).
    body.set('organization_id', organizationID)
  }

  const res = await fetch(`${endpoint.replace(/\/$/, '')}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j.error_description || j.error || ''
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Token exchange failed (${res.status})${detail ? `: ${detail}` : ''}`)
  }
  const json = await res.json()
  if (!json.access_token) {
    throw new Error('Token exchange response missing access_token')
  }
  return json.access_token as string
}
