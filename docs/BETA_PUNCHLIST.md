# Court Command — Beta Punchlist & PR Plan

Source of truth for wrapping up the beta. Derived from the annotated
[SMOKE_TEST.md](SMOKE_TEST.md) run (2026-06) plus the known-broken list in
[FEATURES.md](FEATURES.md) §21.

**Base branch for all PRs:** `feature/logto-integration`
**Delivery:** one GitHub PR per work item against `RelentNet/court-command`.
**Merge policy:** master session auto-merges each PR once its checks are green
(go build + go test + tsc typecheck + eslint; live smoke where the stack is up),
then proceeds to dependents.

Legend: ☐ not started · ◐ in progress (agent dispatched) · ☑ merged

---

## Dependency waves

```
WAVE 1 (parallel — disjoint file sets)
  PR-01  Auth & security hardening        ── foundational, unblocks 08/09/11/17
  PR-02  Search crash fix
  PR-03  Profile save UX
  PR-04  Mutation feedback (team create + audit)
  PR-05  Toast consistency + overlay save modal
  PR-06  Dashboard polish
  PR-07  TV tournament dark theme
  PR-10  API keys listing + seed data
  PR-12  Court stream embed + config UI
  PR-13  Ref console redesign
  PR-14  VAIR rating display (foundational for VAIR chain)

WAVE 2 (after their blocker merges)
  PR-08  Mobile responsive layout      (after PR-01 — Sidebar)
  PR-09  Auth/session FE edges         (after PR-01 — auth FE)
  PR-15  VAIR rating API sync          (after PR-14; needs VAIR docs)

WAVE 3
  PR-11  Navigation gaps + signed-in home (after PR-08 — Sidebar)
  PR-17  Impersonation restore under JWT  (after PR-09 — auth core)
  PR-16  VAIR SSO + dashboard link        (after PR-15)
```

---

## PRs

### PR-01 — Auth & security hardening  ☐  · effort: max · BLOCKER
Closes the pre-beta security gaps. Foundational; several PRs wait on it.
- Remove `TEMP-ADMIN-BYPASS` at all sites (`git grep TEMP-ADMIN-BYPASS`):
  `api/middleware/auth.go` `RequirePlatformAdmin`, `web/src/features/admin/AdminGuard.tsx`,
  `web/src/components/Sidebar.tsx`, `web/src/features/admin/bypass.ts`.
- Complete org-role → `users.role` mapping in `api/auth/context.go` so
  tournament_director / referee / scorekeeper map through (today only
  `platform_admin` elevates; everyone else lands as `player`). FEATURES §21.
- Chain `RequireSportMatchesJWT` on protected routes in `api/router/router.go`
  (cross-sport data-leak window). FEATURES §21.
- Restrict WS `CheckOrigin` to `CORS_ALLOWED_ORIGINS` in `api/ws/handler.go:25`.
- Verify the bypass removal against the new Logto Mgmt-API elevation (commit
  `8063475`) before deleting the gate.
- Smoke refs: 15.x admin gating.

### PR-02 — Global search crash fix  ☐  · effort: high
Search modal opens but typing a query blanks the entire page. Add debounce,
error handling, and a result-list fallback so a failed/empty search never
unmounts the app. Smoke 1.11–1.12.

### PR-03 — Profile save UX  ☐  · effort: high
- Invalidate/refetch the profile query after a save so values render without F5
  (phone, gender dropdown, all fields). Smoke 5.3, 5.7.
- Switch the profile Address block to the Google Places `AddressInput` used
  elsewhere. Smoke 5.9.

### PR-04 — Mutation feedback (team create + audit)  ☐  · effort: high
Create Team submits, the form blanks, no confirmation. Redirect to the new
team (or show a success toast) and audit the other create flows
(org/venue/tournament) for the same missing feedback. Smoke 8.6.

### PR-05 — Toast consistency + overlay save modal  ☐  · effort: high
Overlay-settings save renders an inline banner that pushes the layout then
collapses (visible jank). Replace with the standard green popup toast and unify
toast styling/placement app-wide. Smoke 13.3, 16.4, 18.4.

