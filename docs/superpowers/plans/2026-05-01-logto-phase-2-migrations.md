# Logto Phase 2 — Additive Schema Migration

> Expanded from the Phase 2 outline of
> `docs/superpowers/plans/2026-04-20-logto-integration.md` (lines
> 1707–1718). This plan supersedes the original Phase 2 outline.

**Goal:** Add all new schema needed for the Logto integration without
dropping any existing columns, tables, or constraints. Result: the
codebase still builds, the deployed app keeps working unchanged, but
new Logto fields and the multi-sport scaffolding are now available
for Phase 3+ to populate.

**Branch:** `feature/logto-integration` (continues from Phase 1 tip
`72525e5`).

**Why additive-only:** Dropping `users.password_hash`, `users.role`, or
`tournament_staff.raw_password` immediately would break 78 + 113 + 1
references across ~35 Go files (we measured). The original plan's
"shrink users in one migration" approach is incompatible with
additive deployment — we'd have to rewrite every handler that does
`session.Data.Role` *in the same PR* as the schema change. Phase 6
cutover deletes the old code paths and a follow-up migration drops
the now-orphaned columns.

**Scope of this phase:**

- **CREATE** `sports` lookup table + seed Pickleball + Demo Sport
- **CREATE** `player_profiles` 1:1 table (initially empty; populated in
  Phase 3 when the frontend starts saving profile data)
- **ADD** `users.logto_user_id` (nullable, UNIQUE when not null)
- **ADD** `sport_id` columns on `tournaments`, `leagues`,
  `organizations`, `venues`, `divisions` (nullable, backfilled to
  Pickleball, with index — but NOT NOT NULL until Phase 6)
- **ADD** `api_keys.logto_m2m_app_id` (nullable, UNIQUE when not null)
- **NO drops, no renames, no constraint tightenings.**

**Out of scope (deferred to Phase 6 cutover):**

- Drop `users.password_hash`, `users.role`, `users.first_name/last_name/date_of_birth`,
  and the migrated profile columns (after the data is moved into
  `player_profiles` by webhook + on-demand upsert)
- Drop `tournament_staff.raw_password`
- Drop `api_keys.{key_hash, key_prefix, scopes, expires_at}`
- Make `users.logto_user_id` and the various `sport_id` columns NOT NULL
- Remove the now-unused `idx_users_dedup` (which references
  `first_name, last_name, date_of_birth`)

---

## Task 2.1 — Write migration `00041_logto_schema_additive.sql`

**Files:**
- Create: `api/db/migrations/00041_logto_schema_additive.sql`

**Steps:**

- [ ] **Step 1.** Create the file with the following contents:

