# Phase 3 Follow-ups (Local DB Patches Pending Seeder Updates)

This document captures Logto Mgmt API config that was patched directly in the local Logto database during Phase 3 Task 10 debugging. These changes need to be applied to the seeder (`api/cmd/logto-seed/main.go`) so future fresh local stacks (and eventual production) get them automatically.

## 1. Sign-in experience: allow email as identifier

**Default state** (after fresh `make logto-seed`):
- Sign-in identifiers: `["username"]` only
- Sign-up identifiers: `["username"]` only

This means users can't sign in with their email address — they get "The username is invalid" — and after sign-in Logto demands they set a username.

**Local patch applied** (during Task 10):
```sql
UPDATE sign_in_experiences
SET sign_in = jsonb_set(
  sign_in,
  '{methods}',
  '[{"password": true, "identifier": "email", "verificationCode": false, "isPasswordPrimary": true},
    {"password": true, "identifier": "username", "verificationCode": false, "isPasswordPrimary": false}]'::jsonb
)
WHERE tenant_id='default';

UPDATE sign_in_experiences
SET sign_up = '{"verify": false, "password": true, "identifiers": ["email"]}'::jsonb
WHERE tenant_id='default';
```

**Seeder fix needed:** call Logto's `PATCH /api/sign-in-exp` Mgmt API endpoint to set `signIn.methods` and `signUp.identifiers` to use email. Reference: https://docs.logto.io/docs/references/sign-in-experience.

## 2. Bootstrap admin needs an API resource role with all 12 scopes

**Default state**: bootstrap admin (`admin@courtcommand.local`, user ID `j3akxwq2mvk1`) has **no user role** — only the `platform_admin` ORG role in both sport orgs. Org roles bind ORG scopes (`manage_tournaments` etc.), but the API resource scopes (`read:profile`, `write:profile`, `read:tournaments` etc.) require a **user-level role** that's bound to the resource scopes.

Without this, the access token contains only org scopes — the backend handlers that check API scopes (e.g. `ProfileHandler.PatchMyProfile` checks `claims.HasScope("write:profile")`) reject every request with 403.

**Local patch applied:**
```sql
-- 1. Create a user role bound to the API resource scopes
INSERT INTO roles (id, name, description, tenant_id, type)
VALUES ('role-cc-api-all', 'Court Command API (all scopes)',
        'Bootstrap role for E2E and dev users; grants every API scope',
        'default', 'User');

-- 2. Bind all 12 API scopes to the role
INSERT INTO roles_scopes (id, tenant_id, role_id, scope_id)
SELECT substr(md5(s.id || 'cc'), 1, 21), 'default', 'role-cc-api-all', s.id
FROM scopes s
JOIN resources r ON s.resource_id=r.id
WHERE r.indicator='http://localhost:8080/api';

-- 3. Grant the role to the bootstrap admin
INSERT INTO users_roles (id, tenant_id, user_id, role_id)
VALUES ('ur-cc-admin', 'default', 'j3akxwq2mvk1', 'role-cc-api-all');
```

**Seeder fix needed:**
1. Add a `Court Command API (all scopes)` user role via `POST /api/roles` (type=User)
2. Bind all 12 API resource scopes to it via `POST /api/roles/{roleId}/scopes`
3. Grant the role to the bootstrap admin via `POST /api/users/{userId}/roles`

Reference Logto API: https://openapi.logto.io/#tag/Roles

## 3. Sports table org IDs (already noted in earlier session)

The `sports.logto_org_id` column was seeded with **production** Logto org IDs in migration 00041. For local dev, these need to point at the LOCAL Logto org IDs (`085h6zjwe4ql`, `ijxxqalg47ed`).

Currently patched manually:
```sql
UPDATE sports SET logto_org_id='085h6zjwe4ql' WHERE slug='pickleball';
UPDATE sports SET logto_org_id='ijxxqalg47ed' WHERE slug='demo_sport';
```

**Better approach:** the seeder already creates the orgs and prints their IDs. After creating, the seeder should also UPDATE the `sports` table (in the application DB, not Logto's DB) so the IDs are kept in sync. This makes the migration's hardcoded prod IDs purely production-only.

## Suggested integration into `make logto-seed`

Add a final step to `api/cmd/logto-seed/main.go` that:

1. Calls `PATCH /api/sign-in-exp` to enable email-based sign-in
2. Creates the `Court Command API (all scopes)` user role and binds all 12 API scopes
3. Grants that role to the bootstrap admin
4. Connects to the application Postgres and `UPDATE sports SET logto_org_id=...` to match the orgs the seeder just created

Each step should be idempotent (check before insert/update, swallow 422/409 conflict responses).

## Status

These are **local-only** for now. The committed seeder doesn't apply any of them. Anyone running `make dev-up` followed by `make logto-seed` from scratch will need to either:
- Apply these SQL patches manually (instructions above), OR
- Wait for the seeder enhancement that bundles them (no GitHub issue yet — track here).

Phase 3 E2E test (`web/tests/e2e/auth-flow.spec.ts`) depends on all three patches being in place.
