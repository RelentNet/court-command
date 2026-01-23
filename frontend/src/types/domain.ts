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
  created_at: string
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
  [key: string]: unknown
}

export interface Match {
  id?: number | null
  public_id: string
  court_slug?: string | null
  status: 'warm_up' | 'in_progress' | 'final' | string

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
