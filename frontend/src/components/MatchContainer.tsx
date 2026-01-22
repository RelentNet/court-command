import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Trophy, Undo } from 'lucide-react'
import config from '../config'
import { useMatchSocket } from '../hooks/useMatchSocket'
import { Scoreboard } from './Scoreboard'
import { ControlPanel } from './ControlPanel'
import { DebugConsole } from './DebugConsole'
import { MatchConfigurationPanel } from './MatchConfigurationPanel'

interface MatchContainerProps {
  matchId: string
  readonly?: boolean // If true, hide controls (for scoreboard view)
}

export function MatchContainer({
  matchId,
  readonly = false,
}: MatchContainerProps) {
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
    mutationFn: async (action: 'point' | 'sideout' | 'undo' | 'reset') => {
      const res = await fetch(
        `${config.API_URL}/matches/${matchId}/${action}`,
        {
          method: 'POST',
        },
      )
      if (!res.ok) throw new Error('Action failed')
      return res.json()
    },
    onSuccess: (updatedMatch) => {
      queryClient.setQueryData(['match', matchId], updatedMatch)
    },
  })

  const handleReset = () => {
    if (
      window.confirm(
        'Are you sure you want to RESET this match? This will clear all scores and game history.',
      )
    ) {
      actionMutation.mutate('reset')
    }
  }

  if (isLoading) return <div className="p-8 text-white">Loading match...</div>
  if (!match) return <div className="p-8 text-red-500">Match not found</div>

  return (
    <div className="bg-slate-900 p-6 min-h-screen text-white">
      <div className="space-y-6 mx-auto max-w-4xl">
        {/* Header (Only show in referee mode or if not readonly) */}
        {!readonly && (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <a
                href={match.court_slug ? `/courts/${match.court_slug}` : '/'}
                className="hover:bg-slate-800 p-2 rounded-full transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </a>
              <div>
                <h1 className="font-bold text-2xl">
                  {match.court_slug || 'Quick Match'}
                </h1>
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <span
                    className={`w-2 h-2 rounded-full ${wsStatus === 'OPEN' ? 'bg-green-500' : 'bg-red-500'}`}
                  />
                  WS: {wsStatus}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => actionMutation.mutate('undo')}
                className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 px-4 py-2 rounded-lg font-bold"
              >
                <Undo className="w-4 h-4" /> Undo
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-500 px-4 py-2 rounded-lg font-bold"
              >
                Reset Match
              </button>
            </div>
          </div>
        )}

        {/* Configuration Panel (Referee Only) */}
        {!readonly && <MatchConfigurationPanel match={match} />}

        {/* Components */}
        <Scoreboard
          match={match}
          onPoint={
            readonly ||
            match.status === 'preparing' ||
            match.status === 'final'
              ? () => {}
              : () => actionMutation.mutate('point')
          }
          onSideOut={
            readonly ||
            match.status === 'preparing' ||
            match.status === 'final'
              ? () => {}
              : () => actionMutation.mutate('sideout')
          }
          isPending={actionMutation.isPending}
          readonly={
            readonly || match.status === 'preparing' || match.status === 'final'
          }
        />

        {/* Final Match Banner */}
        {!readonly && match.status === 'final' && (
          <div className="bg-lime-600 p-8 rounded-2xl text-center shadow-2xl animate-in zoom-in-95 duration-300">
            <Trophy className="mx-auto mb-4 w-16 h-16 text-white" />
            <h2 className="mb-2 font-black text-4xl text-white uppercase tracking-tighter">
              Match Complete
            </h2>
            <p className="mb-6 font-bold text-lime-100 text-xl">
              Winner:{' '}
              {(() => {
                const wins1 = match.completed_games.filter(
                  (g: any) => g.winner === 1,
                ).length
                const wins2 = match.completed_games.filter(
                  (g: any) => g.winner === 2,
                ).length
                return wins1 > wins2
                  ? match.participants.team_1?.name || 'Team 1'
                  : match.participants.team_2?.name || 'Team 2'
              })()}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={handleReset}
                className="bg-white hover:bg-slate-100 px-8 py-3 rounded-xl font-bold text-lime-700 transition-all"
              >
                Reset & New Match
              </button>
              <a
                href={match.court_slug ? `/courts/${match.court_slug}` : '/'}
                className="bg-lime-800/50 hover:bg-lime-800 px-8 py-3 rounded-xl font-bold text-white transition-all"
              >
                Return to Court
              </a>
            </div>
          </div>
        )}

        {/* Debug Info (Only for referee) */}
        {!readonly && match.status !== 'preparing' && (
          <div className="gap-6 grid grid-cols-2">
            <DebugConsole data={match} />
            <ControlPanel />
          </div>
        )}
      </div>
    </div>
  )
}
