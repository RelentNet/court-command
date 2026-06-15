/**
 * Canonical overlay types — mirrors api/overlay/contract.go + generated
 * DB models (CourtOverlayConfig, SourceProfile) + api/overlay/themes.go.
 *
 * Wire shapes in this file MUST stay in sync with the backend:
 *   - OverlayData                 ← api/overlay/contract.go OverlayData
 *   - CourtOverlayConfig          ← api/db/generated/models.go CourtOverlayConfig
 *   - ElementsConfig              ← default map in api/service/overlay.go GetOrCreateConfig
 *   - SourceProfile               ← api/db/generated/models.go SourceProfile
 *   - Theme                       ← api/overlay/themes.go Theme
 *
 * Stringly-typed values are imported from ./contract so this file contains
 * only shapes + the keyed unions that bind to those constants.
 */

import type {
  AuthType,
  ElementKey,
  IdleDisplay,
  MatchStatus,
  OverrideKey,
  SourceType,
  SponsorTier,
} from './contract'

// ---------------------------------------------------------------------------
// Overlay data (what the renderer consumes)
// ---------------------------------------------------------------------------

export interface PlayerBrief {
  id?: number
  name: string
}

export interface OverlayTeamData {
  name: string
  short_name: string
  score: number
  /** Hex color, e.g. "#3b82f6" */
  color: string
  logo_url: string
  /**
   * Backend may emit `null` instead of `[]` when no live match is on
   * the court (e.g. the overlay control panel previewing an empty
   * court). The `useOverlayData` hook normalizes this to `[]` via a
   * `select` so consumers downstream of the hook can safely call
   * `.slice` / `.map` / `.length` without null guards.
   *
   * If you're consuming overlay data from somewhere that bypasses
   * useOverlayData, treat this as `PlayerBrief[] | null`.
   */
  players: PlayerBrief[]
  game_wins: number
}

export interface GameResult {
  game_num: number
  score_team_1: number
  score_team_2: number
  /** 1 or 2 */
  winner: 1 | 2
}

export interface SponsorLogo {
  name: string
  logo_url: string
  link_url: string
  tier: SponsorTier | string
}

export interface SeriesScoreData {
  team_1_wins: number
  team_2_wins: number
  best_of: number
}

export interface NextMatchData {
  team_1_name: string
  team_2_name: string
  division_name: string
  round_label: string
}

export interface BracketMatch {
  match_number: number
  team_1_name: string
  team_2_name: string
  team_1_score: number
  team_2_score: number
  /** 0 = not decided, 1 or 2 */
  winner: 0 | 1 | 2
  status: string
}

export interface BracketRound {
  round_num: number
  round_name: string
  matches: BracketMatch[]
}

export interface BracketData {
  division_name: string
  bracket_format: string
  rounds: BracketRound[]
}

export interface PoolTeamEntry {
  rank: number
  team_name: string
  wins: number
  losses: number
  point_differential: number
}

export interface PoolData {
  division_name: string
  pool_name: string
  standings: PoolTeamEntry[]
}

export interface OverlayData {
  match_status: MatchStatus | string
  team_1: OverlayTeamData
  team_2: OverlayTeamData
  /** 1 or 2 */
  serving_team: number
  /** 1 or 2 */
  server_number: number
  current_game: number
  completed_games: GameResult[]
  timeouts_remaining_1: number
  timeouts_remaining_2: number
  division_name: string
  tournament_name: string
  league_name: string
  round_label: string
  match_info: string
  sponsor_logos: SponsorLogo[]
  tournament_logo_url: string
  league_logo_url: string
  is_paused: boolean
  /** Only set for series matches (omitempty on the wire). */
  series_score?: SeriesScoreData | null
  /** From court queue; omitempty on the wire. */
  next_match?: NextMatchData | null
  court_name: string
  /** Division bracket snapshot; omitempty on the wire. */
  bracket?: BracketData | null
  /** Pool standings snapshot; omitempty on the wire. */
  pool?: PoolData | null
}

// ---------------------------------------------------------------------------
// Per-element configuration (inside CourtOverlayConfig.elements JSON)
// Key set is authoritative: api/service/overlay.go GetOrCreateConfig default map.
// Each element may have its own bag of knobs; common fields are typed,
// element-specific knobs are optional.
// ---------------------------------------------------------------------------

