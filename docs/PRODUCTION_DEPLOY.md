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
| `LOGTO_WEBHOOK_SIGNING_KEY` | (filled by Step 3) | output of bootstrap container |
| `SMTP_HOST` | `smtp.resend.com` | Resend SMTP |
| `SMTP_PORT` | `465` | TLS |
| `SMTP_USER` | `resend` | literal — Resend's username |
| `SMTP_PASS` | `re_iCNtaEuU_...` | Resend API key |
| `EMAIL_FROM` | `noreply@mail.courtcommand.app` | from your verified Resend domain |
| `EMAIL_FROM_NAME` | `Court Command` | display name on emails |

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

## Step 2.5 — Resend (production email delivery)

Skipping this step is OK for a smoke deploy, but **without email configured, sign-up will be blocked** because Logto requires email verification when the sign-up identifier is email. The bootstrap admin is created by the seeder via the Mgmt API (bypassing the verification flow), so YOU can still sign in — but no second user can.

1. Sign up at https://resend.com (free tier covers 3,000 emails/month, plenty for early launch)
2. **Domains** → **Add Domain** → `mail.courtcommand.app` (subdomain keeps the apex pristine)
3. Resend gives you 3-4 DNS records (SPF + DKIM + tracking). Add them to your DNS provider for `courtcommand.app`. Verification typically takes 5-30 min.
4. **API Keys** → **Create API Key** → name `Court Command production`, permission `Sending access`. Copy the `re_...` value. **The key is shown only once.**
5. Test the key with curl (the seeder will use SMTP, but a one-shot REST POST proves the key works):

   ```bash
   curl -s -X POST 'https://api.resend.com/emails' \
     -H 'Authorization: Bearer re_YOUR_KEY' \
     -H 'Content-Type: application/json' \
     -d '{
       "from": "Court Command <noreply@mail.courtcommand.app>",
       "to": "your-account-email@example.com",
       "subject": "Resend test",
       "html": "<p>It works.</p>"
     }'
   ```

   200 with an `id` field = success. 403 with `validation_error` = domain not verified yet (wait for DNS).

6. Paste the API key + `mail.courtcommand.app` into Coolify env vars (table in Step 1).

> **Plain SMTP fallback.** If you'd rather use SendGrid, AWS SES, or Postmark, swap the SMTP host/port/user/pass in Coolify. The seeder treats them as opaque SMTP credentials — only the sender domain needs to match `EMAIL_FROM`.

---

## Step 3 — Run prod-bootstrap (provisions Logto + syncs DB)

The bootstrap is a one-shot Docker container that runs in the same network as the prod stack, so **the DB never has to be exposed to the public internet**. The compose file is at `docker-compose.bootstrap.yaml`.

### Prepare `.env.prod` on the Coolify host

SSH to your Coolify VM, cd into the cloned repo (Coolify keeps a copy under `/data/coolify/applications/<resource_uuid>/source` or similar — see Coolify dashboard for the exact path).

Create a `.env.prod` file there (gitignored, never committed):

```bash
# Tells the seeder to skip Demo Sport
APP_ENV=production

# Application database -- internal hostname `db` works because the
# bootstrap service runs on the same Compose network as the api/db services
DATABASE_URL=postgres://courtcommand:<DB_PASSWORD>@db:5432/courtcommand?sslmode=disable

# Logto
LOGTO_ENDPOINT=https://logto.courtcommand.app
LOGTO_API_RESOURCE=https://api.courtcommand.app/api
LOGTO_MANAGEMENT_API_APP_ID=<from Step 2>
LOGTO_MANAGEMENT_API_APP_SECRET=<from Step 2>
LOGTO_MANAGEMENT_API_RESOURCE=https://default.logto.app/api

LOGTO_SPA_REDIRECT_URI=https://courtcommand.app/auth/callback
LOGTO_WEBHOOK_URL=https://api.courtcommand.app/api/v1/webhooks/logto

LOGTO_BOOTSTRAP_EMAIL=daniel.f.velez@gmail.com
LOGTO_BOOTSTRAP_PASSWORD=<strong-password-you-pick>
LOGTO_BOOTSTRAP_NAME="Daniel Velez"

# Resend SMTP (from Step 2.5)
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_YOUR_KEY
EMAIL_FROM=noreply@mail.courtcommand.app
EMAIL_FROM_NAME=Court Command
EMAIL_VERIFY_ON_SIGNUP=true
```

