# Deploying CourtCommand to Coolify

This project is configured to deploy as a single **Docker Compose** resource
in Coolify. Coolify handles image builds, Traefik routing, Let's Encrypt SSL,
persistent volumes, and environment variables.

## 1. Prerequisites

- A Coolify server with a wildcard or per-subdomain DNS set up. This deploy
  uses two hostnames:
  - **Frontend:** `mpl.courtcommand.app`
  - **Backend API:** `v1api.courtcommand.app`
- Both subdomains pointed (A/AAAA or CNAME) at your Coolify server IP.
- This repository pushed to a Git host (GitHub/GitLab/etc.) with a `staging`
  branch that Coolify can pull from.

## 2. Create the Resource in Coolify

1. **New Resource → Docker Compose → Public/Private Repository**
2. Point it at this repo; set **Branch = `staging`**.
3. Coolify auto-detects `docker-compose.yaml` at the repo root.
4. Leave build pack as **Docker Compose** (default).

## 3. Environment Variables

Go to the **Environment Variables** tab and add:

| Name | Example | Notes |
|---|---|---|
| `POSTGRES_USER` | `postgres` | DB username |
| `POSTGRES_PASSWORD` | *(generate a strong one)* | DB password |
| `POSTGRES_DB` | `courtcommand` | DB name |
| `VITE_API_URL` | `https://v1api.courtcommand.app` | **Baked into the frontend bundle at build time.** Must include the protocol. Changing this requires a frontend rebuild. |

Check **"Build Variable"** on `VITE_API_URL` so Coolify passes it as a
`--build-arg` to the frontend image (already configured in `docker-compose.yaml`).

## 4. Domain Routing

In the Coolify service list for this resource, configure:

| Service | Domain | Container Port |
|---|---|---|
| `frontend` | `https://mpl.courtcommand.app` | `80` |
| `backend` | `https://v1api.courtcommand.app` | `8000` |

Coolify will generate the Traefik labels and provision Let's Encrypt certs
automatically. The `db` and `redis` services have no domains — they're
reachable only on the internal Docker network.

## 5. Deploy

Click **Deploy**. Coolify will:

1. Clone the repo at the `staging` branch
2. Build `backend` and `frontend` images (frontend bundles with `VITE_API_URL`)
3. Start `db` and `redis`, wait for healthchecks
4. Start `backend`, run `create_all` on first boot (new schema picks up the
   `Court.theme` JSON column automatically)
5. Start `frontend` serving static files via nginx

Persistent volumes:

- `postgres_data` — database files
- `redis_data` — redis AOF
- `uploads_data` — user-uploaded logos / backgrounds (served by the backend
  at `/uploads/*`)

## 6. Verify

- **Health:** `curl https://v1api.courtcommand.app/health` → `{"status":"healthy"}`
- **API reachable:** `curl https://v1api.courtcommand.app/courts` → `[]`
- **Frontend loads:** https://mpl.courtcommand.app
- **WebSockets:** open the Ticker page in one tab and the Referee Console in
  another; scoring updates must propagate instantly (they ride
  `wss://v1api.courtcommand.app`, derived automatically from `VITE_API_URL`).
- **Uploads:** go to an Overlay Console, upload a PNG, refresh — the image
  should survive.

## 7. Seed the Database

From your local machine (no server access needed — the seed script hits the
public API):

```sh
cd scripts
API_URL=https://v1api.courtcommand.app python3 seed_michigan_league.py
```

The script is **idempotent** — safe to re-run. Players/teams match by name
and get updated in place; no duplicates.

## 8. Schema Changes in the Future

This project uses `SQLModel.metadata.create_all()` (no Alembic). New columns
added via JSON blobs (`Court.theme`, `Match.config`, etc.) need no schema
changes. For **new columns on existing tables**, Coolify users have two
options:

- **Destructive (dev/staging):** drop the `postgres_data` volume in the
  Coolify UI → next deploy recreates tables fresh.
- **Non-destructive (production):** SSH into the Coolify host and run a
  manual `ALTER TABLE` via `psql` before deploying the code that uses the
  new column.

## Local Development

`docker-compose.override.yaml` (gitignored) maps ports to localhost for
local work. The production `docker-compose.yaml` is unaffected:

```sh
docker compose up -d   # uses override in dev; plain compose in Coolify
```

Or run the stack natively:

```sh
make install
make dev
```

## Troubleshooting

- **Frontend shows "Failed to fetch" for API calls**
  `VITE_API_URL` likely wasn't set as a *build* variable, so it baked in
  `undefined`. Set it in Coolify, check "Build Variable", redeploy.
- **WebSocket disconnects / never connects**
  Traefik needs no special config for wss — the frontend derives it from
  `VITE_API_URL`. Confirm `VITE_API_URL` starts with `https://`.
- **Uploads return 404 after redeploy**
  The `uploads_data` volume may not be preserved if you pressed
  "Redeploy (rebuild)" with the option to reset volumes. Back up via
  `docker cp` before nuking.
- **CORS errors**
  The backend currently allows any origin (`allow_origins=["*"]`). If you
  lock this down later, update `backend/main.py`.
