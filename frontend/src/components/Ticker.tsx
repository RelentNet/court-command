import type { Match } from '../types/domain'

interface TickerProps {
  match: Match
}

export default function Ticker({ match }: TickerProps) {
  const getTeamName = (teamId: 1 | 2) => {
    const p =
      teamId === 1 ? match.participants.team_1 : match.participants.team_2
    return (
      p?.name ||
      (teamId === 1 ? match.team_1_name : match.team_2_name) ||
      `Team ${teamId}`
    )
  }

  const getPlayerNames = (teamId: 1 | 2) => {
    const p =
      teamId === 1 ? match.participants.team_1 : match.participants.team_2
    // @ts-ignore: Dynamic access
    const p1 = p?.player_1?.display_name || 'Player 1'
    // @ts-ignore: Dynamic access
    const p2 = p?.player_2?.display_name || 'Player 2'
    return `${p1} & ${p2}`
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase()
  }

  const team1Name = getTeamName(1)
  const team2Name = getTeamName(2)

  return (
    <div className="relative w-135 h-45 bg-red-500 overflow-hidden shrink-0 flex items-center justify-center flex-col">
      {/* Header bar */}
      <div className="bg-[#b3b3b3] px-4 py-1 font-bold text-[#c9062a] uppercase text-sm text-center truncate shrink-0 w-full">
        (league_name) - (tournament_name)
      </div>

      {/* Match body */}
      <div className="flex items-center justify-between size-full">
        {/* Association logo */}
        <div className="bg-white h-full aspect-square border-r border-white">
          <img
            src="/wilson.webp"
            alt="Global Padel Association"
            className="object-contain z-10 size-30 pointer-events-none select-none"
          />
        </div>

        {/* Teams */}
        <div className="flex flex-col divide-y bg-[#636363] divide-white min-w-0 text-white size-full">
          {/* Team 1 */}
          <div className="flex flex-1">
            <div className="flex justify-center items-center border-white border-r aspect-square">
              <img
                src={`https://placehold.co/60x60?text=${getInitials(team1Name)}`}
                alt={`${team1Name} logo`}
                className="aspect-square size-full"
              />
            </div>
            <div className="flex flex-col flex-1 h-full justify-center pr-6 pl-2 min-w-0">
              <span className="font-bold text-lg">{team1Name}</span>
              <span className="font-bold text-sm truncate">
                {getPlayerNames(1)}
              </span>
            </div>
            <div className="flex justify-center items-center bg-[#0E8044] border-white border-x aspect-square font-bold text-4xl">
              {match.team_1_score}
            </div>
          </div>

          {/* Team 2 */}
          <div className="flex flex-1">
            <div className="flex justify-center items-center border-white border-r aspect-square">
              <img
                src={`https://placehold.co/60x60?text=${getInitials(team2Name)}`}
                alt={`${team2Name} logo`}
                className="aspect-square size-full"
              />
            </div>
            <div className="flex flex-col flex-1 h-full justify-center pr-6 pl-2 min-w-0">
              <span className="font-bold text-lg">{team2Name}</span>
              <span className="font-bold text-sm truncate">
                {getPlayerNames(2)}
              </span>
            </div>
            <div className="flex justify-center items-center bg-[#0E8044] border-white border-x aspect-square font-bold text-4xl shrink-0">
              {match.team_2_score}
            </div>
          </div>
        </div>
      </div>
      {/* Footer bar */}
      <div className="bg-[#b3b3b3] px-4 py-1 font-bold text-[#c9062a] uppercase text-sm text-center truncate shrink-0 w-full">
        (extra_info) - (series_length) - (match_status)
      </div>
    </div>
  )
}
