// web/src/features/scorekeeper/ScorekeeperMatchConsole.tsx
import { useNavigate } from '@tanstack/react-router'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { DisconnectBanner } from '../scoring/DisconnectBanner'
import { MatchScoreboard } from '../scoring/MatchScoreboard'
import { MatchSetup } from '../scoring/MatchSetup'
import { playTick, vibrate } from '../scoring/feedback'
import {
  useConfirmGameOver,
  useConfirmMatchOver,
  useMatch,
  useScorePoint,
  useSideOut,
  useStartMatch,
  useUndo,
} from '../scoring/hooks'
import { useKeyboardShortcuts } from '../scoring/useKeyboardShortcuts'
import { useMatchWebSocket } from '../scoring/useMatchWebSocket'
import { useScoringPrefs } from '../scoring/useScoringPrefs'
import type { ScoringActionResult } from '../scoring/types'

import { useSport } from '../../auth/SportContext'
export interface ScorekeeperMatchConsoleProps {
  publicId: string
}

/**
 * Stripped-down scoring console for casual/scorekeeper use.
 *
 * Differences from the ref console:
 *  - No timeout button (scorekeeper can't manage timeouts)
 *  - No game-over / match-over confirmation prompt; when the engine
 *    reports `game_over_detected` or `match_over_detected` the console
 *    auto-confirms so the scorekeeper never has to stop scoring.
 */
export function ScorekeeperMatchConsole({
  publicId,
}: ScorekeeperMatchConsoleProps) {
  const { sport } = useSport()
  const sportSlug = sport?.slug ?? ''

  const { toast } = useToast()
  const navigate = useNavigate()
  const matchQuery = useMatch(publicId)
  const ws = useMatchWebSocket(publicId)
  const { prefs } = useScoringPrefs()

  const startMatch = useStartMatch()
  const scorePoint = useScorePoint()
  const sideOut = useSideOut()
  const undo = useUndo()
  const confirmGame = useConfirmGameOver()
  const confirmMatch = useConfirmMatchOver()

  const match = matchQuery.data
  const disabled = ws.state !== 'open'

  function feedback(v: 'point' | 'side_out' | 'undo' = 'point') {
    if (prefs.haptic) vibrate(50)
    if (prefs.sound) playTick(v)
  }

  function autoConfirm(res: ScoringActionResult) {
    // Scorekeeper UX: auto-confirm game/match when detected (no prompt)
    if (res.match_over_detected) {
      confirmMatch.mutate(
        { publicId },
        {
          onError: (err) =>
            toast(
              'error',
              err instanceof Error ? err.message : 'Failed to end match',
            ),
        },
      )
    } else if (res.game_over_detected) {
      confirmGame.mutate(
        { publicId },
        {
          onError: (err) =>
            toast(
              'error',
              err instanceof Error ? err.message : 'Failed to end game',
            ),
        },
      )
    }
  }

  function handlePoint(team?: 1 | 2) {
    scorePoint.mutate(
      { publicId, team },
      {
        onSuccess: (res) => {
          feedback('point')
          autoConfirm(res)
        },
        onError: (err) =>
          toast(
            'error',
            err instanceof Error ? err.message : 'Failed to score point',
          ),
      },
    )
  }

  function handleSideOut() {
    sideOut.mutate(
      { publicId },
      {
        onSuccess: (res) => {
          feedback('side_out')
          autoConfirm(res)
        },
        onError: (err) =>
          toast(
            'error',
            err instanceof Error ? err.message : 'Failed to side out',
          ),
      },
    )
  }

  function handleUndo() {
    undo.mutate(
      { publicId },
      {
        onSuccess: () => feedback('undo'),
        onError: (err) =>
          toast(
            'error',
            err instanceof Error ? err.message : 'Failed to undo',
          ),
      },
    )
  }

  useKeyboardShortcuts(
    {
      onPointTeam1: () => {
        if (!match) return
        if (match.scoring_type === 'rally') handlePoint(1)
        else handlePoint(match.serving_team as 1 | 2)
      },
      onPointTeam2: () => {
        if (!match) return
        if (match.scoring_type === 'rally') handlePoint(2)
      },
      onSideOut: () => {
        if (match?.scoring_type === 'side_out') handleSideOut()
      },
      onUndo: handleUndo,
    },
    prefs.keyboard &&
      match?.status === 'in_progress' &&
      !disabled &&
      !scorePoint.isPending &&
      !sideOut.isPending &&
      !undo.isPending &&
      !confirmGame.isPending &&
      !confirmMatch.isPending,
  )

  if (matchQuery.isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (matchQuery.isError || !match) {
    return (
      <div className="p-4 text-(--color-error)">
        Failed to load match.{' '}
        <button
          type="button"
          onClick={() => matchQuery.refetch()}
          className="underline"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen">
      <DisconnectBanner state={ws.state} attempt={ws.attempt} />
      {match.status === 'scheduled' ? (
        <MatchSetup
          match={match}
          pending={startMatch.isPending}
          onBegin={(input) =>
            startMatch.mutate(
              { publicId, ...input },
              {
                onSuccess: () => toast('success', 'Match started'),
                onError: (err) =>
                  toast(
                    'error',
                    err instanceof Error
                      ? err.message
                      : 'Failed to start match',
                  ),
              },
            )
          }
          onCancel={() => navigate({ to: '/$sport/scorekeeper', params: { sport: sportSlug } })}
        />
      ) : (
        <div className="p-3 md:p-4 flex-1">
          <MatchScoreboard
            match={match}
            mode="scorekeeper"
            disabled={disabled}
            pending={
              scorePoint.isPending ||
              sideOut.isPending ||
              undo.isPending ||
              confirmGame.isPending ||
              confirmMatch.isPending
            }
            onPoint={handlePoint}
            onSideOut={handleSideOut}
            onUndo={handleUndo}
            onTimeout={() => {
              /* scorekeeper has no timeout button — no-op */
            }}
          />
        </div>
      )}
    </div>
  )
}
