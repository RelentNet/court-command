import type { Match } from '../types/domain'

interface TickerProps {
  match: Match
  isVisible?: boolean
}

export default function Ticker({ match, isVisible = true }: TickerProps) {
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

  // Team Colors
  const getTeamColor = (teamId: 1 | 2) => {
    const p =
      teamId === 1 ? match.participants.team_1 : match.participants.team_2
    // @ts-ignore: Dynamic access
    const color = (p?.primary_color as string) || '#CCCCCC'
    return color.replace('#', '')
  }

  // Configuration & Status
  const leagueName = match.config.league_name || 'Global Padel Association'
  const tournamentName =
    match.config.tournament_name || 'Nebula Padel Open 2026'
  const matchInfo = match.config.match_info || 'Quarter-Finals'
  const showTeamLogos = match.config.show_team_logos ?? true

  // Helper to parse "best_of_X"
  const getSeriesLength = () => {
    const format = match.config.format || 'best_of_3'
    const bestOf = format.split('_').pop() || '3'
    if (bestOf === '1') return ''
    return `Best of ${bestOf}`
  }

  const getMatchStatus = () => {
    if (match.status === 'preparing') return 'Warm Up'

    const wins1 = match.completed_games.filter((g) => g.winner === 1).length
    const wins2 = match.completed_games.filter((g) => g.winner === 2).length

    return `(${wins1} - ${wins2})`
  }

  const footerSegments = [
    matchInfo,
    getSeriesLength(),
    getMatchStatus(),
  ].filter(Boolean)

  return (
    <div
      className={`relative w-135 h-45 bg-red-500 overflow-hidden shrink-0 flex items-center justify-center flex-col transition-all duration-700 ease-in-out ${
        isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
      }`}
    >
      {/* Header bar */}
      <div className="bg-[#b3b3b3] px-4 py-1 font-bold text-[#c9062a] uppercase text-sm text-center truncate shrink-0 w-full">
        {leagueName} ⋅ {tournamentName}
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
            {showTeamLogos && (
              <div className="flex justify-center items-center border-white border-r aspect-square">
                <img
                  src={`https://placehold.co/60x60/${getTeamColor(1)}/FFFFFF?text=${getInitials(team1Name)}`}
                  alt={`${team1Name} logo`}
                  className="aspect-square size-full"
                />
              </div>
            )}
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
            {showTeamLogos && (
              <div className="flex justify-center items-center border-white border-r aspect-square">
                <img
                  src={`https://placehold.co/60x60/${getTeamColor(2)}/FFFFFF?text=${getInitials(team2Name)}`}
                  alt={`${team2Name} logo`}
                  className="aspect-square size-full"
                />
              </div>
            )}
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
        {footerSegments.join(' ⋅ ')}
      </div>
    </div>
  )
}
