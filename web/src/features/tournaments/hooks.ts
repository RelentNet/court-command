import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  apiGet,
  apiPost,
  apiPatch,
  apiDelete,
  apiGetPaginated,
  type PaginatedData,
} from '../../lib/api'
import { buildQueryString } from '../../lib/formatters'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SponsorEntry {
  name: string
  logo_url: string
  link_url: string
  tier: string
  is_header_sponsor: boolean
}

export interface Tournament {
  id: number
  public_id: string
  name: string
  slug: string
  status: string
  start_date: string
  end_date: string
  venue_id: number | null
  league_id: number | null
  season_id: number | null
  description: string | null
  logo_url: string | null
  banner_url: string | null
  contact_email: string | null
  contact_phone: string | null
  website_url: string | null
  rules_document_url: string | null
  max_participants: number | null
  show_registrations: boolean
  cancellation_reason: string | null
  social_links: Record<string, string> | null
  sponsor_info: SponsorEntry[] | null
  notes: string | null
  td_user_id: number | null
  created_by_user_id: number
  created_at: string
  updated_at: string
}

// Shape mirrors api/db/migrations/00011_create_divisions.sql + api/service/division.go
// DivisionResponse. See audit report for the nullability reasoning:
// docs/superpowers/audits/2026-04-20-db-schema-alignment.md (D-02, D-08, D-10).
export interface Division {
  id: number
  name: string
  slug: string
  tournament_id: number
  format: string              // NOT NULL, CHECK enum
  bracket_format: string      // NOT NULL, CHECK enum
  status: string              // NOT NULL DEFAULT 'draft', CHECK enum
  // The following columns are all nullable in the DB schema even when they
  // have a DEFAULT; UI must null-guard. See D-02/D-08/D-10 in the audit.
  gender_restriction: string | null
  scoring_format: string | null
  max_teams: number | null
  max_roster_size: number | null
  entry_fee_amount: number | null
  entry_fee_currency: string | null
  auto_approve: boolean | null
  registration_mode: string | null
  seed_method: string | null
  sort_order: number | null
  created_at: string
  updated_at: string
}

export interface Registration {
  id: number
  division_id: number
  team_id: number | null
  player_id: number | null
  registered_by_user_id: number
  status: string
  seed: number | null
  final_placement: number | null
  seeking_partner: boolean
  registration_notes: string | null
  admin_notes: string | null
  registered_at: string
  approved_at: string | null
  withdrawn_at: string | null
  checked_in_at: string | null
}

export interface Announcement {
  id: number
  tournament_id: number | null
  league_id: number | null
  division_id: number | null
  title: string
  body: string
  is_pinned: boolean
  created_by_user_id: number
  created_at: string
  updated_at: string
}

export interface Pod {
  id: number
  division_id: number
  name: string
  sort_order: number
}

export interface ScoringPreset {
  id: number
  name: string
  description: string | null
  scoring_config: Record<string, unknown>
  is_system: boolean
  is_active: boolean
  created_at: string
}

export interface BracketMatchTeamSummary {
  id: number
  name: string
  short_name?: string
  primary_color?: string | null
  logo_url?: string | null
}

export interface BracketMatch {
  id: number
  public_id?: string
  division_id?: number | null
  round?: number | null
  round_name?: string | null
  match_number?: number | null
  team_1_id?: number | null
  team_2_id?: number | null
  team_1?: BracketMatchTeamSummary | null
  team_2?: BracketMatchTeamSummary | null
  team_1_seed?: number | null
  team_2_seed?: number | null
  team_1_score?: number | null
  team_2_score?: number | null
  winner_team_id?: number | null
  status: string
  next_match_id?: number | null
  next_match_slot?: number | null
  scheduled_at?: string | null
  court_id?: number | null
  created_at: string
  updated_at: string
}

export interface League {
  id: number
  name: string
  slug: string
  status: string
}

export interface Season {
  id: number
  league_id: number
  name: string
  status: string
}

// ---------------------------------------------------------------------------
// Tournament CRUD
// ---------------------------------------------------------------------------

export function useListTournaments(
  query?: string,
  status?: string,
  limit?: number,
  offset?: number,
  leagueId?: string,
) {
  return useQuery<PaginatedData<Tournament>>({
    queryKey: ['tournaments', 'list', { query, status, limit, offset, leagueId }],
    queryFn: () =>
      apiGetPaginated<Tournament>(
        `/api/v1/tournaments${buildQueryString({ query, status, limit, offset, league_id: leagueId })}`,
      ),
    staleTime: 5 * 60 * 1000,
  })
}