```sql
-- +goose Up

-- ============================================================================
-- Phase 2 of the Logto integration: ADDITIVE schema changes.
--
-- This migration only ADDS tables, columns, and indexes. It deliberately
-- does not drop any existing schema; that work is deferred to a Phase 6
-- cutover migration once all Go callers have stopped reading the
-- to-be-removed columns.
--
-- See docs/DATABASE_OWNERSHIP.md for which fields live where after this
-- migration lands. See docs/superpowers/specs/2026-04-20-logto-integration-design.md
-- for the broader design.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. sports lookup table
-- ---------------------------------------------------------------------------

CREATE TABLE sports (
    id              BIGSERIAL PRIMARY KEY,
    slug            TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    logto_org_id    TEXT NOT NULL UNIQUE,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sports_active ON sports(sort_order) WHERE is_active = true;

-- Seed both sports. logto_org_id values match the Logto orgs created
-- per Step 5 of docs/LOGTO_SETUP.md. If those values change in Logto
-- admin, update them via UPDATE rather than re-running this migration.
INSERT INTO sports (slug, name, logto_org_id, sort_order) VALUES
    ('pickleball', 'Pickleball', 'ekup1zyrrxj4', 1),
    ('demo_sport', 'Demo Sport',  '7866ex96uk6b', 99);

-- ---------------------------------------------------------------------------
-- 2. users.logto_user_id (nullable mirror FK)
-- ---------------------------------------------------------------------------

-- Nullable for now: existing rows have no Logto identity, and the
-- Phase 5 webhook + Phase 6 cutover will populate it. NOT NULL is
-- imposed in the cutover migration.
ALTER TABLE users ADD COLUMN logto_user_id TEXT;

-- Partial UNIQUE index allows multiple NULLs (legacy rows) but enforces
-- one-to-one mapping for any row that does have a Logto user.
CREATE UNIQUE INDEX idx_users_logto_user_id
    ON users(logto_user_id)
    WHERE logto_user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. player_profiles (initially empty; populated by Phase 3 forms)
-- ---------------------------------------------------------------------------

-- 1:1 with users by user_id. Lives separately so the users table can
-- shrink to a Logto-mirror shape in Phase 6 without losing profile
-- data. Until Phase 3 starts writing here, every row in users has an
-- implicit empty profile (queries treat absence as defaults).
CREATE TABLE player_profiles (
    user_id                 BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phone                   TEXT,
    dupr_id                 TEXT,
    vair_id                 TEXT,
    paddle_brand            TEXT,
    paddle_model            TEXT,
    gender                  TEXT CHECK (gender IN ('male','female','non_binary','prefer_not_to_say')),
    handedness              TEXT CHECK (handedness IN ('right','left','ambidextrous')),
    date_of_birth           DATE,
    bio                     TEXT,
    address_line_1          TEXT,
    address_line_2          TEXT,
    city                    TEXT,
    state_province          TEXT,
    country                 TEXT,
    postal_code             TEXT,
    formatted_address       TEXT,
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,
    emergency_contact_name  TEXT,
    emergency_contact_phone TEXT,
    medical_notes           TEXT,
    waiver_accepted_at      TIMESTAMPTZ,
    avatar_url              TEXT,
    is_profile_hidden       BOOLEAN NOT NULL DEFAULT false,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_player_profiles_dupr_id
    ON player_profiles(dupr_id) WHERE dupr_id IS NOT NULL;
CREATE INDEX idx_player_profiles_vair_id
    ON player_profiles(vair_id) WHERE vair_id IS NOT NULL;
CREATE INDEX idx_player_profiles_city_state
    ON player_profiles(city, state_province);

-- ---------------------------------------------------------------------------
-- 4. sport_id columns on top-level domain tables
-- ---------------------------------------------------------------------------

-- All five columns are nullable for now and backfilled to Pickleball.
-- Phase 6 cutover migration imposes NOT NULL after every Go writer has
-- been updated to set sport_id explicitly.

DO $$
DECLARE
    pickleball_id BIGINT;
BEGIN
    SELECT id INTO pickleball_id FROM sports WHERE slug = 'pickleball';

    -- tournaments
    ALTER TABLE tournaments ADD COLUMN sport_id BIGINT REFERENCES sports(id);
    UPDATE tournaments SET sport_id = pickleball_id WHERE sport_id IS NULL;

    -- leagues
    ALTER TABLE leagues ADD COLUMN sport_id BIGINT REFERENCES sports(id);
    UPDATE leagues SET sport_id = pickleball_id WHERE sport_id IS NULL;

    -- organizations
    ALTER TABLE organizations ADD COLUMN sport_id BIGINT REFERENCES sports(id);
    UPDATE organizations SET sport_id = pickleball_id WHERE sport_id IS NULL;

    -- venues
    ALTER TABLE venues ADD COLUMN sport_id BIGINT REFERENCES sports(id);
    UPDATE venues SET sport_id = pickleball_id WHERE sport_id IS NULL;

    -- divisions
    ALTER TABLE divisions ADD COLUMN sport_id BIGINT REFERENCES sports(id);
    UPDATE divisions SET sport_id = pickleball_id WHERE sport_id IS NULL;
END $$;

CREATE INDEX idx_tournaments_sport
    ON tournaments(sport_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_leagues_sport
    ON leagues(sport_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_organizations_sport
    ON organizations(sport_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_venues_sport
    ON venues(sport_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_divisions_sport
    ON divisions(sport_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. api_keys.logto_m2m_app_id (nullable mirror FK)
-- ---------------------------------------------------------------------------

ALTER TABLE api_keys ADD COLUMN logto_m2m_app_id TEXT;

CREATE UNIQUE INDEX idx_api_keys_logto_m2m_app_id
    ON api_keys(logto_m2m_app_id)
    WHERE logto_m2m_app_id IS NOT NULL;


-- +goose Down

-- Reverse in opposite order. All operations are conditional so a
-- partial-up migration can be rolled back cleanly.

DROP INDEX IF EXISTS idx_api_keys_logto_m2m_app_id;
ALTER TABLE api_keys DROP COLUMN IF EXISTS logto_m2m_app_id;

DROP INDEX IF EXISTS idx_divisions_sport;
DROP INDEX IF EXISTS idx_venues_sport;
DROP INDEX IF EXISTS idx_organizations_sport;
DROP INDEX IF EXISTS idx_leagues_sport;
DROP INDEX IF EXISTS idx_tournaments_sport;

ALTER TABLE divisions     DROP COLUMN IF EXISTS sport_id;
ALTER TABLE venues        DROP COLUMN IF EXISTS sport_id;
ALTER TABLE organizations DROP COLUMN IF EXISTS sport_id;
ALTER TABLE leagues       DROP COLUMN IF EXISTS sport_id;
ALTER TABLE tournaments   DROP COLUMN IF EXISTS sport_id;

DROP INDEX IF EXISTS idx_player_profiles_city_state;
DROP INDEX IF EXISTS idx_player_profiles_vair_id;
DROP INDEX IF EXISTS idx_player_profiles_dupr_id;
DROP TABLE IF EXISTS player_profiles;

DROP INDEX IF EXISTS idx_users_logto_user_id;
ALTER TABLE users DROP COLUMN IF EXISTS logto_user_id;

DROP INDEX IF EXISTS idx_sports_active;
DROP TABLE IF EXISTS sports;
```

