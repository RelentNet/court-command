import { useQuery } from '@tanstack/react-query'
import { apiGet, apiGetPaginated, type PaginatedData } from '../../lib/api'
import { buildQueryString } from '../../lib/formatters'

// ---------------------------------------------------------------------------
// Types — mirrors backend generated structs from /api/v1/public/*
// ---------------------------------------------------------------------------

export interface PublicTournament {
  id: number
  public_id: string
  name: string
  slug: string
  status: string
  start_date: string
  end_date: string
  venue_name?: string
  city?: string
  state_province?: string
  logo_url?: string | null
  description?: string | null
  division_count?: number
  registration_count?: number
}

export interface PublicLeague {
  id: number
  public_id: string
  name: string
  slug: string
  status: string
  logo_url?: string | null
  city?: string
  state_province?: string
  description?: string | null
}

export interface PublicVenue {
  id: number
  name: string
  slug: string
  status: string
  city?: string
  state_province?: string
  country?: string
  logo_url?: string | null
  photo_url?: string | null
  court_count?: number
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePublicTournaments(params: {
  limit: number
  offset: number
  status?: string
}) {
  return useQuery<PaginatedData<PublicTournament>>({
    queryKey: ['public-tournaments', params],
    queryFn: () =>
      apiGetPaginated<PublicTournament>(
        `/api/v1/public/tournaments${buildQueryString({
          limit: params.limit,
          offset: params.offset,
          status: params.status,
        })}`,
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePublicTournamentBySlug(slug: string) {
  return useQuery<PublicTournament>({
    queryKey: ['public-tournament', slug],
    queryFn: () => apiGet<PublicTournament>(`/api/v1/public/tournaments/${slug}`),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000,
  })
}

export function usePublicLeagues(params: { limit: number; offset: number }) {
  return useQuery<PaginatedData<PublicLeague>>({
    queryKey: ['public-leagues', params],
    queryFn: () =>
      apiGetPaginated<PublicLeague>(
        `/api/v1/public/leagues${buildQueryString({
          limit: params.limit,
          offset: params.offset,
        })}`,
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePublicLeagueBySlug(slug: string) {
  return useQuery<PublicLeague>({
    queryKey: ['public-league', slug],
    queryFn: () => apiGet<PublicLeague>(`/api/v1/public/leagues/${slug}`),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000,
  })
}

export function usePublicVenues(params: { limit: number; offset: number }) {
  return useQuery<PaginatedData<PublicVenue>>({
    queryKey: ['public-venues', params],
    queryFn: () =>
      apiGetPaginated<PublicVenue>(
        `/api/v1/public/venues${buildQueryString({
          limit: params.limit,
          offset: params.offset,
        })}`,
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function usePublicVenueBySlug(slug: string) {
  return useQuery<PublicVenue>({
    queryKey: ['public-venue', slug],
    queryFn: () => apiGet<PublicVenue>(`/api/v1/public/venues/${slug}`),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Live Matches — mirrors backend service.MatchResponse
// ---------------------------------------------------------------------------

export interface TeamSummary {
  id: number
  name: string
  short_name?: string
  primary_color?: string
  logo_url?: string | null
  players?: PlayerSummary[]
}

export interface PlayerSummary {
  id: number
  name: string
  jersey_number?: string
}

export interface LiveMatch {
  id: number
  public_id: string
  tournament_id?: number
  tournament_name?: string
  division_id?: number
  division_name?: string
  court_id?: number
  court_name?: string
  match_type: string
  is_quick_match: boolean
  round?: number
  round_name?: string
  match_number?: number
  team_1?: TeamSummary
  team_2?: TeamSummary
  team_1_seed?: number
  team_2_seed?: number
  scoring_type: string
  games_per_set: number
  sets_to_win: number
  best_of: number
  points_to_win: number
  win_by: number
  max_points?: number
  rally_scoring: boolean
  team_1_score: number
  team_2_score: number
  team_1_games_won: number
  team_2_games_won: number
  current_set: number
  current_game: number
  serving_team?: number
  set_scores: Array<{ team1: number; team2: number }>
  status: string
  is_paused: boolean
  started_at?: string
  scheduled_at?: string
  created_at: string
}

export function useLiveMatches(params: { limit: number; offset: number }) {
  return useQuery<PaginatedData<LiveMatch>>({
    queryKey: ['public-live-matches', params],
    queryFn: () =>
      apiGetPaginated<LiveMatch>(
        `/api/v1/public/live${buildQueryString({
          limit: params.limit,
          offset: params.offset,
        })}`,
      ),
    staleTime: 15 * 1000, // 15s — live data should be relatively fresh
    refetchInterval: 30 * 1000, // auto-refetch every 30s
  })
}

// ---------------------------------------------------------------------------
// Tournament Sub-Resources — divisions, matches, courts
// ---------------------------------------------------------------------------

export interface PublicDivision {
  id: number
  tournament_id: number
  name: string
  slug: string
  format: string
  bracket_format: string
  scoring_format?: string
  status: string
  gender_restriction?: string
  skill_min?: number
  skill_max?: number
  rating_system?: string
  max_teams?: number
  max_roster_size?: number
  entry_fee_currency?: string
  seed_method?: string
  sort_order?: number
  notes?: string
  auto_approve: boolean
  registration_mode?: string
  auto_promote_waitlist: boolean
  current_phase?: string
  created_at: string
  updated_at: string
}

export interface PublicCourt {
  id: number
  name: string
  slug: string
  venue_id?: number
  venue_name?: string
  surface_type?: string
  is_show_court: boolean
  is_active: boolean
  is_temporary: boolean
  sort_order: number
  notes?: string
  stream_url?: string
  stream_type?: string
  stream_is_live: boolean
  stream_title?: string
  active_match?: LiveMatch
  on_deck_match?: LiveMatch
  created_at: string
  updated_at: string
}

export function usePublicTournamentDivisions(slug: string) {
  return useQuery<PublicDivision[]>({
    queryKey: ['public-tournament-divisions', slug],
    queryFn: () =>
      apiGet<PublicDivision[]>(`/api/v1/public/tournaments/${slug}/divisions`),
    enabled: !!slug,
    staleTime: 2 * 60 * 1000,
  })
}

export function usePublicTournamentMatches(
  slug: string,
  params: { limit: number; offset: number },
) {
  return useQuery<LiveMatch[]>({
    queryKey: ['public-tournament-matches', slug, params],
    queryFn: () =>
      apiGet<LiveMatch[]>(
        `/api/v1/public/tournaments/${slug}/matches${buildQueryString({
          limit: params.limit,
          offset: params.offset,
        })}`,
      ),
    enabled: !!slug,
    staleTime: 30 * 1000, // 30s — matches update frequently
  })
}

export function usePublicTournamentCourts(slug: string) {
  return useQuery<PublicCourt[]>({
    queryKey: ['public-tournament-courts', slug],
    queryFn: () =>
      apiGet<PublicCourt[]>(`/api/v1/public/tournaments/${slug}/courts`),
    enabled: !!slug,
    staleTime: 30 * 1000, // 30s — court status changes with matches
  })
}

// ---------------------------------------------------------------------------
// Public Division Detail — bracket, standings, matches (no auth required)
// ---------------------------------------------------------------------------

/**
 * Division detail payload from `GET /public/divisions/{id}`. Lighter than the
 * authed Division struct — only the fields the spectator page needs, plus the
 * embedded tournament reference (for the back-link) and aggregate counts.
 */
export interface PublicDivisionDetail {
  id: number
  tournament_id: number
  name: string
  slug: string
  format: string
  bracket_format: string
  scoring_format?: string
  status: string
  current_phase?: string
  tournament: {
    id: number
    slug: string
    name: string
  }
  counts: {
    registrations: number
    matches: number
  }
}

/**
 * Standings entry from `GET /public/divisions/{id}/standings`. Identical shape
 * to the authed division standings (see leagues/hooks StandingsEntry).
 */
export interface PublicStandingsEntry {
  id: number
  season_id?: number
  division_id: number
  team_id: number
  team?: TeamSummary
  wins: number
  losses: number
  draws: number
  points_for: number
  points_against: number
  point_differential: number
  matches_played: number
  standing_points: number
  override_points?: number
  is_withdrawn: boolean
  rank: number
}

export function usePublicDivision(divisionId: string) {
  return useQuery<PublicDivisionDetail>({
    queryKey: ['public-division', divisionId],
    queryFn: () =>
      apiGet<PublicDivisionDetail>(`/api/v1/public/divisions/${divisionId}`),
    enabled: !!divisionId,
    staleTime: 2 * 60 * 1000,
  })
}

export function usePublicDivisionBracket(divisionId: string) {
  return useQuery<LiveMatch[]>({
    queryKey: ['public-division-bracket', divisionId],
    queryFn: () =>
      apiGet<LiveMatch[]>(`/api/v1/public/divisions/${divisionId}/bracket`),
    enabled: !!divisionId,
    staleTime: 30 * 1000, // 30s — bracket scores update during play
  })
}

export function usePublicDivisionStandings(divisionId: string) {
  return useQuery<PublicStandingsEntry[]>({
    queryKey: ['public-division-standings', divisionId],
    queryFn: () =>
      apiGet<PublicStandingsEntry[]>(
        `/api/v1/public/divisions/${divisionId}/standings`,
      ),
    enabled: !!divisionId,
    staleTime: 30 * 1000,
  })
}

export function usePublicDivisionMatches(divisionId: string) {
  return useQuery<LiveMatch[]>({
    queryKey: ['public-division-matches', divisionId],
    queryFn: () =>
      apiGet<LiveMatch[]>(`/api/v1/public/divisions/${divisionId}/matches`),
    enabled: !!divisionId,
    staleTime: 30 * 1000,
  })
}

// ---------------------------------------------------------------------------
// League Sub-Resources — seasons, tournaments
// ---------------------------------------------------------------------------

export interface PublicSeason {
  id: number
  name: string
  slug: string
  league_id: number
  status: string
  start_date?: string
  end_date?: string
  description?: string
  notes?: string
  roster_confirmation_deadline?: string
  standings_method?: string
  created_at: string
  updated_at: string
}

export function usePublicLeagueSeasons(
  slug: string,
  params: { limit: number; offset: number },
) {
  return useQuery<PaginatedData<PublicSeason>>({
    queryKey: ['public-league-seasons', slug, params],
    queryFn: () =>
      apiGetPaginated<PublicSeason>(
        `/api/v1/public/leagues/${slug}/seasons${buildQueryString({
          limit: params.limit,
          offset: params.offset,
        })}`,
      ),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

export function usePublicLeagueTournaments(
  slug: string,
  params: { limit: number; offset: number },
) {
  return useQuery<PaginatedData<PublicTournament>>({
    queryKey: ['public-league-tournaments', slug, params],
    queryFn: () =>
      apiGetPaginated<PublicTournament>(
        `/api/v1/public/leagues/${slug}/tournaments${buildQueryString({
          limit: params.limit,
          offset: params.offset,
        })}`,
      ),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Venue Sub-Resources — courts
// ---------------------------------------------------------------------------

export function usePublicVenueCourts(slug: string) {
  return useQuery<PublicCourt[]>({
    queryKey: ['public-venue-courts', slug],
    queryFn: () =>
      apiGet<PublicCourt[]>(`/api/v1/public/venues/${slug}/courts`),
    enabled: !!slug,
    staleTime: 30 * 1000,
  })
}