export function useGetTournament(id: string) {
  return useQuery<Tournament>({
    queryKey: ['tournaments', id],
    queryFn: () => apiGet<Tournament>(`/api/v1/tournaments/${id}`),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateTournament() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Tournament>) =>
      apiPost<Tournament>('/api/v1/tournaments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

export function useUpdateTournament(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Tournament>) =>
      apiPatch<Tournament>(`/api/v1/tournaments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

export function useDeleteTournament(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiDelete<void>(`/api/v1/tournaments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

export function useUpdateTournamentStatus(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string }) =>
      apiPatch<Tournament>(`/api/v1/tournaments/${id}/status`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

export function useCloneTournament(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; start_date?: string; end_date?: string }) =>
      apiPost<Tournament>(`/api/v1/tournaments/${id}/clone`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Division CRUD
// ---------------------------------------------------------------------------

export function useListDivisions(tournamentId: string) {
  return useQuery<Division[]>({
    queryKey: ['tournaments', tournamentId, 'divisions'],
    queryFn: () =>
      apiGet<Division[]>(`/api/v1/tournaments/${tournamentId}/divisions`),
    enabled: !!tournamentId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useGetDivision(tournamentId: string, divisionId: string) {
  return useQuery<Division>({
    queryKey: ['tournaments', tournamentId, 'divisions', divisionId],
    queryFn: () =>
      apiGet<Division>(
        `/api/v1/tournaments/${tournamentId}/divisions/${divisionId}`,
      ),
    enabled: !!tournamentId && !!divisionId,
    staleTime: 2 * 60 * 1000,
  })
}

export function useCreateDivision(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Division>) =>
      apiPost<Division>(
        `/api/v1/tournaments/${tournamentId}/divisions`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'divisions'],
      })
    },
  })
}

export function useUpdateDivision(tournamentId: string, divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Division>) =>
      apiPatch<Division>(
        `/api/v1/tournaments/${tournamentId}/divisions/${divisionId}`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'divisions'],
      })
    },
  })
}

export function useDeleteDivision(tournamentId: string, divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiDelete<void>(
        `/api/v1/tournaments/${tournamentId}/divisions/${divisionId}`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'divisions'],
      })
    },
  })
}

export function useUpdateDivisionStatus(
  tournamentId: string,
  divisionId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string }) =>
      apiPatch<Division>(
        `/api/v1/tournaments/${tournamentId}/divisions/${divisionId}/status`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'divisions'],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export function useListRegistrations(
  divisionId: string,
  status?: string,
  limit?: number,
  offset?: number,
) {
  return useQuery<PaginatedData<Registration>>({
    queryKey: ['divisions', divisionId, 'registrations', { status, limit, offset }],
    queryFn: () =>
      apiGetPaginated<Registration>(
        `/api/v1/divisions/${divisionId}/registrations${buildQueryString({ status, limit, offset })}`,
      ),
    enabled: !!divisionId,
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Fetch every registration for a division across all pages.
 *
 * The list endpoint is paginated (server caps the page size at 100), so a
 * single client query only ever holds one page. Bulk operations that must
 * cover the whole division need the complete set, which this helper assembles
 * by walking the pages until `total` is reached.
 */
export async function fetchAllRegistrations(
  divisionId: string,
  status?: string,
): Promise<Registration[]> {
  const pageSize = 100
  const all: Registration[] = []
  let offset = 0

  // Loop guarded by `total`; pageSize caps each request at the server limit.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await apiGetPaginated<Registration>(
      `/api/v1/divisions/${divisionId}/registrations${buildQueryString({
        status,
        limit: pageSize,
        offset,
      })}`,
    )
    all.push(...page.items)
    offset += page.items.length
    if (page.items.length === 0 || offset >= page.total) break
  }

  return all
}

export function useCreateRegistration(divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Registration>) =>
      apiPost<Registration>(
        `/api/v1/divisions/${divisionId}/registrations`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

export function useUpdateRegistrationStatus(
  divisionId: string,
  registrationId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { status: string }) =>
      apiPatch<Registration>(
        `/api/v1/divisions/${divisionId}/registrations/${registrationId}/status`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

export function useUpdateRegistrationSeed(
  divisionId: string,
  registrationId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { seed: number | null }) =>
      apiPatch<Registration>(
        `/api/v1/divisions/${divisionId}/registrations/${registrationId}/seed`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

export function useCheckInRegistration(
  divisionId: string,
  registrationId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiPost<Registration>(
        `/api/v1/divisions/${divisionId}/registrations/${registrationId}/check-in`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

export function useBulkNoShow(divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { registration_ids: number[] }) =>
      apiPost<void>(
        `/api/v1/divisions/${divisionId}/registrations/bulk-no-show`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

export function useWithdrawMidTournament(
  divisionId: string,
  registrationId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiPost<Registration>(
        `/api/v1/divisions/${divisionId}/registrations/${registrationId}/withdraw`,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

export function useUpdateAdminNotes(
  divisionId: string,
  registrationId: string,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { admin_notes: string }) =>
      apiPatch<Registration>(
        `/api/v1/divisions/${divisionId}/registrations/${registrationId}/admin-notes`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'registrations'],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Pods
// ---------------------------------------------------------------------------

export function useListPods(divisionId: string) {
  return useQuery<Pod[]>({
    queryKey: ['divisions', divisionId, 'pods'],
    queryFn: () => apiGet<Pod[]>(`/api/v1/divisions/${divisionId}/pods`),
    enabled: !!divisionId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreatePod(divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Pod>) =>
      apiPost<Pod>(`/api/v1/divisions/${divisionId}/pods`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'pods'],
      })
    },
  })
}

export function useUpdatePod(divisionId: string, podId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Pod>) =>
      apiPatch<Pod>(`/api/v1/divisions/${divisionId}/pods/${podId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'pods'],
      })
    },
  })
}

export function useDeletePod(divisionId: string, podId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiDelete<void>(`/api/v1/divisions/${divisionId}/pods/${podId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'pods'],
      })
    },
  })
}

// ---------------------------------------------------------------------------
// Announcements (tournament-scoped)
// ---------------------------------------------------------------------------

export function useListTournamentAnnouncements(
  tournamentId: string,
  divisionId?: string,
) {
  return useQuery<Announcement[]>({
    queryKey: ['tournaments', tournamentId, 'announcements', { divisionId }],
    queryFn: () =>
      apiGet<Announcement[]>(
        `/api/v1/tournaments/${tournamentId}/announcements${buildQueryString({ division_id: divisionId })}`,
      ),
    enabled: !!tournamentId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateTournamentAnnouncement(tournamentId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Announcement>) =>
      apiPost<Announcement>(
        `/api/v1/tournaments/${tournamentId}/announcements`,
        data,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['tournaments', tournamentId, 'announcements'],
      })
    },
  })
}

