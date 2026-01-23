import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import config from '../config'
import { MatchSetupForm } from '../components/MatchSetupForm'
import { Spinner } from '../components/Spinner'
import type { Court, Match } from '../types/domain'

export const Route = createFileRoute('/courts/$courtSlug/')({
  component: CourtDetail,
})

interface CourtWithHistory extends Court {
  active_match?: Match | null
  match_history?: Array<Match>
}

function CourtDetail() {
  const { courtSlug } = Route.useParams()
  const navigate = useNavigate()
  const [isStarting, setIsStarting] = useState(false)

  const {
    data: court,
    isLoading,
    error,
  } = useQuery<CourtWithHistory>({
    queryKey: ['court', courtSlug],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/courts/${courtSlug}`)
      if (!res.ok) throw new Error('Court not found')
      return res.json()
    },
  })

  const createMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.API_URL}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          court_slug: courtSlug,
          status: 'preparing',
          participants: {},
          config: {
            format: 'best_of_3',
            points_to: 11,
            win_by: 2,
            scoring_type: 'side_out',
          },
        }),
      })
      if (!res.ok) throw new Error('Failed to create match')
      return res.json()
    },
    onSuccess: () => {
      navigate({ to: '/courts/$courtSlug/referee', params: { courtSlug } })
    },
  })

  if (isLoading || !court)
    return <div className="p-8 text-white">Loading...</div>
  if (error) return <div className="p-8 text-red-500">Court not found</div>

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-6 mx-auto max-w-4xl">
        <div className="flex items-center gap-4">
          <Link
            to="/courts"
            className="hover:bg-slate-800 p-2 rounded-full transition-colors"
          >
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="font-bold text-3xl">{court.name}</h1>
            <p className="text-slate-400">
              Manage matches for this court here.
            </p>
          </div>
        </div>

        {/* Active Match or Setup Form */}
        {isStarting ? (
          <div className="flex justify-center">
            <MatchSetupForm
              courtSlug={courtSlug}
              onCancel={() => setIsStarting(false)}
            />
          </div>
        ) : court.active_match ? (
          <div
            className={`p-12 border rounded-xl text-center ${
              court.active_match.status === 'final'
                ? 'bg-slate-800/50 border-slate-700'
                : 'bg-slate-800 border-lime-500/50'
            }`}
          >
            <div
              className={`mb-4 font-mono text-4xl ${
                court.active_match.status === 'final'
                  ? 'text-slate-500'
                  : 'text-lime-500'
              }`}
            >
              {court.active_match.status === 'final' ? '🏁 Final' : '● Live'}
            </div>
            <h2 className="mb-2 font-semibold text-xl">
              {court.active_match.status === 'final'
                ? 'Match Complete'
                : 'Match In Progress'}
            </h2>
            <p className="text-slate-400">
              {court.active_match.participants.team_1?.name || 'Team 1'} vs{' '}
              {court.active_match.participants.team_2?.name || 'Team 2'}
            </p>
            <div className="flex flex-col items-center gap-4 mt-8">
              {court.active_match.status !== 'final' && (
                <Link
                  to="/courts/$courtSlug/referee"
                  params={{ courtSlug }}
                  className="bg-lime-500 hover:bg-lime-400 w-full max-w-md px-8 py-4 rounded-xl font-black text-2xl text-slate-900 transition-all shadow-xl shadow-lime-500/20 text-center uppercase tracking-tighter"
                >
                  Enter Referee Portal
                </Link>
              )}
              <div className="flex justify-center gap-4">
                <Link
                  to="/courts/$courtSlug/ticker"
                  params={{ courtSlug }}
                  target="_blank"
                  className="bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-lg font-bold text-white transition-colors"
                >
                  Broadcast Ticker
                </Link>
                <Link
                  to="/courts/$courtSlug/scoreboard"
                  params={{ courtSlug }}
                  className="bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-lg font-bold text-white transition-colors"
                >
                  Scoreboard Display
                </Link>
              </div>
              {court.active_match.status === 'final' && (
                <button
                  onClick={() => createMatchMutation.mutate()}
                  disabled={createMatchMutation.isPending}
                  className="bg-lime-600 hover:bg-lime-500 mt-4 px-8 py-3 rounded-lg font-bold text-white transition-colors shadow-lg animate-in slide-in-from-bottom-2"
                >
                  {createMatchMutation.isPending
                    ? 'Starting...'
                    : 'Start New Match'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-800 p-12 border border-slate-700 rounded-xl text-center">
            <div className="mb-4 font-mono text-4xl">🎾</div>
            <h2 className="mb-2 font-semibold text-xl">No Active Match</h2>
            <p className="text-slate-400">
              Start a new match to display the scoreboard.
            </p>
            <button
              onClick={() => createMatchMutation.mutate()}
              disabled={createMatchMutation.isPending}
              className="bg-lime-600 hover:bg-lime-500 mt-6 px-6 py-2 rounded font-bold transition-colors disabled:opacity-50"
            >
              {createMatchMutation.isPending ? (
                <div className="flex items-center gap-2">
                  <Spinner size={16} /> Creating...
                </div>
              ) : (
                'Start Match'
              )}
            </button>
          </div>
        )}

        {/* Match History */}
        {court.match_history && court.match_history.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-400 uppercase tracking-wider">
              Recent Matches
            </h3>
            <div className="gap-4 grid grid-cols-1">
              {court.match_history.map((match: Match) => (
                <div
                  key={match.id}
                  className="flex justify-between items-center bg-slate-800 p-4 border border-slate-700 rounded-lg opacity-75 hover:opacity-100 transition-opacity"
                >
                  <div className="flex flex-col gap-1">
                    <span className="font-bold text-lg">
                      {match.participants.team_1?.name || 'Team 1'} vs{' '}
                      {match.participants.team_2?.name || 'Team 2'}
                    </span>
                    <span className="text-slate-500 text-xs">
                      {new Date(match.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Link
                    to="/match/$matchId"
                    params={{ matchId: match.public_id }}
                    className="text-lime-500 hover:underline text-sm"
                  >
                    View Results &rarr;
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