/**
 * Screen-relative anchor for a positioned element on the 1920×1080 canvas.
 * Full 3×3 grid so operators can pin anywhere. Each element has its own
 * sensible default (scoreboard bottom-left, tournament bug top-left,
 * sponsor bug top-right, etc.) and falls back to that default when
 * `position` is unset.
 *
 * LowerThird is a full-width banner by design and ignores this field.
 */
export type ElementPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'middle-center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface ElementConfigBase {
  visible: boolean
  auto_animate?: boolean
  /**
   * Universal size knob. Applied to the element's outer wrapper as
   * `transform: scale(N)`. Range 0.25..3.0, default 1.0 (no effect).
   * Slot footprint does not reserve extra space — oversized elements
   * bleed outside, which is the intended broadcast-producer behavior.
   */
  element_scale?: number
  /**
   * Universal position knob. Shared across every positioned element
   * (all except LowerThird). When unset, each element's renderer picks
   * a sensible default anchor.
   */
  position?: ElementPosition
}

/**
 * Scoreboard layout identifier. Themes control color/font tokens;
 * layouts control composition and structure. Adding a new layout is
 * a pure frontend change — the string flows through the elements JSON
 * column untouched.
 *
 * Known layouts:
 *   - `classic` (default): bottom-left stacked card, two team rows
 *     separated by a hairline, optional extras bar and context strip.
 *   - `banner`: wide horizontal broadcast-style banner with top + bottom
 *     context strips and a dark inset score column on the right.
 */
export type ScoreboardLayout = 'classic' | 'banner'

/**
 * @deprecated Use `ElementPosition` instead. Kept as an alias so any
 * existing call sites continue to compile while we migrate naming.
 */
export type ScoreboardPosition = ElementPosition

export interface ScoreboardConfig extends ElementConfigBase {
  layout?: ScoreboardLayout
  /**
   * Logo scale knobs (0.5..5.0, default 1.0). Each is applied independently
   * so operators can tune tournament branding vs. team identity without
   * affecting the others. Applied as a CSS transform inside the slot — the
   * slot box stays fixed so surrounding layout doesn't shift, but the logo
   * itself is allowed to escape the slot rectangle (no clipping).
   */
  tournament_logo_scale?: number
  team_1_logo_scale?: number
  team_2_logo_scale?: number
  /**
   * Per-logo translate offsets in CSS pixels relative to the logo's natural
   * slot position. Range ±120 by default in the control panel. Combined with
   * the scale as `transform: translate(x, y) scale(s)`.
   */
  tournament_logo_offset_x?: number
  tournament_logo_offset_y?: number
  team_1_logo_offset_x?: number
  team_1_logo_offset_y?: number
  team_2_logo_offset_x?: number
  team_2_logo_offset_y?: number
}

export interface LowerThirdConfig extends ElementConfigBase {}

/**
 * Player slots live on OverlayTeamData.players[] (0 = P1, 1 = P2).
 * The four-string union covers Doubles; Singles ignores P2 entries.
 */
export type PlayerCardSlot =
  | 'team_1_player_1'
  | 'team_1_player_2'
  | 'team_2_player_1'
  | 'team_2_player_2'

export interface PlayerCardConfig extends ElementConfigBase {
  auto_dismiss_seconds?: number
  /**
   * When config.visible is true (not a trigger), which player to show.
   * Trigger payload.player_id still wins over this when present.
   * Unset falls back to the current server / team_1 captain.
   */
  selected_player?: PlayerCardSlot
}

export type TeamCardSelection = 'both' | 'team_1' | 'team_2'

export interface TeamCardConfig extends ElementConfigBase {
  auto_dismiss_seconds?: number
  /**
   * When config.visible is true (not a trigger), which team(s) to show.
   * 'both' renders side-by-side. Trigger payload.team_id still wins
   * over this when present.
   */
  selected_team?: TeamCardSelection
}

export interface SponsorBugConfig extends ElementConfigBase {
  rotation_seconds?: number
  logos?: SponsorLogo[]
  /**
   * When true, the chip background is removed entirely — logos composite
   * directly onto the broadcast surface. Intended for sponsors supplying
   * transparent PNG/WEBP source art. Defaults to false (themed chip).
   */
  transparent_background?: boolean
}

export interface TournamentBugConfig extends ElementConfigBase {}