export function useUpdateAnnouncement(announcementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Announcement>) =>
      apiPatch<Announcement>(`/api/v1/announcements/${announcementId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}

export function useDeleteAnnouncement(announcementId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiDelete<void>(`/api/v1/announcements/${announcementId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments'] })
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Brackets
// ---------------------------------------------------------------------------

export function useGenerateBracket(divisionId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      apiPost<void>(`/api/v1/divisions/${divisionId}/bracket/generate`),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['divisions', divisionId, 'matches'],
      })
    },
  })
}

export function useListBracketMatches(divisionId: string) {
  return useQuery<BracketMatch[]>({
    queryKey: ['divisions', divisionId, 'matches'],
    queryFn: () =>
      apiGet<BracketMatch[]>(`/api/v1/divisions/${divisionId}/matches`),
    enabled: !!divisionId,
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Scoring Presets
// ---------------------------------------------------------------------------

export function useListScoringPresets() {
  return useQuery<ScoringPreset[]>({
    queryKey: ['scoring-presets'],
    queryFn: () => apiGet<ScoringPreset[]>('/api/v1/scoring-presets'),
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Leagues & Seasons (for tournament creation)
// ---------------------------------------------------------------------------

export function useSearchLeagues(query: string) {
  return useQuery<PaginatedData<League>>({
    queryKey: ['leagues', 'search', query],
    queryFn: () =>
      apiGetPaginated<League>(
        `/api/v1/leagues${buildQueryString({ query, limit: 20, offset: 0 })}`,
      ),
    enabled: query.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLeagueSeasons(leagueId: number | null) {
  return useQuery<Season[]>({
    queryKey: ['leagues', leagueId, 'seasons'],
    queryFn: () =>
      apiGet<Season[]>(`/api/v1/leagues/${leagueId}/seasons`),
    enabled: !!leagueId,
    staleTime: 5 * 60 * 1000,
  })
}

// ---------------------------------------------------------------------------
// Tournament Court management
// ---------------------------------------------------------------------------

export function useAssignCourtToTournament(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (courtId: number) =>
      apiPost(`/api/v1/tournaments/${tournamentId}/courts`, { court_id: courtId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] })
    },
  })
}

export function useCreateTempTournamentCourt(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { name: string; surface_type?: string }) =>
      apiPost(`/api/v1/tournaments/${tournamentId}/courts/temp`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] })
    },
  })
}

export function useUnassignCourtFromTournament(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (courtId: number) =>
      apiDelete(`/api/v1/tournaments/${tournamentId}/courts/${courtId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'courts'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Tournament Staff
// ---------------------------------------------------------------------------

export interface TournamentStaffMember {
  id: number
  tournament_id: number
  user_id: number
  role: string
  raw_password: string
  email: string | null
  first_name: string
  last_name: string
  public_id: string
  created_at: string
}

export function useTournamentStaff(tournamentId: number) {
  return useQuery<TournamentStaffMember[]>({
    queryKey: ['tournaments', tournamentId, 'staff'],
    queryFn: () => apiGet<TournamentStaffMember[]>(`/api/v1/tournaments/${tournamentId}/staff`),
    enabled: !!tournamentId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRegenerateStaffPassword(tournamentId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (role: string) =>
      apiPost<TournamentStaffMember>(`/api/v1/tournaments/${tournamentId}/staff/regenerate/${role}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tournaments', tournamentId, 'staff'] })
    },
  })
}
