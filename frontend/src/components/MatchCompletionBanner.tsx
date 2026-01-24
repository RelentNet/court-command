import { RotateCcw, Save, Trash2, Trophy } from 'lucide-react'
import type { Match } from '../types/domain'

interface MatchCompletionBannerProps {
  match: Match
  readonly?: boolean
  onRematch: () => void
  onSave: () => void
  onDelete: () => void
  isRematchPending: boolean
}

export function MatchCompletionBanner({
  match,
  readonly,
  onRematch,
  onSave,
  onDelete,
  isRematchPending,
}: MatchCompletionBannerProps) {
  const wins1 = match.completed_games.filter(
    (g: Record<string, unknown>) => g.winner === 1,
  ).length
  const wins2 = match.completed_games.filter(
    (g: Record<string, unknown>) => g.winner === 2,
  ).length
  const winnerName =
    wins1 > wins2
      ? (match.participants.team_1?.name ?? 'Team 1')
      : (match.participants.team_2?.name ?? 'Team 2')

  return (
    <div className="mb-6 p-6 border border-lime-500/50 rounded-xl bg-gradient-to-r from-lime-900/40 to-slate-900/40 text-center animate-in slide-in-from-top-4">
      <div className="flex justify-center items-center gap-3 mb-2 text-lime-400">
        <Trophy className="w-8 h-8" />
        <h2 className="font-black text-3xl uppercase tracking-widest">
          Match Complete
        </h2>
        <Trophy className="w-8 h-8" />
      </div>
      <p className="text-slate-300 text-lg">
        Winner: <span className="font-bold text-white">{winnerName}</span>
      </p>

      {!readonly && (
        <div className="gap-4 grid grid-cols-1 md:grid-cols-3 mt-8">
          <button
            onClick={onRematch}
            disabled={isRematchPending}
            className="flex justify-center items-center gap-2 bg-lime-600 hover:bg-lime-500 p-4 rounded-lg font-bold text-white transition-all shadow-lg hover:scale-105 active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
            {isRematchPending ? 'Starting...' : 'Rematch'}
          </button>

          <button
            onClick={onSave}
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
                onDelete()
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
  )
}