### PR-06 — Dashboard polish  ☐  · effort: high
"Welcome back, Local" header is too small and too low-contrast. Resize / raise
contrast; light visual pass on the dashboard header. Smoke 2.5, 4.1.

### PR-07 — TV tournament dark theme  ☐  · effort: high
`/tv/tournaments/$id` renders on a light background. Default it to the Court
Command dark theme (sponsor/theming UI comes later). Smoke 14.2.

### PR-08 — Mobile responsive layout  ☐  · effort: high · after PR-01
At <768px the sidebar should hide and the top bar + bottom tabs (Home / Events
/ Live / News / More) should appear; today the sidebar stays and tabs don't
show. Touches `Sidebar`/`AppShell` → sequence after PR-01. Smoke 16.3.

### PR-09 — Auth/session FE edges  ☐  · effort: high · after PR-01
- Clean post-logout landing instead of dumping on the raw Logto
  `/oidc/session/end` URL. Smoke 16.10.
- Second tab: on the next 401 after logout, redirect to a public page instead
  of erroring on protected URLs. Smoke 17.4.
- `/auth/callback` with no query params: render a clean state, not a blank
  page; confirm intended re-auth behavior. Smoke 17.6.

### PR-10 — API keys listing + seed data  ☐  · effort: high
- Only 1 of 2 seeded API keys lists. Fix the listing query / confirm seed
  inserts both; keys without `logto_m2m_app_id` must still list. Smoke 15.9.
- Seed active quick matches so `/quick-match` isn't empty on a fresh seed.
  Smoke 10.1. Files: `api/db/seed.sql`, `api/handler/api_key.go`,
  `api/db/queries/api_keys.sql`.

### PR-11 — Navigation gaps + signed-in home  ☐  · effort: high · after PR-08
Pages work by direct URL but have no nav path while signed in: `/public/live`
(1.9), `/public/events` (1.10), match scoreboard (9.3), `/tv/courts/$slug`
(14.1). Add nav entries. Also: let signed-in users reach the public/home
surface and make announcements from it (1.1, 3.1). Touches `Sidebar` →
sequence after PR-08.

### PR-12 — Court stream embed + config UI  ☐  · effort: high
Court detail marks a court live but renders no video embed when no `stream_url`
is set. Add a stream-config UI (URL + type) on court detail and render the
embed when present. Smoke 8.15.

### PR-13 — Ref console redesign  ☐  · effort: max
Ref console got stripped down to ~scorekeeper. Rebuild for refs: verbal calls
(let / re-do / fault / line call), full event log alongside scoring, and the
game-history bar. Fix the Space=point keyboard shortcut (S=side-out works).
Smoke 11.5, 11.6. FEATURES §21.

### PR-14 — VAIR rating display  ☐  · effort: high
Players list/detail/profile lead with DUPR; make VAIR the primary displayed
rating (platform stays rating-agnostic, VAIR preferred partner). Establishes
the VAIR data field the sync chain builds on. Smoke 8.1.

### PR-15 — VAIR rating API sync  ☐  · effort: max · after PR-14 · needs VAIR docs
Backend VAIR API client + sync job (pull/refresh ratings). Requires the VAIR
API documentation — drop it in `docs/vendor/vair/` before this dispatches.
Smoke 15.11.

### PR-16 — VAIR SSO + dashboard link  ☐  · effort: max · after PR-15
SSO with VAIR and a jump-to-VAIR-dashboard link from the CC dashboard.
Coordinates with Logto. Smoke 15.11.

### PR-17 — Impersonation restore under JWT  ☐  · effort: max · after PR-09
Restore admin impersonation via Logto OAuth 2.0 Token Exchange (RFC 8693) per
the 8-step plan in FEATURES §20: enable token exchange on the SPA app, backend
`/admin/users/:id/impersonate` + stop endpoints, FE token handling +
`ImpersonationBanner` on the `act` claim, retire the legacy cookie
`Impersonator*` fields. Smoke 15.11.

---

## Deferred / not in this program
- Sponsor + theming UI for TV displays (beyond the dark-bg default in PR-07).
- Stripe billing / paid tiers.
- Second real sport beyond Pickleball (Demo Sport is a placeholder).
- Email / SMS notifications.
