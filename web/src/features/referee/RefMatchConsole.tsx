// web/src/features/referee/RefMatchConsole.tsx
import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Skeleton } from '../../components/Skeleton'
import { useToast } from '../../components/Toast'
import { useAuth } from '../../auth/useAuth'
import { DisconnectBanner } from '../scoring/DisconnectBanner'
import { GameOverConfirmModal } from '../scoring/GameOverConfirmModal'
import { MatchCompleteBanner } from '../scoring/MatchCompleteBanner'
import { MatchScoreboard } from '../scoring/MatchScoreboard'
import { MatchSetup } from '../scoring/MatchSetup'
import { ScoreOverrideModal } from '../scoring/ScoreOverrideModal'
import { playTick, vibrate } from '../scoring/feedback'
import {
  useCallTimeout,
  useConfirmGameOver,
  useConfirmMatchOver,
  useMatch,
  usePauseMatch,
  useResumeMatch,
  useScorePoint,
  useSideOut,
  useStartMatch,
  useUndo,
} from '../scoring/hooks'
import { useKeyboardShortcuts } from '../scoring/useKeyboardShortcuts'
import { useMatchWebSocket } from '../scoring/useMatchWebSocket'
import { useScoringPrefs } from '../scoring/useScoringPrefs'
import type { ScoringActionResult } from '../scoring/types'

export interface RefMatchConsoleProps {
  publicId: string
}

// Roles that can perform score overrides. The backend currently only recognises
// 'platform_admin' (see api/db/migrations/00001_create_users.sql), but the
// product direction calls for future 'tournament_director' and 'head_referee'
// roles. Gate on all three so the UI is forward-compatible without requiring a
// backend migration for the frontend to ship.
const PRIVILEGED_ROLES = new Set([
  'platform_admin',
  'tournament_director',
  'head_referee',
])

