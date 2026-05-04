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
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useSport } from '../auth/SportContext'

export const Route = createFileRoute('/$sport')({
  component: SportLayout,
})

function SportLayout() {
  return <SportGuard />
}

function SportGuard() {
  const { sport, sports, isLoading } = useSport()
  const navigate = useNavigate()

  // Bounce home if slug doesn't match any known sport.
  useEffect(() => {
    if (!isLoading && sports.length > 0 && !sport) {
      void navigate({ to: '/' })
    }
  }, [isLoading, sports, sport, navigate])

  if (isLoading) return <div>Loading sport…</div>
  if (!sport) return null
  return <Outlet />
}
