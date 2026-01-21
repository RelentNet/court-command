import { RefreshCw } from 'lucide-react'
import type { Match } from '../types/domain'

interface ScoreboardProps {
  match: Match
  onPoint: (team: number) => void
  onSideOut: () => void
  isPending: boolean
  readonly?: boolean
}

export function Scoreboard({
  match,
  onPoint,
  onSideOut,
  isPending,
  readonly = false,
}: ScoreboardProps) {
  return (
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
          {match.participants.team_1?.name || match.team_1_name || 'Team 1'}
        </h2>
        <div className="font-mono font-bold text-6xl">{match.team_1_score}</div>
        {!readonly && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => onPoint(1)}
              disabled={match.serving_team !== 1 || isPending}
              className="bg-lime-600 hover:bg-lime-500 disabled:opacity-20 px-6 py-3 rounded-lg font-bold transition-all disabled:cursor-not-allowed"
            >
              + Point
            </button>
          </div>
        )}
      </div>

      {/* Team 2 */}
      <div
        className={`text-center space-y-2 p-4 rounded-xl ${match.serving_team === 2 ? 'bg-slate-700/50' : ''}`}
      >
        <h2 className="font-semibold text-slate-300 text-xl">
          {match.participants.team_2?.name || match.team_2_name || 'Team 2'}
        </h2>
        <div className="font-mono font-bold text-6xl">{match.team_2_score}</div>
        {!readonly && (
          <div className="flex justify-center gap-2 mt-4">
            <button
              onClick={() => onPoint(2)}
              disabled={match.serving_team !== 2 || isPending}
              className="bg-lime-600 hover:bg-lime-500 disabled:opacity-20 px-6 py-3 rounded-lg font-bold transition-all disabled:cursor-not-allowed"
            >
              + Point
            </button>
          </div>
        )}
      </div>

      {/* Center Info */}
      <div className="top-1/2 left-1/2 absolute flex flex-col items-center gap-2 -translate-x-1/2 -translate-y-1/2">
        <div className="bg-slate-900 px-4 py-2 border border-slate-600 rounded-full font-mono text-sm">
          Server: {match.server_number}
        </div>
        {!readonly && (
          <button
            onClick={onSideOut}
            disabled={isPending}
            className="flex items-center gap-2 bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg font-bold text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Side Out
          </button>
        )}
      </div>
    </div>
  )
}
