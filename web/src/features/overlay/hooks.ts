// web/src/features/overlay/hooks.ts
//
// TanStack Query hooks for the Overlay + Source Profile control plane.
// All endpoints documented in api/router/router.go:294-320 and
// api/handler/overlay.go / api/handler/source_profile.go.
//
// Query-key convention:
//   ['overlay', 'config', courtID]         — CourtOverlayConfig
//   ['overlay', 'data', courtID, opts]     — OverlayData (live)
//   ['overlay', 'demo']                    — OverlayData (demo fallback)
//   ['overlay', 'themes']                  — Theme[]
//   ['overlay', 'theme', themeID]          — Theme
//   ['overlay', 'resolve', slug]            — { court_id, slug } (public resolve)
//   ['source-profiles']                    — SourceProfile[] (mine)
//   ['source-profiles', profileID]         — SourceProfile
//
// Every mutation invalidates the relevant keys. Error toasts are surfaced
// by callers via useToast() — hooks don't toast themselves (keeps them
// headless for reuse in the preview pane and non-UI contexts).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
} from '../../lib/api'
import type {
  ColorOverrides,
  CourtOverlayConfig,
  DataOverrides,
  ElementsConfig,
  OverlayData,
  SourceProfile,
  SourceProfileInput,
  SourceProfileTestResult,
  Theme,
} from './types'

// ----- Queries -----

/** GET /api/v1/overlay/court/{courtID}/config — authenticated. */
export function useOverlayConfig(courtID: number | null | undefined) {
  return useQuery<CourtOverlayConfig>({
    queryKey: ['overlay', 'config', courtID],
    queryFn: () =>
      apiGet<CourtOverlayConfig>(`/api/v1/overlay/court/${courtID}/config`),
    select: normalizeOverlayConfig,
    enabled: courtID != null && courtID > 0,
    staleTime: 2 * 60 * 1000,
  })
}

/**
 * Backend `config.elements` may omit keys (e.g. for a freshly-created
 * court that has never had its overlay configured, or for newly-added
 * element kinds that pre-existing rows haven't migrated to). Fill in
 * a `{visible: false}` default for every missing key so renderer
 * components can safely access `config.elements.<key>.visible` without
 * defensive null guards in 12 different files.
 *
 * Default keys mirror ALL_ELEMENT_KEYS in contract.ts.
 */
const ALL_ELEMENT_KEYS: Array<keyof ElementsConfig> = [
  'scoreboard',
  'lower_third',
  'player_card',
  'team_card',
  'sponsor_bug',
  'tournament_bug',
  'coming_up_next',
  'match_result',
  'custom_text',
  'bracket_snapshot',
  'pool_standings',
  'series_score',
]

function normalizeOverlayConfig(c: CourtOverlayConfig): CourtOverlayConfig {
  const incoming = (c.elements ?? {}) as Partial<ElementsConfig>
  const elements = {} as ElementsConfig
  for (const key of ALL_ELEMENT_KEYS) {
    const existing = incoming[key]
    // Each element config extends ElementConfigBase ({visible: boolean}).
    // Spread existing first so any element-specific extras (e.g.
    // CustomTextConfig.text) survive; visible defaults to false.
    elements[key] = {
      visible: false,
      ...(existing ?? {}),
    } as ElementsConfig[typeof key]
  }
  return {
    ...c,
    elements,
  }
}

export interface OverlayDataOptions {
  /** Pass the token from CourtOverlayConfig.overlay_token when present. */
  token?: string | null
  /** Force demo data regardless of live availability. */
  demo?: boolean
}

/**
 * GET /api/v1/overlay/court/{courtID}/data — public endpoint used by OBS.
 *
 * Staleness: this query is the primary poll fallback when WS is
 * disconnected. We keep the default refetchInterval off because in
 * normal operation the overlay WebSocket pushes fresh data — callers
 * enable polling via the `refetchInterval` option only for the preview
 * pane, which doesn't maintain a WebSocket.
 *
 * Normalization: backend emits `team_*.players: null` and other
 * potentially-null array fields when no live match is on the court
 * (idle state). The `select` callback below converts these to `[]` so
 * downstream renderers (TeamRow, PlayerCard, TeamCard, etc.) can
 * safely call `.slice` / `.map` / `.length` without per-component null
 * guards. The OverlayTeamData TS type still claims `PlayerBrief[]`
 * (non-null) and matches what consumers see.
 */
