# Production Deployment Runbook

> One-shot launch guide for deploying `feature/logto-integration` to Coolify.
> Run through this top-to-bottom on launch day.

## Pre-flight

- [ ] Coolify is up and you can reach its admin UI
- [ ] DNS records exist:
  - `courtcommand.app` → web service
  - `api.courtcommand.app` → api service
  - `logto.courtcommand.app` → Logto Core (already deployed)
  - `logto-admin.courtcommand.app` → Logto Admin (already deployed)
  - `news.courtcommand.app` → ghost service
- [ ] You have access to `~/code/court-command-v2/_local-secrets/logto-prod-creds.env` on your laptop (or the values themselves)

---

## Step 1 — Coolify env vars (configure BEFORE first deploy)

Coolify deploys `docker-compose.yaml`. The compose file forwards env vars from Coolify's project-level env settings into each service. Set ALL of these in the Coolify project's "Environment Variables" tab.

### Backend / api service

| Variable | Production value | Source |
|---|---|---|
| `APP_ENV` | `production` | literal |
| `DATABASE_URL` | `postgres://courtcommand:<DB_PASSWORD>@db:5432/courtcommand?sslmode=disable` | Coolify provisions |
| `REDIS_URL` | `redis://redis:6379/0` | Coolify default |
| `POSTGRES_USER` | `courtcommand` | literal |
| `POSTGRES_PASSWORD` | (generate strong password) | random — write down |
| `POSTGRES_DB` | `courtcommand` | literal |
| `CORS_ALLOWED_ORIGINS` | `https://courtcommand.app` | literal (add news/staging if needed) |
| `LOGTO_ENDPOINT` | `https://logto.courtcommand.app` | from `_local-secrets/logto-prod-creds.env` |
| `LOGTO_API_RESOURCE` | `https://api.courtcommand.app/api` | from `_local-secrets/logto-prod-creds.env` |
| `LOGTO_MANAGEMENT_API_APP_ID` | (from Logto admin) | see Step 2 |
| `LOGTO_MANAGEMENT_API_APP_SECRET` | (from Logto admin) | see Step 2 |
| `LOGTO_MANAGEMENT_API_RESOURCE` | `https://default.logto.app/api` | Logto-internal fixed value |
| `LOGTO_WEBHOOK_SIGNING_KEY` | (filled by Step 3) | output of `make prod-bootstrap` |

### Frontend / web service (build args — must be set BEFORE the web build)

| Variable | Production value |
|---|---|
| `VITE_API_URL` | `https://api.courtcommand.app` |
| `VITE_LOGTO_ENDPOINT` | `https://logto.courtcommand.app` |
| `VITE_LOGTO_APP_ID` | (filled by Step 3) |
| `VITE_LOGTO_API_RESOURCE` | `https://api.courtcommand.app/api` |
| `VITE_AUTO_REDIRECT_SINGLE_SPORT` | `true` |
| `VITE_GOOGLE_MAPS_API_KEY` | (your Google Maps key, optional) |
| `VITE_WS_URL` | `wss://api.courtcommand.app/ws` |

### Ghost (already configured)

| Variable | Production value |
|---|---|
| `GHOST_URL` | `https://news.courtcommand.app` |

> The variables marked **(filled by Step 3)** can stay blank for the first deploy — the api fail-fast will skip when they're empty AND `APP_ENV != production`. Set `APP_ENV=development` for the first push, then flip to `production` after Step 3 lands.

---

## Step 2 — Logto Management API client

Once Logto is up at `https://logto-admin.courtcommand.app`:

1. Sign in to the admin UI
2. **Applications** → **Create application** → **Machine-to-machine**
3. Name: `Court Command Backend Seeder`
4. Open the new app → **Roles** tab → assign `Logto Management API access` (built-in role)
5. **Settings** tab → copy **App ID** and **App Secret**
6. Paste into Coolify as `LOGTO_MANAGEMENT_API_APP_ID` and `LOGTO_MANAGEMENT_API_APP_SECRET`

---

## Step 3 — Run prod-bootstrap (provisions Logto + syncs DB)

This step is automated. Run it from your laptop pointing at production.

### Prepare `.env.prod`

Create `~/code/court-command-v2/court-command/.env.prod` (gitignored). Paste in:

