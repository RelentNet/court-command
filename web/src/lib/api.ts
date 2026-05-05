// web/src/lib/api.ts
//
// Phase 3 swap: cookie-based fetch -> Bearer-token fetch.
// Token is org-scoped + API-resource-scoped. Slug + orgID + token
// fetcher are pushed into module state by SportProvider / AuthProvider.

const API_BASE = import.meta.env.VITE_API_URL || ''
const API_RESOURCE = import.meta.env.VITE_LOGTO_API_RESOURCE

let currentSportSlug = ''
let currentOrgID = ''
export function setCurrentSport(slug: string, orgID: string) {
  currentSportSlug = slug
  currentOrgID = orgID
}

// (resource, organizationID) => Promise<token | null>
let getAccessTokenFn: ((resource: string, organizationID?: string) => Promise<string | null>) | null = null
export function setGetAccessTokenFn(fn: typeof getAccessTokenFn) {
  getAccessTokenFn = fn
}

export interface ApiError { code: string; message: string }

export class ApiRequestError extends Error {
  code: string; status: number
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.code = code
    this.status = status
  }
}

async function buildHeaders(extra?: HeadersInit): Promise<Headers> {
  const h = new Headers(extra)
  if (getAccessTokenFn) {
    // If we're inside a sport scope, request the org-bound token; if not
    // (sport picker, public routes), request a plain API token. Logto
    // returns null pre-authentication; in that case we send no auth header.
    const orgID = currentOrgID || undefined
    const token = await getAccessTokenFn(API_RESOURCE, orgID)
    if (token) h.set('Authorization', `Bearer ${token}`)
  }
  if (currentSportSlug) h.set('X-Sport', currentSportSlug)
  return h
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 401) {
    // Smoke 17.4: if a request comes back 401, the user's session is
    // gone -- tokens were revoked, expired, or a sibling tab signed
    // out. Surface this as a global event so AuthProvider can do a
    // cleanup + redirect to /. Without this, stale tabs just throw
    // ApiRequestError repeatedly while the user navigates around.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cc:auth-expired'))
    }
  }
  if (!response.ok) await throwApiError(response)
  if (response.status === 204) return undefined as unknown as T
  const body = await response.json()
  return body.data !== undefined ? body.data : body
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await buildHeaders()
  const response = await fetch(`${API_BASE}${path}`, { headers })
  return handleResponse<T>(response)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const headers = await buildHeaders(body ? { 'Content-Type': 'application/json' } : undefined)
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST', headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildHeaders({ 'Content-Type': 'application/json' })
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH', headers, body: JSON.stringify(body),
  })
  return handleResponse<T>(response)
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await buildHeaders({ 'Content-Type': 'application/json' })
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT', headers, body: JSON.stringify(body),
  })
  return handleResponse<T>(response)
}

export async function apiDelete<T = void>(path: string): Promise<T> {
  const headers = await buildHeaders()
  const response = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers })
  return handleResponse<T>(response)
}

export interface PaginatedData<T> {
  items: T[]; total: number; limit: number; offset: number
}

export async function apiGetPaginated<T>(path: string): Promise<PaginatedData<T>> {
  const headers = await buildHeaders()
  const response = await fetch(`${API_BASE}${path}`, { headers })
  if (!response.ok) await throwApiError(response)
  const body = await response.json()
  return {
    items: body.data || [],
    total: body.pagination?.total || 0,
    limit: body.pagination?.limit || 20,
    offset: body.pagination?.offset || 0,
  }
}

async function throwApiError(response: Response): Promise<never> {
  let code = 'unknown_error'
  let message = `Request failed with status ${response.status}`
  try {
    const body = await response.json()
    if (body.error) {
      code = body.error.code || code
      message = body.error.message || message
    }
  } catch { /* not JSON */ }
  throw new ApiRequestError(response.status, code, message)
}
