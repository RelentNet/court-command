export interface Player {
  id?: number | null
  display_name: string
  handedness: 'right' | 'left' | string
  skill_rating?: number | null
  created_at: string
}

export interface Team {
  id?: number | null
  name: string
  short_name?: string | null
  logo_url?: string | null
  primary_color?: string | null
  player_ids: Array<number>
}

export interface Court {
  id?: number | null
  name: string
  slug: string
  is_ticker_visible?: boolean
  theme?: Partial<CourtTheme> | null
  created_at: string
  active_match?: Match | null
}

// --- Overlay Console / Theme ---

export interface HSL {
  h: number
  s: number
  l: number
}

export type BackgroundMode = 'transparent' | 'color' | 'image'
export type TextColorMode = 'auto' | 'manual'

export interface CourtThemeColors {
  headerFooter: HSL
  body: HSL
  badge: HSL
  score: HSL
  pageBackground: HSL
  text: {
    mode: TextColorMode
    value: HSL
  }
}

export interface CourtThemeImages {
  associationLogo: string | null
  hideDefaultAssociationLogo: boolean
}

export interface CourtThemeTextOverrides {
  leagueName: string
  tournamentName: string
  headerExtra: string
  team1Name: string
  team1Players: string
  team1Score: string
  team2Name: string
  team2Players: string
  team2Score: string
  matchInfo: string
  footerExtra: string
}

export interface CourtTheme {
  version: 1
  colors: CourtThemeColors
  backgroundMode: BackgroundMode
  backgroundImage: string | null
  teamLogoScale: number
  badgeLogoScale: number
  badgeLogoPosition: { x: number; y: number }
  images: CourtThemeImages
  textOverrides: CourtThemeTextOverrides
  showBorder: boolean
  useFullAssociationName: boolean
}

export interface MatchParticipant {
  id?: number
  name?: string
  display_name?: string
  player_1?: MatchParticipant
  player_2?: MatchParticipant
  [key: string]: unknown
}

export interface MatchParticipants {
  team_1?: MatchParticipant
  team_2?: MatchParticipant
  [key: string]: unknown
}

export interface MatchConfig {
  format: string
  scoring_type: string
  points_to: number
  win_by: number
  league_name?: string
  tournament_name?: string
  match_info?: string
  show_team_logos?: boolean
  is_ticker_visible?: boolean
  [key: string]: unknown
}

export interface Match {
  id?: number | null
  public_id: string
  court_slug?: string | null
  status: 'warm_up' | 'in_progress' | 'final' | string

  // Metadata
  league_name?: string | null
  tournament_name?: string | null
  match_info?: string | null

  // Configuration
  team_1_id?: number | null
  team_2_id?: number | null
  first_serving_team?: number | null

  participants: MatchParticipants
  config: MatchConfig
  completed_games: Array<Record<string, unknown>>

  // Live State
  current_game_num: number
  team_1_score: number
  team_2_score: number
  server_number: number
  serving_team: number
  swap_sides: boolean

  created_at: string

  // Legacy / Hydrated fields (potentially used in frontend but not in raw DB model)
  team_1_name?: string
  team_2_name?: string
}

export interface MatchPreset {
  id?: number
  category: 'league' | 'tournament' | 'round'
  value: string
}
