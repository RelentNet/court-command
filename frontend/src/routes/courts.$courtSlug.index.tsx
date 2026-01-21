import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import config from '../config'
import { MatchSetupForm } from '../components/MatchSetupForm'
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

  if (isLoading) return <div className="p-8 text-white">Loading...</div>
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
          <div className="bg-slate-800 p-12 border border-lime-500/50 rounded-xl text-center">
            <div className="mb-4 font-mono text-4xl text-lime-500">● Live</div>
            <h2 className="mb-2 font-semibold text-xl">Match In Progress</h2>
            <p className="text-slate-400">
              {court.active_match.participants.team_1.name} vs{' '}
              {court.active_match.participants.team_2.name}
            </p>
            <div className="flex justify-center gap-4 mt-6">
              <Link
                to="/courts/$courtSlug/referee"
                params={{ courtSlug }}
                className="bg-lime-600 hover:bg-lime-500 px-6 py-3 rounded-lg font-bold text-white transition-colors"
              >
                Referee Console
              </Link>
              <Link
                to="/courts/$courtSlug/scoreboard"
                params={{ courtSlug }}
                className="bg-slate-700 hover:bg-slate-600 px-6 py-3 rounded-lg font-bold text-white transition-colors"
              >
                Scoreboard Display
              </Link>
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
              onClick={() => setIsStarting(true)}
              className="bg-lime-600 hover:bg-lime-500 mt-6 px-6 py-2 rounded font-bold transition-colors"
            >
              Start Match
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