export function RefMatchConsole({ publicId }: RefMatchConsoleProps) {
  const { toast } = useToast()
  const navigate = useNavigate()
  const auth = useAuth()
  const matchQuery = useMatch(publicId)
  const ws = useMatchWebSocket(publicId)
  const { prefs } = useScoringPrefs()

  const startMatch = useStartMatch()
  const scorePoint = useScorePoint()
  const sideOut = useSideOut()
  const undo = useUndo()
  const callTimeout = useCallTimeout()
  const confirmGameOver = useConfirmGameOver()
  const confirmMatchOver = useConfirmMatchOver()
  const pauseMatch = usePauseMatch()
  const resumeMatch = useResumeMatch()

  const [gameOverPrompt, setGameOverPrompt] = useState(false)
  const [matchOverPrompt, setMatchOverPrompt] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const match = matchQuery.data
  const disabled = ws.state !== 'open'
  const canOverride = !!auth.user && PRIVILEGED_ROLES.has(auth.user.role)

  function feedback(variant: 'point' | 'side_out' | 'undo' | 'error' = 'point') {
    if (prefs.haptic) vibrate(50)
    if (prefs.sound) playTick(variant)
  }

  function handleResult(res: ScoringActionResult) {
    if (res.match_over_detected) setMatchOverPrompt(true)
    else if (res.game_over_detected) setGameOverPrompt(true)
  }

  function handlePoint(team?: 1 | 2) {
    if (!match) return
    scorePoint.mutate(
      { publicId, team },
      {
        onSuccess: (res) => {
          feedback('point')
          handleResult(res)
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
    if (!match) return
    sideOut.mutate(
      { publicId },
      {
        onSuccess: (res) => {
          feedback('side_out')
          handleResult(res)
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
    if (!match) return
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

  function handleTimeout(team: 1 | 2) {
    if (!match) return
    callTimeout.mutate(
      { publicId, team },
      {
        onSuccess: () => toast('info', `Timeout for Team ${team}`),
        onError: (err) =>
          toast(
            'error',
            err instanceof Error ? err.message : 'Failed to call timeout',
          ),
      },
    )
  }

  function handlePauseToggle() {
    if (!match) return
    if (match.is_paused) {
      resumeMatch.mutate(
        { publicId },
        {
          onSuccess: () => toast('success', 'Match resumed'),
          onError: (err) =>
            toast(
              'error',
              err instanceof Error ? err.message : 'Failed to resume match',
            ),
        },
      )
    } else {
      pauseMatch.mutate(
        { publicId },
        {
          onSuccess: () => toast('success', 'Match paused'),
          onError: (err) =>
            toast(
              'error',
              err instanceof Error ? err.message : 'Failed to pause match',
            ),
        },
      )
    }
  }

  // Side-out: '1' triggers POINT (no team specified). Rally: '1' = team 1, '2' = team 2.
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
        if (!match) return
        if (match.scoring_type === 'side_out') handleSideOut()
      },
      onUndo: handleUndo,
      onTimeout: () => {
        if (match?.serving_team) handleTimeout(match.serving_team)
      },
      onEscape: () => {
        setGameOverPrompt(false)
        setMatchOverPrompt(false)
        setMenuOpen(false)
      },
    },
    prefs.keyboard && match?.status === 'in_progress' && !disabled,
  )

  if (matchQuery.isLoading) {
    return (
      <div className="p-4">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-32 mb-2" />
        <Skeleton className="h-32 mb-2" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (matchQuery.isError || !match) {
    return (
      <div className="p-4 text-red-500" role="alert">
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
          onCancel={() => navigate({ to: '/ref' })}
        />
      ) : match.status === 'completed' ? (
        <div className="p-3 md:p-4 flex-1 max-w-md mx-auto w-full">
          <MatchCompleteBanner
            match={match}
            onBackToCourts={() => navigate({ to: '/ref' })}
          />
        </div>
      ) : (
        <div className="p-3 md:p-4 flex-1">
          <MatchScoreboard
            match={match}
            mode="ref"
            disabled={disabled}
            pending={
              scorePoint.isPending ||
              sideOut.isPending ||
              undo.isPending ||
              callTimeout.isPending
            }
            onPoint={handlePoint}
            onSideOut={handleSideOut}
            onUndo={handleUndo}
            onTimeout={handleTimeout}
            onMenu={() => setMenuOpen((v) => !v)}
          />
        </div>
      )}

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="fixed top-16 right-4 z-30 w-56 rounded-md border border-(--color-border) bg-(--color-bg-secondary) shadow-lg p-1"
          >
            {canOverride && (
              <button
                type="button"
                role="menuitem"
                className="block w-full text-left px-3 py-2 hover:bg-(--color-bg-hover) rounded text-sm text-(--color-text-primary)"
                onClick={() => {
                  setMenuOpen(false)
                  setOverrideOpen(true)
                }}
              >
                Override Score
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="block w-full text-left px-3 py-2 hover:bg-(--color-bg-hover) rounded text-sm text-(--color-text-primary)"
              disabled={pauseMatch.isPending || resumeMatch.isPending}
              onClick={() => {
                setMenuOpen(false)
                handlePauseToggle()
              }}
            >
              {match.is_paused ? 'Resume Match' : 'Pause Match'}
            </button>
            <Link
              role="menuitem"
              to="/settings/scoring"
              className="block px-3 py-2 hover:bg-(--color-bg-hover) rounded text-sm text-(--color-text-primary)"
              onClick={() => setMenuOpen(false)}
            >
              Scoring Settings
            </Link>
          </div>
        </>
      )}

      <GameOverConfirmModal
        open={gameOverPrompt}
        match={match}
        pending={confirmGameOver.isPending}
        onConfirm={() =>
          confirmGameOver.mutate(
            { publicId },
            {
              onSuccess: () => {
                setGameOverPrompt(false)
                toast('success', 'Game ended')
              },
              onError: (err) =>
                toast(
                  'error',
                  err instanceof Error ? err.message : 'Failed to end game',
                ),
            },
          )
        }
        onContinue={() => setGameOverPrompt(false)}
      />

      <GameOverConfirmModal
        open={matchOverPrompt}
        match={match}
        kind="match"
        pending={confirmMatchOver.isPending}
        onConfirm={() =>
          confirmMatchOver.mutate(
            { publicId },
            {
              onSuccess: () => {
                setMatchOverPrompt(false)
                toast('success', 'Match completed')
              },
              onError: (err) =>
                toast(
                  'error',
                  err instanceof Error ? err.message : 'Failed to end match',
                ),
            },
          )
        }
        onContinue={() => setMatchOverPrompt(false)}
      />

      {canOverride && (
        <ScoreOverrideModal
          open={overrideOpen}
          onClose={() => setOverrideOpen(false)}
          match={match}
        />
      )}
    </div>
  )
}
