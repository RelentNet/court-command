// web/src/features/scoring/hooks.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiGetPaginated, apiPatch, apiPost } from '../../lib/api'
import type {
  CourtSummary,
  EventType,
  Match,
  MatchEvent,
  MatchSeriesSummary,
  ScoringActionResult,
} from './types'

// ----- Queries -----

export function useMatch(publicId: string | undefined) {
  return useQuery<Match>({
    queryKey: ['matches', publicId],
    queryFn: () => apiGet<Match>(`/api/v1/matches/public/${publicId}`),
    enabled: !!publicId,
    staleTime: 0,
  })
}

/**
 * Fetches all courts visible to the user (for the ref/scorekeeper home grids).
 *
 * Uses the paginated `/api/v1/courts` endpoint. The backend may not yet
 * expose a list endpoint — if it returns 404/empty, the query will error
 * and the UI should fall back to the jump-by-public-id input.
 */
export function useAllCourts() {
  return useQuery<CourtSummary[]>({
    queryKey: ['courts', 'all'],
    queryFn: async () => {
      const page = await apiGetPaginated<CourtSummary>(
        '/api/v1/courts?limit=200&offset=0',
      )
      return page.items
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useMatchEvents(publicId: string | undefined) {
  return useQuery<MatchEvent[]>({
    queryKey: ['match-events', publicId],
    queryFn: () =>
      apiGet<MatchEvent[]>(`/api/v1/matches/public/${publicId}/events`),
    enabled: !!publicId,
    staleTime: 0,
    // Events can legitimately be empty for a fresh match; don't
    // thrash the network retrying a non-transient 404.
    retry: false,
  })
}

/**
 * Records an arbitrary match event (e.g. a referee's verbal call) against a
 * match by its NUMERIC id.
 *
 * The write endpoint `POST /api/v1/matches/{matchID}/events` is keyed by the
 * numeric `match.id`, not the public id — the scoring-engine routes use the
 * public id but the generic event writer predates them. Callers therefore pass
 * both: `matchId` for the request URL and `publicId` so the cached event list
 * (keyed on public id) can be invalidated. Only valid against an in-progress
 * match; the backend rejects events on other statuses with a 422.
 */
export function useRecordMatchEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      matchId,
      eventType,
      payload,
    }: {
      matchId: number
      publicId: string
      eventType: EventType
      payload?: Record<string, unknown>
    }) =>
      apiPost<MatchEvent>(`/api/v1/matches/${matchId}/events`, {
        event_type: eventType,
        payload: payload ?? {},
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['match-events', vars.publicId] })
    },
  })
}

export function useCourtMatches(courtId: number | undefined) {
  return useQuery<Match[]>({
    queryKey: ['courts', courtId, 'matches'],
    queryFn: () => apiGet<Match[]>(`/api/v1/courts/${courtId}/matches`),
    enabled: !!courtId,
    staleTime: 0,
  })
}

export function useCourtsForTournament(tournamentId: number | undefined) {
  return useQuery<CourtSummary[]>({
    queryKey: ['tournaments', tournamentId, 'courts'],
    queryFn: () =>
      apiGet<CourtSummary[]>(`/api/v1/tournaments/${tournamentId}/courts`),
    enabled: !!tournamentId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useAssignMatchToCourt() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      matchId,
      courtId,
    }: {
      matchId: number
      courtId: number
      tournamentId?: number
    }) =>
      apiPatch<Match>(`/api/v1/matches/${matchId}/court`, {
        court_id: courtId,
      }),
    onSuccess: (_data, vars) => {
      // Invalidate bracket/match queries so they refresh with the new court
      qc.invalidateQueries({ queryKey: ['divisions'] })
      qc.invalidateQueries({ queryKey: ['matches'] })
      if (vars.tournamentId) {
        qc.invalidateQueries({
          queryKey: ['tournaments', vars.tournamentId, 'courts'],
        })
      }
    },
  })
}

export function useMatchSeries(publicId: string | undefined) {
  return useQuery<MatchSeriesSummary>({
    queryKey: ['match-series', publicId],
    queryFn: () =>
      apiGet<MatchSeriesSummary>(`/api/v1/match-series/public/${publicId}`),
    enabled: !!publicId,
    staleTime: 2 * 60 * 1000,
  })
}

// ----- Helper for invalidating after a scoring action -----

function invalidateMatch(
  qc: ReturnType<typeof useQueryClient>,
  publicId: string,
) {
  qc.invalidateQueries({ queryKey: ['match-events', publicId] })
  // match cache is updated via setQueryData below
}

function applyResult(
  qc: ReturnType<typeof useQueryClient>,
  publicId: string,
  result: ScoringActionResult,
) {
  qc.setQueryData(['matches', publicId], result.match)
  invalidateMatch(qc, publicId)
}

// ----- Mutations -----

export function useStartMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      publicId,
      scored_by_name,
      first_serving_team,
      first_serving_player_id,
    }: {
      publicId: string
      scored_by_name?: string
      first_serving_team?: 1 | 2
      first_serving_player_id?: number | null
    }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/start`,
        {
          scored_by_name,
          first_serving_team,
          first_serving_player_id,
        },
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useScorePoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId, team }: { publicId: string; team?: 1 | 2 }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/point`,
        { team },
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useSideOut() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/sideout`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useUndo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/undo`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useRemovePoint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/remove-point`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useConfirmGameOver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/confirm-game`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useConfirmMatchOver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/confirm-match`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useCallTimeout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId, team }: { publicId: string; team: 1 | 2 }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/timeout`,
        { team },
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function usePauseMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/pause`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useResumeMatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ publicId }: { publicId: string }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/resume`,
        {},
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export function useDeclareForfeit() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      publicId,
      forfeiting_team,
      reason,
    }: {
      publicId: string
      forfeiting_team: 1 | 2
      reason: string
    }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/forfeit`,
        { forfeiting_team, reason },
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

export interface OverrideGameInput {
  game_number: number
  team_1_score: number
  team_2_score: number
  winner: 1 | 2 | null
}

export function useOverrideScore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      publicId,
      games,
      reason,
    }: {
      publicId: string
      games: OverrideGameInput[]
      reason: string
    }) =>
      apiPost<ScoringActionResult>(
        `/api/v1/matches/public/${publicId}/override`,
        { games, reason },
      ),
    onSuccess: (data, vars) => applyResult(qc, vars.publicId, data),
  })
}

// ---------------------------------------------------------------------------
// Tournament Assignment (for staff users)
// ---------------------------------------------------------------------------

export interface MyTournamentAssignment {
  tournament_id: number
  tournament_name: string
  role: string
}

export function useMyTournamentAssignment() {
  return useQuery<MyTournamentAssignment>({
    queryKey: ['auth', 'tournament-staff'],
    queryFn: () => apiGet<MyTournamentAssignment>('/api/v1/auth/me/tournament-staff'),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })
}
