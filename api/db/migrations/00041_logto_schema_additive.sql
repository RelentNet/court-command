-- +goose Up

-- ============================================================================
-- Phase 2 of the Logto integration: ADDITIVE schema changes.
--
-- This migration only ADDS tables, columns, and indexes. It deliberately
-- does not drop any existing schema; that work is deferred to a Phase 6
-- cutover migration once all Go callers have stopped reading the
-- to-be-removed columns (password_hash, role, raw_password,
-- key_hash, etc.).
--
-- See docs/DATABASE_OWNERSHIP.md for which fields live where after this
-- migration lands. See
-- docs/superpowers/specs/2026-04-20-logto-integration-design.md for the
-- broader design and
-- docs/superpowers/plans/2026-05-01-logto-phase-2-migrations.md for the
-- expanded plan this migration implements.
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
-- admin (e.g. the orgs are recreated after a Logto re-seed), update
-- them via UPDATE rather than re-running this migration.
INSERT INTO sports (slug, name, logto_org_id, sort_order) VALUES
    ('pickleball', 'Pickleball', 'ekup1zyrrxj4', 1),
    ('demo_sport', 'Demo Sport',  '7866ex96uk6b', 99);

-- ---------------------------------------------------------------------------
-- 2. users.logto_user_id (nullable mirror FK to Logto's user record)
-- ---------------------------------------------------------------------------

-- Nullable for now: existing rows have no Logto identity, and the
-- Phase 5 webhook + Phase 6 cutover will populate it. NOT NULL is
-- imposed in the cutover migration once every code path is rewritten
-- to either bind a logto_user_id at create time or upsert on first
-- authenticated request.
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
-- 5. api_keys.logto_m2m_app_id (nullable mirror FK to Logto M2M app)
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
