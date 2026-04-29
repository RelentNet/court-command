# Logto Setup

This guide configures the self-hosted Logto instance used by Court Command for
authentication, organization-scoped roles (sports), webhooks, and Logto-managed
machine-to-machine credentials (used by API keys and tournament staff accounts).

**Audience:** the operator standing up Logto for the first time, or a developer
re-bootstrapping after a Logto database wipe.

---

## Prerequisites

- Logto is already deployed and reachable at:
  - Core / OIDC endpoint: <https://logto.courtcommand.app>
  - Admin UI: <https://logto-admin.courtcommand.app>
- You can sign in to the Logto admin UI as a Logto-platform admin (this is a
  Logto-internal account, not a Court Command user).
- You have access to the Coolify project for Court Command so you can paste
  generated IDs/secrets into the API and web service environment variables.

> **Secrets discipline.** Every value generated below (App secrets, signing
> keys) belongs in Coolify env vars, never in Git. The tracked
> `.env.example` documents only variable *names*, not values.

---

## Step 1 — Create the SPA application (frontend)

In <https://logto-admin.courtcommand.app> → **Applications** → **Create application**:

- **Type:** Single Page App (React)
- **Name:** `Court Command Web`
- **Redirect URIs:**
  - `https://courtcommand.app/auth/callback`
  - (optional, for future local dev) `http://localhost:5173/auth/callback`
- **Post sign-out redirect URIs:**
  - `https://courtcommand.app`
  - (optional) `http://localhost:5173`
- **CORS allowed origins:**
  - `https://courtcommand.app`
  - (optional) `http://localhost:5173`

Click **Create**. After creation:

| Capture | Goes to |
|---|---|
| **App ID** | Coolify (web service) → `VITE_LOGTO_APP_ID` |

The web app does not have a client secret (SPAs are public clients).

---

## Step 2 — Create the API resource

In **API resources** → **Create API resource**:

- **API name:** `Court Command API`
- **API identifier:** `https://api.courtcommand.app/api`

Open the newly-created resource → **Permissions** tab → add the following 12 scopes:

```
read:profile
write:profile
read:tournaments
write:tournaments
read:matches
write:matches
read:registrations
write:registrations
read:overlay
write:overlay
read:admin
write:admin
```

These are the API-level scopes used for sport-agnostic permission checks (e.g.
"can write tournaments at all"). Per-sport role enforcement is layered on top
via organization roles (Step 4).

No env-var change for this step; the identifier is already in
`LOGTO_API_RESOURCE` and `VITE_LOGTO_API_RESOURCE`.

---

## Step 3 — Create the M2M app for the Management API

In **Applications** → **Create application**:

- **Type:** Machine-to-machine
- **Name:** `Court Command Backend`

After creation, on the application detail page:

1. **Roles** tab → assign the built-in role **`Logto Management API access`**.
   This grants the backend permission to create users, modify org memberships,
   create per-tenant M2M apps for the "API keys" feature, etc.
2. **Settings** tab → capture:

| Capture | Goes to |
|---|---|
| **App ID** | Coolify (api service) → `LOGTO_MANAGEMENT_API_APP_ID` |
| **App Secret** | Coolify (api service) → `LOGTO_MANAGEMENT_API_APP_SECRET` |

Verify the value of `LOGTO_MANAGEMENT_API_RESOURCE` in Coolify is
`https://logto.courtcommand.app/api` (this is the Logto-internal Management API
resource, distinct from `LOGTO_API_RESOURCE`).

---

## Step 4 — Define the organization template (roles + scopes)

In **Organizations** → **Organization template** tab.

### 4a. Define organization scopes

Under **Organization permissions** add:

```
manage_tournaments
manage_matches
manage_registrations
manage_users
read_all
```

### 4b. Define organization roles

Under **Organization roles** add the following five roles. For each role, in
its detail page assign the listed organization scopes:

| Role | Description | Organization scopes |
|---|---|---|
| `player` | Default role for users in this sport | `read_all` |
| `tournament_director` | Can manage tournaments in this sport | `read_all`, `manage_tournaments`, `manage_registrations` |
| `referee` | Can score matches in this sport | `read_all`, `manage_matches` |
| `scorekeeper` | Same as referee, alternate label for staff naming | `read_all`, `manage_matches` |
| `platform_admin` | Full platform access within this sport | all five |

Role names are matched **literally** by the backend (case-sensitive). Do not
rename them without coordinating a code change.

---

## Step 5 — Create the sport organizations

In **Organizations** → **Organizations** tab → **Create organization**.

Create two organizations:

| Name | Description |
|---|---|
| `Pickleball` | Production sport on Court Command |
| `Demo Sport` | Test organization that exercises the multi-sport plumbing |

After each creation, capture the **Organization ID** (`org_xxxxxxxxxxxxx`):