### Run the bootstrap container

```bash
# On the Coolify host, in the repo directory:
set -a && . ./.env.prod && set +a

docker compose \
  -f docker-compose.yaml \
  -f docker-compose.bootstrap.yaml \
  run --rm bootstrap
```

The container builds the api image (sharing layer cache with the existing prod build), runs the seeder once, exits 0 on success.

The seeder provisions:
- 12 API resource scopes
- SPA app `Court Command Web`
- Pickleball organization
- 5 org scopes + 5 org roles + scope→role bindings
- Bootstrap admin user with `platform_admin` org role
- User-level role `Court Command API (all scopes)` granting all 12 API scopes to the bootstrap admin
- SMTP email connector (Resend) with the four canonical email templates
- Sign-in experience: email + username identifiers, magic-link sign-in enabled, sign-up email verification enabled
- Webhook → `https://api.courtcommand.app/api/v1/webhooks/logto`
- `sports.logto_org_id` row in the prod app DB synced to match the new Pickleball org

The summary block at the end prints values for:
- `LOGTO_PICKLEBALL_ORG_ID=...`
- `LOGTO_WEBHOOK_SIGNING_KEY=...`
- `VITE_LOGTO_APP_ID=...`

### Paste into Coolify

Take the printed values and update the Coolify env tab:
- `LOGTO_WEBHOOK_SIGNING_KEY` (api service)
- `VITE_LOGTO_APP_ID` (web service)

---

## Step 4 — Trigger Coolify rebuild

In Coolify:
1. Click **Redeploy** on the Docker Compose resource

This rebuild bakes in the bootstrap-output values (`VITE_LOGTO_APP_ID`, `LOGTO_WEBHOOK_SIGNING_KEY`) — without them, the api fail-fasts in production mode and the web bundle has placeholder values that throw on AuthProvider init.

The api runs migrations on startup. `/api/v1/health` should return `{database:ok, redis:ok, status:ok}` once it's up.

---

## Step 4.5 — Upload Court Command theme to Ghost

Ghost ships with a default Casper theme on first install. To get the Court Command branding (sidebar, header, category tabs):

1. On your laptop:
   ```bash
   cd ~/code/court-command-v2/court-command
   make ghost-theme
   ```
   This packages `ghost-theme/` into `ghost-theme/cc-ghost-theme.zip` (gitignored).

2. Visit `https://news.courtcommand.app/ghost` and complete Ghost's first-run setup (create owner account, name the site, etc.). Use Resend SMTP for the owner email since the SMTP env vars are already in the compose stack.

3. **Settings → Design → Change theme → Upload theme** → select `cc-ghost-theme.zip` → **Activate**.

The theme persists in the `ghost_content` Docker volume across container restarts. Re-uploading is idempotent.

> If Ghost's first-run setup emails (owner password reset, member welcome) don't arrive, check Resend's **Logs** tab. Ghost SMTP is configured via the same env vars Logto uses (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `EMAIL_FROM_NAME`).

---

## Step 5 — First sign-in smoke test

1. Visit `https://courtcommand.app/`
2. PublicLanding renders (hero + tournaments/leagues/venues directories — empty until you create some)
3. Click **Sign In to Get Started**
4. Logto sign-in form appears at `https://logto.courtcommand.app/sign-in`
5. Sign in with `daniel.f.velez@gmail.com` and the bootstrap password (or click **Sign in with email code** for the magic-link flow — Resend should deliver the code in a few seconds)
6. Browser redirects to `https://courtcommand.app/auth/callback?code=...`
7. After token exchange, lands on `https://courtcommand.app/` (PublicLanding inside authenticated shell)
8. Click **Dashboard** in the sidebar → `/pickleball/dashboard` renders
9. Click **Profile** → `/pickleball/profile` renders the form

If anything 401s, check the api logs in Coolify and verify each Logto env var matches between Logto admin and Coolify.

If magic-link emails don't arrive: check Resend dashboard's **Logs** tab for delivery failures (most common: domain not verified, sender mismatch, gmail spam folder).

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
