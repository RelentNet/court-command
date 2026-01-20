import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import config from '../config'

export const Route = createFileRoute('/')({
  component: App,
})

function App() {
  const router = useRouter()
  const [court, setCourt] = useState('Center Court')
  const [team1, setTeam1] = useState('Team A')
  const [team2, setTeam2] = useState('Team B')

  // Create Match Mutation
  const createMatch = useMutation({
    mutationFn: async () => {
      console.log('Creating match with:', { court, team1, team2, apiUrl: config.API_URL })
      const res = await fetch(`${config.API_URL}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          court_name: court,
          team_1_name: team1,
          team_2_name: team2,
          // Defaults
          best_of_games: 3,
          start_on_server_2: false,
        }),
      })
      if (!res.ok) throw new Error('Failed to create match')
      return res.json()
    },
    onSuccess: (data) => {
      console.log('Match Created Response:', data)
      if (!data.public_id) {
        console.error('Missing public_id in response:', data)
        alert('Error: Match created but ID is missing. See console.')
        return
      }
      // Navigate to the debug console
      router.navigate({
        to: '/match/$matchId',
        params: { matchId: data.public_id },
      })
    },
  })

  return (
    <div className="flex flex-col justify-center items-center bg-slate-900 p-4 min-h-screen text-white">
      <div className="bg-slate-800 shadow-2xl p-8 border border-slate-700 rounded-xl w-full max-w-md">
        <h1 className="bg-clip-text bg-linear-to-r from-lime-400 to-emerald-500 mb-8 font-bold text-transparent text-3xl text-center">
          Match Setup
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block mb-1 text-slate-400 text-xs uppercase">
              Court Name
            </label>
            <input
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              className="bg-slate-900 p-2 border border-slate-700 focus:border-lime-500 rounded outline-none w-full text-white transition-colors"
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-400 text-xs uppercase">
              Team 1 Name
            </label>
            <input
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
              className="bg-slate-900 p-2 border border-slate-700 focus:border-lime-500 rounded outline-none w-full text-white transition-colors"
            />
          </div>

          <div>
            <label className="block mb-1 text-slate-400 text-xs uppercase">
              Team 2 Name
            </label>
            <input
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
              className="bg-slate-900 p-2 border border-slate-700 focus:border-lime-500 rounded outline-none w-full text-white transition-colors"
            />
          </div>

          <button
            onClick={() => createMatch.mutate()}
            disabled={createMatch.isPending}
            className="flex justify-center items-center bg-lime-500 hover:bg-lime-400 mt-4 py-3 rounded-lg w-full font-bold text-slate-900 transition-colors"
          >
            {createMatch.isPending ? 'Creating...' : 'Start Match'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