- [ ] **Step 2.** Verify the migration file syntax with a local sanity
  check (no DB needed):

  ```bash
  cd api
  # Just confirm the file parses; goose will fully validate on apply.
  grep -c "^-- +goose " db/migrations/00041_logto_schema_additive.sql
  # Expect: 2 (one Up, one Down)
  ```

**Success criteria for Task 2.1:** the migration file exists, has both
Up and Down sections, and `goose validate` (run later in Task 2.4)
passes.

---

## Task 2.2 — Add new sqlc queries

**Files:**
- Create: `api/db/queries/sports.sql`
- Create: `api/db/queries/player_profiles.sql`
- Modify: `api/db/queries/users.sql` (add Logto-aware lookups; do NOT
  remove existing queries)
- Modify: `api/db/queries/api_keys.sql` (add Logto-aware lookups; do
  NOT remove existing queries)

**Steps:**

- [ ] **Step 1.** Create `api/db/queries/sports.sql`:

```sql
-- api/db/queries/sports.sql

-- name: ListSports :many
SELECT * FROM sports
WHERE is_active = true
ORDER BY sort_order, name;

-- name: GetSportByID :one
SELECT * FROM sports WHERE id = $1;

-- name: GetSportBySlug :one
SELECT * FROM sports WHERE slug = $1;

-- name: GetSportByLogtoOrgID :one
SELECT * FROM sports WHERE logto_org_id = $1;
```

- [ ] **Step 2.** Create `api/db/queries/player_profiles.sql`:

```sql
-- api/db/queries/player_profiles.sql

-- name: GetPlayerProfile :one
SELECT * FROM player_profiles WHERE user_id = $1;

-- name: UpsertPlayerProfile :one
-- Insert or update the 1:1 profile row. The full set of columns is
-- accepted on every call; pass NULL for fields the caller does not
-- want to change AFTER reading the existing row first (or use the
-- nullable narg pattern below for partial updates).
INSERT INTO player_profiles (
    user_id,
    phone, dupr_id, vair_id, paddle_brand, paddle_model,
    gender, handedness, date_of_birth, bio,
    address_line_1, address_line_2, city, state_province, country,
    postal_code, formatted_address, latitude, longitude,
    emergency_contact_name, emergency_contact_phone, medical_notes,
    waiver_accepted_at, avatar_url, is_profile_hidden,
    updated_at
) VALUES (
    $1,
    $2, $3, $4, $5, $6,
    $7, $8, $9, $10,
    $11, $12, $13, $14, $15,
    $16, $17, $18, $19,
    $20, $21, $22,
    $23, $24, $25,
    now()
)
ON CONFLICT (user_id) DO UPDATE SET
    phone                   = EXCLUDED.phone,
    dupr_id                 = EXCLUDED.dupr_id,
    vair_id                 = EXCLUDED.vair_id,
    paddle_brand            = EXCLUDED.paddle_brand,
    paddle_model            = EXCLUDED.paddle_model,
    gender                  = EXCLUDED.gender,
    handedness              = EXCLUDED.handedness,
    date_of_birth           = EXCLUDED.date_of_birth,
    bio                     = EXCLUDED.bio,
    address_line_1          = EXCLUDED.address_line_1,
    address_line_2          = EXCLUDED.address_line_2,
    city                    = EXCLUDED.city,
    state_province          = EXCLUDED.state_province,
    country                 = EXCLUDED.country,
    postal_code             = EXCLUDED.postal_code,
    formatted_address       = EXCLUDED.formatted_address,
    latitude                = EXCLUDED.latitude,
    longitude               = EXCLUDED.longitude,
    emergency_contact_name  = EXCLUDED.emergency_contact_name,
    emergency_contact_phone = EXCLUDED.emergency_contact_phone,
    medical_notes           = EXCLUDED.medical_notes,
    waiver_accepted_at      = EXCLUDED.waiver_accepted_at,
    avatar_url              = EXCLUDED.avatar_url,
    is_profile_hidden       = EXCLUDED.is_profile_hidden,
    updated_at              = now()
RETURNING *;

-- name: DeletePlayerProfile :exec
DELETE FROM player_profiles WHERE user_id = $1;
```

