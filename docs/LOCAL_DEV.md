# Local Development

Run the full Court Command stack on your machine: Postgres, Redis, and a
local Logto tenant in Docker; the Go backend and Vite frontend running
natively on the host for fast iteration.

This setup mirrors production (per `docs/LOGTO_SETUP.md`) but uses a
local Logto container instead of the deployed `logto.courtcommand.app`,
so you can develop, test, wipe, and re-seed without affecting prod.

## Prerequisites

- Docker (any modern version with the `docker compose` plugin)
- Go 1.24+
- Node 22+ and pnpm
- A free copy of the repo

If any are missing on Linux:

```bash
sudo pacman -S go nodejs npm docker docker-compose   # CachyOS / Arch
sudo npm install -g pnpm
sudo systemctl enable --now docker
# Add yourself to the docker group so you don't need sudo for `docker`:
sudo usermod -aG docker $USER
# Log out and back in for the group change to take effect.
```

## First-run setup

Step 1 is one-time-per-machine; after that, day-to-day workflow is just
steps 5 and 6.

### Step 1 — Bring up the dev infra

```bash
cp .env.example .env       # only needed once; edit if you want
make dev-up
```

This launches three Docker containers:

| Service | Port | Purpose |
|---|---|---|
| Postgres 17 | `localhost:5432` | Holds two databases: `courtcommand` (app) and `logto` (Logto's own state) |
| Redis 7 | `localhost:6379` | Pub/sub for real-time match updates (legacy session storage will be removed in Phase 6) |
| Logto 1.22 | `localhost:3001` (OIDC), `localhost:3002` (admin UI) | Self-hosted identity provider |

Wait ~30 seconds for Logto to finish initializing its database. Watch
the readiness with `make dev-logs` if you're impatient.

### Step 2 — Create the initial Logto admin account

Open <http://localhost:3002> in a browser. Logto's first-run wizard
asks you to create an admin account; this is the operator (you), not a
Court Command user. Use any email/password — they're local-only.

After the wizard, you land in the Logto admin dashboard.

### Step 3 — Create the Management API M2M app

The seeder needs Management API credentials to provision everything
else. Logto can't bootstrap this one for you; you create it once via
the admin UI.

In Logto admin (<http://localhost:3002>):

1. **Applications → Create application → Machine-to-machine**
   - Name: `Court Command Backend`
   - Description: anything
   - Click **Create**.
2. On the new app's detail page, click the **Roles** tab.
3. Click **Assign Logto roles** → tick **`Logto Management API access`** → save.
4. Click the **Settings** tab and copy:
   - **App ID** (alphanumeric string)
   - **App Secret** (longer alphanumeric string)

Paste both into your `.env`:

```bash
LOGTO_MANAGEMENT_API_APP_ID=<paste app ID>
LOGTO_MANAGEMENT_API_APP_SECRET=<paste app secret>
```

### Step 4 — Run the seeder

```bash
make logto-seed
```

This script idempotently creates everything else: the SPA app, the
Court Command API resource with its 12 scopes, the organization
template (5 roles + 5 scopes + role-scope mappings), the Pickleball
and Demo Sport organizations, the bootstrap admin user, and the
webhook subscription. Re-running it is safe; existing items are
detected and reused.

The script prints a summary at the end with the values you need to
paste back into `.env`:

```
LOGTO_PICKLEBALL_ORG_ID=...
LOGTO_DEMO_SPORT_ORG_ID=...
LOGTO_WEBHOOK_SIGNING_KEY=...
VITE_LOGTO_APP_ID=...
```

Copy those four lines into your `.env`.

### Step 5 — Start the backend

```bash
make dev
```

This runs the Go backend natively at <http://localhost:8080>. The
backend connects to the Dockerized Postgres + Redis + Logto, runs all
migrations on startup (you'll see goose log lines), and serves
`/api/v1/health`.

Sanity check in another terminal:

```bash
curl -s http://localhost:8080/api/v1/health | jq
# {
#   "build": { "commit": "dev", "built_at": "unknown" },
#   "services": { "database": "ok", "redis": "ok" },
#   "status": "ok"
# }
```

### Step 6 — Start the frontend

```bash
make dev-frontend
```

Vite serves the SPA at <http://localhost:5173>. After Phase 3 lands,
clicking "Sign in" will redirect you to <http://localhost:3001>
(Logto), where you sign in with the bootstrap admin credentials
(`admin@courtcommand.local` / `TestPass123!` by default), and you'll
land back on the SPA with a valid Logto JWT.

## Day-to-day workflow

After the one-time setup above:

```bash
make dev-up         # docker containers (db + redis + logto)
make dev &          # backend
make dev-frontend   # frontend (in another terminal, or as a background job)
```

To shut everything down at end of day:

```bash
# Ctrl-C the backend and frontend processes, then:
make dev-down
```

## Useful commands

```bash
make dev-up         # start the dev infra
make dev-down       # stop the dev infra (data persists)
make dev-reset      # WIPE the dev infra including Postgres + Logto state
make dev-logs       # tail logs from db / redis / logto
make logto-seed     # idempotent Logto provisioning
make migrate-up     # run pending DB migrations manually (the backend also
                    # does this on startup, so usually unnecessary)
make sqlc           # regenerate sqlc bindings after editing
                    # api/db/queries/*.sql
make test           # run all backend tests (creates a separate
                    # courtcommand_test database)
```

## Wiping and re-seeding from scratch

If you mess something up in Logto or want a clean slate:

```bash
make dev-reset
make dev-up
# then steps 2-4 of First-run setup
```

`dev-reset` removes the `pgdata_dev` Docker volume, which holds both the
`courtcommand` and `logto` databases. Migrations re-run on the next
`make dev` startup. The Logto admin account, the M2M app, the seeded
data — all gone. You'll go through the wizard and the seeder again.

## Common problems

### `make logto-seed` fails with "missing required env vars"

You haven't copied `LOGTO_MANAGEMENT_API_APP_ID` and
`LOGTO_MANAGEMENT_API_APP_SECRET` into `.env` from Step 3 yet.

### `make logto-seed` fails with `oidc.invalid_target`

Your `LOGTO_MANAGEMENT_API_RESOURCE` is wrong. For self-hosted Logto the
correct value is `https://default.logto.app/api` — that's a Logto
internal audience identifier, not a real URL. The default in
`.env.example` is correct; verify nothing has changed it.

### Backend startup fails with "failed to run migrations"

Postgres might not be ready yet. The `db` service has a healthcheck and
the backend's connection string targets `localhost:5432`. If the
container is still initializing on a slow machine, wait 30 seconds and
retry. Run `docker compose -f docker-compose.dev.yml ps` to see service
state.

### Webhook from Logto can't reach the backend

The seeder registers the webhook URL as
`http://host.docker.internal:8080/api/v1/webhooks/logto` — Logto runs
in a Docker container, so it has to reach the natively-run backend
through Docker's host-gateway alias. The compose file sets up
`extra_hosts: host.docker.internal: host-gateway` on the Logto
service; if you're on macOS / Windows Docker Desktop this works
out of the box, on Linux Docker the host-gateway feature is enabled
by default in modern versions but check `docker info | grep -i
hosts` if you suspect issues.

### Port conflict on 5432 / 6379 / 3001 / 3002

Another process is using those ports. Either stop it, or edit
`docker-compose.dev.yml` to remap (e.g., `15432:5432`). If you remap,
also update the matching ports in `.env`.

## Going to production

The production deployment doesn't use `docker-compose.dev.yml`. Coolify
runs the `api` and `web` services from the existing
`docker-compose.yaml` against the production Logto at
`logto.courtcommand.app`. See `docs/LOGTO_SETUP.md` for the production
Logto setup walkthrough.

The seeder *can* be run against production Logto if you ever need to
re-seed (e.g., after a Logto database wipe). Set the production env
vars and run `make logto-seed` against them. The seeder is idempotent
and will not duplicate existing apps/resources/orgs/users.
