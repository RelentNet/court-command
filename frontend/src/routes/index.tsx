import { createFileRoute, useRouter } from '@tanstack/react-router'
import {
  useMutation,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query'
import { useState } from 'react'

const queryClient = new QueryClient()

export const Route = createFileRoute('/')({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  ),
})

function App() {
  const router = useRouter()
  const [team1, setTeam1] = useState('D. Johns / A. Johns')
  const [team2, setTeam2] = useState('M. Wright / R. Newman')
  const [court, setCourt] = useState('Grandstand')

  // Create Match Mutation
  const createMatch = useMutation({
    mutationFn: async () => {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000'
      const res = await fetch(`${apiUrl}/api/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          court_name: court,
          team_1_name: team1,
          team_2_name: team2,
          // Defaults
          best_of_games: 3,
          start_on_server_2: false 
        }),
      })
      if (!res.ok) throw new Error('Failed to create match')
      return res.json()
    },
    onSuccess: (data) => {
      // Navigate to the debug console
      router.navigate({ to: `/match/${data.public_id}` })
    },
  })

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 rounded-xl shadow-2xl p-8 border border-slate-700">
        <h1 className="text-3xl font-bold bg-linear-to-r from-lime-400 to-emerald-500 bg-clip-text text-transparent mb-8 text-center">
          Match Setup
        </h1>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 uppercase mb-1">Court Name</label>
            <input 
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-lime-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase mb-1">Team 1 Name</label>
            <input 
              value={team1}
              onChange={(e) => setTeam1(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-lime-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 uppercase mb-1">Team 2 Name</label>
            <input 
              value={team2}
              onChange={(e) => setTeam2(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white focus:border-lime-500 outline-none transition-colors"
            />
          </div>

          <button 
            onClick={() => createMatch.mutate()}
            disabled={createMatch.isPending}
            className="w-full py-3 mt-4 bg-lime-500 hover:bg-lime-400 text-slate-900 font-bold rounded-lg transition-colors flex justify-center items-center"
          >
            {createMatch.isPending ? 'Creating...' : 'Start Match'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App