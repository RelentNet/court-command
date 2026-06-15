# Phase 3 Follow-ups — RESOLVED in Phase 3.5

**Status: All three patches now applied automatically by `make logto-seed`.**

This document originally captured three Logto Mgmt API config changes
that had been patched directly in the local Logto database during Phase
3 Task 10 debugging, with TODO entries for the seeder. Phase 3.5 (commit
to follow) implemented all three. The remaining content here documents
what was done so future seeder maintainers understand the design.

## Resolved patches

### 1. Sign-in experience: email as identifier ✅

**Was:** SQL patch flipping `sign_in.methods` and `sign_up.identifiers` from `username` to `email` in the `sign_in_experiences` table.

**Now:** `seedSignInExperience` in `api/cmd/logto-seed/main.go` calls `PATCH /api/sign-in-exp` with both `email` (primary, password) and `username` (secondary) sign-in methods, and email as the sole sign-up identifier.

**Caveat:** Logto rejects email-based sign-in unless an email connector is registered, AND requires `verify=true` when the sign-up identifier is email. That cascades into two more changes:

- New `seedEmailConnector` step registers the bundled `http-email` connector pointed at a discard URL (`http://localhost:9999/discard`). Real production deployments must replace this with `sendgrid-email-service`, `aws-ses-mail`, etc. before the sign-up flow becomes self-service.
- `SignUpConfig.Verify` is `true`. Since our SPA never exercises the public sign-up flow (the bootstrap admin is created by the seeder via Mgmt API, bypassing sign-in-experience), the unreachable verification email is harmless for dev.

### 2. Bootstrap admin's API role ✅

**Was:** SQL inserts creating a `role-cc-api-all` user role, binding all 12 API scopes via `roles_scopes`, and granting via `users_roles`.

**Now:** `seedAPIUserRole` in `api/cmd/logto-seed/main.go` creates a Logto User-type role named `"Court Command API (all scopes)"` (constant `apiUserRoleName`), uses `ListResourceScopes`/`ListRoleScopes` to find the diff, calls `AssignScopesToRole` to bind missing scopes, then `AssignRolesToUser` to grant to the bootstrap admin. All three sub-steps are idempotent.

This eliminates the 403 cascade where the bootstrap admin held org roles (`platform_admin`) but no API resource scopes, so PATCH `/me/profile` returned 403 on `claims.HasScope("write:profile")`.

### 3. `sports.logto_org_id` sync ✅

**Was:** `UPDATE sports SET logto_org_id='<local Logto org id>' WHERE slug='pickleball';` (and same for `demo_sport`) applied by hand after every fresh seed.

**Now:** `syncSportsOrgIDs` in `api/cmd/logto-seed/main.go` connects to the application database via `DATABASE_URL` (same env var the backend uses) and runs the two updates. Skipped silently with a log warning when `DATABASE_URL` is unset, in which case the seeder prints the SQL the operator should run.

## Remaining seeder follow-up (NOT YET DONE)

### 4. Map Logto org-roles to local users.role

The bootstrap admin is granted the `platform_admin` org role in Logto, but the local `users.role` defaults to `'player'` from `CreateUserFromLogto`. For backend authorization checks (`RequirePlatformAdmin`) to succeed, the local row must reflect the elevated role.

Currently patched manually:
```sql
UPDATE users SET role='platform_admin' WHERE logto_user_id='j3akxwq2mvk1';
```

This isn't strictly a *seeder* problem — the `users` row is created by the **webhook handler** (or the `MirrorUser` middleware) when the user first authenticates. The right fix is in the JWT-session bridge (`api/middleware/jwt_session.go`) or the webhook handler: read `claims.OrganizationRoles`, derive the local role (e.g., `platform_admin` if the user has that role in any org, else `player`), and update `users.role` on every login. Defer to Phase 4 when role-derived authorization gets a closer look.

## Why the seeder integration matters

Without the seeder fixes, every developer setting up a local stack would have to run a multi-step SQL patch incantation by hand AND remember to repeat it whenever they wiped `pgdata_dev`. The Phase 3.5 changes make `make dev-up && make migrate-up && make logto-seed` produce a fully working stack, no manual steps. The Playwright E2E test now passes against a freshly-reseeded Logto with no operator intervention beyond entering the bootstrap admin's credentials in the test browser.