```bash
APP_ENV=production

# DB (must be reachable from your laptop -- ideally over SSH tunnel
# or VPN; for one-shot launch you can temporarily expose 5432 via
# Coolify's "Exposed via the proxy" toggle on the db service, then
# turn it back off when this step finishes).
DATABASE_URL=postgres://courtcommand:<DB_PASSWORD>@<COOLIFY_HOST>:5432/courtcommand?sslmode=disable

# Logto
LOGTO_ENDPOINT=https://logto.courtcommand.app
LOGTO_API_RESOURCE=https://api.courtcommand.app/api
LOGTO_MANAGEMENT_API_APP_ID=<from Step 2>
LOGTO_MANAGEMENT_API_APP_SECRET=<from Step 2>
LOGTO_MANAGEMENT_API_RESOURCE=https://default.logto.app/api

# SPA redirect (the URL Logto redirects users to after sign-in)
LOGTO_SPA_REDIRECT_URI=https://courtcommand.app/auth/callback

# Webhook target (api consumes these in production)
LOGTO_WEBHOOK_URL=https://api.courtcommand.app/api/v1/webhooks/logto

# Bootstrap admin (the FIRST account you'll use to sign in)
LOGTO_BOOTSTRAP_EMAIL=daniel.f.velez@gmail.com
LOGTO_BOOTSTRAP_PASSWORD=<strong-password-you-pick>
LOGTO_BOOTSTRAP_NAME="Daniel Velez"

# Demo Sport: false in prod (Pickleball-only launch)
SEED_DEMO_SPORT=false
```

### Run

```bash
cd ~/code/court-command-v2/court-command
make prod-bootstrap
```

The script provisions:
- 12 API resource scopes
- SPA app `Court Command Web`
- Bootstrap admin user with `platform_admin` role
- Pickleball organization
- 5 org scopes + 5 org roles + scope→role bindings
- Webhook → `https://api.courtcommand.app/api/v1/webhooks/logto`
- Sign-in experience: email identifier
- User-level role `Court Command API (all scopes)` granting all 12 API scopes to the bootstrap admin
- Updates `sports.logto_org_id` row in the prod app DB to match the new Pickleball org

The summary block at the end prints:
- `LOGTO_PICKLEBALL_ORG_ID=...`
- `LOGTO_WEBHOOK_SIGNING_KEY=...`
- `VITE_LOGTO_APP_ID=...`

### Paste into Coolify

Take the printed values and update:
- `LOGTO_WEBHOOK_SIGNING_KEY` (api service)
- `VITE_LOGTO_APP_ID` (web service)

---

## Step 4 — Trigger Coolify rebuild

In Coolify:
1. Click **Redeploy** on the api service
2. After api is healthy, click **Redeploy** on the web service (it needs the new VITE_LOGTO_APP_ID baked in)

The api will run migrations on startup. `/api/v1/health` should return `{database:ok, redis:ok, status:ok}` once it's up.

---

## Step 5 — First sign-in smoke test

1. Visit `https://courtcommand.app/`
2. PublicLanding renders (hero + tournaments/leagues/venues directories — empty until you create some)
3. Click **Sign In to Get Started**
4. Logto sign-in form appears at `https://logto.courtcommand.app/sign-in`
5. Sign in with `daniel.f.velez@gmail.com` and the bootstrap password
6. Browser redirects to `https://courtcommand.app/auth/callback?code=...`
7. After token exchange, lands on `https://courtcommand.app/` (PublicLanding inside authenticated shell)
8. Click **Dashboard** in the sidebar → `/pickleball/dashboard` renders
9. Click **Profile** → `/pickleball/profile` renders the form

If anything 401s, check the api logs in Coolify and verify each Logto env var matches between Logto admin and Coolify.

---

## Step 6 — Post-launch hygiene

- [ ] Rotate `LOGTO_MANAGEMENT_API_APP_SECRET` if it was ever pasted into chat
- [ ] Disable the temporary 5432 exposure on the db service (if used for prod-bootstrap)
- [ ] Take a backup: `make backup-full`
- [ ] Push the `feature/logto-integration` branch to GitHub:
  ```bash
  git push origin feature/logto-integration
  ```
- [ ] Open the PR on GitHub (already exists at #4 — just push, the new commits land in the existing PR)
- [ ] Once verified working, merge to `main`
- [ ] Update `_local-secrets/logto-prod-creds.env` on your laptop with the final values

---

## Known issues (acceptable for launch)

These are documented in `docs/FEATURES.md §21`:

- **Impersonation under JWT** — broken, restored in Phase 4 (Logto-native via OAuth Token Exchange)
- **Cross-sport data leak** — RequireSportMatchesJWT not chained yet; not exploitable without the user manually editing URLs and a multi-sport account
- **Role mapping incomplete** — TD/ref/scorekeeper users created via Logto land as `users.role='player'` until Phase 4 adds the role mapping middleware. Workaround: manual SQL update for now.
- **Ref console scope reduced** — Phase 4 redesign needed
- **Live stream embed** — needs UI for `stream_url`
- **VAIR API integration** — Phase 4

None of these block initial launch with Pickleball as a single-tenant org and the bootstrap admin running tournaments.

---

## Rollback

If the deploy is broken and you need to revert:
1. Coolify → api service → Deployments tab → pick the previous green deployment → **Redeploy**
2. Coolify → web service → same
3. The DB schema is **forward-compatible** with the cookie-only `main` branch (Phase 2 was additive-only) — old code will tolerate the new columns. So a Coolify revert is a single-click full rollback.
