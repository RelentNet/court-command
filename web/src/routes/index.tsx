// web/src/routes/index.tsx
//
// Sport picker landing page. The unauthenticated entrypoint of the app.
//
// Behavior:
// - Always renders. No AuthGuard.
// - Lists active sports from /api/v1/sports.
// - Click a sport:
//   - If not signed in: signIn() stashes target in sessionStorage and
//     redirects to Logto. After callback, user lands on /<sport>/dashboard.
//   - If signed in: navigate directly to /<sport>/dashboard.
// - Used as the bounce target by SportGuard when JWT org doesn't match
//   the URL sport (the user can re-pick + Logto will re-issue a token
//   for the correct org).

import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listSports, type Sport } from '../lib/sports'
import { useAuth } from '../auth/useAuth'

export const Route = createFileRoute('/')({
  component: SportPicker,
})

function SportPicker() {
  const navigate = useNavigate()
  const { isAuthenticated, signIn } = useAuth()
  const { data: sports, isLoading, isError } = useQuery({
    queryKey: ['sports'],
    queryFn: listSports,
  })

  const choose = (s: Sport) => {
    const dashboardPath = `/${s.slug}/dashboard`
    if (!isAuthenticated) {
      // signIn stashes the post-auth target in sessionStorage and
      // redirects to Logto. The callback route reads it back and
      // navigates to /<sport>/dashboard once the token is acquired.
      signIn(dashboardPath)
      return
    }
    void navigate({
      to: '/$sport/dashboard',
      params: { sport: s.slug },
    })
  }

  if (isLoading) return <div className="p-8 text-center">Loading sports…</div>
  if (isError) return <div className="p-8 text-center text-red-600">Failed to load sports. Is the backend running?</div>
  if (!sports || sports.length === 0) {
    return <div className="p-8 text-center">No sports configured yet.</div>
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-8">
      <h1 className="text-3xl font-bold mb-2">Court Command</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Choose your sport</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl w-full">
        {sports.map((s) => (
          <button
            key={s.id}
            onClick={() => choose(s)}
            className="border rounded-lg p-6 bg-white dark:bg-gray-800 hover:shadow transition text-left"
          >
            <div className="text-xl font-semibold">{s.name}</div>
            <div className="text-sm text-gray-500 mt-1">{s.slug}</div>
          </button>
        ))}
      </div>
      {!isAuthenticated && (
        <p className="mt-8 text-sm text-gray-500">
          You'll be asked to sign in after choosing.
        </p>
      )}
    </div>
  )
}
