# Court Command — Feature Inventory

> **Purpose**
> Living catalog of every feature in Court Command. Updated on every commit
> that adds, removes, or changes feature surface. Use this as:
> - The smoke-test checklist before a release
> - The spec for any rewrite or major refactor
> - The shared mental model for what the product does
>
> **How to update**
> When a commit changes feature surface, edit this file in the SAME commit.
> Mark each line with a status emoji (legend below). Add a `(commit-sha)`
> reference for the commit that introduced or last changed it when useful.

## Status legend

- ✅ **Working** — implemented, tested, no known bugs
- ⚠️ **Partial / regressed** — exists but has known limitations or is broken on a subset of paths
- ❌ **Broken** — code exists but doesn't function; needs fixing
- 🚧 **In progress** — actively being built
- 📋 **Planned** — on the roadmap, not yet implemented
- 🗑️ **Removed** — was here, has been deleted (kept on the list as a historical reference for one release cycle, then drop)

---

## Last updated
- **Branch:** `feature/logto-integration`
- **Date:** 2026-05-03
- **Latest commit at update:** `90f8717` (Sidebar SportProvider lift)

---

## 1. Public / Anonymous Experience

Routes that work without sign-in. The public face of the product.

### Landing & Discovery
- ✅ Public landing page (`/`) — hero, news widget, public directories
- ✅ Public top bar + bottom tabs (mobile-app style nav for anonymous visitors)
- ✅ News widget pulling from Ghost CMS (`news.courtcommand.app`)
- ✅ Sign-in CTA from PublicHero — kicks off Logto OIDC flow
- ✅ Switch sport / re-pick (multi-sport users)

### Public Directories
- ✅ Public tournaments directory (`/public/tournaments`) — list with filters
- ✅ Public tournament detail (`/public/tournaments/:slug`) — divisions, schedule, results
- ✅ Public leagues directory (`/public/leagues`)
- ✅ Public league detail (`/public/leagues/:slug`)
- ✅ Public venues directory (`/public/venues`)
- ✅ Public venue detail (`/public/venues/:slug`)
- ✅ Public events feed (`/public/events`) — combined tournaments + leagues
- ✅ Public live page (`/public/live`) — currently live matches across the system

### Public Match Views
- ✅ Public match detail (`/$sport/matches/:publicId`) — viewable without auth
- ✅ Public match scoreboard (`/$sport/matches/:publicId/scoreboard`) — fullscreen, no shell, for projection / kiosk
- ✅ Public match-series detail (`/$sport/match-series/:publicId`)

### Public Search
- ✅ Search modal (Cmd-K) — searches across tournaments, leagues, venues, players, teams
- ✅ Search results grouped by entity type
- ✅ Search context (autocomplete, recent searches)

---

## 2. Authentication & Identity

### Sign-in / sign-up
- ✅ Logto OIDC sign-in flow
- ✅ Email-based sign-in (configured by seeder; default Logto template would require username-only)
- ✅ Sign-up via Logto hosted form (email + password, no email verification in dev)
- ✅ OIDC callback handler (`/auth/callback`) — code exchange + post-redirect from sessionStorage
- ✅ Sign-out — calls Logto `signOut`, returns to `/`
- ✅ JWT token attachment to all API calls (Bearer header from `apiFetch`)
- ✅ Org-scoped JWT — `getAccessToken(resource, organizationId)` produces a token with both API resource scopes and org audience

### User mirror sync
- ✅ Logto webhook handler (`POST /api/v1/webhooks/logto`) — HMAC-SHA-256 verified
- ✅ Webhook handles `User.Created`, `User.Data.Updated`, `User.Deleted`
- ✅ On-demand mirror middleware — fetches from Logto Mgmt API and upserts on first JWT request if no local row exists
- ✅ JWT-session bridge — populates `session.Data` from JWT claims for legacy handler compatibility

### User profile
- ✅ GET `/api/v1/auth/me` — returns the local users mirror row (JWT-protected)
- ✅ GET `/api/v1/me/profile` — returns `player_profiles` row (or empty DTO)
- ✅ PATCH `/api/v1/me/profile` — partial update with COALESCE narg pattern, requires `write:profile` scope
- ✅ Profile edit form (`/$sport/profile`) — 8 sections, all 25 player_profiles fields:
  - Contact (phone)
  - Pickleball Identity (DUPR ID, VAIR ID)
  - Equipment (paddle brand, paddle model)
  - Demographics (gender, handedness, date of birth, bio)
  - Address (line 1, line 2, city, state/province, country, postal code)
  - Emergency Contact (name, phone)
  - Medical (notes)
  - Privacy (hide from public directories)