- [ ] **Step 3.** Append to `api/db/queries/users.sql`:

```sql
-- name: GetUserByLogtoUserID :one
SELECT * FROM users
WHERE logto_user_id = $1 AND deleted_at IS NULL;

-- name: SetUserLogtoUserID :one
-- Phase 5 webhook + on-demand upsert path: bind a Logto user ID to an
-- existing local mirror row. Idempotent: setting the same value twice
-- is fine; setting a different value when one is already set fails on
-- the UNIQUE index.
UPDATE users SET
    logto_user_id = $2,
    updated_at = now()
WHERE id = $1 AND deleted_at IS NULL
RETURNING *;
```

- [ ] **Step 4.** Append to `api/db/queries/api_keys.sql`:

```sql
-- name: GetAPIKeyByLogtoM2MAppID :one
SELECT * FROM api_keys
WHERE logto_m2m_app_id = $1;

-- name: SetAPIKeyLogtoM2MAppID :one
UPDATE api_keys SET
    logto_m2m_app_id = $2,
    updated_at = now()
WHERE id = $1
RETURNING *;
```

**Success criteria for Task 2.2:** all four query files have the new
queries; sqlc can parse them (Task 2.3 verifies).

---

## Task 2.3 — Regenerate sqlc + verify build clean

**Files:**
- Generated (auto): `api/db/generated/*.sql.go` and
  `api/db/generated/models.go`

**Steps:**

- [ ] **Step 1.** Confirm sqlc is available locally:

  ```bash
  which sqlc || go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
  sqlc version
  ```

- [ ] **Step 2.** Regenerate from the api directory:

  ```bash
  cd api
  sqlc generate
  ```

  Expected: no errors. New generated functions:
  - `db/generated/sports.sql.go` with `ListSports`, `GetSportByID`,
    `GetSportBySlug`, `GetSportByLogtoOrgID`
  - `db/generated/player_profiles.sql.go` with `GetPlayerProfile`,
    `UpsertPlayerProfile`, `DeletePlayerProfile`
  - Updated `db/generated/users.sql.go` with `GetUserByLogtoUserID`,
    `SetUserLogtoUserID`
  - Updated `db/generated/api_keys.sql.go` with
    `GetAPIKeyByLogtoM2MAppID`, `SetAPIKeyLogtoM2MAppID`
  - `db/generated/models.go` gets new `Sport`, `PlayerProfile` structs;
    existing `User` and `ApiKey` structs gain `LogtoUserID` /
    `LogtoM2mAppID` fields.

- [ ] **Step 3.** Verify build is clean:

  ```bash
  cd api
  go build ./...
  go vet ./...
  ```

  Expected: both exit 0. Any failure here means the migration's
  schema doesn't match what sqlc inferred — re-read the migration
  carefully.

- [ ] **Step 4.** Verify existing tests still pass for the packages
  that don't touch the DB:

  ```bash
  cd api
  go test ./auth/... ./logto/... ./middleware/... -race
  ```

  Expected: all PASS.

**Success criteria for Task 2.3:** `go build ./...` clean,
`go vet ./...` clean, generated code committed.

---

## Task 2.4 — Smoke test the migration

The codebase runs migrations automatically on startup
(`db.RunMigrations(ctx, cfg.DatabaseURL)` in `api/main.go:42`). So the
production smoke test is implicit: when Coolify deploys the next
build that includes 00041, the migration runs.

But we want to catch errors BEFORE that. Local Postgres is the
reliable path; if Postgres is unavailable, fall back to Coolify
deploy verification.

**Files:** none (verification step).

**Steps:**

