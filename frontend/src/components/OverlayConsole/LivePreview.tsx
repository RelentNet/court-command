import Ticker from '../Ticker'
import config from '../../config'
import { hsl, resolveImageUrl } from '../../utils/theme'
import type { CourtTheme, Match, Team } from '../../types/domain'
import type { CSSProperties } from 'react'

interface LivePreviewProps {
  theme: CourtTheme
  match: Match | null
  teams: Array<Team>
}

// A minimal placeholder match so the preview works without an active game.
const PLACEHOLDER_MATCH: Match = {
  public_id: 'preview',
  status: 'in_progress',
  league_name: 'Global Padel Association',
  tournament_name: 'Nebula Padel Open 2026',
  match_info: 'Quarter-Finals',
  participants: {
    team_1: {
      name: 'Titan Racquets',
      player_1: { display_name: 'Sarah Jenkins' },
      player_2: { display_name: 'Marcus Vane' },
    },
    team_2: {
      name: 'Silver Smashers',
      player_1: { display_name: 'Elena Rodriguez' },
      player_2: { display_name: 'David Chen' },
    },
  },
  config: {
    format: 'best_of_3',
    scoring_type: 'side_out',
    points_to: 11,
    win_by: 2,
    show_team_logos: true,
  },
  completed_games: [],
  current_game_num: 1,
  team_1_score: 5,
  team_2_score: 3,
  server_number: 1,
  serving_team: 1,
  swap_sides: false,
  created_at: new Date().toISOString(),
} as unknown as Match

export function LivePreview({ theme, match, teams }: LivePreviewProps) {
  const effectiveMatch = match ?? PLACEHOLDER_MATCH
  const isTransparent = theme.backgroundMode === 'transparent'

  const backgroundStyle: CSSProperties = (() => {
    if (theme.backgroundMode === 'transparent') return {}
    if (theme.backgroundMode === 'color') {
      return { backgroundColor: hsl(theme.colors.pageBackground) }
    }
    // image
    const url = resolveImageUrl(theme.backgroundImage, config.API_URL)
    return {
      backgroundColor: hsl(theme.colors.pageBackground),
      backgroundImage: url ? `url("${url}")` : undefined,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  })()

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border-b border-slate-800 text-xs text-slate-400">
        <span className="font-bold uppercase tracking-wide">Live Preview</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-lime-500 animate-pulse" />
          {match ? 'Live match data' : 'No active match — placeholder data'}
        </span>
      </div>
      <div
        className={`${isTransparent ? 'cc-checker' : ''} flex items-center justify-center p-8 min-h-[240px]`}
        style={backgroundStyle}
      >
        <Ticker match={effectiveMatch} theme={theme} teams={teams} />
      </div>
    </div>
  )
}
