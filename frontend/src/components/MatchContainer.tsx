import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowLeft,
  RotateCcw,
  Save,
  Trash2,
  Trophy,
  Undo,
} from 'lucide-react'
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
  const navigate = useNavigate()
  const wsStatus = useMatchSocket(matchId)

  // 1. Initial Data Fetch
  const {
    data: match,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}`)
      if (!res.ok) throw new Error('Match not found')
      return res.json()
    },
  })

  const courtSlug = match?.court_slug

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

  const rematchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}/rematch`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to create rematch')
      return res.json()
    },
    onSuccess: (newMatch) => {
      // Navigate to the new match
      navigate({
        to: `/courts/${courtSlug}/referee`,
      })
      // Invalidate to ensure court picks up active match change
      queryClient.invalidateQueries()
    },
  })

  const deleteMatchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete match')
    },
    onSuccess: () => {
      navigate({ to: `/courts/${courtSlug}` })
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
  if (error || !match)
    return (
      <div className="flex flex-col justify-center items-center bg-slate-900 min-h-screen text-red-500">
        <AlertTriangle className="mb-4 w-12 h-12" />
        <h2 className="font-bold text-2xl">Failed to load match</h2>
        <Link to="/" className="mt-4 text-blue-400 hover:underline">
          Return Home
        </Link>
      </div>
    )

  // 1. Calculate Score Logic (same as before)
  const isMatchOver = match.status === 'final'

  // 2. Render
  return (
    <div className="relative flex flex-col bg-slate-900 min-h-screen text-white">
      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 pb-24 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          {/* Match Status Banner */}
          {isMatchOver && (
            <div className="mb-6 p-6 border border-lime-500/50 rounded-xl bg-gradient-to-r from-lime-900/40 to-slate-900/40 text-center animate-in slide-in-from-top-4">
              <div className="flex justify-center items-center gap-3 mb-2 text-lime-400">
                <Trophy className="w-8 h-8" />
                <h2 className="font-black text-3xl uppercase tracking-widest">
                  Match Complete
                </h2>
                <Trophy className="w-8 h-8" />
              </div>
              <p className="text-slate-300 text-lg">
                Winner:{' '}
                <span className="font-bold text-white">
                  {(() => {
                    const wins1 = match.completed_games.filter(
                      (g: Record<string, unknown>) => g.winner === 1,
                    ).length
                    const wins2 = match.completed_games.filter(
                      (g: Record<string, unknown>) => g.winner === 2,
                    ).length
                    return wins1 > wins2
                      ? (match.participants?.team_1?.name ?? 'Team 1')
                      : (match.participants?.team_2?.name ?? 'Team 2')
                  })()}
                </span>
              </p>

              {!readonly && (
                <div className="gap-4 grid grid-cols-1 md:grid-cols-3 mt-8">
                  <button
                    onClick={() => rematchMutation.mutate()}
                    disabled={rematchMutation.isPending}
                    className="flex justify-center items-center gap-2 bg-lime-600 hover:bg-lime-500 p-4 rounded-lg font-bold text-white transition-all shadow-lg hover:scale-105 active:scale-95"
                  >
                    <RotateCcw className="w-5 h-5" />
                    {rematchMutation.isPending ? 'Starting...' : 'Rematch'}
                  </button>

                  <button
                    onClick={() => navigate({ to: `/courts/${courtSlug}` })}
                    className="flex justify-center items-center gap-2 bg-slate-700 hover:bg-slate-600 p-4 rounded-lg font-bold text-white transition-all shadow-lg hover:scale-105 active:scale-95"
                  >
                    <Save className="w-5 h-5" />
                    Save & Exit
                  </button>

                  <button
                    onClick={() => {
                      if (
                        confirm(
                          'Are you sure you want to delete this match? This cannot be undone.',
                        )
                      ) {
                        deleteMatchMutation.mutate()
                      }
                    }}
                    className="flex justify-center items-center gap-2 bg-red-900/50 hover:bg-red-800 p-4 border border-red-800/50 rounded-lg font-bold text-red-200 hover:text-white transition-all shadow-lg hover:scale-105 active:scale-95"
                  >
                    <Trash2 className="w-5 h-5" />
                    Delete Match
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Header (Only show in referee mode or if not readonly) */}
          {!readonly && !isMatchOver && (
            <div className="flex justify-between items-center mb-6">
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
          {!readonly && !isMatchOver && (
            <MatchConfigurationPanel match={match} />
          )}

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
              readonly ||
              match.status === 'preparing' ||
              match.status === 'final'
            }
          />

          {/* Debug Info (Only for referee) */}
          {!readonly && match.status !== 'preparing' && !isMatchOver && (
            <div className="gap-6 grid grid-cols-2 mt-6">
              <DebugConsole data={match} />
              <ControlPanel />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
