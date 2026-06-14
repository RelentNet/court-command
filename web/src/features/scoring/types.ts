// web/src/features/scoring/types.ts

// Values MUST match the CHECK constraint in
// api/db/migrations/00018_create_matches.sql on matches.status.
// Note: 'bye' is NOT a valid matches.status value \u2014 it's an overlay-display
// state only (see web/src/features/overlay/contract.ts MATCH_STATUS).
export type MatchStatus =
  | 'scheduled'
  | 'warmup'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'forfeited'

// Values MUST match the CHECK constraint on matches.match_type.
export type MatchType = 'tournament' | 'quick' | 'pickup' | 'practice' | 'league'

// Values MUST match the CHECK constraint on matches.win_reason.
export type WinReason = 'score' | 'forfeit' | 'retirement' | 'dq' | 'bye'

export type ScoringType = 'side_out' | 'rally'

/**
 * EventType — canonical lowercase snake_case matching backend
 * service/events.go EventType* constants. Any change here MUST be
 * mirrored in the backend constant set, and vice versa.
 */
export type EventType =
  | 'match_started'
  | 'match_paused'
  | 'match_resumed'
  | 'match_complete'
  | 'match_reset'
  | 'match_configured'
  | 'point_team1'
  | 'point_team2'
  | 'point_removed'
  | 'side_out'
  | 'undo'
  | 'game_complete'
  | 'confirm_game_over'
  | 'confirm_match_over'
  | 'timeout'
  | 'timeout_ended'
  | 'end_change'
  | 'substitution'
  | 'score_override'
  | 'forfeit_declared'
  // Officiating / verbal calls (recorded from the referee console).
  | 'let'
  | 're_do'
  | 'fault'
  | 'line_call'

export interface MatchTeam {
  id: number
  name: string
  short_name?: string | null
  primary_color?: string | null
  logo_url?: string | null
  players?: Array<{
    id: number
    public_id: string
    display_name: string
  }>
}

export interface CompletedGame {
  game_num: number
  team_one_score: number
  team_two_score: number
  winner: 1 | 2
}

export interface Match {
  id: number
  public_id: string
  status: MatchStatus
  scoring_type: ScoringType
  points_to_win: number
  win_by: number
  best_of: number
  current_game: number
  team_1: MatchTeam | null
  team_2: MatchTeam | null
  team_1_score: number
  team_2_score: number
  team_1_games_won: number
  team_2_games_won: number
  serving_team: 1 | 2 | null
  server_number: 1 | 2 | null
  serving_player_id?: number | null
  timeouts_per_game: number
  team_1_timeouts_used: number
  team_2_timeouts_used: number
  set_scores: CompletedGame[]
  is_paused: boolean
  is_quick_match: boolean
  match_type?: MatchType
  division_id?: number | null
  division_name?: string | null
  tournament_id?: number | null
  tournament_name?: string | null
  court_id?: number | null
  court_name?: string | null
  match_series_id?: number | null
  scheduled_at?: string | null
  started_at?: string | null
  completed_at?: string | null
  winner_team_id?: number | null
  loser_team_id?: number | null
  expires_at?: string | null
  created_at: string
  updated_at: string
}

// Shape mirrors api/service/match.go ScoreSnapshot (JSON tags). This is the
// value on MatchEvent.score_snapshot \u2014 a historical snapshot of match state at
// the moment an event was recorded. The Go contract is tested in
// api/service/match_contract_test.go; do not add fields here that aren't in
// that test.
// NOTE: team_1_games_won / team_2_games_won are emitted on the MATCH response
// (api/service/match.go MatchResponse), not on the snapshot. They were
// previously typed here and read by no one \u2014 see audit Agent 5 #26.
export interface ScoreSnapshot {
  team_1_score: number
  team_2_score: number
  current_set: number
  current_game: number
  serving_team: number | null
  server_number: number | null
  set_scores: CompletedGame[]
}

export interface MatchEvent {
  id: number
  match_id: number
  sequence_id: number
  event_type: EventType
  timestamp: string
  /** @deprecated use `timestamp`; retained as backend-compat alias. */
  created_at?: string
  payload: Record<string, unknown>
  score_snapshot: ScoreSnapshot
  created_by_user_id?: number | null
}

export interface ScoringActionResult {
  match: Match
  game_over_detected?: boolean
  match_over_detected?: boolean
  end_change_detected?: boolean
  event?: MatchEvent
}

export interface CourtSummary {
  id: number
  name: string
  slug: string
  venue_id?: number | null
  venue_name?: string | null
  is_show_court?: boolean
  stream_url?: string | null
  active_match?: Match | null
  on_deck_match?: Match | null
}

export interface MatchSeriesSummary {
  id: number
  public_id: string
  team1_id: number
  team2_id: number
  team1: MatchTeam | null
  team2: MatchTeam | null
  team1_wins: number
  team2_wins: number
  games_to_win: number
  status: string
  started_at?: string | null
  completed_at?: string | null
  winner_team_id?: number | null
  matches: Match[]
}
