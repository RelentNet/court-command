import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Undo } from 'lucide-react'
import config from '../config'
import { useMatchSocket } from '../hooks/useMatchSocket'
import { Scoreboard } from '../components/Scoreboard'
import { ControlPanel } from '../components/ControlPanel'
import { DebugConsole } from '../components/DebugConsole'

export const Route = createFileRoute('/match/$matchId')({
  component: MatchDebugConsole,
})

function MatchDebugConsole() {
  const { matchId } = Route.useParams()
  const queryClient = useQueryClient()
  const wsStatus = useMatchSocket(matchId)

  // 1. Initial Data Fetch
  const { data: match, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      return res.json()
    },
  })

  // 2. Optimistic Mutations
  const actionMutation = useMutation({
    mutationFn: async (action: 'point' | 'sideout' | 'undo') => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}/${action}`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Action failed')
      return res.json()
    },
    onSuccess: (updatedMatch) => {
      queryClient.setQueryData(['match', matchId], updatedMatch)
    },
  })

  if (isLoading) return <div className="p-8 text-white">Loading match...</div>
  if (!match) return <div className="p-8 text-red-500">Match not found</div>

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-6 mx-auto max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <a
              href="/"
              className="hover:bg-slate-800 p-2 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </a>
            <div>
              <h1 className="font-bold text-2xl">{match.court_name}</h1>
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <span
                  className={`w-2 h-2 rounded-full ${wsStatus === 'OPEN' ? 'bg-green-500' : 'bg-red-500'}`}
                />
                WS: {wsStatus}
              </div>
            </div>
          </div>
          <button
            onClick={() => actionMutation.mutate('undo')}
            className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-lg font-bold"
          >
            <Undo className="w-4 h-4" /> Undo
          </button>
        </div>

        {/* Components */}
        <Scoreboard 
          match={match} 
          onPoint={() => actionMutation.mutate('point')}
          onSideOut={() => actionMutation.mutate('sideout')}
          isPending={actionMutation.isPending}
        />

        {/* Debug Info */}
        <div className="gap-6 grid grid-cols-2">
          <DebugConsole data={match} />
          <ControlPanel />
        </div>
      </div>
    </div>
  )
}