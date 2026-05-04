// web/src/auth/SportContext.tsx
//
// SportProvider exposes the currently-scoped Sport (resolved from the
// URL pathname) and the full sport list to descendants. It pushes the
// slug + org ID into the api module's currentSportSlug / currentOrgID
// state SYNCHRONOUSLY during render — not in a useEffect — so the very
// first API call after a route change carries the correct X-Sport
// header AND requests an org-scoped Logto token.
//
// Mounted GLOBALLY at __root.tsx so every component in the tree (including
// the Sidebar in AuthenticatedLayout / PublicLayout) sees the right
// sport. The provider derives the slug from useLocation().pathname:
// any /<reserved> root (public, overlay, auth, tv) returns '' so we
// don't mistakenly treat /public/leagues as a sport called "public".
//
// This also fixes the "every sidebar nav button redirects to dashboard"
// bug: previously the SportProvider was mounted inside routes/$sport.tsx,
// which left the Sidebar (rendered by RootLayout, above the route tree)
// with no sport context. sportSlug fell back to '' and Sidebar paths
// collapsed to /leagues, /tournaments, etc. — which TanStack Router
// matched as /$sport with sport='leagues', SportGuard bounced to /,
// RootIndex auto-redirected to /<sport>/dashboard.

import { createContext, useContext, type ReactNode } from 'react'
import { useLocation } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listSports, type Sport } from '../lib/sports'
import { setCurrentSport } from '../lib/api'

interface SportCtx {
  sport: Sport | null
  sports: Sport[]
  isLoading: boolean
}

const Ctx = createContext<SportCtx>({ sport: null, sports: [], isLoading: false })

// First-segment values that are NOT sport slugs. Any URL whose first
// path segment matches one of these resolves to slug=''.
const RESERVED_FIRST_SEGMENTS = new Set([
  '',          // bare /
  'public',    // /public/...
  'overlay',   // /overlay/...
  'auth',      // /auth/callback
  'tv',        // /tv/...
])

function extractSportSlugFromPathname(pathname: string): string {
  const m = pathname.match(/^\/([^/]*)/)
  if (!m) return ''
  const first = m[1]
  if (RESERVED_FIRST_SEGMENTS.has(first)) return ''
  return first
}

export function SportProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const slug = extractSportSlugFromPathname(location.pathname)

  const sportsQuery = useQuery({
    queryKey: ['sports'],
    queryFn: listSports,
    staleTime: 60 * 60 * 1000,
  })

  const sport = slug ? sportsQuery.data?.find((s) => s.slug === slug) ?? null : null

  // Set module state SYNCHRONOUSLY during render (not in useEffect) so
  // the very first API call after a route change carries the right
  // X-Sport header and org-scoped token. This is safe because
  // setCurrentSport is idempotent and the only consumer is module-level
  // state read inside fetch().
  if (sport) {
    setCurrentSport(sport.slug, sport.logto_org_id)
  } else if (slug === '') {
    // Reserved root (public/overlay/auth/tv) or bare /. Clear so apiFetch
    // doesn't send a stale X-Sport from a prior sport-scoped page.
    setCurrentSport('', '')
  }
  // If slug is set but sport is null (sports list still loading or
  // unknown slug), don't clear — let the previous value remain stale
  // for one render until SportGuard either renders the page or bounces.

  return (
    <Ctx.Provider value={{ sport, sports: sportsQuery.data ?? [], isLoading: sportsQuery.isLoading }}>
      {children}
    </Ctx.Provider>
  )
}

export function useSport() {
  return useContext(Ctx)
}
