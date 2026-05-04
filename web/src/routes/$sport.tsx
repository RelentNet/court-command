// web/src/routes/$sport.tsx
//
// Layout route for all sport-scoped pages. The SportProvider is mounted
// globally in __root.tsx (so the Sidebar sees it too), so this file's
// job is just to render the SportGuard which:
//
//   1. sports list still loading -> "Loading sport…"
//   2. sports loaded but slug unknown -> navigate('/')
//   3. otherwise -> render <Outlet />
//
// Cross-sport prevention will land when RequireSportMatchesJWT is
// chained on protected routes (Phase 4+); for now, useAuth's /auth/me
// query already implicitly validates the JWT and a 403 at that layer
// will surface as `isAuthenticated=false`, sending the user back
// through the picker.
import { createFileRoute, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { isReservedNonSportPath, useSport } from '../auth/SportContext'

export const Route = createFileRoute('/$sport')({
  component: SportLayout,
})

function SportLayout() {
  return <SportGuard />
}

function SportGuard() {
  const { sport, sports, isLoading } = useSport()
  const navigate = useNavigate()
  const location = useLocation()

  // Defensive: if the URL's first segment is a reserved root (overlay,
  // public, auth, tv), TanStack Router shouldn't have matched us here.
  // This typically happens when a <Link to> uses /overlay (no trailing
  // slash) and TanStack falls through to /$sport with sport='overlay'.
  // Render nothing -- the user is in a transient state; the actual
  // overlay/public/etc. route should pick up. (Long-term we should fix
  // every <Link to>; this guard is a safety net.)
  const reserved = isReservedNonSportPath(location.pathname)

  // Bounce home if slug doesn't match any known sport.
  // Skip the bounce when the URL is a reserved root -- otherwise we'd
  // redirect to / and RootIndex would auto-redirect to dashboard,
  // breaking /overlay-style navigation.
  useEffect(() => {
    if (reserved) return
    if (!isLoading && sports.length > 0 && !sport) {
      void navigate({ to: '/' })
    }
  }, [reserved, isLoading, sports, sport, navigate])

  if (reserved) return null
  if (isLoading) return <div>Loading sport…</div>
  if (!sport) return null
  return <Outlet />
}