| Capture | Goes to |
|---|---|
| Pickleball org ID | Coolify (api service) → `LOGTO_PICKLEBALL_ORG_ID` |
| Demo Sport org ID | Coolify (api service) → `LOGTO_DEMO_SPORT_ORG_ID` |

The roles defined in Step 4 are automatically available in both orgs because
they live on the shared organization template.

---

## Step 6 — Create the bootstrap platform admin user

In **Users** → **Create user**:

- **Email:** `daniel.f.velez@gmail.com`
- **Password:** set one (you'll use it to sign in for the first time)
- **Name:** `Daniel Velez`

After creation, open the user → **Organizations** tab → **Add to organization**:

- Add to **Pickleball** with role `platform_admin`
- Add to **Demo Sport** with role `platform_admin`

Repeat for any additional bootstrap admins.

> **No env-var change.** The user just needs to exist in Logto with the right
> org memberships before you sign in to the Court Command frontend for the
> first time. The backend will upsert a mirror row in `users` automatically on
> first authenticated request.

---

## Step 7 — Register the webhook

In **Webhooks** → **Create webhook**:

- **Name:** `Court Command Backend`
- **Endpoint URL:** `https://api.courtcommand.app/api/v1/webhooks/logto`
- **Events:** check
  - `User.Created`
  - `User.Data.Updated`
  - `User.Deleted`

After creation, open the webhook detail page and capture:

| Capture | Goes to |
|---|---|
| **Signing key** | Coolify (api service) → `LOGTO_WEBHOOK_SIGNING_KEY` |

The backend validates the `logto-signature-sha-256` header on every webhook
delivery using HMAC-SHA256 of the raw request body keyed with this value.

> The backend webhook handler is delivered in a later phase. Until then,
> Logto will deliver `User.Created` events that 404 — that's fine; the user
> still exists in Logto and the on-demand upsert path in `/auth/me` covers
> the gap.

---

## Step 8 — Verify Coolify env vars

Confirm both Coolify services have the full set of variables. Reference list
(see `.env.example` in the repo for the source of truth):

### `api` service

```
LOGTO_ENDPOINT
LOGTO_API_RESOURCE
LOGTO_MANAGEMENT_API_APP_ID
LOGTO_MANAGEMENT_API_APP_SECRET
LOGTO_MANAGEMENT_API_RESOURCE
LOGTO_WEBHOOK_SIGNING_KEY
LOGTO_PICKLEBALL_ORG_ID
LOGTO_DEMO_SPORT_ORG_ID
```

### `web` service (build-time, baked into the Vite bundle)

```
VITE_LOGTO_ENDPOINT
VITE_LOGTO_APP_ID
VITE_LOGTO_API_RESOURCE
```

After updating, redeploy both services so the new variables take effect.

---

## Step 9 — Smoke-test the Management API from the command line

From a machine that can reach Logto (typically your local box):

```bash
# Replace with the real values from Coolify
APP_ID=...
APP_SECRET=...
LOGTO_ENDPOINT=https://logto.courtcommand.app
RESOURCE=https://logto.courtcommand.app/api

# 1. Get an M2M token
TOKEN=$(curl -s -X POST "$LOGTO_ENDPOINT/oidc/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "$APP_ID:$APP_SECRET" \
  -d "grant_type=client_credentials&resource=$RESOURCE&scope=all" \
  | jq -r .access_token)

[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && echo "✓ token issued" || { echo "✗ no token"; exit 1; }

# 2. List users
curl -s "$LOGTO_ENDPOINT/api/users" -H "Authorization: Bearer $TOKEN" | jq '.[0:2]'

# 3. List organizations (should include Pickleball + Demo Sport)
curl -s "$LOGTO_ENDPOINT/api/organizations" -H "Authorization: Bearer $TOKEN" | jq '.[].name'
```

Expected: token issued, users array contains the bootstrap admin, organizations
include both `Pickleball` and `Demo Sport`. If any of those fails, fix Logto
configuration before proceeding to backend implementation.

---

## Re-seeding after a Logto wipe

If the Logto Postgres database is recreated (e.g. volume rotation), Logto
loses **everything** documented above — apps, resources, scopes, org template,
orgs, users, webhooks. There is no automated re-seed today; re-run Steps 1–7
manually and re-paste the regenerated IDs/secrets into Coolify.

> **Future improvement:** `make seed-logto` could call the Management API to
> idempotently create everything from a YAML manifest. Tracked as a follow-up
> after the initial integration ships.

---

## Reference

- Spec: [`docs/superpowers/specs/2026-04-20-logto-integration-design.md`](superpowers/specs/2026-04-20-logto-integration-design.md)
- Plan: [`docs/superpowers/plans/2026-04-20-logto-integration.md`](superpowers/plans/2026-04-20-logto-integration.md)
- Logto docs: <https://docs.logto.io>
