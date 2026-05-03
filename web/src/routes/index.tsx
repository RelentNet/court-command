// web/src/routes/index.tsx
//
// Root landing page. Public-facing -- never gates on auth.
//
// Behavior:
// - Anonymous visitors see PublicLanding (hero, news widget, public
//   directories of tournaments/leagues/venues). Sign-in CTAs in the
//   PublicHero send them through Logto when they choose to.
// - Authenticated visitors are auto-routed to their sport's dashboard:
//     - Single-sport mode (only one active sport): straight to
//       /<slug>/dashboard.
//     - Multi-sport mode (more than one): a sport picker is shown so
//       they can choose which to enter.
// - Used as the bounce target by SportGuard when the JWT org doesn't
//   match the URL sport (the user re-picks and Logto re-issues).
//
// Multi-sport picker is gated on VITE_AUTO_REDIRECT_SINGLE_SPORT
// (default true). When false, even authenticated users with one sport
// see the picker -- useful to preview the picker UI in dev.

import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listSports, type Sport } from '../lib/sports'
import { useAuth } from '../auth/useAuth'
import { PublicLanding } from '../features/public/PublicLanding'

const AUTO_REDIRECT_SINGLE_SPORT =
  (import.meta.env.VITE_AUTO_REDIRECT_SINGLE_SPORT ?? 'true') !== 'false'

export const Route = createFileRoute('/')({
  component: RootIndex,
})

function RootIndex() {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: listSports,
    // Don't block the public landing on the sports query. Anonymous
    // visitors don't need this data; we only fetch it so that
    // authenticated visitors can be routed to their dashboard
    // without a separate roundtrip.
  })
  const navigate = useNavigate()

  // Authenticated visitors with single-sport config: redirect to
  // their dashboard. Anonymous visitors stay here and see the public
  // landing. Multiple-sport config: render the picker (below).
  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    if (!AUTO_REDIRECT_SINGLE_SPORT) return
    if (!sports || sports.length !== 1) return
    const only = sports[0]
    if (!only) return
    void navigate({
      to: '/$sport/dashboard',
      params: { sport: only.slug },
    })
  }, [authLoading, isAuthenticated, sports, navigate])

  // Authenticated multi-sport visitors get the picker.
  if (isAuthenticated && sports && sports.length > 1) {
    return <SportPicker sports={sports} />
  }

  // Default: anonymous OR authenticated-single-sport-while-redirect-pending.
  // PublicLanding is the same UI both cases see; the redirect effect
  // above transitions authenticated users out within a tick, no flash.
  return <PublicLanding />
}

function SportPicker({ sports }: { sports: Sport[] }) {
  const navigate = useNavigate()
  const choose = (s: Sport) => {
    void navigate({
      to: '/$sport/dashboard',
      params: { sport: s.slug },
    })
  }
  return (
    // Padding bottom is critical: PublicBottomTabs is position:fixed
    // at h-14 (56px) + safe-area-bottom. Without pb-24, on shorter
    // viewports the buttons render UNDER the bottom tabs and are
    // unclickable.
    <div className="flex flex-col items-center justify-center px-8 pt-8 pb-24 min-h-[calc(100vh-7.5rem)]">
      <h1 className="text-3xl font-bold mb-2">Choose your sport</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Pick where you want to go.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
        {sports.map((s) => (
          <button
            key={s.id}
            onClick={() => choose(s)}
            className="border rounded-lg p-6 bg-white dark:bg-gray-800 hover:shadow transition text-left cursor-pointer relative z-10"
            type="button"
          >
            <div className="text-xl font-semibold">{s.name}</div>
            <div className="text-sm text-gray-500 mt-1">{s.slug}</div>
          </button>
        ))}
      </div>
    </div>
  )
}
