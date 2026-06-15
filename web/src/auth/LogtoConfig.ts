// web/src/auth/LogtoConfig.ts
//
// Logto SDK configuration. The SDK uses these to drive the OIDC flow:
// authorization endpoint, token endpoint, JWKS, etc. — discovered via
// the .well-known endpoint of `endpoint`.

import type { LogtoConfig } from '@logto/react'
import { UserScope } from '@logto/react'

const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT
const appId = import.meta.env.VITE_LOGTO_APP_ID
const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE

if (!endpoint || !appId || !apiResource) {
  throw new Error(
    'Missing Logto config. Set VITE_LOGTO_ENDPOINT, VITE_LOGTO_APP_ID, VITE_LOGTO_API_RESOURCE in .env',
  )
}

// Scopes requested at sign-in. The 12 API scopes correspond to the
// resource scopes provisioned by api/cmd/logto-seed.
export const API_SCOPES = [
  'read:profile', 'write:profile',
  'read:tournaments', 'write:tournaments',
  'read:matches', 'write:matches',
  'read:registrations', 'write:registrations',
  'read:overlay', 'write:overlay',
  'read:admin', 'write:admin',
] as const

// Org scopes are NOT requested at signIn — they're embedded in the
// org-scoped access token automatically by Logto when the user has the
// corresponding org role(s). Listed here for documentation only.
export const ORG_SCOPES = [
  'manage_tournaments', 'manage_matches', 'manage_registrations',
  'manage_users', 'read_all',
] as const

export const logtoConfig: LogtoConfig = {
  endpoint,
  appId,
  resources: [apiResource],
  scopes: [
    ...API_SCOPES,
    UserScope.Email,
    UserScope.Profile,
    UserScope.Identities,
    UserScope.Organizations,      // CRITICAL: required to get organization-scoped tokens
    UserScope.OrganizationRoles,  // CRITICAL: required for organization_roles claim in token.
                                  // Without this Logto issues org-scoped tokens but strips
                                  // the role names, so api's claims.ElevatedRole() never
                                  // sees platform_admin and the admin sidebar link is hidden
                                  // even when the user has the role assigned in Logto Console.
  ],
}

// Public for tests + the SportContext to use when calling getOrganizationToken.
export const API_RESOURCE = apiResource
