// web/src/routes/$sport.tsx
//
// Layout route for all sport-scoped pages. Wraps the subtree in
// <SportProvider> so the X-Sport header + org-scoped Logto token are
// pushed into module state synchronously during render.
//
// Loading order:
//   1. sports list still loading -> "Loading sport…"
//   2. sports loaded but slug unknown -> navigate('/')
//   3. otherwise -> render <Outlet />
//
// Cross-sport prevention will land when RequireSportMatchesJWT is
// chained on protected routes (Phase 4+); for now, useAuth's /auth/me
// query already implicitly validates the JWT and a 403 at that layer
// will surface as `isAuthenticated=false`, sending the user back
// through the picker.
import { createFileRoute, Outlet, useParams, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { SportProvider, useSport } from '../auth/SportContext'

export const Route = createFileRoute('/$sport')({
  component: SportLayout,
})

function SportLayout() {
  const { sport: slug } = useParams({ from: '/$sport' })
  return (
    <SportProvider slug={slug}>
      <SportGuard />
    </SportProvider>
  )
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