- ✅ Sidebar "Switch sport" link

### Sessions / impersonation
- ✅ Cookie session path — kept as fallback for testutil server only (production uses JWT)
- ⚠️ **Impersonation / masquerade — currently non-functional under JWT, restoration path is Logto-native.** Existing backend code (`StartImpersonation`, `StopImpersonation`, `Impersonator*` fields on session.Data) is cookie-tied and doesn't see the JWT path. The correct fix is **NOT custom claim-stuffing** — Logto provides first-class impersonation via OAuth 2.0 Token Exchange (RFC 8693, see [docs](https://docs.logto.io/developers/user-impersonation)):
  1. Backend admin endpoint validates "Sarah can impersonate Alex," then calls Logto Mgmt API `POST /api/subject-tokens` with `userId=alex` and a `context` object (ticket ID, reason, etc.) — returns a 10-min single-use `subjectToken`.
  2. Frontend exchanges the subject token at Logto's `/oidc/token` with `grant_type=urn:ietf:params:oauth:grant-type:token-exchange` + `subject_token` + `actor_token=<admin's_access_token>` → receives an access token where `sub=alex` and `act.sub=sarah`.
  3. SPA stashes the impersonation token, `apiFetch` uses it for all subsequent requests. Backend RequireJWT validates it normally; user mirror sync flows naturally. The `act` claim is the audit signal.
  4. Stop impersonation = discard the impersonation token, revert to admin's regular token.
  
  Prerequisites:
  - Enable "Allow token exchange" on the SPA app in Logto (one-time toggle; seeder can apply via Mgmt API).
  - Admin endpoint must enforce "platform_admin only" + log to `activity_logs` for audit.
  - Frontend `ImpersonationBanner` reads the `act` claim from the current access token to render.

### Roles & Permissions
- ✅ Logto org roles: `player`, `tournament_director`, `referee`, `scorekeeper`, `platform_admin`
- ✅ Logto API resource scopes: `read:profile`, `write:profile`, `read:tournaments`, `write:tournaments`, `read:matches`, `write:matches`, `read:registrations`, `write:registrations`, `read:overlay`, `write:overlay`, `read:admin`, `write:admin` (12 total)
- ✅ Logto org scopes: `manage_tournaments`, `manage_matches`, `manage_registrations`, `manage_users`, `read_all` (5 total)
- ✅ Bootstrap admin granted `Court Command API (all scopes)` user-role with all 12 resource scopes (via seeder)
- ✅ Local `users.role` derivation from JWT claims (`elevatedRoleFromClaims`) — promotes to platform_admin when org claim present
- ⚠️ Other role mapping (TD, ref, scorekeeper) NOT yet derived from claims — local row defaults to `player` until manually patched

---

## 3. Sport Routing & Multi-Tenancy

Multi-sport architecture: tournaments/leagues/venues are scoped per sport via `sport_id` columns and Logto orgs.

- ✅ `GET /api/v1/sports` — public endpoint, returns active sports
- ✅ `sports` table seeded with Pickleball + Demo Sport (Demo Sport hidden in production launch mode)
- ✅ Single-sport launch mode (`VITE_AUTO_REDIRECT_SINGLE_SPORT=true`, `SEED_DEMO_SPORT=false` in prod)
- ✅ Sport picker UI (multi-sport mode) — at `/`, only renders when authenticated AND multiple active sports
- ✅ `$sport` URL segment for all sport-scoped routes (`/pickleball/dashboard`, `/pickleball/leagues`, etc.)
- ✅ SportProvider — globally mounted, derives slug from URL, exposes `useSport()` hook
- ✅ X-Sport HTTP header attached to API calls by `apiFetch` based on current URL
- ✅ Backend RequireSportMatchesJWT middleware exists (Phase 1) but **NOT yet chained on protected routes** — cross-sport URL editing is a known data-leak window
- ✅ SportGuard bounces unknown slugs to `/` (the picker)

---

## 4. Tournaments

`tournaments` table + `divisions` + `pods` + `tournament_courts` + `tournament_staff`.

### Lifecycle
- ✅ Create tournament (`/$sport/tournaments/create`)
- ✅ Tournament detail (`/$sport/tournaments/:tournamentId`) — overview, divisions, courts, staff, settings tabs
- ✅ Tournament list (`/$sport/tournaments`)
- ✅ Tournament settings tab — edit name, description, dates, scoring presets, etc.
- ✅ Tournament clone — duplicate a tournament with all divisions + settings
- ✅ Tournament publishing/lifecycle (status: draft, registration_open, in_progress, complete)
- ✅ Tournament announcements (`tournaments.announcements` route group)
- ✅ Soft-delete (deleted_at)

### Divisions
- ✅ Division CRUD (`/$sport/tournaments/:tournamentId/divisions/:divisionId`)
- ✅ Division registrations (table view)
- ✅ Division seeds (manual ordering of teams)
- ✅ Division bracket (auto-generated from registrations)
- ✅ Division overview, detail, list components
- ✅ Division forms (create, edit)

### Pods (group-stage pools)
- ✅ Pod CRUD
- ✅ Pod-to-team assignment
- ✅ Pod scheduling (matches across pod members)

### Courts
- ✅ Tournament-to-court assignment (`tournament_courts` junction table)
- ✅ Assign existing venue court to tournament
- ✅ Create temp court for tournament (one-off)
- ✅ Unassign court from tournament

### Staff
- ✅ Tournament staff invites (`tournament_staff` table) — TD, head ref, ref, scorekeeper, broadcast operator roles
- ✅ Staff regenerate token (resend invite)
- ✅ Staff list per tournament
- ⚠️ Tournament staff sign-in flow — handler exists but cookie-tied; needs Phase 4 review under JWT

### Tournament-level features
- ✅ Tournament announcements (text post + scheduled visibility)
- ✅ Tournament public view (slug-routed)
- ✅ Tournament directory filters (sport, status, date range)

---

## 5. Leagues & Seasons

`leagues` + `seasons` + `division_templates` + `season_confirmations` + `league_registrations`.

- ✅ Create league (`/$sport/leagues/create`)
- ✅ League detail (`/$sport/leagues/:leagueId`)
- ✅ League list (`/$sport/leagues`)
- ✅ League announcements feed
- ✅ League registrations (separate from tournament registrations)
- ✅ Seasons CRUD per league (`/$sport/leagues/:leagueId/seasons/:seasonId`)
- ✅ Season form (create, edit)
- ✅ Season list
- ✅ Season confirmations — players opt in to play a given season
- ✅ Division templates per league — reusable bracket/format definitions
- ✅ Standings view (`StandingsView`)

---

## 6. Registry — Players, Teams, Organizations, Venues, Courts

Long-lived domain entities not tied to a single tournament/season.

### Players
- ✅ Player list (`/$sport/players`) — paginated, searchable
- ✅ Player detail (`/$sport/players/:playerId`)
- ✅ Player creation (legacy form via `PlayerForm.tsx` — uses `/api/v1/players/me`, cookie-only path; orphaned post-Phase-3, candidate for deletion in Phase 6)
- ✅ Shadow players (status='unclaimed', no Logto link) — created via TD workflow OR seed script
- 📋 Claim flow — when a real Logto user signs up matching an existing unclaimed user's email, merge rows. **Not yet implemented; Phase 4+.**

### Teams
- ✅ Teams list (`/$sport/teams`)
- ✅ Team detail (`/$sport/teams/:teamId`)
- ✅ Team create (`/$sport/teams/new`)
- ✅ Team edit (`/$sport/teams/:teamId/edit`)
- ✅ Team rosters (`team_rosters` junction with player IDs)
- ✅ Team minimum-2-players validation

### Organizations
- ✅ Org list (`/$sport/organizations`)
- ✅ Org detail (`/$sport/organizations/:orgId`)
- ✅ Org create (`/$sport/organizations/new`)
- ✅ Org edit (`/$sport/organizations/:orgId/edit`)
- ✅ Org memberships (`org_memberships` table — many-to-many users-to-orgs)
- ✅ Org blocks (`org_blocks` — orgs can block other orgs from registering in their tournaments)
- ✅ Org-team relationship (teams optionally belong to an org)

### Venues
- ✅ Venue list (`/$sport/venues`)
- ✅ Venue detail (`/$sport/venues/:venueId`) — info, courts, upcoming matches, stream embeds
- ✅ Venue create (`/$sport/venues/new`)
- ✅ Venue edit (`/$sport/venues/:venueId/edit`)
- ✅ Venue managers (`venue_managers` junction — users with edit permission on a venue)
- ✅ Venue address with Google Maps integration (`MapView` component)
- ✅ Address standardization (formatted_address, lat/long via Maps API)
- ✅ Stream embed support (`StreamEmbed` component for venue + court live streams)

### Courts
- ✅ Court list (`/$sport/courts`)
- ✅ Court detail (`/$sport/courts/:courtId`) — info, current match, queue, recent results
- ✅ Standalone/floating courts (not tied to a tournament)
- ✅ Court live status (available, occupied, maintenance)
- ✅ Court queue (queue of upcoming matches per court)
- ✅ Court overlay configuration (per-court broadcast settings)

---

## 7. Match Operations

`matches` + `match_events` + `match_series` + `tournament_matches` (via tournament_courts).

### Match lifecycle
- ✅ Match detail page (`/$sport/matches/:publicId`)
- ✅ Match info panel (court, teams, time, status)
- ✅ Match hero (live score, key stats)
- ✅ Match status: `preparing`, `in_progress`, `completed`, `cancelled`
- ✅ Match completion — refs see Rematch / Save & Exit / Delete options
- ✅ Match history is read-only (matches in `completed` status)
- ✅ Match scoreboard page (`/$sport/matches/:publicId/scoreboard`) — fullscreen, no shell, projection-friendly

### Match events
- ✅ Event-sourced scoring — every point/serve/timeout/etc. emits an event
- ✅ Event timeline view
- ✅ Undo last event (restore from snapshot)
- ✅ Score override modal (admin/TD recovery)
- ✅ Game over confirmation modal
- ✅ Match complete banner

### Match series
- ✅ Match-series creation per division (best-of-N)
- ✅ Match-series detail (`/$sport/match-series/:publicId`)
- ✅ Series score tracking
- ✅ Series-aware overlay element

### Quick Match
- ✅ Quick match list (`/$sport/quick-match`)
- ✅ Quick match create (`/$sport/quick-match/new`)
- ✅ Quick match card on dashboard
- ✅ Auto-cleanup of stale quick matches (background job, hourly)

---

## 8. Scoring — Engine + UI

Pickleball-specific scoring logic + UI for officials.

### Engine
- ✅ Pickleball rules engine — server rotation, side-out, point scoring, win-by-2
- ✅ Custom scoring presets (game-to-X, win-by-N, sideout/rally, etc.)
- ✅ Best-of-N games support
- ✅ Match contract test (engine isolation)

### Referee Console
- ✅ Ref home (`/$sport/ref`) — list of assigned courts
- ✅ Ref court view (`/$sport/ref/courts/:courtId`)
- ✅ Ref match console (`/$sport/ref/matches/:publicId`) — full scoring UI
- ✅ Court grid (multi-court overview for venues)
- ✅ Live scoring buttons (Side Out, Point)
- ✅ Serve indicator (which player serves next)
- ✅ Timeout badge / track timeouts
- ✅ Score call display
- ✅ Game history bar (game scores so far)
- ✅ Match setup (assign teams + format before start)
- ✅ Lazy match configuration (refs can edit teams mid-match if needed)
- ✅ Disconnect banner (websocket dropped)
- ✅ Keyboard shortcuts for fast scoring
- ✅ Scoring preferences (per-user UI prefs)

### Scorekeeper Console
- ✅ Scorekeeper home (`/$sport/scorekeeper`)
- ✅ Scorekeeper match console (`/$sport/scorekeeper/matches/:publicId`)
- ✅ Read-only scoreboard view + event timeline
- ✅ Suggest score corrections to ref

### Real-time
- ✅ WebSocket match subscription (`useMatchWebSocket`)
- ✅ Court-level subscription (multiple matches on a court)
- ✅ Auto-reconnect on dropout
- ✅ WebSocket broadcast from backend on event create

---

## 9. Brackets & Court Queue

- ✅ Bracket auto-generation from division registrations
- ✅ Bracket court assignment (which courts host which round)
- ✅ Bracket snapshot for overlay
- ✅ Court queue position tracking
- ✅ Auto-advance teams through bracket on match completion

---

## 10. Standings

`standings_entries` table.

- ✅ Per-division standings calculation
- ✅ Per-season league standings
- ✅ Standings view component (sortable table with W/L/Pts)
- ✅ Tiebreaker rules (point differential, head-to-head)
- ✅ Standings refresh on match completion

---

## 11. Broadcast — Overlay System

`court_overlay_configs` + `source_profiles` + `themes` (JSON-defined). A complete OBS browser-source / kiosk system.

### Renderer
- ✅ Per-court overlay URL (`/overlay/court/:slug`)
- ✅ Demo overlay (`/overlay/demo/:themeId`) — for theme preview without a live match
- ✅ Transparent background composite
- ✅ Real-time WebSocket-driven updates
- ✅ Element scale control (responsive to OBS canvas size)
- ✅ Fade mount/unmount transitions

### Element library
- ✅ Scoreboard (live match score, server indicator, set count)
- ✅ Lower third (player names, sponsor)
- ✅ Player card (info card with photo + stats)
- ✅ Team card (team logo + roster)
- ✅ Pool standings (round-robin results)
- ✅ Bracket snapshot (current bracket state)
- ✅ Series score (best-of-N tracker)
- ✅ Match result (final score banner)
- ✅ Sponsor bug (logo overlay)
- ✅ Tournament bug (tournament name/branding)
- ✅ Custom text element (TD-defined messages)
- ✅ Coming up next (queued match preview)

### Control panel
- ✅ Overlay control panel (`/overlay/court/:slug/settings`)
- ✅ Elements tab — toggle which elements are visible
- ✅ Theme tab — choose theme (12 elements styled by JSON config)
- ✅ Source tab — which match/court/series feeds the elements
- ✅ Triggers tab — manual fire of one-off elements
- ✅ Overrides tab — replace data fields (e.g., custom player name)
- ✅ OBS URL tab — generated browser-source URL with token
- ✅ Token-protected overlay URLs (rotation, generate, revoke)

### Source profiles
- ✅ Source profile editor — reusable broadcast scene config
- ✅ Source profile list
- ✅ Per-court source profile binding

### Producer Monitor
- ✅ Producer monitor (`/overlay/monitor`) — TD-facing view of all live overlays
- ✅ Court monitor card per active court
- ✅ Real-time status of each broadcast source

### Setup Wizard
- ✅ Setup wizard (`/overlay/setup`) — guided flow for first-time broadcast setup
- ✅ Walks through: source profile → theme → elements → court binding → URL generation

---

## 12. TV / Kiosk Displays

Fullscreen, no-shell, public-facing displays for venues.

- ✅ TV tournament display (`/tv/tournaments/:id`) — bracket + scores + sponsor rotation
- ✅ TV court display (`/tv/courts/:slug`) — single court fullscreen
- ✅ Slide rotation (`useSlideRotation`) — auto-cycle through views
- ✅ TVKiosk bracket / TVKiosk court components

---

## 13. Dashboard (Authenticated User Home)

`/$sport/dashboard` — landing for authenticated users.

- ✅ Welcome header with user name
- ✅ Stats summary (career W/L, recent activity)
- ✅ Active registrations (tournaments user is registered for)
- ✅ Upcoming matches (next scheduled matches)
- ✅ My Teams (teams user belongs to)
- ✅ Recent results (last completed matches)
- ✅ Dashboard announcements (tournament/league/system-wide broadcast)
- ✅ Manage hub (`/$sport/manage`) — TD-facing aggregate of tournaments, leagues, orgs the user manages

---

## 14. Admin Platform

Platform-admin-only console for managing the system. `/$sport/admin/*`

### User management
- ✅ User search (`/$sport/admin/users`)
- ✅ User detail (`/$sport/admin/users/:userId`)
- ✅ User edit (role, status changes)
- ⚠️ User impersonation (start) — handler exists but broken end-to-end under JWT (see §2)
- ⚠️ User impersonation (stop) — same issue
- ✅ Role assignment (player, TD, ref, scorekeeper, platform_admin)
- ✅ User status management (active, suspended, banned, unclaimed, merged, deleted)

### System monitoring
- ✅ Activity log (`/$sport/admin/activity`) — audit trail of admin actions
- ✅ Activity log filters (action type, user, date range)

### Settings
- ✅ Site settings page (`/$sport/admin/settings`)
- ✅ Settings persistence (`site_settings` key/value table)
- ✅ Ghost CMS integration toggle
- ✅ Google Maps API key
- ✅ Public site display preferences

### Uploads
- ✅ Upload browser (`/$sport/admin/uploads`)
- ✅ Image upload component (used across forms)
- ✅ Orphaned upload cleanup (background job, daily)

### Ad management
- ✅ Ad manager (`/$sport/admin/ads`)
- ✅ Ad config CRUD (`ad_configs` table)
- ✅ Ad display duration per slot
- ✅ Public ad slot rendering (`AdSlot` component)
- ✅ Ad rotation logic

### API keys
- ✅ API key manager (`/$sport/admin/api-keys`)
- ✅ Key generation (random + bcrypt-hashed storage)
- ✅ Key revocation (is_active flag)
- ✅ Optional binding to Logto M2M app ID

### Venue approval
- ✅ Venue approval UI (`/$sport/admin/venues`) — TDs submit, admin approves
- ✅ Approval workflow (pending → approved/rejected)

---

## 15. Webhooks & Integrations

- ✅ Logto webhook (`/api/v1/webhooks/logto`) — User.Created/Updated/Deleted
- ✅ HMAC-SHA-256 signature verification
- ✅ Idempotent upsert via UserSyncService
- ✅ Generic court webhook (`/api/v1/overlay/webhook/:courtID`) — TBD purpose, accepts external triggers
- 📋 Stripe webhook (deferred to billing phase)

---

## 16. Real-Time / WebSocket

- ✅ WebSocket gateway (`/api/v1/ws`)
- ✅ Match subscription channel
- ✅ Court subscription channel
- ✅ Auto-broadcast on match event create
- ✅ Reconnect logic on client (handled in `useWebSocket` / `useMatchWebSocket`)

---

## 17. Cross-Cutting UX

- ✅ Sidebar (collapsible, mobile-responsive)
- ✅ Theme system (light/dark/system) via `ThemeToggle`
- ✅ Toast notifications (success/error/info)
- ✅ Confirm dialog component
- ✅ Modal component
- ✅ Pagination
- ✅ Skeleton loaders
- ✅ Error boundary (per-route)
- ✅ Offline banner
- ✅ Install banner (PWA)
- ✅ Update prompt (PWA)
- ✅ Service worker (PWA, Workbox)
- ✅ Skip-to-content accessibility link
- ✅ Form components (Input, Textarea, Select, FormField, DateInput, AddressInput, ImageUpload)
- ✅ Avatar component (initials fallback)
- ✅ Badge / StatusBadge
- ✅ Card component
- ✅ EmptyState component
- ✅ TabLayout component
- ✅ Table component
- ✅ Search input
- ✅ ScoringPresetPicker
- ✅ VenuePicker
- ✅ SponsorEditor
- ✅ MapView (Google Maps embed)
- ✅ NewsWidget (Ghost CMS)
- ✅ Rich text display (markdown rendering)

---

## 18. Backend Cross-Cutting

- ✅ Health endpoint (`/api/v1/health`) — db + redis + build info
- ✅ Slog structured logging (production JSON, dev human)
- ✅ Request ID propagation
- ✅ CORS middleware (configurable allowed origins; X-Sport in allow-headers)
- ✅ JWT validator (jwx/v3, JWKS cache with stale fallback, ErrJWKSUnavailable sentinel for 503 vs 401)
- ✅ JWT-session bridge (claims → session.Data)
- ✅ Optional JWT (mixed-auth routes — Phase 3.6)
- ✅ MirrorUser middleware (on-demand Logto user mirror)
- ✅ Activity log service (audit writer)
- ✅ Slug service (URL-friendly generation)
- ✅ Search service (full-text across entities)
- ✅ Background jobs:
  - Quick match cleanup (hourly)
  - Upload orphan cleanup (daily, min 7d age)
- ✅ Goose migration runner (auto-applies on startup, blocks app start on failure)
- ✅ sqlc-generated query layer (~110 queries)
- ✅ Production fail-fast on missing required env vars (Phase 3.6)
- ✅ Logto Mgmt API client (cached M2M token, auto-refresh with safety margin)

---

## 19. Local Dev Tooling

- ✅ Docker Compose dev stack (`docker-compose.dev.yml`) — Postgres + Redis + Logto
- ✅ Logto seeder (`api/cmd/logto-seed/main.go`) — idempotent provisioner
- ✅ Seed.sql — 24 fixtures (1 admin + 17 unclaimed players + 6 staff, 3 orgs, 8 teams, 3 tournaments, etc.)
- ✅ `make dev-up` / `make dev-down` / `make dev-logs` / `make dev-reset`
- ✅ `make logto-seed`
- ✅ `make migrate-up` / `make migrate-down` / `make migrate-create`
- ✅ `make seed` (DB fixtures via dev compose)
- ✅ `make dev` (backend dev mode)
- ✅ `make build` (production binary)
- ✅ `make test` (Go test suite)
- ✅ Playwright E2E test (`pnpm e2e`) — full auth + dashboard + profile flow
- ✅ Bootstrap admin: `admin@courtcommand.local` / `TestPass123!`

---

## 20. Phase 4+ Roadmap (Not Yet Implemented)

Tracked here so they don't get lost.

### Auth / identity
- 📋 Restore impersonation via Logto OAuth 2.0 Token Exchange (RFC 8693) — see §2 for the full flow. Concrete tasks:
  1. Enable "Allow token exchange" on SPA app via seeder (`PATCH /api/applications/:id` setting `customClientMetadata.allowTokenExchange=true`).
  2. Backend: `POST /api/v1/admin/users/:userId/impersonate` (platform_admin only, logs to activity_logs) — calls Logto Mgmt `POST /api/subject-tokens`, returns subject token to frontend.
  3. Backend: `POST /api/v1/admin/stop-impersonation` — no-op now (frontend handles), but keep for symmetry/audit log entry.
  4. Frontend: when admin clicks "Impersonate" in UserDetail, POST to backend, then exchange at Logto's `/oidc/token` for the impersonation access token, store separately from admin's token.
  5. Frontend `apiFetch`: prefer impersonation token over admin token when present.
  6. Frontend `useAuth`: detect `act` claim → expose `isImpersonating: true` + `impersonator: act.sub`.
  7. Frontend `ImpersonationBanner`: render whenever `act` claim is present, with "Stop impersonation" button that discards the impersonation token.
  8. Cleanup: delete the legacy session-cookie `Impersonator*` fields, `StartImpersonation`/`StopImpersonation` cookie handlers, `users.session.Data.Impersonator*` once the new path lands.
- 📋 Claim flow — merge unclaimed users with Logto-mirrored users by email match
- 📋 Map all 5 Logto org roles → local users.role (currently only platform_admin elevation works)
- 📋 Chain `RequireSportMatchesJWT` middleware on protected routes (cross-sport URL editing is a known data-leak window)

### Performance / hardening
- 📋 Rate-limit Logto Mgmt API fetches per Subject (DoS amplification mitigation)
- 📋 Phase 6 cleanup — drop cookie code paths (RequireAuth, OptionalAuth, password_hash column, cookie session store, /auth/login, /auth/register, /auth/logout endpoints, legacy /players/me)
- 📋 Drop 3 documented seeder DB patches (move to Logto Mgmt API once those endpoints are confirmed in our SDK)
- 📋 Externalize webhook URL for prod (currently hardcoded `host.docker.internal:8080`)

### Code quality
- 📋 Extract `splitName` to `internal/usersync` (currently duplicated in middleware/handler)
- 📋 Delete dead `PlayerForm` + legacy player hooks (orphaned post-Phase-3)
- 📋 Frontend code-quality review of feature directories (some may be larger than ideal)

### Future product features (not yet started)
- 📋 Stripe billing integration (organization-level paid tiers)
- 📋 Multi-sport beyond Pickleball (Demo Sport is a placeholder; real second sport TBD)
- 📋 Mobile app (PWA → native via Capacitor or Expo)
- 📋 Advanced analytics dashboards
- 📋 Spectator-side notifications (subscribe to live matches)
- 📋 Replay clips / video integration (alongside StreamEmbed)
- 📋 DUPR sync (pull/push player ratings)
- 📋 VAIR sync (pull/push player ratings)
- 📋 Email notifications (registration confirmations, match reminders, etc.)
- 📋 SMS notifications

---

## 21. Known Broken / Regressed (top priority for repair)

- ⚠️ **Impersonation under JWT** (§2) — biggest feature regression from cookie → JWT migration. Restoration path is Logto-native via OAuth 2.0 Token Exchange (RFC 8693); concrete 8-step plan in §20. Phase 4 priority.
- ⚠️ **Cross-sport data leak window** (§3) — RequireSportMatchesJWT not chained. Phase 4 priority.
- ⚠️ **Role mapping incomplete** (§2) — only platform_admin elevation works. TD/ref/scorekeeper org-role users land with `users.role='player'` until manually patched.

---

## 22. Removed (historical)

(none yet — first release of this inventory)

---

*End of inventory. Update on every feature-affecting commit.*
