import { RefreshCw, Trophy } from 'lucide-react'
import type { Match } from '../types/domain'
import { PlayerCard } from './PlayerCard'

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
    <div className="space-y-6">
      {/* Score Display (Big) */}
      <div className="flex items-center gap-px bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
        {/* Team 1 Score */}
        <div
          className={`flex-1 py-10 text-center transition-colors ${match.serving_team === 1 ? 'bg-lime-500/10' : ''}`}
        >
          <div className="font-semibold text-slate-400 text-sm uppercase tracking-widest mb-2">
            {match.participants.team_1?.name || match.team_1_name || 'Team 1'}
          </div>
          <div className="font-black text-8xl text-white font-mono leading-none">
            {match.team_1_score}
          </div>
        </div>

        {/* Center Divider / Game Info */}
        <div className="bg-slate-900 px-6 py-8 w-32 text-center shrink-0 border-x border-slate-700">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter mb-1">
            Game
          </div>
          <div className="font-black text-white text-2xl mb-4 leading-none">
            {match.current_game_num}
          </div>
          <div className="w-full h-px bg-slate-800 mb-4" />
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter mb-1">
            Server
          </div>
          <div
            className={`font-black text-2xl ${match.server_number === 2 ? 'text-amber-500' : 'text-lime-500'}`}
          >
            {match.server_number}
          </div>
        </div>

        {/* Team 2 Score */}
        <div
          className={`flex-1 py-10 text-center transition-colors ${match.serving_team === 2 ? 'bg-lime-500/10' : ''}`}
        >
          <div className="font-semibold text-slate-400 text-sm uppercase tracking-widest mb-2">
            {match.participants.team_2?.name || match.team_2_name || 'Team 2'}
          </div>
          <div className="font-black text-8xl text-white font-mono leading-none">
            {match.team_2_score}
          </div>
        </div>
      </div>

      {/* Player Grid */}
      <div className="gap-4 grid grid-cols-2">
        {/* Team 1 Players */}
        <div className="space-y-4">
          <PlayerCard
            teamId={1}
            playerIdx={1}
            teamName={match.participants.team_1?.name || 'Team 1'}
            match={match}
          />
          <PlayerCard
            teamId={1}
            playerIdx={2}
            teamName={match.participants.team_1?.name || 'Team 1'}
            match={match}
          />
        </div>

        {/* Team 2 Players */}
        <div className="space-y-4">
          <PlayerCard
            teamId={2}
            playerIdx={1}
            teamName={match.participants.team_2?.name || 'Team 2'}
            match={match}
          />
          <PlayerCard
            teamId={2}
            playerIdx={2}
            teamName={match.participants.team_2?.name || 'Team 2'}
            match={match}
          />
        </div>
      </div>

      {/* Unified Action Controls */}
      {!readonly && (
        <div className="flex gap-4 h-28">
          <button
            onClick={onSideOut}
            disabled={isPending}
            className="flex flex-col justify-center items-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-8 rounded-2xl w-1/3 font-bold text-slate-200 shadow-lg transition-all active:scale-95"
          >
            <RefreshCw className="w-8 h-8" />
            <span className="uppercase tracking-widest text-sm">Side Out</span>
          </button>

          <button
            onClick={() => onPoint(match.serving_team || 1)}
            disabled={isPending}
            className="flex flex-col justify-center items-center gap-2 bg-lime-500 hover:bg-lime-400 disabled:opacity-50 shadow-xl shadow-lime-500/20 rounded-2xl w-2/3 font-black text-3xl text-slate-900 uppercase tracking-tighter transition-all active:scale-95"
          >
            <Trophy className="w-10 h-10" />
            Point Scored
          </button>
        </div>
      )}
    </div>
  )
}
