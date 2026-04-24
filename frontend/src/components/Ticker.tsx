import config from '../config'
import {
  DEFAULT_THEME,
  contrastTextColor,
  hsl,
  resolveImageUrl,
  resolveOverride,
  resolveTheme,
} from '../utils/theme'
import type { CSSProperties } from 'react'
import type {
  CourtTheme,
  Match,
  MatchParticipant,
  Team,
} from '../types/domain'

interface TickerProps {
  match: Match
  isVisible?: boolean
  /** Partial theme (from backend); falls back to DEFAULT_THEME. */
  theme?: Partial<CourtTheme> | null
  /** Optional teams lookup (for resolving Team.logo_url via participants.team_X.id). */
  teams?: Array<Team>
}

export default function Ticker({
  match,
  isVisible = true,
  theme: rawTheme,
  teams,
}: TickerProps) {
  const theme = resolveTheme(rawTheme)

  const getParticipant = (teamId: 1 | 2): MatchParticipant | undefined => {
    return teamId === 1 ? match.participants.team_1 : match.participants.team_2
  }

  const getTeamName = (teamId: 1 | 2) => {
    const p = getParticipant(teamId)
    return (
      p?.name ||
      (teamId === 1 ? match.team_1_name : match.team_2_name) ||
      `Team ${teamId}`
    )
  }

  const getPlayerNames = (teamId: 1 | 2) => {
    const p = getParticipant(teamId)
    const p1 = p?.player_1?.display_name || 'Player 1'
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

  const getTeamColor = (teamId: 1 | 2) => {
    const p = getParticipant(teamId) as
      | (MatchParticipant & { primary_color?: string })
      | undefined
    const color = p?.primary_color || '#CCCCCC'
    return color.replace('#', '')
  }

  /** Prefer the registry Team.logo_url (via participants.team_X.id), fall back to placehold.co. */
  const getTeamLogoSrc = (teamId: 1 | 2): string => {
    const p = getParticipant(teamId) as
      | (MatchParticipant & { id?: number; logo_url?: string | null })
      | undefined

    // 1. participants may already include a logo_url (embedded from backend).
    const embeddedLogo = p?.logo_url
    if (embeddedLogo) {
      const resolved = resolveImageUrl(embeddedLogo, config.API_URL)
      if (resolved) return resolved
    }

    // 2. Fall back to a teams array lookup by id (passed from the console).
    if (teams && p?.id != null) {
      const t = teams.find((tt) => tt.id === p.id)
      if (t?.logo_url) {
        const resolved = resolveImageUrl(t.logo_url, config.API_URL)
        if (resolved) return resolved
      }
    }

    // 3. Last resort — color-coded placeholder (matches previous behavior).
    const name = getTeamName(teamId)
    return `https://placehold.co/100x100/${getTeamColor(teamId)}/FFFFFF?text=${getInitials(name)}`
  }

  // ---------- Text resolution (overrides > live) ----------

  const o = theme.textOverrides
  const defaultAssociation = theme.useFullAssociationName
    ? 'Global Padel Association'
    : 'GPA'

  const liveLeague = match.league_name || defaultAssociation
  const liveTournament = match.tournament_name || 'Nebula Padel Open 2026'
  const liveMatchInfo = match.match_info || 'Quarter-Finals'

  const leagueText = resolveOverride(o.leagueName, liveLeague)
  const tournamentText = resolveOverride(o.tournamentName, liveTournament)
  const headerExtraText = resolveOverride(o.headerExtra, '')
  const matchInfoText = resolveOverride(o.matchInfo, liveMatchInfo)
  const footerExtraText = resolveOverride(o.footerExtra, '')

  const team1Name = resolveOverride(o.team1Name, getTeamName(1))
  const team2Name = resolveOverride(o.team2Name, getTeamName(2))
  const team1Players = resolveOverride(o.team1Players, getPlayerNames(1))
  const team2Players = resolveOverride(o.team2Players, getPlayerNames(2))

  const team1Score = resolveOverride(o.team1Score, String(match.team_1_score))
  const team2Score = resolveOverride(o.team2Score, String(match.team_2_score))

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
    const format = match.config.format || 'best_of_3'
    const bestOf = format.split('_').pop() || '3'
    if (bestOf === '1') return ''
    const wins1 = match.completed_games.filter((g) => g.winner === 1).length
    const wins2 = match.completed_games.filter((g) => g.winner === 2).length
    return `(${wins1} - ${wins2})`
  }

  const headerSegments = [leagueText, tournamentText, headerExtraText].filter(
    Boolean,
  )
  const footerSegments = [
    matchInfoText,
    getSeriesLength(),
    getMatchStatus(),
    footerExtraText,
  ].filter(Boolean)

  // ---------- Color resolution ----------

  const headerBg = theme.colors.headerFooter
  const bodyBg = theme.colors.body
  const badgeBg = theme.colors.badge
  const scoreBg = theme.colors.score

  // Text color: in 'manual' mode a single global color is used everywhere the
  // original hardcoded theme used #c9062a (header/footer) — but the body rows
  // always used white, which looked correct because the body default is dark.
  // To preserve the default look AND give operators a single lever, we use:
  //   - manual mode → manual color for header/footer text, auto for body/score
  //   - auto mode   → auto-contrast everywhere
  // This matches the prior visual output when left on defaults.
  const manualTextColor =
    theme.colors.text.mode === 'manual' ? hsl(theme.colors.text.value) : null

  const headerTextColor = manualTextColor ?? contrastTextColor(headerBg)
  const bodyTextColor = contrastTextColor(bodyBg)
  const scoreTextColor = contrastTextColor(scoreBg)

  // ---------- Assets ----------

  const associationLogoSrc =
    resolveImageUrl(theme.images.associationLogo, config.API_URL) ||
    '/wilson.webp'
  const showAssociationLogo = !theme.images.hideDefaultAssociationLogo

  const badgeOffset = theme.badgeLogoPosition
  const badgeScale = theme.badgeLogoScale
  const teamLogoScale = theme.teamLogoScale

  // ---------- Styles ----------

  const headerBarStyle: CSSProperties = {
    backgroundColor: hsl(headerBg),
    color: headerTextColor,
  }
  const footerBarStyle: CSSProperties = {
    backgroundColor: hsl(headerBg),
    color: headerTextColor,
  }
  const badgeCellStyle: CSSProperties = {
    backgroundColor: hsl(badgeBg),
  }
  const bodyStyle: CSSProperties = {
    backgroundColor: hsl(bodyBg),
    color: bodyTextColor,
  }
  const scoreCellStyle: CSSProperties = {
    backgroundColor: hsl(scoreBg),
    color: scoreTextColor,
  }

  const associationImgStyle: CSSProperties = {
    transform: `translate(${badgeOffset.x}px, ${badgeOffset.y}px) scale(${badgeScale})`,
    transformOrigin: 'center',
  }

  const teamLogoStyle: CSSProperties = {
    transform: `scale(${teamLogoScale})`,
    transformOrigin: 'center',
  }

  return (
    <div
      className={`relative w-full max-w-[540px] aspect-[3/1] overflow-hidden shrink-0 flex items-center justify-center flex-col transition-all duration-700 ease-in-out shadow-2xl ${
        isVisible ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
      } ${theme.showBorder ? 'ring-1 ring-white/20' : ''}`}
      style={{ fontSize: 'min(2vw, 14px)' }}
    >
      {/* Header bar */}
      <div
        className="px-4 py-1 font-bold uppercase text-[0.9em] text-center truncate shrink-0 w-full border-b border-white/20"
        style={headerBarStyle}
      >
        {headerSegments.join(' ⋅ ')}
      </div>

      {/* Match body */}
      <div className="flex items-center justify-between flex-1 w-full min-h-0">
        {/* Association / badge cell */}
        <div
          className="h-full aspect-square border-r border-white flex items-center justify-center p-2 relative overflow-hidden"
          style={badgeCellStyle}
        >
          {showAssociationLogo && (
            <img
              src={associationLogoSrc}
              alt="Association logo"
              className="max-w-full max-h-full object-contain z-10 pointer-events-none select-none"
              style={associationImgStyle}
            />
          )}
        </div>

        {/* Teams */}
        <div
          className="flex flex-col divide-y divide-white min-w-0 flex-1 h-full"
          style={bodyStyle}
        >
          {/* Team 1 */}
          <div className="flex flex-1 min-h-0">
            {showTeamLogos && (
              <div className="flex justify-center items-center border-white border-r aspect-square h-full overflow-hidden">
                <img
                  src={getTeamLogoSrc(1)}
                  alt={`${team1Name} logo`}
                  className="aspect-square h-full object-cover"
                  style={teamLogoStyle}
                />
              </div>
            )}
            <div className="flex flex-col flex-1 h-full justify-center px-3 min-w-0">
              <span className="font-bold text-[1.2em] leading-tight truncate">
                {team1Name}
              </span>
              <span className="font-bold text-[0.8em] opacity-90 truncate uppercase tracking-tight">
                {team1Players}
              </span>
            </div>
            <div
              className="flex justify-center items-center border-white border-l aspect-square h-full font-black text-[2.5em]"
              style={scoreCellStyle}
            >
              {team1Score}
            </div>
          </div>

          {/* Team 2 */}
          <div className="flex flex-1 min-h-0">
            {showTeamLogos && (
              <div className="flex justify-center items-center border-white border-r aspect-square h-full overflow-hidden">
                <img
                  src={getTeamLogoSrc(2)}
                  alt={`${team2Name} logo`}
                  className="aspect-square h-full object-cover"
                  style={teamLogoStyle}
                />
              </div>
            )}
            <div className="flex flex-col flex-1 h-full justify-center px-3 min-w-0">
              <span className="font-bold text-[1.2em] leading-tight truncate">
                {team2Name}
              </span>
              <span className="font-bold text-[0.8em] opacity-90 truncate uppercase tracking-tight">
                {team2Players}
              </span>
            </div>
            <div
              className="flex justify-center items-center border-white border-l aspect-square h-full font-black text-[2.5em]"
              style={scoreCellStyle}
            >
              {team2Score}
            </div>
          </div>
        </div>
      </div>
      {/* Footer bar */}
      <div
        className="px-4 py-1 font-bold uppercase text-[0.9em] text-center truncate shrink-0 w-full border-t border-white/20"
        style={footerBarStyle}
      >
        {footerSegments.join(' ⋅ ')}
      </div>
    </div>
  )
}

// Re-export DEFAULT_THEME for callers that want to feed it as a prop for tests.
export { DEFAULT_THEME }