export interface ComingUpNextConfig extends ElementConfigBase {}

export interface MatchResultConfig extends ElementConfigBase {
  auto_show_delay_seconds?: number
  auto_dismiss_seconds?: number
}

/**
 * Curated web-safe font stack. Every entry below ships natively on major
 * desktop + mobile OS families, so we can render these without loading
 * any remote fonts. Values are the `font-family` fallback stack strings
 * that actually get applied in CSS. `system` inherits the theme font.
 */
export type CustomTextFont =
  | 'system'
  | 'system-ui'
  | 'Arial, sans-serif'
  | 'Helvetica, Arial, sans-serif'
  | '"Arial Black", Gadget, sans-serif'
  | 'Verdana, Geneva, sans-serif'
  | 'Tahoma, Geneva, sans-serif'
  | '"Trebuchet MS", "Lucida Grande", sans-serif'
  | '"Times New Roman", Times, serif'
  | 'Georgia, serif'
  | 'Garamond, "Apple Garamond", serif'
  | '"Palatino Linotype", "Book Antiqua", Palatino, serif'
  | '"Courier New", Courier, monospace'
  | '"Lucida Console", Monaco, monospace'
  | 'Impact, Charcoal, sans-serif'
  | '"Comic Sans MS", "Chalkboard SE", cursive'
  | '"Brush Script MT", "Brush Script Std", cursive'

export interface CustomTextConfig extends ElementConfigBase {
  text?: string
  auto_dismiss_seconds?: number
  /**
   * @deprecated Legacy zone field — replaced by `position` on
   * `ElementConfigBase`. Still read at runtime if `position` is unset so
   * stored configs from earlier builds don't reset to the default anchor.
   */
  zone?: string
  /** Font-family stack. Defaults to theme when omitted or `'system'`. */
  font_family?: CustomTextFont | string
  /** CSS color for the text glyphs. Defaults to `var(--overlay-text)`. */
  font_color?: string
  /**
   * CSS color for the chip background panel. Defaults to
   * `var(--overlay-primary)` when omitted. Ignored when
   * `transparent_background === true`.
   */
  background_color?: string
  /**
   * When true the chip panel is dropped entirely — text composites
   * directly onto the broadcast surface. Same pattern as SponsorBug.
   */
  transparent_background?: boolean
}

export interface BracketSnapshotConfig extends ElementConfigBase {}

export interface PoolStandingsConfig extends ElementConfigBase {}

export interface SeriesScoreConfig extends ElementConfigBase {}

export interface ElementsConfig {
  scoreboard: ScoreboardConfig
  lower_third: LowerThirdConfig
  player_card: PlayerCardConfig
  team_card: TeamCardConfig
  sponsor_bug: SponsorBugConfig
  tournament_bug: TournamentBugConfig
  coming_up_next: ComingUpNextConfig
  match_result: MatchResultConfig
  custom_text: CustomTextConfig
  bracket_snapshot: BracketSnapshotConfig
  pool_standings: PoolStandingsConfig
  series_score: SeriesScoreConfig
}

/** Map element key → config shape. */
export type ElementConfigFor<K extends ElementKey> = ElementsConfig[K]

// ---------------------------------------------------------------------------
// CourtOverlayConfig (DB row — what GET /api/v1/overlay/court/{id}/config returns)
// Source: api/db/generated/models.go CourtOverlayConfig (raw sqlc struct).
// The backend serializes Elements / ColorOverrides / DataOverrides as []byte
// (raw JSON); we type them here as structured objects for frontend convenience.
// ---------------------------------------------------------------------------

export interface ColorOverrides {
  /** Matches the CSS custom properties emitted by ThemeProvider. */
  primary?: string
  secondary?: string
  accent?: string
  background?: string
  text?: string
  font_family?: string
  border_radius?: string
  animation_style?: string
}

export type DataOverrides = Partial<Record<OverrideKey, string | number>>

export interface CourtOverlayConfig {
  id: number
  court_id: number
  theme_id: string
  color_overrides: ColorOverrides
  elements: ElementsConfig
  /** pgtype.Int8 serializes to `{Int64, Valid}`; sqlc-style, but the service
   *  layer maps it to *int64 at the HTTP boundary only on write. For reads the
   *  raw pgtype wrapper ships over the wire. We normalize both shapes here. */
  source_profile_id: PgtypeInt8 | number | null
  overlay_token: string | null
  show_branding: boolean
  match_result_delay_seconds: number
  idle_display: IdleDisplay | string
  data_overrides: DataOverrides
  created_at: string
  updated_at: string
}

