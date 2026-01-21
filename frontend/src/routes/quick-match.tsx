import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Zap, ArrowLeft } from 'lucide-react'
import config from '../config'

export const Route = createFileRoute('/quick-match')({
  component: QuickMatchPage,
})

function QuickMatchPage() {
  const navigate = useNavigate()
  const [team1, setTeam1] = useState('Team 1')
  const [team2, setTeam2] = useState('Team 2')
  const [isCreating, setIsCreating] = useState(false)

  const handleStart = async () => {
    setIsCreating(true)
    try {
      const payload = {
        status: "in_progress",
        court_slug: null, // No specific court
        participants: {
          team_1: { name: team1 },
          team_2: { name: team2 }
        },
        config: {
          format: "best_of_1",
          points_to: 11,
          win_by: 2,
          scoring_type: "side_out"
        },
        team_1_score: 0,
        team_2_score: 0,
        current_game_num: 1,
        server_number: 1,
        serving_team: 1
      }

      const res = await fetch(`${config.API_URL}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) throw new Error('Failed to create match')
      const match = await res.json()
      
      navigate({ to: '/match/$matchId', params: { matchId: match.public_id } })
    } catch (e) {
      console.error(e)
      setIsCreating(false)
    }
  }

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-4 mb-8">
          <a href="/" className="hover:bg-slate-800 p-2 rounded-full transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </a>
          <h1 className="font-bold text-3xl">Quick Match</h1>
        </div>

        <div className="bg-slate-800 p-8 border border-slate-700 rounded-2xl shadow-xl">
          <div className="mb-8 text-center">
            <div className="inline-flex bg-amber-500/20 mb-4 p-4 rounded-full">
              <Zap className="w-12 h-12 text-amber-500" />
            </div>
            <p className="text-slate-400">
              Start a match immediately without selecting a court or registered teams.
            </p>
          </div>

          <div className="space-y-6">
            <div className="gap-6 grid grid-cols-2">
              <div>
                <label className="block mb-2 font-semibold text-sm">Team 1 Name</label>
                <input
                  value={team1}
                  onChange={(e) => setTeam1(e.target.value)}
                  className="bg-slate-900 px-4 py-3 border border-slate-700 focus:border-amber-500 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block mb-2 font-semibold text-sm">Team 2 Name</label>
                <input
                  value={team2}
                  onChange={(e) => setTeam2(e.target.value)}
                  className="bg-slate-900 px-4 py-3 border border-slate-700 focus:border-amber-500 rounded-lg w-full focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            <button
              onClick={handleStart}
              disabled={isCreating}
              className="bg-amber-500 hover:bg-amber-400 disabled:opacity-50 py-4 rounded-xl w-full font-bold text-slate-900 text-lg transition-colors"
            >
              {isCreating ? 'Creating...' : 'Start Now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
