import { RefreshCw, Trophy, User } from 'lucide-react'
import type { Match, MatchParticipant } from '../types/domain'

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
  
  const getPlayerName = (team: MatchParticipant | undefined, playerKey: 'player_1' | 'player_2') => {
    // @ts-ignore: Dynamic access to player object
    return team?.[playerKey]?.display_name || (playerKey === 'player_1' ? 'Player 1' : 'Player 2')
  }

  const renderPlayerBox = (teamId: 1 | 2, playerIdx: 1 | 2, teamName: string) => {
    const isServingTeam = match.serving_team === teamId
    
    // Band Logic: The "Band" serves as the permanent marker for the First Server.
    // In our model, Player 1 is ALWAYS the First Server.
    // Swapping the band means swapping the players in the Configuration Panel.
    const hasBand = playerIdx === 1

    // Active Server Logic:
    // Who is holding the ball?
    // If Server 1 -> The player WITH the band.
    // If Server 2 -> The player WITHOUT the band.
    const isActiveServer = isServingTeam && (
      (match.server_number === 1 && hasBand) || 
      (match.server_number === 2 && !hasBand)
    )

    return (
      <div className={`
        flex flex-col justify-center p-4 border rounded-xl transition-all h-32 relative
        ${isActiveServer ? 'border-lime-500 bg-lime-500/10 shadow-[0_0_15px_rgba(132,204,22,0.3)]' : 'border-slate-700 bg-slate-800 opacity-60'}
      `}>
        {/* Static Band Badge - Always on Player 1 */}
        {hasBand && (
          <div className="top-2 right-2 absolute bg-slate-700 px-2 py-0.5 rounded text-[10px] text-slate-400 uppercase tracking-wider font-bold">
            Band
          </div>
        )}
        
        {/* Active Server Indicator */}
        {isActiveServer && (
          <div className="top-2 left-2 absolute bg-lime-500 px-2 py-0.5 rounded text-[10px] text-slate-900 uppercase tracking-wider font-bold animate-pulse">
            Serving
          </div>
        )}

        <div className={`flex justify-center items-center gap-2 mb-1 text-xs uppercase ${isActiveServer ? 'text-lime-400 font-bold' : 'text-slate-500'}`}>
          <User className="w-3 h-3" /> {teamName}
        </div>
        <div className={`text-lg truncate text-center ${isActiveServer ? 'text-white font-black scale-105 transition-transform' : 'text-slate-400 font-medium'}`}>
          {getPlayerName(teamId === 1 ? match.participants.team_1 : match.participants.team_2, playerIdx === 1 ? 'player_1' : 'player_2')}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Score Display (Big) */}
      <div className="flex items-center gap-px bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
        {/* Team 1 Score */}
        <div className={`flex-1 py-10 text-center transition-colors ${match.serving_team === 1 ? 'bg-lime-500/10' : ''}`}>
          <div className="font-semibold text-slate-400 text-sm uppercase tracking-widest mb-2">
            {match.participants.team_1?.name || match.team_1_name || 'Team 1'}
          </div>
          <div className="font-black text-8xl text-white font-mono leading-none">
            {match.team_1_score}
          </div>
        </div>

        {/* Center Divider / Game Info */}
        <div className="bg-slate-900 px-6 py-8 w-32 text-center shrink-0 border-x border-slate-700">
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter mb-1">Game</div>
          <div className="font-black text-white text-2xl mb-4 leading-none">{match.current_game_num}</div>
          <div className="w-full h-px bg-slate-800 mb-4" />
          <div className="text-slate-500 text-[10px] font-bold uppercase tracking-tighter mb-1">Server</div>
          <div className={`font-black text-2xl ${match.server_number === 2 ? 'text-amber-500' : 'text-lime-500'}`}>
            {match.server_number}
          </div>
        </div>

        {/* Team 2 Score */}
        <div className={`flex-1 py-10 text-center transition-colors ${match.serving_team === 2 ? 'bg-lime-500/10' : ''}`}>
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
          {renderPlayerBox(1, 1, match.participants.team_1?.name || 'Team 1')}
          {renderPlayerBox(1, 2, match.participants.team_1?.name || 'Team 1')}
        </div>

        {/* Team 2 Players */}
        <div className="space-y-4">
          {renderPlayerBox(2, 1, match.participants.team_2?.name || 'Team 2')}
          {renderPlayerBox(2, 2, match.participants.team_2?.name || 'Team 2')}
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