/** pgtype.Int8 wire shape when a Go handler returns a raw sqlc row. */
export interface PgtypeInt8 {
  Int64: number
  Valid: boolean
}

/** Helper: normalize source_profile_id to plain number|null. */
export function normalizeSourceProfileID(
  v: CourtOverlayConfig['source_profile_id'],
): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  return v.Valid ? v.Int64 : null
}

// ---------------------------------------------------------------------------
// Source Profiles (api/db/generated/models.go SourceProfile)
// ---------------------------------------------------------------------------

export interface SourceProfile {
  id: number
  name: string
  created_by_user_id: number
  source_type: SourceType | string
  api_url: string | null
  webhook_secret: string | null
  auth_type: AuthType | string
  /** Shape depends on auth_type; tolerant Record for forward-compat. */
  auth_config: Record<string, unknown>
  /** pgtype.Int4 wire shape. */
  poll_interval_seconds: PgtypeInt4 | number | null
  /** Keys: canonical OverlayData / OverrideKey field names.
   *  Values: JSON path string into external payload (e.g. "data.score.home"). */
  field_mapping: Record<string, string>
  is_active: boolean
  /** pgtype.Timestamptz — RFC3339 or {Time, Valid}. */
  last_poll_at: PgtypeTimestamptz | string | null
  last_poll_status: string | null
  created_at: string
  updated_at: string
}

/** pgtype.Int4 wire shape. */
export interface PgtypeInt4 {
  Int32: number
  Valid: boolean
}

/** pgtype.Timestamptz wire shape. */
export interface PgtypeTimestamptz {
  Time: string
  Valid: boolean
}

export function normalizePollInterval(
  v: SourceProfile['poll_interval_seconds'],
): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v
  return v.Valid ? v.Int32 : null
}

export function normalizeTimestamptz(
  v: PgtypeTimestamptz | string | null | undefined,
): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v
  return v.Valid ? v.Time : null
}

// Create/Update payloads for POST /api/v1/source-profiles + PUT /{id}
export interface SourceProfileInput {
  name: string
  source_type: SourceType
  api_url?: string | null
  webhook_secret?: string | null
  auth_type: AuthType
  auth_config?: Record<string, unknown>
  poll_interval_seconds?: number | null
  field_mapping?: Record<string, string>
}

/** Response body for POST /api/v1/source-profiles/test. */
export interface SourceProfileTestResult {
  success: boolean
  status_code?: number
  /** Discovered JSON leaf paths (dot-separated) for FieldMapper dropdown. */
  discovered_paths?: string[]
  /** Raw sample payload echoed back for inspection. */
  sample_payload?: unknown
  error?: string
}

// ---------------------------------------------------------------------------
// Themes (api/overlay/themes.go)
// ---------------------------------------------------------------------------

export interface ThemeDefaults {
  primary: string
  secondary: string
  accent: string
  background: string
  text: string
  font_family: string
  border_radius: string
  /** "slide" | "fade" | "scale" | "none" — kept loose for forward-compat. */
  animation_style: string
}

export interface Theme {
  id: string
  name: string
  description: string
  defaults: ThemeDefaults
}

// ---------------------------------------------------------------------------
// Overlay triggers (ephemeral, UI-only; Phase 4C / 4E)
// These are queued client-side and not persisted to the backend.
// ---------------------------------------------------------------------------

export type TriggerKind = 'player_card' | 'team_card' | 'match_result' | 'custom_text'

export type TriggerDismissMode =
  | { kind: 'manual' }
  | { kind: 'auto'; durationMs: number }

export interface OverlayTrigger {
  id: string
  kind: TriggerKind
  /** Monotonic timestamp (Date.now) when the trigger began. */
  startedAt: number
  dismiss: TriggerDismissMode
  /** Arbitrary per-trigger payload (e.g. selected player, custom text). */
  payload?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// WebSocket message envelope
// Source: api/pubsub/pubsub.go Message — {type, channel, data}.
// ---------------------------------------------------------------------------

export interface OverlayWSMessage<T = unknown> {
  type: string
  channel: string
  data: T
}