export function useOverlayData(
  courtID: number | null | undefined,
  opts: OverlayDataOptions = {},
) {
  const { token, demo } = opts
  const qs = new URLSearchParams()
  if (token) qs.set('token', token)
  if (demo) qs.set('demo', '1')
  const query = qs.toString()
  return useQuery<OverlayData>({
    queryKey: ['overlay', 'data', courtID, token ?? null, !!demo],
    queryFn: () =>
      apiGet<OverlayData>(
        `/api/v1/overlay/court/${courtID}/data${query ? '?' + query : ''}`,
      ),
    select: normalizeOverlayData,
    enabled: courtID != null && courtID > 0,
    staleTime: 0,
    retry: 1,
  })
}

/**
 * Coerces backend-null arrays into [] so downstream renderers don't
 * crash. Centralized here because every consumer of useOverlayData
 * is exposed to the same shape.
 */
function normalizeOverlayData(d: OverlayData): OverlayData {
  return {
    ...d,
    team_1: { ...d.team_1, players: d.team_1.players ?? [] },
    team_2: { ...d.team_2, players: d.team_2.players ?? [] },
    completed_games: d.completed_games ?? [],
    sponsor_logos: d.sponsor_logos ?? [],
  }
}

/** Response shape from GET /api/v1/overlay/court/{slug}/resolve. */
interface CourtResolveResult {
  court_id: number
  slug: string
}

/**
 * Resolves an overlay by the court's slug. Uses the public
 * /resolve endpoint to map slug→ID server-side, then delegates
 * to useOverlayData. Returns the resolved courtID alongside so
 * callers can pass it to useOverlayWebSocket and other
 * courtID-keyed hooks.
 *
 * Unlike the previous implementation that fetched the entire
 * courts list (authenticated), this uses a lightweight public
 * endpoint — no auth required, making it usable from OBS.
 */
export function useOverlayDataBySlug(
  slug: string | undefined,
  opts: OverlayDataOptions = {},
) {
  const courtsQuery = useQuery<CourtResolveResult>({
    queryKey: ['overlay', 'resolve', slug],
    queryFn: () =>
      apiGet<CourtResolveResult>(`/api/v1/overlay/court/${slug}/resolve`),
    enabled: !!slug,
    staleTime: 5 * 60 * 1000,
  })
  const courtID = courtsQuery.data?.court_id ?? null
  const overlay = useOverlayData(courtID, opts)
  return {
    courtID,
    courtsQuery,
    overlayQuery: overlay,
  }
}

/** GET /api/v1/overlay/themes — public. */
export function useThemes() {
  return useQuery<Theme[]>({
    queryKey: ['overlay', 'themes'],
    queryFn: () => apiGet<Theme[]>('/api/v1/overlay/themes'),
    staleTime: 5 * 60 * 1000,
  })
}

/** GET /api/v1/overlay/themes/{themeID} — public. */
export function useTheme(themeID: string | null | undefined) {
  return useQuery<Theme>({
    queryKey: ['overlay', 'theme', themeID],
    queryFn: () => apiGet<Theme>(`/api/v1/overlay/themes/${themeID}`),
    enabled: !!themeID,
    staleTime: 5 * 60 * 1000,
  })
}

/** GET /api/v1/overlay/demo-data — public fallback payload. */
export function useDemoData() {
  return useQuery<OverlayData>({
    queryKey: ['overlay', 'demo'],
    queryFn: () => apiGet<OverlayData>('/api/v1/overlay/demo-data'),
    staleTime: 60 * 1000,
  })
}

/** GET /api/v1/source-profiles — caller's profiles. */
export function useSourceProfiles() {
  return useQuery<SourceProfile[]>({
    queryKey: ['source-profiles'],
    queryFn: () => apiGet<SourceProfile[]>('/api/v1/source-profiles'),
    staleTime: 5 * 60 * 1000,
  })
}

/** GET /api/v1/source-profiles/{profileID}. */
export function useSourceProfile(profileID: number | null | undefined) {
  return useQuery<SourceProfile>({
    queryKey: ['source-profiles', profileID],
    queryFn: () =>
      apiGet<SourceProfile>(`/api/v1/source-profiles/${profileID}`),
    enabled: profileID != null && profileID > 0,
    staleTime: 2 * 60 * 1000,
  })
}

// ----- Overlay config mutations -----

export interface UpdateThemeInput {
  theme_id: string
  color_overrides?: ColorOverrides
}

/** PUT /api/v1/overlay/court/{courtID}/config/theme. */
export function useUpdateTheme(courtID: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation<CourtOverlayConfig, Error, UpdateThemeInput>({
    mutationFn: (input) =>
      apiPut<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/theme`,
        input,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
    },
  })
}

/** PUT /api/v1/overlay/court/{courtID}/config/elements. */
export function useUpdateElements(courtID: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation<
    CourtOverlayConfig,
    Error,
    { elements: ElementsConfig }
  >({
    mutationFn: (input) =>
      apiPut<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/elements`,
        input,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
    },
  })
}

