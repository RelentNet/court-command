import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLogto } from '@logto/react'
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  apiGetPaginated,
  type PaginatedData,
} from '../../lib/api'
import { buildQueryString } from '../../lib/formatters'
import { useSport } from '../../auth/SportContext'
import { API_RESOURCE } from '../../auth/LogtoConfig'
import {
  exchangeSubjectToken,
  setImpersonationToken,
  clearImpersonationToken,
} from '../../auth/impersonation'
import type {
  AdminStats,
  AdminUser,
  ActivityLogEntry,
  ApiKey,
  Upload,
  VenueApprovalItem,
} from './types'

// ── Stats ──────────────────────────────────────────────────────────────

export function useAdminStats() {
  return useQuery<AdminStats>({
    queryKey: ['admin', 'stats'],
    queryFn: () => apiGet<AdminStats>('/api/v1/admin/stats'),
  })
}

// ── Users ──────────────────────────────────────────────────────────────

export function useSearchUsers(
  query?: string,
  role?: string,
  status?: string,
  limit?: number,
  offset?: number,
) {
  return useQuery<PaginatedData<AdminUser>>({
    queryKey: ['admin', 'users', { query, role, status, limit, offset }],
    queryFn: () =>
      apiGetPaginated<AdminUser>(
        `/api/v1/admin/users${buildQueryString({ query, role, status, limit, offset })}`,
      ),
  })
}

export function useAdminUser(userId: string) {
  return useQuery<AdminUser>({
    queryKey: ['admin', 'users', userId],
    queryFn: () => apiGet<AdminUser>(`/api/v1/admin/users/${userId}`),
    enabled: !!userId,
  })
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiPatch<void>(`/api/v1/admin/users/${userId}/role`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

export function useUpdateUserStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      status,
      reason,
    }: {
      userId: string
      status: string
      reason: string
    }) => apiPatch<void>(`/api/v1/admin/users/${userId}/status`, { status, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

// ── Venues ─────────────────────────────────────────────────────────────

export function usePendingVenues(limit?: number, offset?: number) {
  return useQuery<PaginatedData<VenueApprovalItem>>({
    queryKey: ['admin', 'venues', 'pending', { limit, offset }],
    queryFn: () =>
      apiGetPaginated<VenueApprovalItem>(
        `/api/v1/admin/venues/pending${buildQueryString({ limit, offset })}`,
      ),
  })
}

export function useUpdateVenueStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      venueId,
      status,
      feedback,
    }: {
      venueId: number
      status: string
      feedback?: string
    }) =>
      apiPatch<void>(`/api/v1/admin/venues/${venueId}/status`, {
        status,
        feedback,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'venues'] })
    },
  })
}

// ── Activity Log ───────────────────────────────────────────────────────

export function useActivityLogs(filters: {
  user_id?: string
  entity_type?: string
  action?: string
  limit?: number
  offset?: number
}) {
  return useQuery<PaginatedData<ActivityLogEntry>>({
    queryKey: ['admin', 'activity', filters],
    queryFn: () =>
      apiGetPaginated<ActivityLogEntry>(
        `/api/v1/admin/activity-logs${buildQueryString(filters)}`,
      ),
  })
}

// ── API Keys ───────────────────────────────────────────────────────────

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['admin', 'api-keys'],
    queryFn: () => apiGet<ApiKey[]>('/api/v1/admin/api-keys'),
  })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; scopes: string[]; expires_at?: string }) =>
      apiPost<ApiKey>('/api/v1/admin/api-keys', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'api-keys'] })
    },
  })
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (keyId: number) =>
      apiDelete<void>(`/api/v1/admin/api-keys/${keyId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'api-keys'] })
    },
  })
}

// ── Uploads ────────────────────────────────────────────────────────────

export function useMyUploads() {
  return useQuery<Upload[]>({
    queryKey: ['admin', 'uploads'],
    queryFn: () => apiGet<Upload[]>('/api/v1/uploads'),
  })
}

export function useDeleteUpload() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (uploadId: number) =>
      apiDelete<void>(`/api/v1/uploads/${uploadId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'uploads'] })
    },
  })
}

// ── Impersonation (Logto OAuth 2.0 Token Exchange, RFC 8693) ─────────────
//
// Start: POST the backend impersonate endpoint (platform_admin only; it mints
// a Logto subject token + writes the audit log), then exchange that subject
// token at Logto's /oidc/token using the ADMIN's own access token as the actor
// token. The resulting impersonation access token (sub=target, act.sub=admin)
// is stored separately; api.ts buildHeaders prefers it on every request.
//
// Stop: discard the impersonation token (reverts to the admin's token) and
// fire the backend audit endpoint so the stop is recorded. The audit call uses
// the impersonation token (still present until we clear it) so the backend can
// read the act claim — we clear AFTER the request resolves.

interface ImpersonateResponse {
  subject_token: string
  target: { public_id: string; first_name: string; last_name: string; role: string }
}

export function useStartImpersonation() {
  const queryClient = useQueryClient()
  const { getAccessToken } = useLogto()
  const { sport } = useSport()
  return useMutation({
    // userId is the target's public_id (e.g. "CC-10295") OR numeric id; the
    // backend resolveUserParam accepts both.
    mutationFn: async (userId: number | string) => {
      const orgID = sport?.logto_org_id || undefined
      // 1. Ask the backend to mint a subject token (also writes activity log).
      const resp = await apiPost<ImpersonateResponse>(
        `/api/v1/admin/users/${userId}/impersonate`,
      )
      // 2. Grab the admin's own access token (the actor token for the exchange).
      const actorToken = await getAccessToken(API_RESOURCE, orgID)
      if (!actorToken) throw new Error('Could not obtain admin access token')
      // 3. Exchange the subject token for an impersonation access token.
      const impToken = await exchangeSubjectToken(resp.subject_token, actorToken, orgID)
      // 4. Store it; api.ts now prefers it for all subsequent requests.
      setImpersonationToken(impToken)
      return resp
    },
    onSuccess: () => {
      // Refetch /auth/me so it reflects the impersonated user + act claim.
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}

export function useStopImpersonation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      // Audit first (while the impersonation token is still attached so the
      // backend can read act.sub), then discard. Tolerate audit failure — the
      // user must always be able to escape impersonation.
      try {
        await apiPost<{ restored: boolean }>('/api/v1/admin/stop-impersonation')
      } catch {
        /* best-effort audit; clearing the token below is what actually stops it */
      }
      clearImpersonationToken()
      return { restored: true }
    },
    onSuccess: () => {
      // Refetch /auth/me to get the admin's own data back.
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    },
  })
}
