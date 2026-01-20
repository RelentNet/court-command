import { createFileRoute } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, RefreshCw, Undo } from 'lucide-react'

export const Route = createFileRoute('/match/$matchId')({
  component: MatchDebugConsole,
})

const API_URL =
  import.meta.env.VITE_API_URL || 'https://api.tickertemplate.relentnet.app'

function MatchDebugConsole() {
  const { matchId } = Route.useParams()
  const queryClient = useQueryClient()
  const [wsStatus, setWsStatus] = useState<'CONNECTING' | 'OPEN' | 'CLOSED'>(
    'CLOSED',
  )

  // 1. Initial Data Fetch
  const { data: match, isLoading } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      return res.json()
    },
  })

  // 2. WebSocket Subscription for Real-time Updates
  useEffect(() => {
    const wsUrl = API_URL.replace(/^http/, 'ws') + `/ws/matches/${matchId}`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => setWsStatus('OPEN')
    ws.onclose = () => setWsStatus('CLOSED')

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data)
      // Instant update of React Query cache
      queryClient.setQueryData(['match', matchId], update)
    }

    return () => {
      ws.close()
    }
  }, [matchId, queryClient])

  // 3. Actions
  const actionMutation = useMutation({
    mutationFn: async (action: string) => {
      await fetch(`${API_URL}/api/matches/${matchId}/${action}`, {
        method: 'POST',
      })
    },
  })

  if (isLoading) return <div className="p-8 text-white">Loading Match...</div>
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

        {/* Scoreboard Preview */}
        <div className="relative gap-4 grid grid-cols-2 bg-slate-800 p-8 border border-slate-700 rounded-2xl overflow-hidden">
          {/* Active Server Indicator */}
          <div
            className={`absolute top-0 bottom-0 w-2 bg-lime-500 transition-all duration-300 ${match.serving_team === 1 ? 'left-0' : 'right-0'}`}
          />

          {/* Team 1 */}
          <div
            className={`text-center space-y-2 p-4 rounded-xl ${match.serving_team === 1 ? 'bg-slate-700/50' : ''}`}
          >
            <h2 className="font-semibold text-slate-300 text-xl">
              {match.team_1_name}
            </h2>
            <div className="font-mono font-bold text-6xl">
              {match.team_1_score}
            </div>
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => actionMutation.mutate('point')}
                disabled={match.serving_team !== 1}
                className="bg-lime-600 hover:bg-lime-500 disabled:opacity-20 px-6 py-3 rounded-lg font-bold transition-all disabled:cursor-not-allowed"
              >
                + Point
              </button>
            </div>
          </div>

          {/* Team 2 */}
          <div
            className={`text-center space-y-2 p-4 rounded-xl ${match.serving_team === 2 ? 'bg-slate-700/50' : ''}`}
          >
            <h2 className="font-semibold text-slate-300 text-xl">
              {match.team_2_name}
            </h2>
            <div className="font-mono font-bold text-6xl">
              {match.team_2_score}
            </div>
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => actionMutation.mutate('point')}
                disabled={match.serving_team !== 2}
                className="bg-lime-600 hover:bg-lime-500 disabled:opacity-20 px-6 py-3 rounded-lg font-bold transition-all disabled:cursor-not-allowed"
              >
                + Point
              </button>
            </div>
          </div>

          {/* Center Info */}
          <div className="top-1/2 left-1/2 absolute flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2">
            <div className="bg-slate-900 px-4 py-2 border border-slate-600 rounded-full font-mono text-sm">
              Server: {match.server_number}
            </div>
            <button
              onClick={() => actionMutation.mutate('sideout')}
              className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg font-bold text-sm"
            >
              <RefreshCw className="w-4 h-4" /> Side Out
            </button>
          </div>
        </div>

        {/* Debug Info */}
        <div className="gap-6 grid grid-cols-2">
          <div className="bg-slate-900 p-4 border border-slate-800 rounded-lg h-64 overflow-auto font-mono text-xs">
            <h3 className="mb-2 text-slate-500 uppercase">Raw State</h3>
            <pre className="text-lime-300">
              {JSON.stringify(match, null, 2)}
            </pre>
          </div>

          <div className="bg-slate-900 p-4 border border-slate-800 rounded-lg">
            <h3 className="mb-2 text-slate-500 uppercase">Controls</h3>
            <div className="gap-2 grid grid-cols-2">
              {/* Placeholders for future features */}
              <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
                Timeout (T1)
              </button>
              <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
                Timeout (T2)
              </button>
              <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
                Warning
              </button>
              <button className="bg-slate-800 hover:bg-slate-700 p-2 rounded text-slate-400 text-sm">
                Technical
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
