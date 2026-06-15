# Court Command — Status & Handoff

_Last updated: 2026-06-14. Work branch: **`feature/logto-integration`** (the real product tip — `main` is a stale pre-Logto snapshot, do not use it)._

## TL;DR

The local dev stack (Postgres + Redis + Logto + Go API + React web) was stood up and the
beta wrap-up is largely done. The annotated [SMOKE_TEST.md](SMOKE_TEST.md) punchlist, the
security hardening, the ref console, impersonation, and a new **public spectator drill-in**
feature are all merged (**15 PRs, #5–#19**). What remains before beta: an optional dedicated
public court page, the **VAIR** integration (blocked on vendor docs), the **Coolify deploy**,
and a README refresh.

## Done (merged on `feature/logto-integration`)

| PR | What |
|----|------|
| #5  | Beta punchlist + PR plan |
| #6  | fix(dev): postgres-init script must be POSIX sh, not bash (Logto DB now created) |
| #7  | fix(seed): quick matches + API keys owned by admin so they list |
| #8  | fix(layout): gate public bottom tabs on mobile for anon |
| #9  | fix(courts): block "stream live" when no stream URL |
| #10 | fix(players): VAIR shown before DUPR on detail + profile |
| #11 | fix(seed): username sign-up identifier when email verify unavailable (dev) |
| #12 | fix(auth): clean post-logout landing (no raw Logto end-session page) |
| #13 | **fix(security)**: remove admin bypass, complete org-role mapping, chain sport-JWT, lock WS origin |
| #14 | feat(ref): verbal calls + event log on the referee console (+ migration 00043) |
| #15 | feat(admin): restore impersonation via Logto token exchange |
| #16 | fix(impersonation): emit `act` claim via Logto JWT customizer (completes #15) |
| #17 | feat(public): read-only division detail + bracket + standings + matches endpoints |
| #18 | feat(public): spectator division page (bracket/standings/matches) + wire division cards |
| #19 | feat(public): anon-safe match page + court card drill-in, honest affordances |

Triage also confirmed **6 smoke items were already fixed** in earlier batches (global search,
profile save, team-create feedback, overlay-save jank, dashboard header, TV dark theme).

### Bugs found & fixed while standing up (not on the original list)
- **#6** postgres-init used a `bash` shebang; `postgres:17-alpine` has no bash, so the `logto`
  database was never created and Logto couldn't start.
- **#11** the Logto seeder crashed setting the sign-in experience with no SMTP (Logto rejects an
  email sign-up identifier without verification) — fall back to a username sign-up identifier.
- **#16** the impersonation token exchange produced no `act` claim on vanilla Logto; the seeder
  now installs an access-token JWT customizer that maps the subject-token context to `act`.

## What's left

1. **(Decision pending) Dedicated public court page** — its own URL showing a court's live match
   + recent results + queue + stream. ~2 PRs (one backend single-court public endpoint + one
   page). **Current behavior:** courts link directly to their live/on-deck match, and quiet
   courts are honest static cards. Decide whether the standalone court page is worth it.
2. **VAIR rating API sync** — backend client + sync job. **BLOCKED:** needs the VAIR API docs.
   Drop them in `docs/vendor/vair/`.
3. **VAIR SSO + dashboard link** — Logto social/enterprise connector + "Sign in with VAIR" +
   jump-to-VAIR-dashboard. **BLOCKED:** needs VAIR OAuth credentials + docs. Depends on (2).
4. **Coolify deploy → beta** — prod uses `docker-compose.yaml` (separate app DB + Logto DB +
   Ghost) against `logto.courtcommand.app`; see [LOGTO_SETUP.md](LOGTO_SETUP.md). The seeder now
   handles the prod JWT customizer + token-exchange. Run the prod seed once, paste outputs into
   Coolify env, redeploy `web` (VITE_* are build-time).
5. **README refresh** — `README.md` is stale (claims the frontend isn't started; references
   `backend/` instead of `api/`).
6. **Browser eyeball (low-risk confirmations)** — verified at code + headless level, but worth a
   click-through: the new public division/match/court drill-in, the ref console verbal-calls +
   event-log, the post-logout landing, the impersonation banner/stop flow, and the 6
   already-fixed smoke items.

## Resuming on another machine (Mac)

`.env` and the local Logto tenant are **machine-local and gitignored — they do NOT transfer.**
The Mac provisions its own fresh Logto. Full walkthrough: [LOCAL_DEV.md](LOCAL_DEV.md). Short version:

```sh
git fetch origin && git checkout feature/logto-integration && git pull

cp .env.example .env
make dev-up                      # Docker: Postgres + Redis + Logto

# In the Logto admin UI (http://localhost:3002):
#   - create the Logto admin account (first-run wizard)
#   - Applications -> Create -> Machine-to-machine "Court Command Backend"
#     -> Roles -> assign "Logto Management API access"
#   - copy App ID + App Secret into .env (LOGTO_MANAGEMENT_API_APP_ID / _SECRET)

make logto-seed                  # prints VITE_LOGTO_APP_ID, LOGTO_WEBHOOK_SIGNING_KEY, org IDs
#   -> paste those into .env, AND create web/.env with the VITE_* values (see "gotchas")

make dev                         # Go API at :8080 (runs migrations + auto-seeds Logto on boot)
make dev-frontend                # Vite at :5173

# Sign in once at http://localhost:5173 as admin@courtcommand.local / TestPass123!
#   (mirrors the bootstrap admin into the local users table — required before domain seed)
make seed                        # domain fixtures (tournaments, venues, matches, etc.)
```

The two seeder/infra bugs above are fixed, so this first-run now completes cleanly on a fresh box.

### Local-dev gotchas learned this session
- **`web/.env` is required** — Vite reads env from `web/`, not the repo root. It needs
  `VITE_API_URL`, `VITE_LOGTO_ENDPOINT`, `VITE_LOGTO_APP_ID`, `VITE_LOGTO_API_RESOURCE`
  (mirror the repo-root `.env` Logto values). See `web/.env.example`.
- **Domain seed needs a Logto-linked admin first** — `make seed` aborts with "No Logto-linked
  admin user found" until you've signed in once via the SPA (which mirrors the admin).
- **Token exchange** is enabled by default for existing SPA apps on Logto 1.22; the seeder
  installs the access-token JWT customizer that emits the impersonation `act` claim.

## Pointers
- Annotated smoke run: [SMOKE_TEST.md](SMOKE_TEST.md) · Feature inventory + known-broken: [FEATURES.md](FEATURES.md)
- PR plan / history: [BETA_PUNCHLIST.md](BETA_PUNCHLIST.md) · Prod Logto: [LOGTO_SETUP.md](LOGTO_SETUP.md)
