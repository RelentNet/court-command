// web/src/lib/sports.ts
//
// Public sport directory client. The sport picker (unauthenticated
// landing page) calls listSports() before the user has selected an org,
// so the underlying GET /api/v1/sports endpoint is mounted in the
// router's public block (no Bearer token required).

import { apiGet } from './api'

export interface Sport {
  id: number
  slug: string
  name: string
  /** Logto organization ID — needed to request an org-scoped access token. */
  logto_org_id: string
}

/** Fetches the list of active sports from the backend. */
export async function listSports(): Promise<Sport[]> {
  return apiGet<Sport[]>('/api/v1/sports')
}