- [ ] **Step 1 (preferred).** Run the migration locally against a
  fresh ephemeral Postgres.

  Install Postgres if missing:
  ```bash
  sudo pacman -S --noconfirm postgresql
  sudo -u postgres initdb -D /var/lib/postgres/data 2>/dev/null || true
  sudo systemctl enable --now postgresql
  ```

  Create a throwaway DB:
  ```bash
  sudo -u postgres createuser -s phoenix 2>/dev/null || true
  createdb cc_logto_smoke
  ```

  Run the full migration set:
  ```bash
  cd api
  DATABASE_URL=postgres://phoenix@localhost:5432/cc_logto_smoke?sslmode=disable \
    go run ./cmd/migrate up || \
    DATABASE_URL=postgres://phoenix@localhost:5432/cc_logto_smoke?sslmode=disable \
    go test -run TestMigrationsUp ./db -v
  ```

  (If neither cmd nor TestMigrationsUp exists, run via the running
  binary's startup migration: `DATABASE_URL=... go run main.go &` and
  watch the logs.)

  Verify the new tables and columns:
  ```bash
  psql cc_logto_smoke -c "\d sports"
  psql cc_logto_smoke -c "\d player_profiles"
  psql cc_logto_smoke -c "SELECT slug, name, logto_org_id FROM sports;"
  psql cc_logto_smoke -c "\d users"     # confirm logto_user_id column
  psql cc_logto_smoke -c "\d api_keys"  # confirm logto_m2m_app_id column
  psql cc_logto_smoke -c "\d tournaments" # confirm sport_id column
  ```

  Expected: 2 sports rows (pickleball, demo_sport), all columns and
  indexes present.

  Test the rollback:
  ```bash
  goose -dir api/db/migrations \
    postgres "postgres://phoenix@localhost:5432/cc_logto_smoke?sslmode=disable" \
    down
  ```

  Verify the rollback succeeded:
  ```bash
  psql cc_logto_smoke -c "\d sports"     # should not exist
  psql cc_logto_smoke -c "\d player_profiles"  # should not exist
  psql cc_logto_smoke -c "\d users"      # logto_user_id column gone
  ```

  Re-run up to confirm it can be re-applied:
  ```bash
  goose -dir api/db/migrations postgres "..." up
  ```

- [ ] **Step 2 (fallback).** If local Postgres is not available, push
  the migration to `feature/logto-integration` and let Coolify run it.
  Watch the deploy log for migration output. The api startup logs
  will show `running database migrations` followed by goose's per-
  migration log lines. After deploy, verify by adding a brief logging
  trace in the app or by querying via a one-shot psql container in
  Coolify.

  This is less safe (can't easily roll back without code changes) but
  acceptable given the additive-only design — even a botched 00041 is
  a non-event because the migration only adds; nothing breaks if the
  Down half is buggy because we don't intend to run it.

**Success criteria for Task 2.4:** migration applies cleanly (no error
output from goose), all expected schema elements exist, rollback also
clean.

---

## Verification and exit criteria for Phase 2

- [ ] `api/db/migrations/00041_logto_schema_additive.sql` committed
- [ ] `api/db/queries/sports.sql` and `player_profiles.sql` committed;
      `users.sql` and `api_keys.sql` augmented (no removals)
- [ ] `api/db/generated/` contains the regenerated bindings
- [ ] `go build ./...` clean
- [ ] `go vet ./...` clean
- [ ] `go test ./auth/... ./logto/... ./middleware/... -race` clean
- [ ] Migration up/down validated on a real Postgres (or, fallback,
      cleanly applied via Coolify deploy)
- [ ] Live smoke verifies `/api/v1/health` still 200 OK (i.e. the
      migration didn't break the app's startup path)
- [ ] PR description / commit messages clearly note the additive-only
      scope and what's deferred to Phase 6

---

## Risk register

| Risk | Mitigation |
|---|---|
| The hardcoded `logto_org_id` values for Pickleball/Demo Sport drift if the operator regenerates Logto orgs | Documented in `docs/LOGTO_SETUP.md` Step 5; the seed is data, not code, and can be UPDATEd post-deploy. |
| sqlc generation surprises us with a name collision or shape mismatch | Pre-flight Step 3 of Task 2.3 will fail fast; we adjust the queries. |
| Migration takes longer than Coolify's deploy timeout on a large prod table | All ALTER TABLEs are metadata-only operations on Postgres 17 (no rewrites for nullable adds); UPDATEs only set sport_id on rows that have NULL, which is fast on tables with <100k rows. Production has zero users so this is trivial. |
| `idx_users_dedup` references soon-to-be-removed columns | Out of scope for Phase 2; leave it alone. Phase 6 cutover handles the drop. |
| Phase 3 expects player_profiles to be populated already | Phase 3 will write profile data on form submit (UpsertPlayerProfile). Existing user rows have no profile until the user edits their profile in the new UI. Acceptable for a zero-user environment. |
