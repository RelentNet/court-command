// web/src/routes/index.tsx
//
// Root landing page (Home). Public-facing -- never gates on auth.
// EVERYONE sees PublicLanding here -- anonymous AND authenticated.
//
// Why no auto-redirect for authenticated users:
//   - User research (smoke test 1.1, 1.9, 1.10, 3.1): signed-in users
//     want to access live scores, events, news, and the public landing
//     without losing the in-app shell.
//   - Auto-redirecting / -> /<sport>/dashboard hid the public surface.
//   - PublicLayout in __root.tsx already renders the authenticated
//     Sidebar around PublicLanding when the user is signed in, so
//     getting back to the dashboard is one sidebar click away.
//
// Multi-sport picker remains: when the user has access to more than
// one active sport, show the picker so they can pick which to enter.
// (Single-sport users stay on the public landing; their dashboard is
// in the sidebar.)

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listSports, type Sport } from '../lib/sports'
import { useAuth } from '../auth/useAuth'
import { PublicLanding } from '../features/public/PublicLanding'

export const Route = createFileRoute('/')({
  component: RootIndex,
})

function RootIndex() {
  const { isAuthenticated } = useAuth()
  const { data: sports } = useQuery({
    queryKey: ['sports'],
    queryFn: listSports,
  })

  // Authenticated multi-sport visitors get the picker so they can
  // jump straight to a sport without going through the sidebar.
  if (isAuthenticated && sports && sports.length > 1) {
    return <SportPicker sports={sports} />
  }

  // Everyone else (anonymous OR authenticated single-sport): the
  // public landing page.
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
