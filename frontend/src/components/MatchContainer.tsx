import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'
import config from '../config'
import { useWebSocket } from '../hooks/useWebSocket'
import { Scoreboard } from './Scoreboard'
import { DebugConsole } from './DebugConsole'
import { MatchConfigurationPanel } from './MatchConfigurationPanel'
import { MatchCompletionBanner } from './MatchCompletionBanner'
import { MatchRefereeHeader } from './MatchRefereeHeader'
import { ActionButtons } from './ActionButtons'

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
  
  const wsStatus = useWebSocket({
    url: matchId ? `${config.WS_URL}/ws/matches/${matchId}` : '',
    queryKey: ['match', matchId]
  })

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
    mutationFn: async (
      action: 'point' | 'sideout' | 'undo' | 'reset' | 'end-game' | 'end-match',
    ) => {
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

  const rematchMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${config.API_URL}/matches/${matchId}/rematch`, {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to create rematch')
      return res.json()
    },
    onSuccess: () => {
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

  const isMatchOver = match.status === 'final'

  return (
    <div className="relative flex flex-col bg-slate-900 min-h-screen text-white">
      {/* MAIN CONTENT */}
      <main className="flex-1 p-4 pb-24 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
          {/* Match Status Banner */}
          {isMatchOver && (
            <MatchCompletionBanner
              match={match}
              readonly={readonly}
              onRematch={() => rematchMutation.mutate()}
              onSave={() => navigate({ to: `/courts/${courtSlug}` })}
              onDelete={() => deleteMatchMutation.mutate()}
              isRematchPending={rematchMutation.isPending}
            />
          )}

          {/* Header (Only show in referee mode or if not readonly) */}
          {!readonly && !isMatchOver && (
            <MatchRefereeHeader
              match={match}
              wsStatus={wsStatus}
              actions={
                <ActionButtons
                  onReset={handleReset}
                  onDelete={() => deleteMatchMutation.mutate()}
                  onEndGame={() => actionMutation.mutate('end-game')}
                  onEndMatch={() => actionMutation.mutate('end-match')}
                />
              }
            />
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
            onUndo={() => actionMutation.mutate('undo')}
            isPending={actionMutation.isPending}
            readonly={
              readonly ||
              match.status === 'preparing' ||
              match.status === 'final'
            }
          />

          {/* Debug Info (Only for referee) */}
          {!readonly && match.status !== 'preparing' && !isMatchOver && (
            <div className="mt-6">
              <DebugConsole data={match} />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}