// web/src/routes/$sport.tsx
//
// Layout route for all sport-scoped pages. Wraps the subtree in
// <SportProvider> so the X-Sport header + org-scoped Logto token are
// pushed into module state synchronously during render. SportGuard
// then probes /api/v1/auth/me to confirm the user's JWT actually has
// access to this sport's org. On 403, bounces to '/' so the user
// can re-pick (and Logto will re-issue an org-scoped token for the
// new sport).
//
// Loading order:
//   1. sports list still loading -> "Loading sport…"
//   2. sports loaded but slug unknown -> navigate('/')
//   3. authenticated + probe pending -> "Verifying access…"
//   4. probe ok (or unauthenticated) -> render <Outlet />
//   5. probe 403 -> navigate('/')
//
// See plan amendment A3.5.
import { createFileRoute, Outlet, useParams, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { SportProvider, useSport } from '../auth/SportContext'
import { useAuth } from '../auth/useAuth'
import { apiGet, ApiRequestError } from '../lib/api'

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
  const { isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [probeStatus, setProbeStatus] = useState<'pending' | 'ok' | 'forbidden'>('pending')

  // Bounce home if slug doesn't match any known sport.
  useEffect(() => {
    if (!isLoading && sports.length > 0 && !sport) {
      void navigate({ to: '/' })
    }
  }, [isLoading, sports, sport, navigate])

  // Probe: confirm the JWT's org matches this sport. If not, the user's
  // current session is for a different sport — bounce to '/' so they
  // can re-pick (and re-authenticate to the right org).
  useEffect(() => {
    if (!sport || !isAuthenticated) return
    let cancelled = false
    void (async () => {
      try {
        await apiGet('/api/v1/auth/me')
        if (!cancelled) setProbeStatus('ok')
      } catch (e) {
        if (cancelled) return
        if (e instanceof ApiRequestError && e.status === 403) {
          setProbeStatus('forbidden')
          void navigate({ to: '/' })
        } else {
          // Other errors (404, 503) — let downstream handle.
          setProbeStatus('ok')
        }
      }
    })()
    return () => { cancelled = true }
  }, [sport?.slug, isAuthenticated, navigate])

  if (isLoading) return <div>Loading sport…</div>
  if (!sport) return null
  if (isAuthenticated && probeStatus === 'pending') return <div>Verifying access…</div>
  return <Outlet />
}
