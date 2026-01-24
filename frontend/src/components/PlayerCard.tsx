import { User } from 'lucide-react'
import type { MatchParticipant } from '../types/domain'

interface PlayerCardProps {
  teamId: 1 | 2
  playerIdx: 1 | 2
  teamName: string
  match: {
    serving_team: number
    server_number: number
    participants: {
      team_1?: MatchParticipant
      team_2?: MatchParticipant
    }
  }
}

export function PlayerCard({
  teamId,
  playerIdx,
  teamName,
  match,
}: PlayerCardProps) {
  const isServingTeam = match.serving_team === teamId

  // Band Logic: The "Band" serves as the permanent marker for the First Server.
  // In our model, Player 1 is ALWAYS the First Server.
  // Swapping the band means swapping the players in the Configuration Panel.
  const hasBand = playerIdx === 1

  // Active Server Logic:
  // Who is holding the ball?
  // If Server 1 -> The player WITH the band.
  // If Server 2 -> The player WITHOUT the band.
  const isActiveServer =
    isServingTeam &&
    ((match.server_number === 1 && hasBand) ||
      (match.server_number === 2 && !hasBand))

  const getPlayerName = (
    team: MatchParticipant | undefined,
    playerKey: 'player_1' | 'player_2',
  ) => {
    // @ts-ignore: Dynamic access to player object
    return (
      team?.[playerKey]?.display_name ||
      (playerKey === 'player_1' ? 'Player 1' : 'Player 2')
    )
  }

  return (
    <div
      className={`
      flex flex-col justify-center p-4 border rounded-xl transition-all h-32 relative
      ${isActiveServer ? 'border-lime-500 bg-lime-500/10 shadow-[0_0_15px_rgba(132,204,22,0.3)]' : 'border-slate-700 bg-slate-800 opacity-60'}
    `}
    >
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

      <div
        className={`flex justify-center items-center gap-2 mb-1 text-xs uppercase ${isActiveServer ? 'text-lime-400 font-bold' : 'text-slate-500'}`}
      >
        <User className="w-3 h-3" /> {teamName}
      </div>
      <div
        className={`text-lg truncate text-center ${isActiveServer ? 'text-white font-black scale-105 transition-transform' : 'text-slate-400 font-medium'}`}
      >
        {getPlayerName(
          teamId === 1 ? match.participants.team_1 : match.participants.team_2,
          playerIdx === 1 ? 'player_1' : 'player_2',
        )}
      </div>
    </div>
  )
}
