# Logto Runbook — Court Command

Operational guide for the Logto integration. Where `docs/LOGTO_SETUP.md`
covers first-time provisioning, this file covers **runtime behavior,
known gotchas, debugging recipes, and the active TEMP-ADMIN-BYPASS
state**.

If you arrived here because the admin sidebar link disappeared, jump
straight to "Common failure shapes."

---

## 1. Architecture

Logto, the api, and the SPA interact as follows:

```
                ┌──────────────┐
                │   Browser    │  (the SPA, served from courtcommand.app)
                └──────┬───────┘
                       │
        (1) authorize  │ via @logto/react SDK
                       ▼
       ┌─────────────────────────────┐
       │  Logto (svhd/logto:1.22.0)  │  identity provider, OIDC
       │  logto.courtcommand.app      │
       └──────┬──────────────────────┘
              │
   (2) issues access token (org-scoped)
              │
              ▼
       ┌──────────────┐
       │  Browser     │
       └──────┬───────┘
              │
   (3) Authorization: Bearer <jwt>
              ▼
       ┌──────────────┐
       │  api         │  api.courtcommand.app
       │              │  validates JWT against Logto JWKS
       │              │  reads claims, mirrors user, etc.
       └──────────────┘
```

**Key facts**

- The SPA is a Logto SPA-type app; the api is a JWT-protected resource server.
- Sport organizations in Logto map 1:1 to rows in the local `sports`
  table via `sports.logto_org_id` (stored at first boot by the
  auto-bootstrap, sync'd to Logto on every subsequent boot).
- `platform_admin` is a Logto org-role (not a global role) granted per
  sport org. The api elevates `users.role` from the local DB to
  `platform_admin` per-request when the JWT's `organization_roles`
  claim contains `platform_admin`.
- The bootstrap admin's local row is created with `users.role='player'`
  (the SQL default in migration 00041). The elevation is overlaid at
  read time in `api/handler/auth.go:MeJWT`.

### Files of interest

| Path                                          | Purpose                                              |
| --------------------------------------------- | ---------------------------------------------------- |
| `api/main.go`                                 | Boot sequence; calls `logtoseed.Run` + verifier      |
| `api/logtoseed/`                              | Idempotent provisioning logic (was a CLI; now also auto-run) |
| `api/startup/verify_sports.go`                | Belt-and-suspenders: every active sport's org ID must resolve in Logto |
| `api/auth/context.go`                         | `Claims` shape + `ElevatedRole()` mapping            |
| `api/handler/auth.go:MeJWT`                   | Returns `users.role` overridden by `claims.ElevatedRole()` |
| `api/middleware/auth.go:RequirePlatformAdmin` | Backend admin gate (currently bypassed)              |
| `api/cmd/logto-seed/main.go`                  | Thin CLI wrapper around `logtoseed.Run`              |
| `web/src/auth/LogtoConfig.ts`                 | SDK config; scopes requested at sign-in              |
| `web/src/auth/AuthProvider.tsx`               | `<LogtoProvider>` + token wiring                     |
| `web/src/auth/SportContext.tsx`               | Maps URL slug → `logto_org_id` for org-scoped tokens |
| `web/src/auth/useAuth.ts`                     | `/me` query; gates on `!sportLoading`                |
| `web/src/lib/api.ts`                          | `apiFetch` attaches Bearer token, requests org token |
| `web/src/features/admin/AdminGuard.tsx`       | SPA admin route gate (currently bypassed)            |
| `web/src/components/Sidebar.tsx`              | Admin link visibility (currently bypassed)           |
| `web/src/features/admin/bypass.ts`            | `ADMIN_BYPASS_ACTIVE` flag for the warning banner    |

---

## 2. Boot sequence (api)

On every api start, in order:

1. `db.RunMigrations` runs goose migrations against the application DB.
   Migration 00042 idempotently rewrites the stale 00041 hardcoded
   `logto_org_id` values to `'pending-seed:<slug>'` placeholders.

2. `logtoseed.Run` (when Logto Mgmt API creds are present) idempotently
   provisions everything against the Logto tenant: API resource +
   scopes, SPA app (drift-protected if `LOGTO_SPA_APP_ID` env is set),
   M2M role assignment, org template, sport orgs, bootstrap admin +
   `platform_admin` org-role assignment, email connector, sign-in
   experience, webhook (drift-protected if `LOGTO_WEBHOOK_SIGNING_KEY`
   env is set). Then `syncSportsOrgIDs` overwrites the placeholders
   with the real Logto org IDs. Held under a Postgres advisory lock
   so concurrent api boots don't race.

3. `startup.VerifySportsOrgIDsFromDB` lists Logto orgs via the Mgmt
   API and confirms every `is_active=true` row in `sports` references
   an org that actually exists. In production, any problem fails the
   boot (`os.Exit(1)`); in development, it logs warnings and
   continues.

4. Router mounts, http server starts, traffic begins.

In production a successful boot prints these `slog` lines (paraphrased):

```
INFO logto seed starting endpoint=https://logto.courtcommand.app ...
INFO synced sports.logto_org_id pickleball_rows=1 demo_sport_rows=0
INFO logto seed complete pickleball_org_id=vcx906e38a2v ...
INFO verified sports.logto_org_id against Logto tenant sports_checked=1 logto_orgs_listed=N
```

If you don't see these lines on api boot, the Logto integration is
not running -- check `LOGTO_MANAGEMENT_API_APP_ID/SECRET` are present
in env (`api/main.go:251-261` warns and skips when absent).

---

## 3. Known races, gotchas, and design constraints

### 3.1 SPA mount-order race (fixed in commit 971b11a)

**Symptom**: `/me` returns `role: "player"` despite the user being
assigned `platform_admin` in Logto.

**Cause**: `SportProvider` and `useAuth` mount in the same render.
`useAuth` enables the `/me` query immediately based on
`isAuthenticated`; `apiFetch` reads `currentOrgID` synchronously when
it builds the Authorization header. If `listSports()` hasn't resolved
yet, `currentOrgID === ''` and the Logto SDK is called with no orgID,
which issues a **resource-only token** (no `organization_id`, no
`organization_roles` claim). The api can't elevate, the response says
`role: "player"`, React Query caches that for 5 minutes.

**Fix in `useAuth`**: query is `enabled: isAuthenticated && !sportLoading`,
and `sport?.slug` is part of the queryKey so navigating between sports
forces a refetch with the new org's elevation.

### 3.2 `UserScope.OrganizationRoles` requirement (fixed in commit edfeee2)

`UserScope.Organizations` puts `organization_id` in the token but NOT
the role names. To get `organization_roles: ["platform_admin"]` in the
JWT, the SDK must also request `UserScope.OrganizationRoles`. Without
it, the api receives an org-scoped token but `claims.ElevatedRole()`
finds an empty `OrganizationRoles` slice and never elevates.

**Known open issue (Phase 3 of the ongoing fix)**: even after this
scope is requested, the `organization_roles` claim is still absent in
production tokens. The TEMP-ADMIN-BYPASS exists to keep admin work
moving while this is debugged. See section 6.

### 3.3 Org-ID drift across Logto tenants (fixed in commit fb81fae + b68e940)

Logto generates org IDs randomly at creation time, so the IDs hardcoded
in migration 00041 (`ekup1zyrrxj4`, `7866ex96uk6b`) were correct only
for the original developer's local Logto. Every other tenant has
different IDs. The auto-bootstrap on every api boot resolves this
because `syncSportsOrgIDs` writes whatever IDs Logto actually returned
into the local `sports` table.

If a fresh deploy ever produces stale IDs again, look at the api boot
log for `logto seed` errors -- the seeder is the only path that
populates that table after migration 00042.

### 3.4 Token caching (SDK + React Query)

Two layers cache the access token / `/me` response:

1. **Logto SDK** stores tokens in `localStorage` under keys prefixed
   with `logto:` and reuses them until they expire.
2. **React Query** caches `/me` for 5 minutes (`staleTime` in
   `useAuth.ts`).

After a config change that affects token *shape* (e.g. adding a scope),
a refresh is NOT enough. You must sign out (which calls the SDK's
`signOut` and clears its storage) AND let the `/me` query stale out,
OR clear localStorage manually:

```js
// DevTools console
Object.keys(localStorage)
  .filter(k => k.startsWith('logto:'))
  .forEach(k => localStorage.removeItem(k))
sessionStorage.clear()
```

For a guaranteed clean test, use an **incognito window**.

### 3.5 Build-time vs runtime envs

These are baked into the SPA image at build time and require a web
rebuild to change:

- `VITE_LOGTO_ENDPOINT`
- `VITE_LOGTO_APP_ID`
- `VITE_LOGTO_API_RESOURCE`
- `VITE_AUTO_REDIRECT_SINGLE_SPORT`

These can be flipped via Coolify env without a rebuild (api reads them
at startup):

- `LOGTO_ENDPOINT`
- `LOGTO_API_RESOURCE`
- `LOGTO_MANAGEMENT_API_APP_ID` / `_SECRET` / `_RESOURCE`
- `LOGTO_BOOTSTRAP_EMAIL` / `_PASSWORD` / `_NAME`
- `LOGTO_WEBHOOK_SIGNING_KEY`
- `LOGTO_SPA_APP_ID` (drift protection for the seeder)
- `SEED_DEMO_SPORT`
- SMTP creds for the email connector

---

## 4. Debugging recipes

### 4.1 Decode a JWT in one line

```sh
TOKEN='eyJhbG...'  # from Authorization: Bearer header
echo "$TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | jq
```

### 4.2 Expected claims

| Claim                 | When present                                    | Meaning                          |
| --------------------- | ----------------------------------------------- | -------------------------------- |
| `aud`                 | always                                          | API resource indicator OR `urn:logto:organization:<id>` for org-scoped |
| `organization_id`     | org-scoped tokens only                          | Sport org user is currently scoped to |
| `organization_roles`  | org-scoped tokens + `OrganizationRoles` scope   | Role names (e.g. `["platform_admin"]`) |
| `scope`               | always                                          | Space-separated API + user scopes |
| `sub`                 | always                                          | Logto user ID                    |

If `organization_id` is **missing**: the SPA requested a resource-only
token. Diagnose with the mount-order race (3.1).

If `organization_id` is **present** but `organization_roles` is
**missing**: see 3.2 and section 6.

### 4.3 Capture what scopes the SDK is requesting

1. Sign out.
2. Open DevTools → Network → enable "Preserve log".
3. Click sign in.
4. Look for `GET https://logto.courtcommand.app/oidc/auth?...` (the
   first request before the redirect).
5. Decode the `scope=` query param. Expected scopes today:
   - `openid profile email`
   - `urn:logto:scope:organizations` (orgs in token)
   - `urn:logto:scope:organization_roles` (role names in token)
   - The 12 Court Command API scopes (`read:profile write:profile ...`)

### 4.4 Verify Logto state directly via the Mgmt API

```sh
# Get an M2M token
TOKEN=$(curl -sS -X POST "https://logto.courtcommand.app/oidc/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "${LOGTO_MANAGEMENT_API_APP_ID}:${LOGTO_MANAGEMENT_API_APP_SECRET}" \
  -d "grant_type=client_credentials&resource=https://default.logto.app/api&scope=all" \
  | jq -r .access_token)

# List orgs (to confirm the one in your DB exists)
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://logto.courtcommand.app/api/organizations" | jq '.[].id,.[].name'

# Confirm a user has platform_admin in a sport org
curl -sS -H "Authorization: Bearer $TOKEN" \
  "https://logto.courtcommand.app/api/organizations/<ORG_ID>/users/<USER_ID>/roles" | jq
```

### 4.5 Verify api state directly

```sh
# Health
curl -sS https://api.courtcommand.app/api/v1/health | jq

# What sports does the api expose? (Should match Logto orgs)
curl -sS https://api.courtcommand.app/api/v1/sports | jq

# /me (replace TOKEN with the Bearer from your browser's request)
curl -sS https://api.courtcommand.app/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## 5. Common failure shapes

| Symptom                                       | Diagnosis                                            | Fix                                                  |
| --------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| No Admin link in sidebar                      | `user.role !== 'platform_admin'` in `/me`            | Verify elevation. See 5.1 below.                     |
| Sidebar collapsed; can't tell if Admin is there | Admin renders as Shield icon only when collapsed     | Expand the sidebar (chevron at top).                 |
| `aud` is the API resource, no `organization_id` | Mount-order race, OR you're on `/` (no sport)        | Navigate to `/<sport>/...`. Already fixed for the race. |
| `organization_id` present, `organization_roles` absent | SDK didn't request `OrganizationRoles` scope OR Logto version doesn't honor it | See 3.2 and section 6.                         |
| /me returns 404 user mirror not found         | Logto webhook hasn't fired yet for this user         | Wait a few seconds; or the JWTSession middleware mirrors on demand. |
| api refuses to start, "verification failed"   | `sports.logto_org_id` points at a missing Logto org  | Check `logto seed` logs; the seeder should have fixed this. If not, the Mgmt API creds may be wrong. |
| Sign-in loop                                  | api returning 401 on `/me`; SPA treats as logged-out, redirects to sign-in | Check the api log for JWT validation errors. |

### 5.1 Why is `/me` returning `role: "player"` when I have `platform_admin` in Logto?

Five things to check, in order:

1. **Token has `organization_id`?** If not -> mount-order race (3.1) or
   you're on a non-sport URL.
2. **Token has `organization_roles`?** If not -> scope issue (3.2). See
   section 6.
3. **Logto Mgmt API shows you with `platform_admin` in that org?** If
   not -> the seeder didn't run (check api boot log) or the bootstrap
   email in `LOGTO_BOOTSTRAP_EMAIL` doesn't match your real email.
4. **`api/auth/context.go:ElevatedRole()` looking for `platform_admin`?**
   It is (verify the code hasn't drifted).
5. **`MeJWT` applying the elevation?** (`api/handler/auth.go:178`)

---

## 6. TEMP-ADMIN-BYPASS (active in production as of 2026-05)

While the `organization_roles` claim plumbing is being debugged, three
admin enforcement sites are intentionally disabled:

| File                                         | What was bypassed                                |
| -------------------------------------------- | ------------------------------------------------ |
| `api/middleware/auth.go`                     | `RequirePlatformAdmin` accepts any auth'd user   |
| `web/src/features/admin/AdminGuard.tsx`      | Route guard accepts any auth'd user              |
| `web/src/components/Sidebar.tsx`             | Admin link is shown to every auth'd user         |

A red banner is mounted on every authenticated page
(`web/src/features/admin/AdminBypassBanner.tsx`), gated by
`ADMIN_BYPASS_ACTIVE` in `bypass.ts`. Flipping that constant to
`false` hides the banner but does NOT restore the gates.

### 6.1 Open question

After requesting `UserScope.OrganizationRoles` (commit edfeee2), the
SPA's access token still arrives with `organization_id` but no
`organization_roles` claim. Hypotheses to investigate:

- **Logto SDK not actually adding the scope to the authorize URL.**
  Verify with 4.3.
- **Logto Console doesn't have OrganizationRoles in the SPA app's
  permission list.** Logto only lets an app request scopes that are
  in its assigned permission list.
- **Logto 1.22.0 may not support the `urn:logto:scope:organization_roles`
  scope.** Try a newer Logto version. (As of this writing the
  compose file pins `svhd/logto:1.22.0`.)
- **Consent grants are cached.** Even after adding a scope to the
  authorize URL, Logto may keep returning tokens shaped by the
  previous consent. Try revoking user consent / refresh tokens from
  the Logto admin UI.

### 6.2 How to revert the bypass (when ready)

In order:

1. **Confirm the fix works** for at least one signed-in user: that
   their `/me` returns `role: "platform_admin"` and a freshly-decoded
   JWT contains `organization_roles: ["platform_admin"]`.
2. **Revert the backend gate**: in `api/middleware/auth.go`
   `RequirePlatformAdmin`, uncomment the original role check and
   remove the bypass line. Redeploy api. Sanity-check that you
   still get through to admin endpoints; sign up a throwaway account
   and verify they get 403.
3. **Revert the SPA route gate**: in `AdminGuard.tsx`, uncomment the
   original `if (user?.role !== 'platform_admin')` block and remove
   the bypass `if (!user)` block. Restore the `Navigate` import.
4. **Revert the sidebar visibility**: in `Sidebar.tsx`, restore the
   `if (role === 'platform_admin')` guard around the
   `groups.push(getAdminNavGroup(sportSlug))` call. Remove the
   `void role` line.
5. **Hide the banner**: set `ADMIN_BYPASS_ACTIVE = false` in
   `bypass.ts`. Optional: delete `AdminBypassBanner.tsx`,
   `bypass.ts`, and the two import + render sites in `__root.tsx`
   for a fully clean removal.
6. **Search for any remaining markers**: `git grep TEMP-ADMIN-BYPASS`
   should return zero results after a complete revert.

The original code is preserved verbatim in comments at each bypass
site, so each step is a mechanical uncomment + delete.

---

## 7. Quick reference

```sh
# Find every TEMP-ADMIN-BYPASS site
git grep TEMP-ADMIN-BYPASS

# Re-run logto seed manually (CLI, optional -- the api auto-runs it)
docker compose -f docker-compose.yaml -f docker-compose.bootstrap.yaml \
  run --rm bootstrap

# Trigger Coolify redeploy for the api+web stack
curl -sS -X POST \
  -H "Authorization: Bearer $COOLIFY_TOKEN" \
  "https://empower.relentnet.com/api/v1/deploy?uuid=y0gcg880gs0s0kowgks4k0sc&force=false"

# Inspect the live SPA bundle for a code shape (admin link, etc.)
curl -sS https://courtcommand.app | grep -oE '/assets/index-[^"]+\.js'
```
