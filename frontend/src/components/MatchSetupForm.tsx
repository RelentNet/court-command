import { useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Settings, Shirt, Trophy } from 'lucide-react'
import config from '../config'
import type { Team } from '../types/domain'
import { Spinner } from './Spinner'

interface MatchSetupFormProps {
  courtSlug: string
  onCancel: () => void
}

export function MatchSetupForm({ courtSlug, onCancel }: MatchSetupFormProps) {
  const navigate = useNavigate()

  // Form State
  const [team1Id, setTeam1Id] = useState<string>('')
  const [team2Id, setTeam2Id] = useState<string>('')
  const [pointsTo, setPointsTo] = useState(11)
  const [winBy, setWinBy] = useState(2)
  const [bestOf, setBestOf] = useState(3)

  // Fetch Teams
  const { data: teams, isLoading } = useQuery<Array<Team>>({
    queryKey: ['teams'],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/teams`)
      if (!res.ok) throw new Error('Failed to fetch teams')
      return res.json()
    },
  })

  // ... (createMatch mutation remains the same)

  const createMatch = useMutation({
    mutationFn: async () => {
      const t1 = teams?.find((t: Team) => t.id?.toString() === team1Id)
      const t2 = teams?.find((t: Team) => t.id?.toString() === team2Id)

      if (!t1 || !t2) throw new Error('Select both teams')

      const payload = {
        court_slug: courtSlug,
        status: 'in_progress',
        participants: {
          team_1: t1,
          team_2: t2,
        },
        config: {
          format: `best_of_${bestOf}`,
          points_to: pointsTo,
          win_by: winBy,
          scoring_type: 'side_out', // Default for now
        },
        // Initialize scores
        team_1_score: 0,
        team_2_score: 0,
        current_game_num: 1,
        server_number: 1,
        serving_team: 1,
      }

      const res = await fetch(`${config.API_URL}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) throw new Error('Failed to start match')
      return res.json()
    },
    onSuccess: (data) => {
      if (courtSlug) {
        // Redirect to Court Referee Interface
        navigate({ to: '/courts/$courtSlug/referee', params: { courtSlug } })
      } else {
        // Redirect to Generic Referee Interface (Quick Match)
        navigate({ to: '/match/$matchId', params: { matchId: data.public_id } })
      }
    },
  })

  if (isLoading)
    return (
      <div className="flex justify-center p-8">
        <Spinner />
      </div>
    )

  return (
    <div className="bg-slate-800 p-6 border border-slate-700 rounded-xl w-full max-w-2xl animate-in fade-in zoom-in-95 duration-200">
      <div className="flex justify-between items-center mb-6 border-b border-slate-700 pb-4">
        <h2 className="font-bold text-2xl text-white">Start Match</h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          Cancel
        </button>
      </div>

      <div className="gap-8 grid grid-cols-1 md:grid-cols-2">
        {/* Teams Selection */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2 font-semibold text-lime-400 text-sm uppercase tracking-wider">
            <Shirt className="w-4 h-4" /> Teams
          </div>

          <div className="space-y-2">
            <label className="block text-slate-400 text-xs">
              Home Team (Server 1)
            </label>
            <select
              value={team1Id}
              onChange={(e) => setTeam1Id(e.target.value)}
              className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
            >
              <option value="">Select Team 1</option>
              {teams?.map((t: Team) => (
                <option
                  key={t.id}
                  value={t.id || ''}
                  disabled={t.id?.toString() === team2Id}
                >
                  {t.name} ({t.short_name})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center">
            <span className="font-bold text-slate-500 text-xs">VS</span>
          </div>

          <div className="space-y-2">
            <label className="block text-slate-400 text-xs">Away Team</label>
            <select
              value={team2Id}
              onChange={(e) => setTeam2Id(e.target.value)}
              className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white focus:ring-2 focus:ring-lime-500 outline-none"
            >
              <option value="">Select Team 2</option>
              {teams?.map((t: Team) => (
                <option
                  key={t.id}
                  value={t.id || ''}
                  disabled={t.id?.toString() === team1Id}
                >
                  {t.name} ({t.short_name})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Configuration */}
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-2 font-semibold text-lime-400 text-sm uppercase tracking-wider">
            <Settings className="w-4 h-4" /> Rules
          </div>

          <div className="gap-4 grid grid-cols-2">
            <div>
              <label className="block mb-1 text-slate-400 text-xs">
                Points To
              </label>
              <input
                type="number"
                value={pointsTo}
                onChange={(e) => setPointsTo(parseInt(e.target.value))}
                className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white"
              />
            </div>
            <div>
              <label className="block mb-1 text-slate-400 text-xs">
                Win By
              </label>
              <input
                type="number"
                value={winBy}
                onChange={(e) => setWinBy(parseInt(e.target.value))}
                className="bg-slate-900 border-slate-700 p-3 border rounded-lg w-full text-white"
              />
            </div>
          </div>

          <div>
            <label className="block mb-1 text-slate-400 text-xs">Format</label>
            <div className="flex gap-2">
              {[1, 3, 5].map((num) => (
                <button
                  key={num}
                  onClick={() => setBestOf(num)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    bestOf === num
                      ? 'bg-lime-600 text-white'
                      : 'bg-slate-900 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  Best of {num}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-700">
        <button
          onClick={() => createMatch.mutate()}
          disabled={!team1Id || !team2Id || createMatch.isPending}
          className="flex justify-center items-center gap-2 bg-lime-500 hover:bg-lime-400 disabled:opacity-50 shadow-lg disabled:shadow-none py-4 rounded-xl w-full font-bold text-slate-900 text-lg transition-all"
        >
          {createMatch.isPending ? (
            'Starting...'
          ) : (
            <>
              <Trophy className="w-5 h-5" /> Start Match
            </>
          )}
        </button>
      </div>
    </div>
  )
}