/** PUT /api/v1/overlay/court/{courtID}/config/data-overrides. */
export function useUpdateDataOverrides(courtID: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation<CourtOverlayConfig, Error, { overrides: DataOverrides }>({
    mutationFn: (input) =>
      apiPut<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/data-overrides`,
        input,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
      qc.invalidateQueries({ queryKey: ['overlay', 'data', courtID] })
    },
  })
}

/** DELETE /api/v1/overlay/court/{courtID}/config/data-overrides. */
export function useClearDataOverrides(courtID: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation<CourtOverlayConfig, Error, void>({
    mutationFn: () =>
      apiDelete<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/data-overrides`,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
      qc.invalidateQueries({ queryKey: ['overlay', 'data', courtID] })
    },
  })
}

/** PUT /api/v1/overlay/court/{courtID}/config/source-profile. */
export function useUpdateSourceProfileBinding(
  courtID: number | null | undefined,
) {
  const qc = useQueryClient()
  return useMutation<
    CourtOverlayConfig,
    Error,
    { source_profile_id: number | null }
  >({
    mutationFn: (input) =>
      apiPut<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/source-profile`,
        input,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
      qc.invalidateQueries({ queryKey: ['overlay', 'data', courtID] })
    },
  })
}

/** POST /api/v1/overlay/court/{courtID}/config/token/generate. */
export function useGenerateOverlayToken(courtID: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation<CourtOverlayConfig, Error, void>({
    mutationFn: () =>
      apiPost<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/token/generate`,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
    },
  })
}

/** DELETE /api/v1/overlay/court/{courtID}/config/token. */
export function useRevokeOverlayToken(courtID: number | null | undefined) {
  const qc = useQueryClient()
  return useMutation<CourtOverlayConfig, Error, void>({
    mutationFn: () =>
      apiDelete<CourtOverlayConfig>(
        `/api/v1/overlay/court/${courtID}/config/token`,
      ),
    onSuccess: (cfg) => {
      qc.setQueryData(['overlay', 'config', courtID], cfg)
    },
  })
}

// ----- Source profile mutations -----

/** POST /api/v1/source-profiles. */
export function useCreateSourceProfile() {
  const qc = useQueryClient()
  return useMutation<SourceProfile, Error, SourceProfileInput>({
    mutationFn: (input) =>
      apiPost<SourceProfile>('/api/v1/source-profiles', input),
    onSuccess: (profile) => {
      qc.setQueryData(['source-profiles', profile.id], profile)
      qc.invalidateQueries({ queryKey: ['source-profiles'] })
    },
  })
}

/** PUT /api/v1/source-profiles/{profileID}. */
export function useUpdateSourceProfile() {
  const qc = useQueryClient()
  return useMutation<
    SourceProfile,
    Error,
    { id: number; input: SourceProfileInput }
  >({
    mutationFn: ({ id, input }) =>
      apiPut<SourceProfile>(`/api/v1/source-profiles/${id}`, input),
    onSuccess: (profile) => {
      qc.setQueryData(['source-profiles', profile.id], profile)
      qc.invalidateQueries({ queryKey: ['source-profiles'] })
    },
  })
}

/** POST /api/v1/source-profiles/{profileID}/deactivate. */
export function useDeactivateSourceProfile() {
  const qc = useQueryClient()
  return useMutation<SourceProfile, Error, number>({
    mutationFn: (id) =>
      apiPost<SourceProfile>(
        `/api/v1/source-profiles/${id}/deactivate`,
        undefined,
      ),
    onSuccess: (profile) => {
      qc.setQueryData(['source-profiles', profile.id], profile)
      qc.invalidateQueries({ queryKey: ['source-profiles'] })
    },
  })
}

/** DELETE /api/v1/source-profiles/{profileID}. */
export function useDeleteSourceProfile() {
  const qc = useQueryClient()
  return useMutation<void, Error, number>({
    mutationFn: (id) => apiDelete<void>(`/api/v1/source-profiles/${id}`),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['source-profiles', id] })
      qc.invalidateQueries({ queryKey: ['source-profiles'] })
    },
  })
}

/**
 * POST /api/v1/source-profiles/test — tests a connection and returns
 * discovered JSON paths.
 *
 * NOTE: As of Phase 4A the backend endpoint is not yet mounted. The
 * hook is wired here so the Phase 4D source-profile editor's
 * Test Connection button lands on a typed call site; the backend
 * route is scheduled as the first task of Phase 4D.
 */
export function useTestSourceProfileConnection() {
  return useMutation<SourceProfileTestResult, Error, SourceProfileInput>({
    mutationFn: (input) =>
      apiPost<SourceProfileTestResult>('/api/v1/source-profiles/test', input),
  })
}
