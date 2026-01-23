import type { Match } from '../types/domain'

interface TickerProps {
  match: Match
}

export default function Ticker({ match }: TickerProps) {
  const getTeamName = (teamId: 1 | 2) => {
    const p = teamId === 1 ? match.participants.team_1 : match.participants.team_2
    return p?.name || (teamId === 1 ? match.team_1_name : match.team_2_name) || `Team ${teamId}`
  }

  const getPlayerNames = (teamId: 1 | 2) => {
    const p = teamId === 1 ? match.participants.team_1 : match.participants.team_2
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
    <div className="relative mx-auto px-4 max-w-300">
      <div className="inline-grid relative grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] pt-10 pl-28 align-top">
        {/* Association logo */}
        <img
          src="https://placehold.co/300x300?text=GPA"
          alt="Global Padel Association"
          className="-bottom-4 -left-15 z-10 absolute w-75 h-auto pointer-events-none select-none"
        />

        {/* Header bar */}
        <div className="col-span-2 col-start-1 bg-[#001b3f] px-4 py-1 font-bold text-white text-sm text-end truncate">
          Global Padel Association - Nebula Padel Open 2026
        </div>

        {/* Match body */}
        <div className="grid grid-cols-[3.75rem_minmax(0,1fr)_3.75rem] col-span-3 col-start-1 w-full">
          {/* Left band */}
          <div className="bg-white h-full aspect-square" />

          {/* Teams */}
          <div className="flex flex-col divide-y divide-[#001b3f] min-w-0">
            {/* Team 1 */}
            <div className="flex bg-white text-black">
              <div className="flex justify-center items-center bg-white ml-18 border-[#001b3f] border-r h-15 aspect-square shrink-0">
                <img
                  src={`https://placehold.co/60x60?text=${getInitials(team1Name)}`}
                  alt={`${team1Name} logo`}
                  className="p-1 h-full object-contain"
                />
              </div>
              <div className="flex flex-col flex-1 justify-center pr-6 pl-2 min-w-0">
                <span className="font-bold">{team1Name}</span>
                <span className="font-bold truncate">
                  {getPlayerNames(1)}
                </span>
              </div>
              <div className="flex justify-center items-center bg-[#78bce3] border-[#001b3f] border-x h-15 aspect-square font-bold text-4xl shrink-0">
                {match.team_1_score}
              </div>
            </div>

            {/* Team 2 */}
            <div className="flex bg-white text-black">
              <div className="flex justify-center items-center bg-white ml-18 border-[#001b3f] border-r h-15 aspect-square shrink-0">
                <img
                  src={`https://placehold.co/60x60?text=${getInitials(team2Name)}`}
                  alt={`${team2Name} logo`}
                  className="p-1 h-full object-contain"
                />
              </div>
              <div className="flex flex-col flex-1 justify-center pr-6 pl-2 min-w-0">
                <span className="font-bold">{team2Name}</span>
                <span className="font-bold truncate">
                  {getPlayerNames(2)}
                </span>
              </div>
              <div className="flex justify-center items-center bg-[#78bce3] border-[#001b3f] border-x h-15 aspect-square font-bold text-4xl shrink-0">
                {match.team_2_score}
              </div>
            </div>
          </div>

          {/* Footer bar */}
          <div className="col-span-2 col-start-1 bg-[#001b3f] px-4 py-1 font-bold text-white text-sm text-end truncate">
            Quarter-Finals - Best of 3 Sets - Live Match
          </div>
        </div>
      </div>
    </div>
  )
}
