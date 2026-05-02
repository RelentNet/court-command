// web/src/auth/SportContext.tsx
//
// SportProvider exposes the currently-scoped Sport (resolved from a URL
// slug) and the full sport list to descendants. Critically, it pushes
// the slug + org ID into the api module's currentSportSlug /
// currentOrgID state SYNCHRONOUSLY during render — not in a useEffect —
// so the very first API call after a route change carries the correct
// X-Sport header AND requests an org-scoped Logto token.
//
// This is the fix described in plan amendment I2: doing it in useEffect
// races the first useQuery in any sport-scoped page; the query fires on
// mount with stale module state and 403s. setCurrentSport is idempotent
// and module-state-only, so calling it during render is safe.

import { createContext, useContext, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listSports, type Sport } from '../lib/sports'
import { setCurrentSport } from '../lib/api'

interface SportCtx {
  sport: Sport | null
  sports: Sport[]
  isLoading: boolean
}

const Ctx = createContext<SportCtx>({ sport: null, sports: [], isLoading: false })

export function SportProvider({ slug, children }: { slug: string | null; children: ReactNode }) {
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
  } else if (slug === null) {
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
